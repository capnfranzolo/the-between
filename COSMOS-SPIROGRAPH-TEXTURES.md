# Replace Torus Thoughts with Real Spirograph Textures

The 3D cosmos currently represents stars as groups of torus rings. Replace them with the actual spirograph renderer output — the same visual you see on the star detail page (firefly tracers, ghost traces, emotion colors).

## Strategy

Render each spirograph to an offscreen canvas, convert to a Three.js texture, display as a billboard sprite in the scene. Most stars get a static baked texture. The selected star and the user's own star get live-animated textures.

## Implementation

### 1. Baked spirograph textures (all stars)

For each star in the cosmos:

1. Create an offscreen `<canvas>` element (256×256, or 128×128 for depth 2 stars)
2. Call `createSpirograph(canvas, dimensions, { size: 256, dpr: 1 })` from `src/lib/spirograph/renderer.ts`
3. Call `renderStatic(2.5)` to bake a single frame at t=2.5 seconds — this captures the ghost trace + firefly positions at that moment
4. Create a `THREE.CanvasTexture(canvas)` from the result
5. Create a `THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })` and a `THREE.Sprite` with it
6. Scale the sprite to match the old torus group size (~8-12 world units)
7. Add the sprite to the star's group, replacing the torus meshes and glow sprite (keep the invisible click sphere and point light)

### 2. Subtle life cycle (static stars)

Static spirographs should feel slightly alive without running the renderer every frame:

1. For each star, bake THREE frames at different times: t=2.0, t=4.5, t=7.0
2. Store all three textures
3. Every 8-10 seconds, crossfade to the next frame by interpolating the sprite material's opacity between two overlapping sprites (one fading out, one fading in, 2-second transition)
4. This creates a gentle shimmer — the firefly tracers appear to drift between positions
5. Stagger the crossfade timing per star using the star's hash so they don't all shift at once

### 3. Live-animated textures (selected star + user's star)

When a star becomes "active" (selected via click, or it's the user's own star):

1. Start a `requestAnimationFrame` loop on that star's offscreen canvas
2. Call `createSpirograph` with `start()` instead of `renderStatic`
3. Set `texture.needsUpdate = true` every frame so Three.js re-uploads it
4. Cap at 2 simultaneous live textures max (user's star + selected star)
5. When a star is deselected, stop the animation loop, bake a final static frame, and revert to the crossfade cycle

### 4. Performance guardrails

- Offscreen canvases for stars that are far from the camera (>200 units) should use 128×128 resolution
- Stars within 100 units get 256×256
- Stars beyond 300 units can skip the crossfade cycle entirely and just show one static frame
- When a star enters/leaves these distance thresholds, swap the texture resolution (don't recreate the spirograph — just re-render at the new size)
- Limit total baked canvases to ~50. If there are more stars than that in the cosmos, only create textures for the nearest 50 and use a simple glowing dot sprite for the rest. Swap as the camera moves.
- Dispose canvas textures when removing a star or when it goes out of range

### 5. Integration with existing cosmos code

- The `createThought` function (or however the torus groups are currently created) needs to accept the star's `dimensions` object (the same shape stored in the DB: certainty, warmth, tension, vulnerability, scope, rootedness, emotionIndex, curveType)
- The `thoughts` prop on CosmosScene should include dimensions for each star
- The point light per star should use the emotion color from `EMOTIONS[emotionIndex].rgb`
- Keep the bobbing, pulse scale, and orbital mechanics exactly as they are — just replace what the star LOOKS like, not how it moves

### 6. What to change in the star group

Old structure (remove):
- 3-5 TorusGeometry meshes with rotation
- Core glow sprite (canvas-drawn radial gradient)

New structure:
- 2-3 Sprite layers for crossfade cycle (only 2 visible at any time)
- Point light (keep, use emotion color)
- Invisible click sphere (keep)

The sprite should face the camera at all times (that's the default Sprite behavior in Three.js — no extra work needed).

### 7. Bloom effect for new stars

When a star is first created (the user just submitted), render it with `bloomMs: 2200` — start the offscreen canvas with the bloom version of createSpirograph. After the bloom completes (2.2s), switch to the normal baked frames.

## What NOT to change

- Camera movement, terrain, sky dome, clouds, star field — untouched
- Orbital mechanics for bonded pairs — untouched
- Bond connection lines — untouched
- StarDetail panel (the bottom card UI) — it already uses the canvas renderer for the detail view, keep that
- The spirograph renderer itself — don't modify renderer.ts at all, just consume its API

## Testing

1. Enter the cosmos with mock data. Every star should show its unique spirograph form instead of torus rings.
2. Stars should have subtly different shapes and colors based on their dimensions.
3. Click a star — it should transition from static crossfade to live animation smoothly.
4. Performance: should maintain 60fps with 40 stars visible. Check with browser dev tools — canvas texture uploads should only happen for the 1-2 live stars plus occasional crossfade swaps on static stars.
5. Stars far from the camera should be smaller/lower-res but still recognizably spirographs, not blurry blobs.
