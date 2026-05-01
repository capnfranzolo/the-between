# The Between — 3D Cosmos Integration Guide

## Claude Code Prompt

Use this prompt with Claude Code to integrate the cosmos into your Next.js app:

---

```
I need to integrate a Three.js 3D cosmos scene into my Next.js app as a React component. The scene is a twilight flight simulator that serves as the background for the cosmos page where users browse other people's spirograph "thoughts."

Here's the working prototype as a single JS module. Convert it to a React component at `components/cosmos/CosmosScene.tsx` that:

1. Takes a `thoughts` prop — an array of `{ id: string, x: number, z: number, y: number, color: number }` objects representing real entries from Supabase. When the prop changes, update the scene (add/remove thought groups) without rebuilding everything.

2. Takes an `onThoughtClick(id: string)` callback — fired when user clicks a thought in the 3D scene. The parent component handles navigation/modal.

3. Uses `useRef` for the canvas container, `useEffect` for setup/teardown. Cleans up renderer, geometries, materials on unmount. Handles resize.

4. Exposes a `flyToThought(id: string)` method via `useImperativeHandle` so the parent can programmatically steer toward a thought.

5. The scene should render behind page content using `position: fixed; inset: 0; z-index: 0` with the canvas. Page content layers on top with `position: relative; z-index: 1`.

6. Install three.js via npm (`three@0.128.0`) — don't use the CDN. Import types from `@types/three`.

7. Keep all the tuned constants exactly as they are — don't "clean up" the magic numbers. They were tuned visually.

Here's the working prototype code to extract from:
```

Then paste the contents of `cosmos.html`'s `<script>` tag below the prompt.

---

## Extracted Module: `cosmos-scene.js`

This is the pure JS extracted from the prototype, ready to paste into the Claude Code prompt or adapt directly. No HTML wrapper, no CDN — just the scene logic.

```javascript
import * as THREE from 'three';

/**
 * Creates and manages the Between cosmos 3D scene.
 * 
 * @param {HTMLElement} container - DOM element to append the canvas to
 * @param {Object} options
 * @param {Function} options.onThoughtClick - callback(thoughtId) when a thought is clicked
 * @returns {Object} API: { dispose(), addThought(id, x, y, z, color), removeThought(id), flyTo(id) }
 */
export function createCosmosScene(container, options = {}) {
  const { onThoughtClick } = options;

  // ─── SETUP ───
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.5, 2000);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  container.appendChild(renderer.domElement);

  scene.fog = new THREE.FogExp2(0x2A1B3D, 0.0012);

  // ─── LIGHTING ───
  scene.add(new THREE.AmbientLight(0x6B4D8A, 0.8));
  const dirLight = new THREE.DirectionalLight(0xF0C080, 0.4);
  dirLight.position.set(0, 5, -200);
  scene.add(dirLight);
  scene.add(new THREE.HemisphereLight(0x5A3D78, 0x1E1030, 0.3));

  // ─── SKY DOME ───
  const skyGeo = new THREE.SphereGeometry(900, 64, 64);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vLocalPos;
      void main() {
        vLocalPos = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vLocalPos;
      vec3 hex(float r, float g, float b) { return vec3(r, g, b) / 255.0; }
      void main() {
        float y = vLocalPos.y;
        float breathe = sin(uTime * 0.02) * 0.002;
        vec3 zenith    = hex(30.0, 24.0, 64.0);
        vec3 upper     = hex(61.0, 45.0, 101.0);
        vec3 mid       = hex(110.0, 70.0, 125.0);
        vec3 low       = hex(155.0, 100.0, 135.0);
        vec3 rose      = hex(180.0, 120.0, 130.0);
        vec3 horizPeak = hex(210.0, 150.0, 110.0);
        vec3 color;
        if (y < -0.15) { color = rose; }
        else if (y < 0.0) { color = mix(rose, horizPeak, smoothstep(-0.15, 0.0, y)); }
        else if (y < 0.008 + breathe) { color = mix(horizPeak, rose, smoothstep(0.0, 0.008 + breathe, y)); }
        else if (y < 0.04) { color = mix(rose, low, smoothstep(0.008 + breathe, 0.04, y)); }
        else if (y < 0.12) { color = mix(low, mid, smoothstep(0.04, 0.12, y)); }
        else if (y < 0.4) { color = mix(mid, upper, smoothstep(0.12, 0.4, y)); }
        else { color = mix(upper, zenith, smoothstep(0.4, 1.0, y)); }
        gl_FragColor = vec4(color, 1.0);
      }
    `
  });
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  skyDome.rotation.x = -8 * Math.PI / 180;
  scene.add(skyDome);

  // ─── STARS ───
  const starCount = 300;
  const starGeo = new THREE.BufferGeometry();
  const starPositions = new Float32Array(starCount * 3);
  const starSizes = new Float32Array(starCount);
  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.45;
    const r = 880;
    starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = r * Math.cos(phi);
    starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    starSizes[i] = 1.5 + Math.random() * 2.5;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeo.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));
  const starMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float size;
      varying float vSize;
      void main() {
        vSize = size;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (300.0 / -mvPos.z);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying float vSize;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float alpha = smoothstep(0.5, 0.0, d) * 0.7;
        alpha *= 0.6 + 0.4 * sin(uTime * (1.0 + vSize * 0.5) + vSize * 10.0);
        gl_FragColor = vec4(0.9, 0.85, 1.0, alpha);
      }
    `
  });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // ─── TERRAIN ───
  const TERRAIN_SIZE = 3200;
  const TERRAIN_SEGS = 300;
  const terrainGeo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGS, TERRAIN_SEGS);
  const terrainMat = new THREE.MeshLambertMaterial({ color: 0x503868 });
  const terrain = new THREE.Mesh(terrainGeo, terrainMat);
  terrain.rotation.x = -Math.PI / 2;
  scene.add(terrain);

  let terrainOffsetX = 0, terrainOffsetZ = 0;

  function getHeight(wx, wz) {
    return Math.sin(wx * 0.004) * 24 + Math.sin(wz * 0.005) * 20
         + Math.sin(wx * 0.01 + wz * 0.008) * 12 + Math.sin(wx * 0.02 - wz * 0.015) * 6
         + Math.sin(wx * 0.035 + wz * 0.03) * 3 + Math.sin(wx * 0.06 - wz * 0.05) * 1.5;
  }

  function updateTerrainGeometry() {
    const pos = terrainGeo.attributes.position;
    const half = TERRAIN_SIZE / 2;
    const step = TERRAIN_SIZE / TERRAIN_SEGS;
    for (let i = 0; i <= TERRAIN_SEGS; i++) {
      for (let j = 0; j <= TERRAIN_SEGS; j++) {
        const idx = i * (TERRAIN_SEGS + 1) + j;
        const lx = -half + j * step;
        const lz = -half + i * step;
        pos.setZ(idx, getHeight(lx + terrainOffsetX, lz + terrainOffsetZ));
      }
    }
    pos.needsUpdate = true;
    terrainGeo.computeVertexNormals();
  }
  updateTerrainGeometry();

  // ─── CLOUDS ───
  const clouds = [];
  for (let i = 0; i < 30; i++) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const ctx = c.getContext('2d');
    for (let j = 0; j < 6 + Math.floor(Math.random() * 7); j++) {
      const x = 40 + Math.random() * 176, y = 20 + Math.random() * 88;
      const r = 20 + Math.random() * 40, a = 0.06 + Math.random() * 0.09;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(140,100,170,${a})`);
      grad.addColorStop(1, 'rgba(140,100,170,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 128);
    }
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.8 });
    const sprite = new THREE.Sprite(mat);
    const angle = Math.random() * Math.PI * 2;
    const dist = 20 + Math.random() * 280;
    sprite.position.set(Math.cos(angle) * dist, 25 + Math.random() * 50, Math.sin(angle) * dist);
    sprite.scale.set(30 + Math.random() * 50, 15 + Math.random() * 20, 1);
    sprite.userData = { dx: (Math.random() - 0.5) * 0.3, dz: (Math.random() - 0.5) * 0.3 };
    scene.add(sprite);
    clouds.push(sprite);
  }

  // ─── THOUGHTS ───
  const THOUGHT_COLORS = [
    0xE07050, 0xF0C050, 0xF080A0, 0xC080F0, 0xE080B0,
    0xA0E080, 0x70B0E0, 0x60D0D0, 0x60D0B0, 0xF0A060,
    0xD090F8, 0xF08888, 0x80C0F0, 0x90E0A0, 0xF0D080
  ];
  const thoughtGroups = new Map(); // id -> THREE.Group
  const thoughtMeshes = [];

  function createThought(id, wx, wy, wz, color) {
    color = color || THOUGHT_COLORS[Math.floor(Math.random() * THOUGHT_COLORS.length)];
    const group = new THREE.Group();
    const ringCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < ringCount; i++) {
      const radius = 1.5 + Math.random() * 2.5;
      const tube = 0.03 + Math.random() * 0.04;
      const torusMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 - i * 0.12 });
      const torus = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 16, 64), torusMat);
      torus.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      torus.userData = { rx: (Math.random() - 0.5) * 0.4, ry: (Math.random() - 0.5) * 0.3 };
      group.add(torus);
    }
    // Glow
    const gc = document.createElement('canvas'); gc.width = 64; gc.height = 64;
    const gx = gc.getContext('2d');
    const col = new THREE.Color(color);
    const gr = gx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${col.r*255|0},${col.g*255|0},${col.b*255|0},0.9)`);
    gr.addColorStop(0.3, `rgba(${col.r*255|0},${col.g*255|0},${col.b*255|0},0.3)`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    gx.fillStyle = gr; gx.fillRect(0, 0, 64, 64);
    const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), transparent: true, depthWrite: false }));
    glowSprite.scale.set(6, 6, 1);
    group.add(glowSprite);
    group.add(new THREE.PointLight(color, 0.8, 40));
    // Click target
    const clickSphere = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    clickSphere.userData = { thoughtId: id, thoughtGroup: group };
    group.add(clickSphere);
    thoughtMeshes.push(clickSphere);

    group.position.set(wx, wy, wz);
    group.userData = { id, bobPhase: Math.random() * Math.PI * 2, bobSpeed: 0.2 + Math.random() * 0.3, baseY: wy, pulsePhase: Math.random() * Math.PI * 2 };
    scene.add(group);
    thoughtGroups.set(id, group);
    return group;
  }

  // ─── CAMERA STATE ───
  let heading = 0, targetHeading = null, speed = 4, clickBoostTime = 0;
  camera.position.set(0, 80, 0);
  let lastSnapX = 0, lastSnapZ = 0;
  const clock = new THREE.Clock();
  let disposed = false;

  // ─── INPUT ───
  const keys = {};
  const onKeyDown = e => { keys[e.code] = true; };
  const onKeyUp = e => { keys[e.code] = false; };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const onClick = e => {
    mouse.x = (e.clientX / container.clientWidth) * 2 - 1;
    mouse.y = -(e.clientY / container.clientHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(thoughtMeshes);
    if (hits.length > 0) {
      const { thoughtId, thoughtGroup } = hits[0].object.userData;
      const dx = thoughtGroup.position.x - camera.position.x;
      const dz = thoughtGroup.position.z - camera.position.z;
      targetHeading = Math.atan2(dx, -dz);
      clickBoostTime = 1.5;
      if (onThoughtClick) onThoughtClick(thoughtId);
    }
  };
  renderer.domElement.addEventListener('click', onClick);

  const onResize = () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  };
  window.addEventListener('resize', onResize);

  // ─── ANIMATION ───
  function animate() {
    if (disposed) return;
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    const time = clock.getElapsedTime();

    skyMat.uniforms.uTime.value = time;
    skyDome.position.copy(camera.position);
    stars.position.copy(camera.position);
    starMat.uniforms.uTime.value = time;

    const targetSpeed = keys['Space'] ? 25 : (clickBoostTime > 0 ? 18 : 4);
    speed += (targetSpeed - speed) * dt * 3;
    if (clickBoostTime > 0) clickBoostTime -= dt;

    if (targetHeading !== null) {
      let diff = targetHeading - heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      heading += diff * dt * 1.5;
      if (Math.abs(diff) < 0.05) targetHeading = null;
    }

    const fwdX = Math.sin(heading), fwdZ = -Math.cos(heading);
    camera.position.x += fwdX * speed * dt;
    camera.position.z += fwdZ * speed * dt;
    camera.position.y = Math.max(getHeight(camera.position.x, camera.position.z) + 40, 80 + Math.sin(time * 0.3) * 0.4);

    const lookDist = 200;
    camera.lookAt(new THREE.Vector3(
      camera.position.x + fwdX * lookDist,
      camera.position.y + Math.tan(17 * Math.PI / 180) * lookDist,
      camera.position.z + fwdZ * lookDist
    ));

    // Terrain snap
    if (Math.abs(camera.position.x - lastSnapX) > 300 || Math.abs(camera.position.z - lastSnapZ) > 300) {
      lastSnapX = Math.round(camera.position.x / 300) * 300;
      lastSnapZ = Math.round(camera.position.z / 300) * 300;
      terrainOffsetX = lastSnapX; terrainOffsetZ = lastSnapZ;
      terrain.position.set(lastSnapX, 0, lastSnapZ);
      updateTerrainGeometry();
    }

    // Animate thoughts
    for (const [, g] of thoughtGroups) {
      g.position.y = g.userData.baseY + Math.sin(time * g.userData.bobSpeed + g.userData.bobPhase) * 1.0;
      g.scale.setScalar(1.0 + Math.sin(time * 0.8 + g.userData.pulsePhase) * 0.05);
      g.children.forEach(child => {
        if (child.userData.rx !== undefined) {
          child.rotation.x += child.userData.rx * dt;
          child.rotation.y += child.userData.ry * dt;
        }
      });
    }

    // Clouds
    for (const c of clouds) {
      c.position.x += c.userData.dx * dt;
      c.position.z += c.userData.dz * dt;
      const dx = c.position.x - camera.position.x, dz = c.position.z - camera.position.z;
      if (dx * dx + dz * dz > 320 * 320) {
        const a = Math.random() * Math.PI * 2, d = 100 + Math.random() * 180;
        c.position.set(camera.position.x + Math.cos(a) * d, 25 + Math.random() * 50, camera.position.z + Math.sin(a) * d);
      }
    }

    renderer.render(scene, camera);
  }
  animate();

  // ─── PUBLIC API ───
  return {
    addThought(id, x, y, z, color) {
      if (thoughtGroups.has(id)) return;
      createThought(id, x, y, z, color);
    },
    removeThought(id) {
      const g = thoughtGroups.get(id);
      if (!g) return;
      scene.remove(g);
      thoughtGroups.delete(id);
      // Clean up click mesh from raycaster list
      const idx = thoughtMeshes.findIndex(m => m.userData.thoughtId === id);
      if (idx >= 0) thoughtMeshes.splice(idx, 1);
    },
    flyTo(id) {
      const g = thoughtGroups.get(id);
      if (!g) return;
      const dx = g.position.x - camera.position.x;
      const dz = g.position.z - camera.position.z;
      targetHeading = Math.atan2(dx, -dz);
      clickBoostTime = 2.0;
    },
    dispose() {
      disposed = true;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('click', onClick);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    }
  };
}
```

## Key Constants Reference

These were all tuned visually. Don't change them without testing:

| Constant | Value | What it controls |
|---|---|---|
| Sky dome tilt | -8° | Where sunset gradient sits relative to terrain |
| Camera pitch | 17° up | Horizon at bottom ~15% of screen |
| Camera height | max(groundY+40, 80) | Fly altitude above terrain |
| Terrain size | 3200×3200 | Large enough that edges never reach visible horizon |
| Terrain snap | 300 units | How far before terrain re-centers |
| Fog density | 0.0012 | Subtle distance fade |
| Terrain color | #503868 | Warm purple ridgelines |
| Star count | 300 | Upper sky only |
| Thought ring radius | 1.5–4.0 | Visible but not overwhelming |
| Base speed | 4 | Gentle drift |
| Boost speed | 25 | Hold space |

## Usage in Next.js

```tsx
'use client';
import { useEffect, useRef } from 'react';
import { createCosmosScene } from '@/lib/cosmos-scene';

export default function CosmosPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const cosmos = createCosmosScene(containerRef.current, {
      onThoughtClick: (id) => console.log('clicked', id),
    });

    // Add thoughts from your data
    // cosmos.addThought('abc123', 50, 70, -100, 0xF080A0);

    return () => cosmos.dispose();
  }, []);

  return (
    <>
      <div ref={containerRef} style={{ position: 'fixed', inset: 0, zIndex: 0 }} />
      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Your UI layers on top */}
      </div>
    </>
  );
}
```
