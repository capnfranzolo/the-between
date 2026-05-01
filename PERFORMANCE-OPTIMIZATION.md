# Performance Optimization — 3D Cosmos

The cosmos is too slow. 40 stars cause frame drops on mid-range laptops and the site barely runs on an iPhone 14 Pro. The target is 60fps on a 2020 MacBook Air and smooth 30fps on an iPhone 12+. This prompt is about finding and eliminating waste without changing the visual design.

## Step 0: Measure before changing anything

Before optimizing, add a debug performance overlay so we can see what's happening. This stays in the codebase behind a flag.

Add `?perf=1` query param support. When present, show an overlay in the top-left corner:

```
FPS: 60
Frame: 4.2ms
Draw calls: 47
Triangles: 12,340
Textures: 42
Programs: 3
Geometries: 28
Active canvases: 2
Texture uploads/s: 2
```

Get these from `renderer.info` (Three.js exposes render, memory, and programs counts). Track texture uploads by counting `texture.needsUpdate = true` calls per second. Track active offscreen canvases with a simple counter.

Also log to console on load:
- Total GPU memory estimate (texture count × resolution² × 4 bytes)
- Number of Three.js objects in the scene
- Number of active requestAnimationFrame loops

**Run the cosmos with this overlay and READ THE NUMBERS before making any changes.** The numbers will tell you where the problem is.

## Step 1: Audit and fix texture waste

This is the most likely bottleneck. Each spirograph star may be creating multiple canvas textures that are larger than needed and uploading them to the GPU too frequently.

### Texture size by distance tier

Stars should use the smallest texture that looks acceptable at their screen size:

| Camera distance | Screen size (approx) | Texture resolution | Notes |
|----------------|----------------------|-------------------|-------|
| < 80 units | Large, detailed | 256×256 | Only the focused/selected star |
| 80-200 units | Medium | 128×128 | Nearby stars |
| 200-400 units | Small | 64×64 | Mid-distance |
| > 400 units | Tiny dot | 32×32 or NONE | Use a simple circle sprite instead |

### Reduce texture count

The crossfade system (3 baked frames per star) means 3 textures per star. For 40 stars that's 120 textures. Reduce to:

- **Nearby stars (< 200 units): 2 baked frames** — crossfade between two frames is enough for subtle life
- **Distant stars (200-400 units): 1 baked frame** — static, no crossfade
- **Very distant stars (> 400 units): NO spirograph texture** — use a simple 8×8 or 16×16 solid-color circle texture, one per emotion color (7 total textures shared across all distant stars)

### Texture pooling

Don't create unique textures for every star. For distant stars (>200 units), the spirograph details aren't visible anyway. Create a pool of ~20 pre-baked spirograph textures at 64×64 covering a range of dimension combinations, and assign each distant star to the nearest match. The visual difference is undetectable at distance.

### Canvas disposal

After baking a static frame to a texture, DISPOSE the offscreen canvas immediately. Don't keep 40+ canvas elements alive in memory. The texture has the pixels — the canvas is no longer needed.

```javascript
// After baking:
const texture = new THREE.CanvasTexture(canvas);
texture.needsUpdate = true;
// The texture now has the pixel data. Destroy the canvas:
canvas.width = 0;
canvas.height = 0;
canvas = null;
```

### Texture upload throttling

`texture.needsUpdate = true` triggers a GPU texture upload, which is expensive. Ensure this ONLY happens for:
- The 1-2 live-animated stars (selected + user's own)
- Nothing else, ever

Audit every place `needsUpdate` is set. If the crossfade system is setting it on a timer for static stars, STOP. Instead, swap the sprite's material.map reference between two pre-uploaded textures. Swapping a reference is free; uploading pixels is expensive.

## Step 2: Reduce draw calls

Each Three.js object with its own material is a separate draw call. 40 stars, each with a sprite + point light + click sphere + maybe glow layers = potentially 120-200 draw calls.

### Remove point lights

Point lights are EXTREMELY expensive in Three.js. Each point light affects every object in the scene and multiplies draw calls. 40 point lights is catastrophic.

Replace per-star point lights with:
- A slightly brighter/larger sprite for the star's glow (use additive blending on a second sprite layer)
- Or a single ambient light for the whole scene + per-star emissive sprite materials

This alone might fix the entire performance problem.

### Merge distant star geometry

Stars beyond 200 units can be rendered as a single `THREE.Points` object (a particle system) instead of individual sprites:

1. Create a `BufferGeometry` with positions for all distant stars
2. Use a `PointsMaterial` with a circle texture, `size` based on the average star size, `vertexColors: true`
3. Update positions each frame for orbital movement (just update the buffer attribute, one GPU upload)
4. This replaces N distant sprites (N draw calls) with 1 draw call

Only stars within 200 units get individual sprite objects with their own materials.

### Invisible click spheres

If the click detection uses invisible mesh spheres, ensure they have `material.visible = false` AND `material.colorWrite = false`. Even invisible meshes generate draw calls unless explicitly excluded. Better: use raycasting against the sprite positions directly (check distance from ray to point) instead of invisible meshes. Remove the meshes entirely.

### Connection lines

If each bond line is a separate `Line` object, merge them into one `LineSegments` object with a shared BufferGeometry. Update the buffer each frame for orbital movement. Many lines → 1 draw call.

## Step 3: Kill unnecessary per-frame work

### Frustum culling

Three.js has built-in frustum culling (objects outside the camera view aren't drawn). Ensure it's enabled:
```javascript
renderer.sortObjects = true; // default
// Each object: object.frustumCulled = true; // default
```

But frustum culling doesn't stop JavaScript update logic. If every star is running bobbing/pulse/orbital calculations every frame, that's 40 sets of trig calculations regardless of visibility.

Add a visibility check: only update star animation (bob, pulse, orbit) if the star is within 500 units of the camera. Beyond that, freeze it. Nobody can see micro-movements at that distance.

### RAF loop audit

Check how many `requestAnimationFrame` loops are running. There should be exactly ONE — the main Three.js render loop. If each live spirograph canvas has its own RAF loop, consolidate them into the main loop:

```javascript
// WRONG: separate RAF per canvas
function animateStar() {
  requestAnimationFrame(animateStar);
  spirograph.update();
  texture.needsUpdate = true;
}

// RIGHT: update in the main render loop
function mainRenderLoop() {
  requestAnimationFrame(mainRenderLoop);
  
  // Update the 1-2 live spirograph canvases
  if (selectedStarCanvas) {
    selectedStarCanvas.update();
    selectedStarTexture.needsUpdate = true;
  }
  
  renderer.render(scene, camera);
}
```

### Terrain updates

The terrain re-centers when the camera moves 300+ units. Make sure it's not recalculating every frame — only when the threshold is crossed.

## Step 4: Sky dome and clouds

### Sky dome

The sky shader should be very cheap (one dot product + gradient lookup per fragment). If the sky sphere has high polygon count, reduce it. A sky dome needs maybe 32 segments × 16 rings = 512 triangles max. It's a background element with a smooth gradient — geometry detail is invisible.

### Clouds

How are clouds implemented? If they're transparent sprites with large textures, they're expensive due to alpha blending and overdraw. Options:
- Reduce cloud count to 5-8 max
- Use smaller textures (128×128 or 256×256)
- Disable clouds on mobile entirely

## Step 5: Mobile detection and quality tiers

Detect mobile/low-power devices and reduce quality automatically:

```typescript
function getQualityTier(): 'high' | 'medium' | 'low' {
  const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  const debugInfo = gl?.getExtension('WEBGL_debug_renderer_info');
  const gpuRenderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : '';
  
  // Known low-power GPUs
  const isLowGPU = /Mali|Adreno [0-5]|Intel HD|Intel UHD|Apple GPU/i.test(gpuRenderer);
  
  if (isMobile) return 'low';
  if (isLowGPU) return 'medium';
  return 'high';
}
```

### Quality settings per tier

| Setting | High | Medium | Low |
|---------|------|--------|-----|
| Renderer pixel ratio | window.devicePixelRatio | 1.5 | 1.0 |
| Max visible stars | 50 | 30 | 15 |
| Spirograph textures | 256/128/64 | 128/64/32 | 64/32/none |
| Crossfade frames | 2 | 1 | 0 (static only) |
| Live animated textures | 2 | 1 | 0 (static only) |
| Point lights | 0 (already removed) | 0 | 0 |
| Clouds | 8 | 4 | 0 |
| Terrain resolution | Full | Half | Quarter |
| Background stars (dots) | 200 | 100 | 50 |
| Connection line glow | Yes | No | No |
| Star bob/pulse animation | Yes | Reduced | None |
| Shadow/bloom effects | Yes | No | No |
| Render resolution | Native | 75% | 50% |

### Passive mode (landing page) is always "medium" or lower

The cosmos behind the question form doesn't need full quality — stars are blurred anyway. Force medium tier on the landing page regardless of device capability. This keeps the landing page fast everywhere.

### Pixel ratio is critical on mobile

iPhone 14 Pro has a 3x pixel ratio. If the renderer uses `window.devicePixelRatio`, it's rendering at 3x resolution — 9x the pixels of 1x. Force `renderer.setPixelRatio(1.0)` on mobile. The cosmos is a blurred background on mobile — nobody will notice the difference but the GPU will.

## Step 6: Lazy loading

Don't create all 40 star objects on mount. Load in waves:

1. On mount: create the nearest 10 stars (by deterministic position distance to initial camera position)
2. After first render: add the next 10
3. Continue until all visible stars are loaded
4. Stars beyond the max for the quality tier are never created

This eliminates the initial frame spike where 40 textures are baked and uploaded simultaneously.

## Implementation order

Do these in order, checking the perf overlay after each:

1. Add the perf overlay (Step 0)
2. Remove point lights (Step 2) — likely the single biggest win
3. Fix texture upload frequency (Step 1 audit) — stop unnecessary needsUpdate calls
4. Add quality tiers + force low pixel ratio on mobile (Step 5)
5. Reduce texture sizes and dispose canvases (Step 1)
6. Merge distant stars into Points (Step 2)
7. Add lazy loading (Step 6)
8. Optimize clouds and terrain (Step 4)

Stop after each step and check if performance is acceptable. You may not need all of them.

## What NOT to change

- The spirograph renderer math — untouched
- Visual design of the selected/nearby stars — they should still look great up close
- The radial sunset sky — untouched
- Connection flow and UI panels — untouched
- The overall feel of floating through a twilight cosmos — preserve this

## Success criteria

- Landing page (passive cosmos): 60fps on 2020 MacBook Air, 30fps on iPhone 12
- Active cosmos with 40 stars: 60fps on M1 MacBook, 45fps on 2020 MacBook Air, 30fps on iPhone 12
- Active cosmos with 100 stars: 45fps on M1 MacBook (future-proofing)
- No visible frame spike on initial load
- No memory leaks (GPU memory stable over 5 minutes of browsing)
- Perf overlay shows < 50 draw calls in active cosmos
