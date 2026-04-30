'use client';
import { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { EMOTIONS, createSpirograph, type SpiroDimensions, type SpirographInstance } from '@/lib/spirograph/renderer';

export interface ThoughtData {
  id: string;
  x: number;
  y: number;
  z: number;
  emotionIndex: number;
  dimensions: SpiroDimensions;
}

export interface BondData {
  id: string;
  from_id: string;
  to_id: string;
  reason?: string;
}

export interface CosmosSceneHandle {
  flyToThought: (id: string) => void;
}

interface CosmosSceneProps {
  thoughts?: ThoughtData[];
  bonds?: BondData[];
  activeStar?: string | null;
  userStar?: string | null;
  paused?: boolean;
  onThoughtClick?: (id: string) => void;
  onBackgroundClick?: () => void;
}

interface StarSpiro {
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  sprite: THREE.Sprite;
  inst: SpirographInstance;
  timeOffset: number;   // per-star offset so animations don't sync
  frameCount: number;   // frame counter for throttling
  dims: SpiroDimensions;
}

function seededRand(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const MAX_BAKED = 50;

const CosmosScene = forwardRef<CosmosSceneHandle, CosmosSceneProps>(
  function CosmosScene({ thoughts, bonds, activeStar, userStar, paused, onThoughtClick, onBackgroundClick }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);

    const addThoughtFnRef = useRef<((t: ThoughtData) => void) | null>(null);
    const removeThoughtFnRef = useRef<((id: string) => void) | null>(null);
    const flyToFnRef = useRef<((id: string) => void) | null>(null);
    const addBondFnRef = useRef<((b: BondData) => void) | null>(null);
    const removeBondFnRef = useRef<((id: string) => void) | null>(null);
    const activeThoughtIds = useRef<Set<string>>(new Set());
    const activeBondIds = useRef<Set<string>>(new Set());

    // Readable by the Three.js animation loop without re-running setup
    const activeStarRef = useRef<string | null>(activeStar ?? null);
    const userStarRef = useRef<string | null>(userStar ?? null);
    const pausedRef = useRef<boolean>(paused ?? false);
    useEffect(() => { activeStarRef.current = activeStar ?? null; }, [activeStar]);
    useEffect(() => { userStarRef.current = userStar ?? null; }, [userStar]);
    useEffect(() => { pausedRef.current = paused ?? false; }, [paused]);

    const onClickRef = useRef(onThoughtClick);
    useEffect(() => { onClickRef.current = onThoughtClick; }, [onThoughtClick]);
    const onBgClickRef = useRef(onBackgroundClick);
    useEffect(() => { onBgClickRef.current = onBackgroundClick; }, [onBackgroundClick]);

    useImperativeHandle(ref, () => ({
      flyToThought: (id: string) => flyToFnRef.current?.(id),
    }), []);

    // ─── SCENE SETUP (runs once) ───────────────────────────────────────────
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

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
        `,
      });
      const skyDome = new THREE.Mesh(skyGeo, skyMat);
      skyDome.rotation.x = -8 * Math.PI / 180;
      scene.add(skyDome);

      // ─── BACKGROUND STARS ───
      const starCount = 300;
      const starGeo = new THREE.BufferGeometry();
      const starPositions = new Float32Array(starCount * 3);
      const starSizes = new Float32Array(starCount);
      for (let i = 0; i < starCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI * 0.45;
        const r = 880;
        starPositions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
        starPositions[i * 3 + 1] = r * Math.cos(phi);
        starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
        starSizes[i] = 1.5 + Math.random() * 2.5;
      }
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
      starGeo.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));
      const starMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
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
        `,
      });
      const bgStars = new THREE.Points(starGeo, starMat);
      scene.add(bgStars);

      // ─── TERRAIN ───
      const TERRAIN_SIZE = 3200;
      const TERRAIN_SEGS = 300;
      const terrainGeo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGS, TERRAIN_SEGS);
      const terrainMat = new THREE.MeshLambertMaterial({ color: 0x503868 });
      const terrain = new THREE.Mesh(terrainGeo, terrainMat);
      terrain.rotation.x = -Math.PI / 2;
      scene.add(terrain);

      let terrainOffsetX = 0;
      let terrainOffsetZ = 0;

      function getHeight(wx: number, wz: number): number {
        return Math.sin(wx * 0.004) * 24 + Math.sin(wz * 0.005) * 20
             + Math.sin(wx * 0.01 + wz * 0.008) * 12 + Math.sin(wx * 0.02 - wz * 0.015) * 6
             + Math.sin(wx * 0.035 + wz * 0.03) * 3 + Math.sin(wx * 0.06 - wz * 0.05) * 1.5;
      }

      function updateTerrainGeometry() {
        const pos = terrainGeo.attributes.position as THREE.BufferAttribute;
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
      const clouds: THREE.Sprite[] = [];
      for (let i = 0; i < 30; i++) {
        const c = document.createElement('canvas');
        c.width = 256; c.height = 128;
        const ctx = c.getContext('2d')!;
        const blobs = 6 + Math.floor(Math.random() * 7);
        for (let j = 0; j < blobs; j++) {
          const x = 40 + Math.random() * 176;
          const y = 20 + Math.random() * 88;
          const r = 20 + Math.random() * 40;
          const a = 0.06 + Math.random() * 0.09;
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
      const thoughtGroups = new Map<string, THREE.Group>();
      const thoughtMeshes: THREE.Mesh[] = [];
      let bakedStarCount = 0;

      // Canvas size must be ≥ 396px: outerRadius(120) × zoom(1.4) = 168px from center;
      // yOffset(30) adds 30 more to the bottom → 198px needed. 420/2 = 210 ✓
      const SPIRO_SIZE = 420;
      const SPRITE_SCALE = 12;

      function createThought(t: ThoughtData) {
        if (thoughtGroups.has(t.id)) return;
        const rand = seededRand(hashStr(t.id));
        const [er, eg, eb] = EMOTIONS[t.emotionIndex]?.rgb ?? [255, 255, 255];
        const color = (er << 16) | (eg << 8) | eb;
        const group = new THREE.Group();
        let spiro: StarSpiro | null = null;

        if (bakedStarCount < MAX_BAKED) {
          bakedStarCount++;
          const canvas = document.createElement('canvas');
          const inst = createSpirograph(canvas, t.dimensions, { size: SPIRO_SIZE, dpr: 1 });
          // Per-star time offset so animations don't all sync up
          const timeOffset = (hashStr(t.id) % 10000) / 1000;
          inst.renderStatic(timeOffset);
          const texture = new THREE.CanvasTexture(canvas);
          const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: texture, transparent: true, depthWrite: false, opacity: 1.0,
          }));
          sprite.scale.set(SPRITE_SCALE, SPRITE_SCALE, 1);
          group.add(sprite);
          spiro = { canvas, texture, sprite, inst, timeOffset, frameCount: 0, dims: t.dimensions };
        } else {
          // Glowing dot fallback beyond the 50-star cap
          const dc = document.createElement('canvas'); dc.width = 32; dc.height = 32;
          const dctx = dc.getContext('2d')!;
          const gr = dctx.createRadialGradient(16, 16, 0, 16, 16, 16);
          gr.addColorStop(0, `rgba(${er},${eg},${eb},1)`);
          gr.addColorStop(0.4, `rgba(${er},${eg},${eb},0.5)`);
          gr.addColorStop(1, 'rgba(0,0,0,0)');
          dctx.fillStyle = gr; dctx.fillRect(0, 0, 32, 32);
          const dot = new THREE.Sprite(new THREE.SpriteMaterial({
            map: new THREE.CanvasTexture(dc), transparent: true, depthWrite: false,
          }));
          dot.scale.set(4, 4, 1);
          group.add(dot);
        }

        group.add(new THREE.PointLight(color, 0.8, 40));
        const clickSphere = new THREE.Mesh(
          new THREE.SphereGeometry(5, 8, 8),
          new THREE.MeshBasicMaterial({ visible: false }),
        );
        clickSphere.userData = { thoughtId: t.id, thoughtGroup: group };
        group.add(clickSphere);
        thoughtMeshes.push(clickSphere);

        group.position.set(t.x, t.y, t.z);
        group.userData = {
          id: t.id,
          emotionIndex: t.emotionIndex,
          basePos: new THREE.Vector3(t.x, t.y, t.z),
          bobPhase: rand() * Math.PI * 2,
          bobSpeed: 0.2 + rand() * 0.3,
          baseY: t.y,
          pulsePhase: rand() * Math.PI * 2,
          orbit: null,
          spiro,
        };
        scene.add(group);
        thoughtGroups.set(t.id, group);
      }

      function destroyThought(id: string) {
        const group = thoughtGroups.get(id);
        if (!group) return;
        const spiro = group.userData.spiro as StarSpiro | null;
        if (spiro) {
          spiro.texture.dispose();
          (spiro.sprite.material as THREE.SpriteMaterial).dispose();
          bakedStarCount--;
        }
        scene.remove(group);
        group.children.forEach(child => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material.dispose();
          }
          if (child instanceof THREE.Sprite && (!spiro || child !== spiro.sprite)) {
            (child.material as THREE.SpriteMaterial).map?.dispose();
            child.material.dispose();
          }
        });
        thoughtGroups.delete(id);
        const idx = thoughtMeshes.findIndex(m => m.userData.thoughtId === id);
        if (idx >= 0) thoughtMeshes.splice(idx, 1);
      }

      // ─── BONDS ───
      interface BondLineEntry { line: THREE.Line; fromId: string; toId: string }
      const bondLines = new Map<string, BondLineEntry>();

      function createBond(b: BondData) {
        const fromGroup = thoughtGroups.get(b.from_id); // orbiter
        const toGroup   = thoughtGroups.get(b.to_id);   // anchor
        if (!fromGroup || !toGroup || bondLines.has(b.id)) return;

        // Solar system model: from_star orbits to_star (anchor).
        // Anchor stays at its deterministic basePos.
        // Count existing orbiters of this anchor to pick radius/period.
        let orbiterCount = 0;
        bondLines.forEach(entry => { if (entry.toId === b.to_id) orbiterCount++; });

        const BASE_RADIUS = 15;
        const RADIUS_STEP = 7;
        const BASE_PERIOD = 40;
        const PERIOD_STEP = 15;
        const orbitRadius = BASE_RADIUS + orbiterCount * RADIUS_STEP;
        const period = BASE_PERIOD + orbiterCount * PERIOD_STEP;

        // Derive tilt and phase from orbiter id so each orbit is distinct
        const rand = seededRand(hashStr(b.from_id + b.to_id));
        const tilt = (rand() - 0.5) * 40 * (Math.PI / 180); // -20° to +20°
        const phaseOffset = rand() * Math.PI * 2;

        fromGroup.userData.orbit = { anchorId: b.to_id, radius: orbitRadius, period, tilt, phaseOffset };

        const fromEI = fromGroup.userData.emotionIndex as number;
        const toEI   = toGroup.userData.emotionIndex as number;
        const [fr, fg, fb] = EMOTIONS[fromEI]?.rgb ?? [255, 255, 255];
        const [tr, tg, tb] = EMOTIONS[toEI]?.rgb ?? [255, 255, 255];
        const lineColor = new THREE.Color(
          ((fr + tr) / 2 / 255) * 0.55,
          ((fg + tg) / 2 / 255) * 0.55,
          ((fb + tb) / 2 / 255) * 0.55,
        );

        const linePosArr = new Float32Array(6);
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position', new THREE.BufferAttribute(linePosArr, 3));
        const lineMat = new THREE.LineBasicMaterial({
          color: lineColor, transparent: true, opacity: 0.3, depthWrite: false,
        });
        const line = new THREE.Line(lineGeo, lineMat);
        scene.add(line);
        bondLines.set(b.id, { line, fromId: b.from_id, toId: b.to_id });
      }

      function destroyBond(id: string) {
        const entry = bondLines.get(id);
        if (!entry) return;
        scene.remove(entry.line);
        entry.line.geometry.dispose();
        (entry.line.material as THREE.LineBasicMaterial).dispose();
        bondLines.delete(id);
      }

      addThoughtFnRef.current = createThought;
      removeThoughtFnRef.current = destroyThought;
      addBondFnRef.current = createBond;
      removeBondFnRef.current = destroyBond;

      // ─── CAMERA STATE ───
      let heading = 0;
      let targetHeading: number | null = null;
      let speed = 4;
      let clickBoostTime = 0;
      camera.position.set(0, 80, 0);
      let lastSnapX = 0;
      let lastSnapZ = 0;
      let disposed = false;

      flyToFnRef.current = (id: string) => {
        const g = thoughtGroups.get(id);
        if (!g) return;
        const dx = g.position.x - camera.position.x;
        const dz = g.position.z - camera.position.z;
        targetHeading = Math.atan2(dx, -dz);
        // No speed boost — camera pauses after selection
      };

      // ─── INPUT ───
      const keys: Record<string, boolean> = {};
      const onKeyDown = (e: KeyboardEvent) => { keys[e.code] = true; };
      const onKeyUp = (e: KeyboardEvent) => { keys[e.code] = false; };
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);

      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();
      const onClickCanvas = (e: MouseEvent) => {
        mouse.x = (e.clientX / container.clientWidth) * 2 - 1;
        mouse.y = -(e.clientY / container.clientHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObjects(thoughtMeshes);
        if (hits.length > 0) {
          const { thoughtId, thoughtGroup } = hits[0].object.userData as { thoughtId: string; thoughtGroup: THREE.Group };
          const dx = thoughtGroup.position.x - camera.position.x;
          const dz = thoughtGroup.position.z - camera.position.z;
          targetHeading = Math.atan2(dx, -dz);
          onClickRef.current?.(thoughtId);
        } else {
          onBgClickRef.current?.();
        }
      };
      renderer.domElement.addEventListener('click', onClickCanvas);

      const onResize = () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
      };
      window.addEventListener('resize', onResize);

      // ─── ANIMATION ───
      const clock = new THREE.Clock();

      function animate() {
        if (disposed) return;
        requestAnimationFrame(animate);
        const dt = Math.min(clock.getDelta(), 0.05);
        const time = clock.getElapsedTime();

        skyMat.uniforms.uTime.value = time;
        skyDome.position.copy(camera.position);
        bgStars.position.copy(camera.position);
        starMat.uniforms.uTime.value = time;

        const isPaused = pausedRef.current;
        const targetSpeed = isPaused ? 0 : (keys['Space'] ? 25 : (clickBoostTime > 0 ? 18 : 4));
        speed += (targetSpeed - speed) * dt * (isPaused ? 8 : 3);
        if (clickBoostTime > 0) clickBoostTime -= dt;

        if (targetHeading !== null) {
          let diff = targetHeading - heading;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          heading += diff * dt * 1.5;
          if (Math.abs(diff) < 0.05) targetHeading = null;
        }

        const fwdX = Math.sin(heading);
        const fwdZ = -Math.cos(heading);
        if (!isPaused) {
          camera.position.x += fwdX * speed * dt;
          camera.position.z += fwdZ * speed * dt;
        }
        camera.position.y = Math.max(getHeight(camera.position.x, camera.position.z) + 40, 80 + Math.sin(time * 0.3) * 0.4);

        const lookDist = 200;
        camera.lookAt(new THREE.Vector3(
          camera.position.x + fwdX * lookDist,
          camera.position.y + Math.tan(17 * Math.PI / 180) * lookDist,
          camera.position.z + fwdZ * lookDist,
        ));

        if (Math.abs(camera.position.x - lastSnapX) > 300 || Math.abs(camera.position.z - lastSnapZ) > 300) {
          lastSnapX = Math.round(camera.position.x / 300) * 300;
          lastSnapZ = Math.round(camera.position.z / 300) * 300;
          terrainOffsetX = lastSnapX;
          terrainOffsetZ = lastSnapZ;
          terrain.position.set(lastSnapX, 0, lastSnapZ);
          updateTerrainGeometry();
        }

        // Animate thoughts — two passes so anchors are positioned before their orbiters
        // Pass 1: non-orbiters (anchors and free stars)
        thoughtGroups.forEach(g => {
          if (g.userData.orbit) return; // skip orbiters in pass 1
          g.position.y = (g.userData.baseY as number) + Math.sin(time * (g.userData.bobSpeed as number) + (g.userData.bobPhase as number)) * 1.0;
        });
        // Pass 2: orbiters (may orbit anchors that were just updated above)
        thoughtGroups.forEach(g => {
          const orbit = g.userData.orbit as { anchorId: string; radius: number; period: number; tilt: number; phaseOffset: number } | null;
          if (!orbit) return;
          const anchorGroup = thoughtGroups.get(orbit.anchorId);
          if (!anchorGroup) {
            g.position.y = (g.userData.baseY as number) + Math.sin(time * (g.userData.bobSpeed as number) + (g.userData.bobPhase as number)) * 1.0;
            return;
          }
          const angle = (time / orbit.period) * Math.PI * 2 + orbit.phaseOffset;
          g.position.x = anchorGroup.position.x + Math.cos(angle) * orbit.radius;
          g.position.z = anchorGroup.position.z + Math.sin(angle) * orbit.radius * Math.cos(orbit.tilt);
          g.position.y = anchorGroup.position.y + Math.sin(angle) * orbit.radius * Math.sin(orbit.tilt);
        });
        // Pass 3: scale pulse + spiro animation for all stars
        thoughtGroups.forEach(g => {
          const id = g.userData.id as string;
          g.scale.setScalar(1.0 + Math.sin(time * 0.8 + (g.userData.pulsePhase as number)) * 0.05);

          const spiro = g.userData.spiro as StarSpiro | null;
          if (!spiro) return;

          // All stars animate continuously. Active/user stars update every frame;
          // others update every other frame (~30fps) to spread GPU texture uploads.
          const isActive = id === activeStarRef.current || id === userStarRef.current;
          spiro.frameCount++;
          if (isActive || spiro.frameCount % 2 === 0) {
            spiro.inst.renderStatic(time + spiro.timeOffset);
            spiro.texture.needsUpdate = true;
          }
        });

        // Update bond lines — endpoints + proximity brightness
        bondLines.forEach(({ line, fromId, toId }) => {
          const fromG = thoughtGroups.get(fromId);
          const toG   = thoughtGroups.get(toId);
          if (!fromG || !toG) return;
          const pos = line.geometry.attributes.position as THREE.BufferAttribute;
          pos.setXYZ(0, fromG.position.x, fromG.position.y, fromG.position.z);
          pos.setXYZ(1, toG.position.x,   toG.position.y,   toG.position.z);
          pos.needsUpdate = true;
          const mx = (fromG.position.x + toG.position.x) / 2;
          const mz = (fromG.position.z + toG.position.z) / 2;
          const bdx = mx - camera.position.x;
          const bdz = mz - camera.position.z;
          const nearby = (bdx * bdx + bdz * bdz) < 50 * 50;
          const mat = line.material as THREE.LineBasicMaterial;
          mat.opacity += ((nearby ? 0.7 : 0.3) - mat.opacity) * dt * 3;
        });

        // Clouds
        for (const cloud of clouds) {
          cloud.position.x += (cloud.userData.dx as number) * dt;
          cloud.position.z += (cloud.userData.dz as number) * dt;
          const cdx = cloud.position.x - camera.position.x;
          const cdz = cloud.position.z - camera.position.z;
          if (cdx * cdx + cdz * cdz > 320 * 320) {
            const a = Math.random() * Math.PI * 2;
            const d = 100 + Math.random() * 180;
            cloud.position.set(
              camera.position.x + Math.cos(a) * d,
              25 + Math.random() * 50,
              camera.position.z + Math.sin(a) * d,
            );
          }
        }

        renderer.render(scene, camera);
      }
      animate();

      return () => {
        disposed = true;
        addThoughtFnRef.current = null;
        removeThoughtFnRef.current = null;
        flyToFnRef.current = null;
        addBondFnRef.current = null;
        removeBondFnRef.current = null;

        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('resize', onResize);
        renderer.domElement.removeEventListener('click', onClickCanvas);

        bondLines.forEach((_, id) => destroyBond(id));
        thoughtGroups.forEach((_, id) => destroyThought(id));

        renderer.dispose();
        terrainGeo.dispose();
        terrainMat.dispose();
        skyGeo.dispose();
        skyMat.dispose();
        starGeo.dispose();
        starMat.dispose();
        clouds.forEach(c => {
          (c.material as THREE.SpriteMaterial).map?.dispose();
          c.material.dispose();
        });

        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      };
    }, []);

    // ─── THOUGHTS SYNC ────────────────────────────────────────────────────
    useEffect(() => {
      const add = addThoughtFnRef.current;
      const remove = removeThoughtFnRef.current;
      if (!add || !remove) return;

      const next = new Set(thoughts?.map(t => t.id) ?? []);

      for (const t of (thoughts ?? [])) {
        if (!activeThoughtIds.current.has(t.id)) {
          add(t);
          activeThoughtIds.current.add(t.id);
        }
      }

      for (const id of [...activeThoughtIds.current]) {
        if (!next.has(id)) {
          remove(id);
          activeThoughtIds.current.delete(id);
        }
      }
    }, [thoughts]);

    // ─── BONDS SYNC ───────────────────────────────────────────────────────
    useEffect(() => {
      const add = addBondFnRef.current;
      const remove = removeBondFnRef.current;
      if (!add || !remove) return;

      const next = new Set(bonds?.map(b => b.id) ?? []);

      for (const b of (bonds ?? [])) {
        if (!activeBondIds.current.has(b.id)) {
          add(b);
          activeBondIds.current.add(b.id);
        }
      }

      for (const id of [...activeBondIds.current]) {
        if (!next.has(id)) {
          remove(id);
          activeBondIds.current.delete(id);
        }
      }
    }, [bonds]);

    return (
      <div
        ref={containerRef}
        style={{ position: 'fixed', inset: 0, zIndex: 0 }}
      />
    );
  },
);

export default CosmosScene;
