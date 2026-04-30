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
  turnRight: () => void;
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
const LIVE_SIZE = 1024;  // hi-res canvas for the selected star
const SELECTED_SCALE_MULT = 1.4; // sprite scale boost when star is selected
// Sun sits slightly below horizon, directly in front of initial camera heading
const SUN_DIRECTION = new THREE.Vector3(0, -0.15, -1).normalize();

const CosmosScene = forwardRef<CosmosSceneHandle, CosmosSceneProps>(
  function CosmosScene({ thoughts, bonds, activeStar, userStar, paused, onThoughtClick, onBackgroundClick }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);

    const addThoughtFnRef = useRef<((t: ThoughtData) => void) | null>(null);
    const removeThoughtFnRef = useRef<((id: string) => void) | null>(null);
    const flyToFnRef = useRef<((id: string) => void) | null>(null);
    const turnRightFnRef = useRef<(() => void) | null>(null);
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
      turnRight: () => turnRightFnRef.current?.(),
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
      renderer.toneMappingExposure = 0.75;
      container.appendChild(renderer.domElement);

      // ─── LIGHTING ───
      scene.add(new THREE.AmbientLight(0x6B4D8A, 0.8));
      const dirLight = new THREE.DirectionalLight(0xF0C080, 0.4);
      dirLight.position.set(0, 5, -200);
      scene.add(dirLight);
      scene.add(new THREE.HemisphereLight(0x5A3D78, 0x1E1030, 0.3));

      // ─── SKY DOME — radial gradient emanating from a fixed sun point ───
      const skyGeo = new THREE.SphereGeometry(900, 64, 64);
      const skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: { uTime: { value: 0 }, uSunDir: { value: SUN_DIRECTION } },
        vertexShader: `
          varying vec3 vWorldDir;
          void main() {
            vWorldDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3  uSunDir;
          uniform float uTime;
          varying vec3  vWorldDir;

          vec3 twiGrad(float t) {
            // t = 0 at sun point, t = 1 at opposite pole
            // Warm zone is narrow — purples dominate by ~25° out
            vec3 c0  = vec3(160.0,100.0,140.0)/255.0; //   0° dim rose-mauve
            vec3 c1  = vec3(130.0, 88.0,138.0)/255.0; //  10° rose-purple
            vec3 c2  = vec3(108.0, 78.0,135.0)/255.0; //  20° purple
            vec3 c3  = vec3( 88.0, 65.0,125.0)/255.0; //  35° mid purple
            vec3 c4  = vec3( 68.0, 52.0,112.0)/255.0; //  55° purple
            vec3 c5  = vec3( 50.0, 39.0, 96.0)/255.0; //  75° dark purple
            vec3 c6  = vec3( 36.0, 28.0, 78.0)/255.0; //  95° deep purple
            vec3 c7  = vec3( 24.0, 19.0, 58.0)/255.0; // 115° indigo
            vec3 c8  = vec3( 16.0, 13.0, 42.0)/255.0; // 140° near black-blue
            vec3 c9  = vec3( 10.0,  8.0, 28.0)/255.0; // 180° near black
            if (t < 0.056) return mix(c0, c1, smoothstep(0.000,0.056,t));
            if (t < 0.111) return mix(c1, c2, smoothstep(0.056,0.111,t));
            if (t < 0.194) return mix(c2, c3, smoothstep(0.111,0.194,t));
            if (t < 0.305) return mix(c3, c4, smoothstep(0.194,0.305,t));
            if (t < 0.416) return mix(c4, c5, smoothstep(0.305,0.416,t));
            if (t < 0.528) return mix(c5, c6, smoothstep(0.416,0.528,t));
            if (t < 0.639) return mix(c6, c7, smoothstep(0.528,0.639,t));
            if (t < 0.778) return mix(c7, c8, smoothstep(0.639,0.778,t));
            return             mix(c8, c9, smoothstep(0.778,1.000,t));
          }

          void main() {
            vec3 dir  = normalize(vWorldDir);
            float cosA = dot(dir, uSunDir);
            float t   = acos(clamp(cosA, -1.0, 1.0)) / 3.14159265;
            vec3 color = twiGrad(t);
            // Faint violet glow near sun — keeps it subtle
            float haze = max(0.0, cosA - 0.95);
            color += vec3(0.18, 0.08, 0.22) * haze * 3.0;
            // Very gentle breathing pulse
            color *= 1.0 + sin(uTime * 0.07) * 0.006;
            gl_FragColor = vec4(color, 1.0);
          }
        `,
      });
      const skyDome = new THREE.Mesh(skyGeo, skyMat);
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
      const terrainMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: true,
        vertexShader: `
          varying float vDistFromCam;
          varying float vFlatness;
          void main() {
            vec4 worldPos = modelMatrix * vec4(position, 1.0);
            vDistFromCam = length(worldPos.xz - cameraPosition.xz);
            // normal.z ≈ flatness in local space (PlaneGeometry normal = local +Z)
            vec3 wn = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
            vFlatness = wn.y;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying float vDistFromCam;
          varying float vFlatness;
          void main() {
            vec3 flatColor  = vec3(80.0,  56.0, 104.0) / 255.0; // #503868
            vec3 slopeColor = vec3(50.0,  36.0,  70.0) / 255.0; // darker
            vec3 color = mix(slopeColor, flatColor, vFlatness * vFlatness);
            float fade = 1.0 - smoothstep(500.0, 1000.0, vDistFromCam);
            if (fade < 0.01) discard;
            gl_FragColor = vec4(color, fade);
          }
        `,
      });
      const terrain = new THREE.Mesh(terrainGeo, terrainMat);
      terrain.rotation.x = -Math.PI / 2;
      terrain.renderOrder = -1; // render before transparent sprites for correct depth
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
      interface LiveEntry { canvas: HTMLCanvasElement; inst: SpirographInstance; texture: THREE.CanvasTexture; origTexture: THREE.Texture }
      const liveStars = new Map<string, LiveEntry>();
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

      function activateLive(id: string) {
        if (liveStars.has(id)) return;
        const g = thoughtGroups.get(id);
        if (!g) return;
        const spiro = g.userData.spiro as StarSpiro | null;
        if (!spiro) return;
        const canvas = document.createElement('canvas');
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const inst = createSpirograph(canvas, spiro.dims, { size: LIVE_SIZE, dpr });
        inst.start();
        const texture = new THREE.CanvasTexture(canvas);
        const mat = spiro.sprite.material as THREE.SpriteMaterial;
        const origTexture = mat.map!;
        mat.map = texture;
        mat.needsUpdate = true;
        liveStars.set(id, { canvas, inst, texture, origTexture });
      }

      function deactivateLive(id: string) {
        const live = liveStars.get(id);
        if (!live) return;
        live.inst.stop();
        const g = thoughtGroups.get(id);
        if (g) {
          const spiro = g.userData.spiro as StarSpiro | null;
          if (spiro) {
            const mat = spiro.sprite.material as THREE.SpriteMaterial;
            mat.map = live.origTexture;
            mat.needsUpdate = true;
          }
        }
        live.texture.dispose();
        liveStars.delete(id);
      }

      function destroyThought(id: string) {
        deactivateLive(id);
        if (id === activeStarRef.current) flyTargetXZ = null;
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
      // Initial heading toward SUN_DIRECTION (sunset straight ahead)
      let heading = Math.atan2(SUN_DIRECTION.x, -SUN_DIRECTION.z);
      let targetHeading: number | null = null;
      let flyTargetXZ: { x: number; z: number } | null = null;
      let flyStarTargetY = 90; // camera Y to aim for during flyTo
      let camTargetY = 90;
      let speed = 4;
      let pitch = -0.035; // radians; negative = slight downward gaze
      camera.position.set(0, 90, 0);
      let lastSnapX = 0;
      let lastSnapZ = 0;
      let disposed = false;

      flyToFnRef.current = (id: string) => {
        const g = thoughtGroups.get(id);
        if (!g) return;
        const starPos = g.position;
        const dx = starPos.x - camera.position.x;
        const dz = starPos.z - camera.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        targetHeading = Math.atan2(dx, -dz);
        const stopDist = 60;
        if (dist > stopDist + 2) {
          const t = (dist - stopDist) / dist;
          flyTargetXZ = {
            x: camera.position.x + dx * t,
            z: camera.position.z + dz * t,
          };
        } else {
          flyTargetXZ = null;
        }
        // Camera stops slightly below star so star sits in the upper viewport
        flyStarTargetY = Math.max(starPos.y - 14, 60);
      };

      turnRightFnRef.current = () => {
        targetHeading = heading + Math.PI / 2;
        flyTargetXZ = null;
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
      let prevActiveStar: string | null = null;

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

        // Activate/deactivate high-res live texture as active star changes
        const currentActiveStar = activeStarRef.current;
        if (currentActiveStar !== prevActiveStar) {
          if (prevActiveStar) deactivateLive(prevActiveStar);
          if (currentActiveStar) activateLive(currentActiveStar);
          prevActiveStar = currentActiveStar;
        }

        // Heading: smooth toward target, or very slow drift when idle
        if (targetHeading !== null) {
          let diff = targetHeading - heading;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          heading += diff * dt * 1.5;
          if (Math.abs(diff) < 0.05) targetHeading = null;
        } else if (!isPaused && !flyTargetXZ) {
          // One rotation every ~50 minutes — sunset slowly sweeps across the view
          heading += 0.002 * dt;
        }

        const fwdX = Math.sin(heading);
        const fwdZ = -Math.cos(heading);
        // Sun always in front of camera so warm glow stays ahead
        skyMat.uniforms.uSunDir.value.set(fwdX, -0.15, fwdZ).normalize();

        // Speed for free drift
        const targetSpeed = isPaused ? 0 : (keys['Space'] ? 25 : 4);
        speed += (targetSpeed - speed) * dt * 3;

        // Horizontal position
        if (flyTargetXZ) {
          const fdx = flyTargetXZ.x - camera.position.x;
          const fdz = flyTargetXZ.z - camera.position.z;
          const fdist = Math.sqrt(fdx * fdx + fdz * fdz);
          if (fdist < 2) {
            flyTargetXZ = null;
          } else {
            const flyAmt = Math.min(fdist, 90 * dt);
            camera.position.x += (fdx / fdist) * flyAmt;
            camera.position.z += (fdz / fdist) * flyAmt;
          }
        } else if (!isPaused) {
          camera.position.x += fwdX * speed * dt;
          camera.position.z += fwdZ * speed * dt;
        }

        // Camera Y — smooth lerp; tracks terrain floor in free mode, star approach Y in flyTo
        const terrainFloor = Math.max(getHeight(camera.position.x, camera.position.z) + 40, 80);
        if (flyTargetXZ) {
          camTargetY = Math.max(flyStarTargetY, terrainFloor);
        } else if (activeStarRef.current) {
          const ag = thoughtGroups.get(activeStarRef.current);
          camTargetY = ag ? Math.max(ag.position.y - 14, terrainFloor) : terrainFloor;
        } else {
          camTargetY = terrainFloor;
        }
        camera.position.y += (camTargetY - camera.position.y) * Math.min(dt * 2.5, 1);

        // Pitch-based smooth lookAt — angles interpolate, no world-space jump on star click
        const activeId = activeStarRef.current;
        if (activeId) {
          const ag = thoughtGroups.get(activeId);
          if (ag) {
            const dx = ag.position.x - camera.position.x;
            const dz = ag.position.z - camera.position.z;
            const dy = (ag.position.y - 4) - camera.position.y;
            const hDist = Math.max(Math.sqrt(dx * dx + dz * dz), 0.01);
            pitch += (Math.atan2(dy, hDist) - pitch) * Math.min(dt * 2.5, 1);
          }
        } else {
          pitch += (-0.035 - pitch) * Math.min(dt * 1.5, 1);
        }
        const cosP = Math.cos(pitch);
        const sinP = Math.sin(pitch);
        camera.lookAt(new THREE.Vector3(
          camera.position.x + fwdX * cosP * 200,
          camera.position.y + sinP * 200,
          camera.position.z + fwdZ * cosP * 200,
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
          const isSelected = id === activeStarRef.current;
          const baseScale = 1.0 + Math.sin(time * 0.8 + (g.userData.pulsePhase as number)) * 0.05;
          g.scale.setScalar(baseScale * (isSelected ? SELECTED_SCALE_MULT : 1.0));

          const spiro = g.userData.spiro as StarSpiro | null;
          if (!spiro) return;

          const live = liveStars.get(id);
          if (live) {
            // Live stars animate via their own RAF loop; just tell Three.js to re-upload
            live.texture.needsUpdate = true;
          } else {
            // Baked stars use renderStatic; active/user stars every frame, others ~30fps
            const isActive = isSelected || id === userStarRef.current;
            spiro.frameCount++;
            if (isActive || spiro.frameCount % 2 === 0) {
              spiro.inst.renderStatic(time + spiro.timeOffset);
              spiro.texture.needsUpdate = true;
            }
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
        turnRightFnRef.current = null;
        addBondFnRef.current = null;
        removeBondFnRef.current = null;

        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('resize', onResize);
        renderer.domElement.removeEventListener('click', onClickCanvas);

        liveStars.forEach(live => { live.inst.stop(); live.texture.dispose(); });
        liveStars.clear();
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
