'use client';
import { useRef, useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { EMOTIONS, createSpirograph, type SpiroDimensions, type SpirographInstance } from '@/lib/spirograph/renderer';
import { DEFAULT_ATMOSPHERE, type AtmosphereConfig, type SkyStop } from '@/lib/atmosphere';
import { sound } from '@/lib/sound';
import {
  BloomChoreographer, OrbitInscription, orderRingForReading,
  NEAR_SIDE, GLYPH_EM, PREFERRED_FONT, type ScreenPoint,
} from './moments';

export interface ThoughtData {
  id: string;
  x: number;
  y: number;
  z: number;
  emotionIndex: number;
  dimensions: SpiroDimensions;
  /** Answer text — shown during drift dwell and as a smoke/ghost effect on hover */
  answer?: string;
  /** Unique fact — the byline shown under the answer during drift dwell */
  uniqueFact?: string;
}

export interface BondData {
  id: string;
  from_id: string;
  to_id: string;
  reason?: string;
}

/**
 * Camera mode state machine:
 *   drift   — autonomous tour: glide star→star, dwell and show the thought
 *   manual  — the visitor has the stick: drag-look, wheel/pinch move, WASD
 *   focused — a star is selected (panel open); the camera frames it
 */
export type CamMode = 'drift' | 'manual' | 'focused';

export interface CosmosSceneHandle {
  flyToThought: (id: string) => void;
  /** Turn drift on (enters drift immediately unless a star is focused) or off. */
  setDrifting: (on: boolean) => void;
  /**
   * Phase 4 — sky rail world switch. Fades the current star field out,
   * lerps the sky/terrain/star/cloud atmosphere to `atmosphere`, then calls
   * `onMidpoint` (once the fade-out completes) so the caller can swap the
   * `thoughts`/`bonds` props to the new question's data — newly-appearing
   * stars fade in automatically. The camera's position/orientation and the
   * drift/manual/focused mode are untouched; drift's visited-set resets so
   * it explores the new world fresh.
   */
  crossfadeToWorld: (atmosphere: AtmosphereConfig, onMidpoint: () => void) => void;
  /**
   * Phase 8 — star birth. Holds the star at nothing, then blooms it in place
   * (scale/opacity/glow) once the camera has glided close enough for the
   * moment to read. The birth sound fires on that same frame, so the bloom is
   * never heard before it is seen.
   */
  bloomStar: (id: string) => void;
  /**
   * Phase 8 — the bond finale. Both stars bloom together and the reason is
   * written once along the orbit they now share, then it is gone.
   */
  bondFinale: (fromId: string, toId: string, reason: string) => void;
}

// Crossfade timing — exported so callers can guard re-entrancy for exactly
// this long without duplicating the constant.
export const CROSSFADE_OUT_MS = 650;
export const CROSSFADE_IN_MS = 900;

interface CosmosSceneProps {
  thoughts?: ThoughtData[];
  bonds?: BondData[];
  activeStar?: string | null;
  userStar?: string | null;
  onThoughtClick?: (id: string) => void;
  onBackgroundClick?: () => void;
  /** Fires whenever the camera mode changes. Initial mode is 'drift'. */
  onModeChange?: (mode: CamMode) => void;
  /** Fires each time a drift dwell begins on a new star — useful for counting thoughts seen. */
  onDwell?: (thoughtId: string) => void;
  /** Sky/terrain/star/cloud atmosphere for the world at mount. Defaults to
   *  DEFAULT_ATMOSPHERE. Subsequent world switches go through the
   *  `crossfadeToWorld` imperative handle, not this prop. */
  initialAtmosphere?: AtmosphereConfig;
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

// Builds the sky dome's horizon→zenith gradient as a 256×1 canvas texture —
// smooth interpolation, no GLSL banding. Shared by the mount-time sky and
// every Phase 4 world-switch crossfade (see AtmosphereConfig.skyStops).
function buildSkyGradientTexture(stops: SkyStop[]): THREE.CanvasTexture {
  const gc = document.createElement('canvas');
  gc.width = 256; gc.height = 1;
  const gx = gc.getContext('2d')!;
  const grd = gx.createLinearGradient(0, 0, 256, 0);
  for (const s of stops) grd.addColorStop(s.offset, s.color);
  gx.fillStyle = grd;
  gx.fillRect(0, 0, 256, 1);
  const tex = new THREE.CanvasTexture(gc);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (tex as any).encoding = 3001; // THREE.sRGBEncoding
  return tex;
}

const MAX_BAKED = 50;
// Extra slots for on-demand dot→spiro upgrades as the camera approaches.
// Keeps memory bounded while ensuring nearby stars never stay as blobs.
const MAX_PROXIMITY_UPGRADES = 20;
// Canvas must be large enough that the glow (outerRadius 120 × zoom 1.4 + yOffset 30)
// never clips. At size=560 the bottom margin is ~82px — safe even with glow overlap.
const SPIRO_SIZE_LIVE = 560; // used for both baked and live so visual size stays identical
const SELECTED_SCALE_MULT = 1.75; // ~30 % of viewport height when focused at stop-dist
// Sun sits slightly below horizon, directly in front of initial camera heading
const SUN_DIRECTION = new THREE.Vector3(0, -0.15, -1).normalize();

const CosmosScene = forwardRef<CosmosSceneHandle, CosmosSceneProps>(
  function CosmosScene({ thoughts, bonds, activeStar, userStar, onThoughtClick, onBackgroundClick, onModeChange, onDwell, initialAtmosphere }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const perfOverlayRef = useRef<HTMLPreElement>(null);

    const addThoughtFnRef = useRef<((t: ThoughtData) => void) | null>(null);
    const removeThoughtFnRef = useRef<((id: string) => void) | null>(null);
    const flyToFnRef = useRef<((id: string) => void) | null>(null);
    const setDriftingFnRef = useRef<((on: boolean) => void) | null>(null);
    const addBondFnRef = useRef<((b: BondData) => void) | null>(null);
    const removeBondFnRef = useRef<((id: string) => void) | null>(null);
    const crossfadeFnRef = useRef<((atmosphere: AtmosphereConfig, onMidpoint: () => void) => void) | null>(null);
    const bloomStarFnRef = useRef<((id: string) => void) | null>(null);
    const bondFinaleFnRef = useRef<((fromId: string, toId: string, reason: string) => void) | null>(null);
    const activeThoughtIds = useRef<Set<string>>(new Set());
    const activeBondIds = useRef<Set<string>>(new Set());

    // Readable by the Three.js animation loop without re-running setup
    const activeStarRef = useRef<string | null>(activeStar ?? null);
    const userStarRef = useRef<string | null>(userStar ?? null);
    useEffect(() => { activeStarRef.current = activeStar ?? null; }, [activeStar]);
    useEffect(() => { userStarRef.current = userStar ?? null; }, [userStar]);

    // Baked-in sky/terrain values
    const SKY_BRIGHT  = 1.10;
    const TERRAIN_BRIGHT = 1.00;
    const BASE_CAM_Y  = 65;

    // The atmosphere this scene mounted with — subsequent world switches go
    // through crossfadeToWorld(), not this prop (see CosmosSceneProps).
    const atmo0 = initialAtmosphere ?? DEFAULT_ATMOSPHERE;

    // Baked star/terrain tweaks — seeded from the mount-time atmosphere,
    // then live-tweened by crossfadeToWorld() on every subsequent switch.
    const dbgTerrainGlowRef = useRef(atmo0.terrainGlow);
    const dbgStarDensityRef = useRef(atmo0.starDensity);
    const dbgStarSpeedRef   = useRef(0.50);
    const dbgStarFloorRef   = useRef(atmo0.starFloor);

    const gradLiftRef  = useRef(atmo0.gradLift);
    const gradSteepRef = useRef(atmo0.gradSteep);
    const sunShiftRef  = useRef(atmo0.sunShift);

    const onClickRef = useRef(onThoughtClick);
    useEffect(() => { onClickRef.current = onThoughtClick; }, [onThoughtClick]);
    const onBgClickRef = useRef(onBackgroundClick);
    useEffect(() => { onBgClickRef.current = onBackgroundClick; }, [onBackgroundClick]);
    const onModeChangeRef = useRef(onModeChange);
    useEffect(() => { onModeChangeRef.current = onModeChange; }, [onModeChange]);
    const onDwellRef = useRef(onDwell);
    useEffect(() => { onDwellRef.current = onDwell; }, [onDwell]);

    useImperativeHandle(ref, () => ({
      flyToThought: (id: string) => flyToFnRef.current?.(id),
      setDrifting: (on: boolean) => setDriftingFnRef.current?.(on),
      crossfadeToWorld: (atmosphere: AtmosphereConfig, onMidpoint: () => void) =>
        crossfadeFnRef.current?.(atmosphere, onMidpoint),
      bloomStar: (id: string) => bloomStarFnRef.current?.(id),
      bondFinale: (fromId: string, toId: string, reason: string) =>
        bondFinaleFnRef.current?.(fromId, toId, reason),
    }), []);

    // ─── SCENE SETUP (runs once) ───────────────────────────────────────────
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.5, 2000);
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setSize(container.clientWidth, container.clientHeight);
      // Mobile: force 1.0 — iPhone 14 Pro is 3×, that's 9× the pixels of 1×.
      // Desktop: cap at 1.5 — the extra sharpness beyond 1.5× is imperceptible on a 3D cosmos.
      const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
      renderer.setPixelRatio(isMobile ? 1.0 : Math.min(window.devicePixelRatio, 1.5));
      renderer.toneMapping = THREE.NoToneMapping;
      // sRGBEncoding matches the browser canvas color space — spirographs look as vivid in 3D as in 2D
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (renderer as any).outputEncoding = 3001; // THREE.sRGBEncoding
      renderer.toneMappingExposure = 1.0;
      container.appendChild(renderer.domElement);

      // ─── LIGHTING ───
      const ambientLight = new THREE.AmbientLight(0x6B4D8A, 0.8);
      scene.add(ambientLight);
      const dirLight = new THREE.DirectionalLight(0xF0C080, 0.4);
      dirLight.position.set(0, 5, -200);
      scene.add(dirLight);
      scene.add(new THREE.HemisphereLight(0x5A3D78, 0x1E1030, 0.3));

      // ─── SKY DOME — radial gradient emanating from a fixed sun point ───
      // 32×16 = 512 triangles vs 64×64 = 4096 — sky is a smooth gradient, no detail needed
      const skyGeo = new THREE.SphereGeometry(900, 32, 16);
      const skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: {
          uTime:      { value: 0 },
          uSunDir:    { value: SUN_DIRECTION },
          uBrightness:{ value: SKY_BRIGHT },
          uGradSteep: { value: atmo0.gradSteep },
          uGradLift:  { value: atmo0.gradLift },
          uSunShift:  { value: atmo0.sunShift },
          uSkyGrad:   { value: null as THREE.Texture | null },
          // Phase 4 world-switch crossfade: uSkyGrad is world A (current),
          // uSkyGradB is world B (incoming); uMix eases 0→1 during the fade,
          // then CosmosScene commits B → A and resets uMix to 0.
          uSkyGradB:  { value: null as THREE.Texture | null },
          uMix:       { value: 0 },
        },
        vertexShader: `
          varying vec3 vWorldDir;
          void main() {
            vWorldDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3      uSunDir;
          uniform float     uTime;
          uniform float     uBrightness;
          uniform float     uGradSteep;
          uniform float     uGradLift;
          uniform float     uSunShift;
          uniform sampler2D uSkyGrad;
          uniform sampler2D uSkyGradB;
          uniform float     uMix;
          varying vec3      vWorldDir;

          void main() {
            vec3 dir = normalize(vWorldDir);

            float t = clamp(dir.y * uGradSteep + uGradLift, 0.0, 1.0);

            float sunAz = dot(normalize(dir.xz + vec2(0.0001)), normalize(uSunDir.xz + vec2(0.0001)));
            float horizBand = 1.0 - smoothstep(0.0, uGradLift + 0.06, abs(dir.y));
            float sunInfluence = pow(max(sunAz, 0.0), 3.0) * horizBand;
            t = clamp(t - sunInfluence * uSunShift, 0.0, 1.0);

            // Sample baked gradient textures — smooth, no GLSL banding —
            // and cross-dissolve between the current and incoming world.
            vec3 colorA = texture2D(uSkyGrad, vec2(t, 0.5)).rgb;
            vec3 colorB = texture2D(uSkyGradB, vec2(t, 0.5)).rgb;
            vec3 color = mix(colorA, colorB, uMix);
            color *= 1.0 + sin(uTime * 0.07) * 0.006;
            gl_FragColor = vec4(color * uBrightness, 1.0);
          }
        `,
      });
      const skyDome = new THREE.Mesh(skyGeo, skyMat);
      scene.add(skyDome);

      // Build the initial gradient texture from canvas so interpolation is
      // smooth (no GLSL banding). t=0 (x=0) = warm amber at horizon; t=1
      // (x=255) = space-blue night at zenith. Parameterized by atmo0.skyStops
      // so each world's variant (src/lib/atmosphere.ts) reuses this exact
      // build path — see buildSkyGradientTexture() below.
      {
        const skyGradTex = buildSkyGradientTexture(atmo0.skyStops);
        skyMat.uniforms.uSkyGrad.value = skyGradTex;
        // Seed B with the same texture — irrelevant while uMix=0, and
        // crossfadeToWorld() always replaces it before ever raising uMix.
        skyMat.uniforms.uSkyGradB.value = skyGradTex;
      }

      // ─── BACKGROUND STARS ───
      const starCount = 700;
      const starGeo = new THREE.BufferGeometry();
      const starPositions = new Float32Array(starCount * 3);
      const starSizes = new Float32Array(starCount);
      for (let i = 0; i < starCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        // 55% in the top 30° dome, 45% spread across upper 75° — many more visible at zenith
        const phi = i < starCount * 0.55
          ? Math.random() * Math.PI * 0.17
          : Math.random() * Math.PI * 0.42;
        const r = 880;
        starPositions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
        starPositions[i * 3 + 1] = r * Math.cos(phi);
        starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
        starSizes[i] = 1.2 + Math.random() * 2.8;
      }
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
      starGeo.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));
      const starMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uStarDensity: { value: 0.70 },
          uStarSpeed:   { value: 0.50 },
          uStarFloor:   { value: 0.60 },
        },
        vertexShader: `
          attribute float size;
          varying float vSize;
          void main() {
            vSize = size;
            vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
            // Stars orbit at r=880; 300→900 keeps them 1-4px instead of sub-pixel
          gl_PointSize = size * (900.0 / -mvPos.z);
            gl_Position = projectionMatrix * mvPos;
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform float uStarDensity;
          uniform float uStarSpeed;
          uniform float uStarFloor;
          varying float vSize;
          void main() {
            float d = length(gl_PointCoord - vec2(0.5));
            if (d > 0.5) discard;
            float alpha = smoothstep(0.5, 0.0, d) * uStarDensity;
            // Base rate ~1 rad/s so speed=1 gives ~6 second cycle; speed=3 gives ~2 seconds
            float flicker = uStarFloor + (1.0 - uStarFloor) *
              (0.5 + 0.5 * sin(uTime * uStarSpeed * (1.0 + vSize * 0.1) + vSize * 10.0));
            alpha *= flicker;
            gl_FragColor = vec4(0.92, 0.88, 1.0, alpha);
          }
        `,
      });
      const bgStars = new THREE.Points(starGeo, starMat);
      scene.add(bgStars);

      // ─── TERRAIN ───
      const TERRAIN_SIZE = 5600;
      // 80 segs = 6,561 vertices vs 300 segs = 90,601 — terrain snap update is 14× faster
      const TERRAIN_SEGS = 80;
      const terrainGeo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGS, TERRAIN_SEGS);
      const terrainMat = new THREE.ShaderMaterial({
        transparent: false,
        depthWrite: true,
        uniforms: { uTerrainBright: { value: TERRAIN_BRIGHT }, uTerrainGlow: { value: 0.30 } },
        vertexShader: `
          varying float vDistFromCam;
          varying float vFlatness;
          void main() {
            vec4 worldPos = modelMatrix * vec4(position, 1.0);
            vDistFromCam = length(worldPos.xz - cameraPosition.xz);
            vec3 wn = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
            vFlatness = wn.y;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTerrainBright;
          uniform float uTerrainGlow;
          varying float vDistFromCam;
          varying float vFlatness;
          void main() {
            vec3 flatColor  = vec3(80.0,  56.0, 104.0) / 255.0;
            vec3 slopeColor = vec3(50.0,  36.0,  70.0) / 255.0;
            vec3 color = mix(slopeColor, flatColor, vFlatness * vFlatness) * uTerrainBright;
            // Silhouette: lerp from near-black to warm amber based on uTerrainGlow dial
            vec3 darkSil = vec3(8.0,  5.0, 14.0) / 255.0;
            vec3 warmSil = vec3(70.0, 28.0, 10.0) / 255.0;
            vec3 silColor = mix(darkSil, warmSil, uTerrainGlow);
            float silFade = smoothstep(400.0, 1800.0, vDistFromCam);
            color = mix(color, silColor, silFade);
            gl_FragColor = vec4(color, 1.0);
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
      // 8 clouds on desktop (was 30), 0 on mobile. Smaller textures reduce alpha overdraw.
      // Each cloud's blob layout is stored so a Phase 4 world switch can
      // re-tint the same shapes (paintCloudCanvas) without regenerating them.
      interface CloudBlob { x: number; y: number; r: number; a: number }
      const isMobileCloud = /iPhone|iPad|Android/i.test(navigator.userAgent);
      const cloudCount = isMobileCloud ? 0 : 8;
      const CLOUD_W = 256; const CLOUD_H = 100; // was 512×200 — same visual, ¼ the memory
      function paintCloudCanvas(ctx: CanvasRenderingContext2D, blobs: CloudBlob[], tint: string) {
        ctx.clearRect(0, 0, CLOUD_W, CLOUD_H);
        for (const b of blobs) {
          const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
          grad.addColorStop(0, `rgba(${tint},${b.a})`);
          grad.addColorStop(0.6, `rgba(${tint},${b.a * 0.4})`);
          grad.addColorStop(1, `rgba(${tint},0)`);
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, CLOUD_W, CLOUD_H);
        }
        // Feather all four edges so there's no hard canvas boundary
        const vigX = ctx.createLinearGradient(0, 0, CLOUD_W * 0.25, 0);
        vigX.addColorStop(0, 'rgba(0,0,0,1)'); vigX.addColorStop(1, 'rgba(0,0,0,0)');
        const vigX2 = ctx.createLinearGradient(CLOUD_W, 0, CLOUD_W * 0.75, 0);
        vigX2.addColorStop(0, 'rgba(0,0,0,1)'); vigX2.addColorStop(1, 'rgba(0,0,0,0)');
        const vigY = ctx.createLinearGradient(0, 0, 0, CLOUD_H * 0.35);
        vigY.addColorStop(0, 'rgba(0,0,0,1)'); vigY.addColorStop(1, 'rgba(0,0,0,0)');
        const vigY2 = ctx.createLinearGradient(0, CLOUD_H, 0, CLOUD_H * 0.65);
        vigY2.addColorStop(0, 'rgba(0,0,0,1)'); vigY2.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalCompositeOperation = 'destination-out';
        for (const vig of [vigX, vigX2, vigY, vigY2]) {
          ctx.fillStyle = vig; ctx.fillRect(0, 0, CLOUD_W, CLOUD_H);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      const clouds: THREE.Sprite[] = [];
      for (let i = 0; i < cloudCount; i++) {
        const c = document.createElement('canvas');
        c.width = CLOUD_W; c.height = CLOUD_H;
        const ctx = c.getContext('2d')!;
        const blobCount = 10 + Math.floor(Math.random() * 8);
        const blobs: CloudBlob[] = [];
        for (let j = 0; j < blobCount; j++) {
          blobs.push({
            x: 60 + Math.random() * (CLOUD_W - 120),
            y: 30 + Math.random() * (CLOUD_H - 60),
            r: 40 + Math.random() * 80,
            a: 0.045 + Math.random() * 0.07,
          });
        }
        paintCloudCanvas(ctx, blobs, atmo0.cloudTint);
        const tex = new THREE.CanvasTexture(c);
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.3 });
        const sprite = new THREE.Sprite(mat);
        const angle = Math.random() * Math.PI * 2;
        const dist = 20 + Math.random() * 280;
        sprite.position.set(Math.cos(angle) * dist, 25 + Math.random() * 50, Math.sin(angle) * dist);
        sprite.scale.set(30 + Math.random() * 50, 15 + Math.random() * 20, 1);
        sprite.userData = {
          dx: (Math.random() - 0.5) * 0.3, dz: (Math.random() - 0.5) * 0.3,
          canvas: c, ctx, blobs,
        };
        scene.add(sprite);
        clouds.push(sprite);
      }

      // Re-tints every cloud's existing blob layout in place — Phase 4 world
      // switch only, called once per crossfade (not blended; clouds are a
      // quiet background garnish and the retint is not visually abrupt).
      function applyCloudTint(tint: string) {
        for (const cloud of clouds) {
          const { ctx, blobs } = cloud.userData as { ctx: CanvasRenderingContext2D; blobs: CloudBlob[] };
          paintCloudCanvas(ctx, blobs, tint);
          ((cloud.material as THREE.SpriteMaterial).map as THREE.CanvasTexture).needsUpdate = true;
        }
      }

      // ─── THOUGHTS ───
      const thoughtGroups = new Map<string, THREE.Group>();
      interface LiveEntry { canvas: HTMLCanvasElement; inst: SpirographInstance; texture: THREE.CanvasTexture; origTexture: THREE.Texture }
      const liveStars = new Map<string, LiveEntry>();
      let bakedStarCount = 0;
      let proximityUpgradeCount = 0;

      // SPRITE_SCALE compensates for the spirograph occupying ~71 % of the SPIRO_SIZE_LIVE
      // canvas (vs ~94 % at the old 420 px). 16 × 0.71 / 12 × 0.94 ≈ 1.0 — same apparent size.
      const SPIRO_SIZE = SPIRO_SIZE_LIVE;
      const SPRITE_SCALE = 16;

      // Phase 4 world-switch crossfade: while true, newly-created thought
      // groups start fully transparent and are marked userData.fadingIn so
      // the fade-in tick in animate() ramps them 0→1 over CROSSFADE_IN_MS.
      let fadeInPendingStars = false;

      function setGroupOpacity(g: THREE.Group, o: number) {
        g.children.forEach(child => {
          if (child instanceof THREE.Sprite) {
            (child.material as THREE.SpriteMaterial).opacity = o;
          }
        });
      }

      function createThought(t: ThoughtData) {
        if (thoughtGroups.has(t.id)) return;
        const rand = seededRand(hashStr(t.id));
        const [er, eg, eb] = EMOTIONS[t.emotionIndex]?.rgb ?? [255, 255, 255];
        const group = new THREE.Group();
        let spiro: StarSpiro | null = null;
        let glow: THREE.Sprite | null = null;

        if (bakedStarCount < MAX_BAKED) {
          bakedStarCount++;
          const canvas = document.createElement('canvas');
          // dpr=1 for baked stars — 4× less VRAM than dpr=2, visually identical at typical
          // viewing distances. Live (selected) star uses its own canvas with dpr=1 too.
          const inst = createSpirograph(canvas, t.dimensions, { size: SPIRO_SIZE, dpr: 1 });
          // Per-star time offset so all stars look different when static
          const timeOffset = (hashStr(t.id) % 10000) / 1000;
          inst.renderStatic(timeOffset);
          const texture = new THREE.CanvasTexture(canvas);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (texture as any).encoding = 3001; // THREE.sRGBEncoding
          const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: texture, transparent: true, depthWrite: false, opacity: 1.0,
          }));
          sprite.scale.set(SPRITE_SCALE, SPRITE_SCALE, 1);
          group.add(sprite);
          spiro = { canvas, texture, sprite, inst, timeOffset, frameCount: 0, dims: t.dimensions };
        } else {
          // Glowing dot fallback beyond the 50-star cap.
          // Store dims so activateLive() can upgrade this dot to a full spirograph on demand.
          const dc = document.createElement('canvas'); dc.width = 32; dc.height = 32;
          const dctx = dc.getContext('2d')!;
          const gr = dctx.createRadialGradient(16, 16, 0, 16, 16, 16);
          gr.addColorStop(0, `rgba(${er},${eg},${eb},1)`);
          gr.addColorStop(0.4, `rgba(${er},${eg},${eb},0.5)`);
          gr.addColorStop(1, 'rgba(0,0,0,0)');
          dctx.fillStyle = gr; dctx.fillRect(0, 0, 32, 32);
          const dotSprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: new THREE.CanvasTexture(dc), transparent: true, depthWrite: false,
          }));
          dotSprite.scale.set(4, 4, 1);
          dotSprite.userData = { isDotFallback: true };
          group.add(dotSprite);
        }

        // Cheap glow halo via additive sprite — replaces per-star PointLight
        // (point lights multiply draw calls for every object in their range)
        {
          const gc = document.createElement('canvas'); gc.width = 32; gc.height = 32;
          const gx = gc.getContext('2d')!;
          const gr = gx.createRadialGradient(16, 16, 0, 16, 16, 16);
          gr.addColorStop(0,   `rgba(${er},${eg},${eb},0.28)`);
          gr.addColorStop(0.5, `rgba(${er},${eg},${eb},0.08)`);
          gr.addColorStop(1,   'rgba(0,0,0,0)');
          gx.fillStyle = gr; gx.fillRect(0, 0, 32, 32);
          const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: new THREE.CanvasTexture(gc),
            transparent: true, depthWrite: false,
            blending: THREE.AdditiveBlending,
          }));
          glowSprite.scale.set(SPRITE_SCALE * 2.2, SPRITE_SCALE * 2.2, 1);
          group.add(glowSprite);
          // Kept on the group so the Phase 8 bloom can flare it without
          // walking the children every frame.
          glow = glowSprite;
        }
        // No collider mesh — picking is generous screen-space projection (see pickStar)

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
          glow,
          // dotDims: stored when spiro is null (beyond MAX_BAKED cap) so activateLive()
          // can upgrade the dot fallback to a full spirograph on first selection.
          dotDims: spiro ? undefined : t.dimensions,
          answer: t.answer ?? '',
          uniqueFact: t.uniqueFact ?? '',
          scaleMult: 1.0,
          fadingIn: false,
        };
        if (fadeInPendingStars) {
          setGroupOpacity(group, 0);
          group.userData.fadingIn = true;
        }
        scene.add(group);
        thoughtGroups.set(t.id, group);
      }

      function activateLive(id: string) {
        if (liveStars.has(id)) return;
        const g = thoughtGroups.get(id);
        if (!g) return;
        let spiro = g.userData.spiro as StarSpiro | null;

        // Dot-fallback upgrade: if this star was beyond MAX_BAKED at creation time,
        // build a full spirograph now so the selected star always animates properly.
        if (!spiro && g.userData.dotDims) {
          const dims = g.userData.dotDims as SpiroDimensions;
          const canvas = document.createElement('canvas');
          const inst = createSpirograph(canvas, dims, { size: SPIRO_SIZE, dpr: 1 });
          const timeOffset = (hashStr(id) % 10000) / 1000;
          inst.renderStatic(timeOffset);
          const texture = new THREE.CanvasTexture(canvas);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (texture as any).encoding = 3001;
          const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: texture, transparent: true, depthWrite: false, opacity: 1.0,
          }));
          sprite.scale.set(SPRITE_SCALE, SPRITE_SCALE, 1);
          // Hide the dot fallback sprite(s), show the new spirograph sprite
          g.children.forEach(child => {
            if (child instanceof THREE.Sprite && child.userData.isDotFallback) child.visible = false;
          });
          g.add(sprite);
          spiro = { canvas, texture, sprite, inst, timeOffset, frameCount: 0, dims };
          g.userData.spiro = spiro;
          g.userData.dotDims = undefined;
        }

        if (!spiro) return;
        const liveCanvas = document.createElement('canvas');
        // dpr=1 — sharper doesn't justify the VRAM at this size
        const liveInst = createSpirograph(liveCanvas, spiro.dims, { size: SPIRO_SIZE, dpr: 1 });
        // Do NOT call inst.start() — we drive renderStatic from the main RAF loop.
        // That keeps exactly ONE requestAnimationFrame loop running for the whole scene.
        const liveTexture = new THREE.CanvasTexture(liveCanvas);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (liveTexture as any).encoding = 3001; // THREE.sRGBEncoding
        const mat = spiro.sprite.material as THREE.SpriteMaterial;
        const origTexture = mat.map!;
        mat.map = liveTexture;
        mat.needsUpdate = true;
        liveStars.set(id, { canvas: liveCanvas, inst: liveInst, texture: liveTexture, origTexture });
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
        if (id === driftTargetId) {
          driftTargetId = null;
          driftPhase = 'seek';
          hideDwellText();
        }
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
      }

      // Lazy upgrade: swap a dot-fallback star to a real spirograph sprite when the
      // camera gets close enough that the dot would be ~20+ px on screen. Throttled
      // to 2 per frame by the caller so we never hitch. Stars upgraded this way use
      // the same distance-based animation tiers as originally-baked stars.
      function upgradeDotToSpiro(id: string, g: THREE.Group) {
        if (!g.userData.dotDims) return; // already upgraded or not a dot
        if (proximityUpgradeCount >= MAX_PROXIMITY_UPGRADES) return;
        const dims = g.userData.dotDims as SpiroDimensions;
        const canvas = document.createElement('canvas');
        const inst = createSpirograph(canvas, dims, { size: SPIRO_SIZE, dpr: 1 });
        const timeOffset = (hashStr(id) % 10000) / 1000;
        inst.renderStatic(timeOffset);
        const texture = new THREE.CanvasTexture(canvas);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (texture as any).encoding = 3001;
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
          map: texture, transparent: true, depthWrite: false, opacity: 1.0,
        }));
        sprite.scale.set(SPRITE_SCALE, SPRITE_SCALE, 1);
        // Hide the dot fallback sprite(s)
        g.children.forEach(child => {
          if (child instanceof THREE.Sprite && child.userData.isDotFallback) child.visible = false;
        });
        g.add(sprite);
        const spiro: StarSpiro = { canvas, texture, sprite, inst, timeOffset, frameCount: 0, dims };
        g.userData.spiro = spiro;
        g.userData.dotDims = undefined;
        bakedStarCount++;       // keep destroyThought accounting consistent
        proximityUpgradeCount++;
      }

      // ─── BONDS ───  (orbital mechanics only — no line visuals)
      const bondOrbitals = new Map<string, { fromId: string; toId: string }>();

      function createBond(b: BondData) {
        const fromGroup = thoughtGroups.get(b.from_id);
        const toGroup   = thoughtGroups.get(b.to_id);
        if (!fromGroup || !toGroup || bondOrbitals.has(b.id)) return;

        let orbiterCount = 0;
        bondOrbitals.forEach(entry => { if (entry.toId === b.to_id) orbiterCount++; });

        const orbitRadius = 15 + orbiterCount * 7;
        const period      = 40 + orbiterCount * 15;

        const rand = seededRand(hashStr(b.from_id + b.to_id));
        const tilt = (rand() - 0.5) * 40 * (Math.PI / 180);
        const phaseOffset = rand() * Math.PI * 2;

        fromGroup.userData.orbit = { anchorId: b.to_id, radius: orbitRadius, period, tilt, phaseOffset };
        bondOrbitals.set(b.id, { fromId: b.from_id, toId: b.to_id });
      }

      function destroyBond(id: string) {
        const entry = bondOrbitals.get(id);
        if (!entry) return;
        const fromGroup = thoughtGroups.get(entry.fromId);
        if (fromGroup) fromGroup.userData.orbit = null;
        bondOrbitals.delete(id);
      }

      addThoughtFnRef.current = createThought;
      removeThoughtFnRef.current = destroyThought;
      addBondFnRef.current = createBond;
      removeBondFnRef.current = destroyBond;

      // ─── MOMENTS (Phase 8) ──────────────────────────────────────────────
      // Star birth and the bond finale. Both are transient: the bloom is an
      // envelope multiplied into the existing sprite scale/opacity (no new
      // geometry, ever), and the inscription is one SVG overlay that holds
      // nothing between moments. See ./moments.ts.
      const blooms = new BloomChoreographer();
      const inscription = new OrbitInscription(container);
      let pendingFinale: { fromId: string; toId: string; reason: string; waited: number } | null = null;
      let activeFinale: { fromId: string; toId: string; textLen: number } | null = null;

      const ringVec = new THREE.Vector3();
      const ringCam = new THREE.Vector3();

      // Projects the orbit the two bound stars now share — widened to a legible
      // ring around the pair, ordered so the reason reads along its near side.
      // null when the geometry isn't there yet or any of it is behind the camera.
      function projectOrbitRing(fromId: string, toId: string, textLen: number): ScreenPoint[] | null {
        if (!container) return null; // hoisted fn — re-narrow for TS
        const fg = thoughtGroups.get(fromId);
        const tg = thoughtGroups.get(toId);
        if (!fg || !tg) return null;
        const orbit = fg.userData.orbit as { radius: number; tilt: number } | null;
        if (!orbit) return null;
        const w = container.clientWidth;
        const h = container.clientHeight;
        const N = 96;
        const sinT = Math.sin(orbit.tilt);
        const cosT = Math.cos(orbit.tilt);

        const ring = (radius: number): ScreenPoint[] | null => {
          const out: ScreenPoint[] = [];
          for (let i = 0; i < N; i++) {
            const a = (i / N) * Math.PI * 2;
            ringVec.set(
              tg.position.x + Math.cos(a) * radius,
              tg.position.y + Math.sin(a) * radius * sinT,
              tg.position.z + Math.sin(a) * radius * cosT,
            );
            ringCam.copy(ringVec).applyMatrix4(camera.matrixWorldInverse);
            if (ringCam.z > -1) return null; // behind (or on) the camera plane
            ringVec.project(camera);
            out.push({ x: (ringVec.x + 1) / 2 * w, y: (-ringVec.y + 1) / 2 * h });
          }
          return out;
        };

        const base = ring(orbit.radius);
        if (!base) return null;
        let minX = Infinity, maxX = -Infinity;
        for (const p of base) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; }
        const baseW = Math.max(maxX - minX, 1);
        let basePerim = 0;
        for (let i = 1; i < base.length; i++) {
          basePerim += Math.hypot(base[i].x - base[i - 1].x, base[i].y - base[i - 1].y);
        }
        // Widen the true orbit only as far as the reason needs to be readable,
        // and never past what the viewport can hold: a short reason is written
        // on the orbit itself, a long one on a wider ring around the pair.
        const wantPerim = (textLen * PREFERRED_FONT * GLYPH_EM) / NEAR_SIDE;
        const maxK = Math.min(w * 0.86, 560) / baseW;
        const k = Math.max(1, Math.min(Math.max(maxK, 1), wantPerim / Math.max(basePerim, 1)));
        const wide = k > 1.02 ? ring(orbit.radius * k) : base;
        if (!wide) return null;
        return orderRingForReading(wide);
      }

      bloomStarFnRef.current = (id: string) => {
        // 'arrival' — the star stays at nothing until the camera has come to
        // it, so the bloom and the birth sound land on the same beat.
        blooms.begin(id, 'arrival', () => sound.play('birth'));
      };

      bondFinaleFnRef.current = (fromId: string, toId: string, reason: string) => {
        blooms.begin(fromId, 'now');
        blooms.begin(toId, 'now');
        inscription.clear();
        activeFinale = null;
        // The orbit is created by the bonds prop sync a beat later; the tick
        // below waits for it (and for the blooms to lead) before writing.
        pendingFinale = { fromId, toId, reason, waited: 0 };
      };

      // ─── CAMERA STATE MACHINE ───────────────────────────────────────────
      // Exactly one mode owns the camera each frame (see CamMode docs above).
      // Initial heading toward SUN_DIRECTION (sunset straight ahead).
      let camMode: CamMode = 'drift';
      let driftEnabled = true;   // user toggle — gates drift entry & idle resume
      let heading = Math.atan2(SUN_DIRECTION.x, -SUN_DIRECTION.z);
      let pitch = 0.30;
      let speed = 0;             // forward u/s — W/boost only, no baseline cruise
      let turnVel = 0;           // rad/s — keyboard/arrow turn with easing
      let strafeVel = 0;         // units/s — Q/E lateral slide
      let wheelVel = 0;          // u/s — scroll-wheel forward/back, decays
      const lookVel = { x: 0, y: 0 }; // rad/frame — drag/swipe momentum
      let flyTargetXZ: { x: number; z: number } | null = null; // focused approach
      let idleSec = 0;           // manual-mode idle accumulator
      let camTargetY = BASE_CAM_Y;
      camera.position.set(0, BASE_CAM_Y, 0);
      let lastSnapX = 0;
      let lastSnapZ = 0;
      let disposed = false;

      // Focus bookkeeping — was the current focus user-initiated (canvas
      // click/tap) or automatic (deep link / own-star autofocus)? Dismissing
      // an auto focus hands over to drift after a short beat instead of the
      // full idle wait.
      let lastUserSelectAt = -Infinity;
      let focusWasAuto = false;

      const IDLE_RESUME_SEC = 10;   // manual → drift after this much idle
      // Arrival framing: look slightly below the star so it rides the upper
      // third of the viewport — clear of the bottom panel / dwell text.
      // (offset in radians of the 60° vertical FOV; viewport-relative at any size)
      const FOCUS_STOP_DIST = 78;
      const FOCUS_PITCH_OFFSET = 0.24;

      function wrapAngle(a: number): number {
        while (a > Math.PI) a -= Math.PI * 2;
        while (a < -Math.PI) a += Math.PI * 2;
        return a;
      }
      const clampPitch = (p: number) => Math.max(-0.4, Math.min(0.7, p));

      // Ease heading/pitch toward framing a star, with angular-velocity caps
      // so the turn is always gentle (no motion sickness, no snap).
      function faceStar(
        g: THREE.Group, pitchOffset: number, dt: number,
        rate: number, maxTurn: number, maxPitchRate: number,
      ) {
        const dx = g.position.x - camera.position.x;
        const dz = g.position.z - camera.position.z;
        const hDist = Math.max(Math.hypot(dx, dz), 0.01);
        const dy = g.position.y - camera.position.y;
        const targetH = Math.atan2(dx, -dz);
        const targetP = clampPitch(Math.atan2(dy, hDist) - pitchOffset);
        const hStep = wrapAngle(targetH - heading) * Math.min(dt * rate, 1);
        const maxH = maxTurn * dt;
        heading += Math.max(-maxH, Math.min(maxH, hStep));
        const pStep = (targetP - pitch) * Math.min(dt * rate, 1);
        const maxP = maxPitchRate * dt;
        pitch = clampPitch(pitch + Math.max(-maxP, Math.min(maxP, pStep)));
      }

      // ─── DRIFT CONTROLLER ───────────────────────────────────────────────
      // Lean-back tour: pick a star (nearby + unseen this session + emotion
      // variety + roughly ahead), glide there on an eased leg, dwell 8-12 s
      // with the thought readable, continue. The controller always aims at a
      // star, so the camera never faces empty sky.
      const DRIFT_CRUISE = 26;          // u/s cap — meditative planetarium pace
      const DRIFT_LEG_MIN = 4;          // s — minimum glide duration
      const DRIFT_STOP_DIST = 85;       // horizontal arrival distance from star
      const DRIFT_PITCH_OFFSET = 0.17;  // star rides upper third during dwell
      const DRIFT_MAX_TURN = 0.55;      // rad/s heading cap while drifting
      const DRIFT_MAX_PITCH_RATE = 0.35;
      let driftPhase: 'seek' | 'glide' | 'dwell' = 'seek';
      let driftTargetId: string | null = null;
      const driftVisited = new Set<string>();      // shown this session
      const driftRecentEmotions: number[] = [];    // last 3 — gentle variety
      let driftSeekDelay = 1.0; // s before first pick — lets deep-link focus land
      let glideT = 0;
      let glideDur = 6;
      const glideFrom = new THREE.Vector3();
      const glideTo = new THREE.Vector3();
      let dwellRemaining = 0;

      function setMode(m: CamMode) {
        if (camMode === m) return;
        if (camMode === 'drift') {
          driftPhase = 'seek';
          driftTargetId = null;
          hideDwellText();
        }
        camMode = m;
        if (m === 'manual') {
          // Fresh hands-over: zero every residual velocity so there's no jump
          idleSec = 0;
          speed = 0; turnVel = 0; strafeVel = 0; wheelVel = 0;
          lookVel.x = 0; lookVel.y = 0;
          touch.pinchVel = 0;
        }
        if (m === 'drift') {
          driftPhase = 'seek';
          driftSeekDelay = 0.4;
        }
        onModeChangeRef.current?.(m);
      }

      function pickNextDriftStar(): string | null {
        // Candidates: the ~12 nearest unseen stars with something to read,
        // scored by distance + turn away from current heading + emotion repeat.
        const cx = camera.position.x;
        const cz = camera.position.z;
        const all: { id: string; g: THREE.Group; d: number }[] = [];
        thoughtGroups.forEach((g, id) => {
          if (id === driftTargetId) return;
          const answer = (g.userData.answer as string | undefined) ?? '';
          if (!answer.trim()) return;
          const d = Math.hypot(g.position.x - cx, g.position.z - cz);
          if (d < 25) return; // effectively where we already are
          all.push({ id, g, d });
        });
        if (all.length === 0) return null;
        all.sort((a, b) => a.d - b.d);
        let pool = all.filter(c => !driftVisited.has(c.id)).slice(0, 12);
        if (pool.length === 0) {
          // Everything has been shown — start the tour over
          driftVisited.clear();
          pool = all.slice(0, 12);
        }
        let bestId: string | null = null;
        let bestScore = Infinity;
        for (const c of pool) {
          const dx = c.g.position.x - cx;
          const dz = c.g.position.z - cz;
          const turn = Math.abs(wrapAngle(Math.atan2(dx, -dz) - heading));
          const em = c.g.userData.emotionIndex as number;
          let score = c.d + turn * 60; // forward bias: ~60 units per radian of turn
          if (driftRecentEmotions.includes(em)) score += 120;
          if (score < bestScore) { bestScore = score; bestId = c.id; }
        }
        return bestId;
      }

      function startGlideTo(id: string) {
        const g = thoughtGroups.get(id);
        if (!g) return;
        driftTargetId = id;
        // Arrival point: on the line star→camera, DRIFT_STOP_DIST out
        const dx = camera.position.x - g.position.x;
        const dz = camera.position.z - g.position.z;
        const hd = Math.hypot(dx, dz) || 1;
        glideTo.set(
          g.position.x + (dx / hd) * DRIFT_STOP_DIST,
          BASE_CAM_Y,
          g.position.z + (dz / hd) * DRIFT_STOP_DIST,
        );
        glideFrom.copy(camera.position);
        glideFrom.y = BASE_CAM_Y;
        const legDist = glideFrom.distanceTo(glideTo);
        // Cap SPEED, not duration — a rare long leg takes longer rather than
        // rushing. (smoothstep peak velocity is 1.5× the average, hence 1.5)
        glideDur = Math.max(DRIFT_LEG_MIN, (legDist * 1.5) / DRIFT_CRUISE);
        glideT = 0;
        driftPhase = 'glide';
      }

      function runDrift(dt: number) {
        if (driftPhase === 'seek') {
          driftSeekDelay -= dt;
          if (driftSeekDelay > 0) return;
          const next = pickNextDriftStar();
          if (next) startGlideTo(next);
          return;
        }
        const g = driftTargetId ? thoughtGroups.get(driftTargetId) : null;
        if (!g) {
          driftPhase = 'seek';
          hideDwellText();
          return;
        }
        if (driftPhase === 'glide') {
          glideT += dt;
          const u = Math.min(glideT / glideDur, 1);
          const e = u * u * (3 - 2 * u); // smoothstep — ease-in, ease-out
          camera.position.x = glideFrom.x + (glideTo.x - glideFrom.x) * e;
          camera.position.z = glideFrom.z + (glideTo.z - glideFrom.z) * e;
          faceStar(g, DRIFT_PITCH_OFFSET, dt, 1.6, DRIFT_MAX_TURN, DRIFT_MAX_PITCH_RATE);
          if (u >= 1) {
            driftPhase = 'dwell';
            dwellRemaining = 8 + Math.random() * 4; // 8-12 s
            driftVisited.add(driftTargetId!);
            const em = g.userData.emotionIndex as number;
            driftRecentEmotions.push(em);
            if (driftRecentEmotions.length > 3) driftRecentEmotions.shift();
            showDwellText(g);
          }
        } else {
          // dwell — hold framing (the star bobs), keep the thought readable
          dwellRemaining -= dt;
          faceStar(g, DRIFT_PITCH_OFFSET, dt, 2.0, DRIFT_MAX_TURN, DRIFT_MAX_PITCH_RATE);
          updateDwellTextPosition(g);
          if (dwellRemaining <= 0) {
            hideDwellText();
            driftPhase = 'seek';
            driftSeekDelay = 0;
          }
        }
      }

      flyToFnRef.current = (id: string) => {
        const g = thoughtGroups.get(id);
        if (!g) return;
        // A canvas click/tap within the last 600 ms means this focus is
        // user-initiated; otherwise it's automatic (deep link / autofocus).
        focusWasAuto = performance.now() - lastUserSelectAt > 600;
        const dx = g.position.x - camera.position.x;
        const dz = g.position.z - camera.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist > FOCUS_STOP_DIST + 2) {
          const t = (dist - FOCUS_STOP_DIST) / dist;
          flyTargetXZ = {
            x: camera.position.x + dx * t,
            z: camera.position.z + dz * t,
          };
        } else {
          flyTargetXZ = null;
        }
      };

      setDriftingFnRef.current = (on: boolean) => {
        driftEnabled = on;
        if (on && camMode === 'manual') setMode('drift');
        if (!on && camMode === 'drift') setMode('manual');
      };

      // ─── WORLD CROSSFADE (Phase 4 — sky rail) ────────────────────────────
      // Fades the current star field out while lerping the sky/terrain/star
      // atmosphere toward the incoming world, then hands back to the caller
      // (onMidpoint) to swap the thoughts/bonds props — newly-created stars
      // fade in automatically (see createThought's fadeInPendingStars check
      // and the fade-in tick below). Camera position/heading/pitch and the
      // drift/manual/focused mode are untouched.
      let fadeOutActive = false;
      let fadeOutT = 0;
      let fadeOutMidCb: (() => void) | null = null;
      let fadeInActive = false;
      let fadeInT = 0;
      const FADE_OUT_DUR = CROSSFADE_OUT_MS / 1000;
      const FADE_IN_DUR = CROSSFADE_IN_MS / 1000;
      let atmoFrom: AtmosphereConfig = atmo0;
      let atmoTo: AtmosphereConfig = atmo0;
      let skyGradTexB: THREE.CanvasTexture | null = null;
      const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

      function crossfadeToWorld(atmosphere: AtmosphereConfig, onMidpoint: () => void) {
        // Defensive: callers already guard re-entrancy (see the pages'
        // switching state), but never silently drop a caller's callback by
        // overwriting a fade already in flight.
        if (fadeOutActive || fadeInActive) return;
        hideDwellText();
        clearSmoke();
        // A moment belongs to the world it happened in.
        inscription.clear();
        blooms.clear();
        pendingFinale = null;
        activeFinale = null;
        if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
        hoverStarId = null;

        // Drift explores the new world fresh; the camera itself is untouched.
        driftPhase = 'seek';
        driftTargetId = null;
        driftVisited.clear();
        driftRecentEmotions.length = 0;
        driftSeekDelay = FADE_OUT_DUR + 0.25;

        atmoFrom = {
          skyStops: atmoFrom.skyStops, // unused on this side of the mix
          starDensity: dbgStarDensityRef.current,
          starFloor: dbgStarFloorRef.current,
          terrainGlow: dbgTerrainGlowRef.current,
          cloudTint: atmoTo.cloudTint,
          gradLift: gradLiftRef.current,
          gradSteep: gradSteepRef.current,
          sunShift: sunShiftRef.current,
        };
        atmoTo = atmosphere;

        if (skyGradTexB) skyGradTexB.dispose();
        skyGradTexB = buildSkyGradientTexture(atmosphere.skyStops);
        skyMat.uniforms.uSkyGradB.value = skyGradTexB;
        skyMat.uniforms.uMix.value = 0;
        applyCloudTint(atmosphere.cloudTint);

        fadeInPendingStars = true;
        fadeOutActive = true;
        fadeOutT = 0;
        fadeOutMidCb = onMidpoint;
      }
      crossfadeFnRef.current = crossfadeToWorld;

      // ─── INPUT ───
      // Any deliberate input (pointer down, wheel, touch, key) pauses drift
      // instantly and hands the camera to manual controls mid-flight — the
      // camera keeps its exact position/orientation, so there is no jump.
      function interruptDriftForInput() {
        idleSec = 0;
        if (camMode === 'drift') setMode('manual');
      }

      const keys: Record<string, boolean> = {};
      const onKeyDown = (e: KeyboardEvent) => {
        keys[e.code] = true;
        interruptDriftForInput();
      };
      const onKeyUp = (e: KeyboardEvent) => { keys[e.code] = false; };
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);

      // ─── SCREEN-SPACE PICKING ─────────────────────────────────────────────
      // Generous: pointer within PICK_RADIUS CSS px of a star's projected
      // center picks the nearest such star. No dependence on tiny colliders,
      // star bobbing, or camera motion.
      const PICK_RADIUS = 48;
      const pickVec = new THREE.Vector3();
      function pickStar(clientX: number, clientY: number): string | null {
        if (!container) return null; // hoisted fn — re-narrow for TS
        const w = container.clientWidth;
        const h = container.clientHeight;
        let bestId: string | null = null;
        let bestD = PICK_RADIUS;
        thoughtGroups.forEach((g, id) => {
          // Behind-camera guard — project() mirrors points behind the camera
          pickVec.copy(g.position).applyMatrix4(camera.matrixWorldInverse);
          if (pickVec.z >= 0) return;
          pickVec.copy(g.position).project(camera);
          const sx = (pickVec.x + 1) / 2 * w;
          const sy = (-pickVec.y + 1) / 2 * h;
          const d = Math.hypot(sx - clientX, sy - clientY);
          if (d < bestD) { bestD = d; bestId = id; }
        });
        return bestId;
      }

      // ─── MOUSE — drag to look, click to select, wheel to move ────────────
      let suppressClick = false; // a drag ends with a synthetic click — swallow it
      const mouseDrag = { active: false, moved: false, lastX: 0, lastY: 0, startX: 0, startY: 0 };

      const onMouseDown = (e: MouseEvent) => {
        if (e.button !== 0) return;
        interruptDriftForInput();
        suppressClick = false;
        mouseDrag.active = true;
        mouseDrag.moved = false;
        mouseDrag.lastX = mouseDrag.startX = e.clientX;
        mouseDrag.lastY = mouseDrag.startY = e.clientY;
        lookVel.x = 0;
        lookVel.y = 0;
      };
      const onMouseMoveWindow = (e: MouseEvent) => {
        if (!mouseDrag.active) return;
        const dx = e.clientX - mouseDrag.lastX;
        const dy = e.clientY - mouseDrag.lastY;
        mouseDrag.lastX = e.clientX;
        mouseDrag.lastY = e.clientY;
        if (!mouseDrag.moved &&
            Math.hypot(e.clientX - mouseDrag.startX, e.clientY - mouseDrag.startY) > 5) {
          mouseDrag.moved = true;
        }
        if (!mouseDrag.moved) return;
        idleSec = 0;
        if (camMode !== 'manual') return; // focused: camera stays framed on the star
        const sensX = (Math.PI * 1.4) / container.clientWidth;
        const sensY = (Math.PI * 0.7) / container.clientHeight;
        heading += dx * sensX;
        pitch = clampPitch(pitch - dy * sensY);
        lookVel.x = dx * sensX;
        lookVel.y = -dy * sensY;
      };
      const onMouseUpWindow = () => {
        if (!mouseDrag.active) return;
        mouseDrag.active = false;
        if (mouseDrag.moved) {
          suppressClick = true; // momentum (lookVel) coasts in the animate loop
        } else {
          lookVel.x = 0;
          lookVel.y = 0;
        }
      };
      renderer.domElement.addEventListener('mousedown', onMouseDown);
      window.addEventListener('mousemove', onMouseMoveWindow);
      window.addEventListener('mouseup', onMouseUpWindow);

      const onClickCanvas = (e: MouseEvent) => {
        if (suppressClick) { suppressClick = false; return; }
        const hitId = pickStar(e.clientX, e.clientY);
        if (hitId) {
          lastUserSelectAt = performance.now();
          onClickRef.current?.(hitId);
        } else if (activeStarRef.current) {
          // Panel is open — a missed click dismisses it, nothing else
          onBgClickRef.current?.();
        }
        // A missed click with no panel open does nothing — never moves the camera
      };
      renderer.domElement.addEventListener('click', onClickCanvas);

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        interruptDriftForInput();
        if (camMode !== 'manual') return; // ignore while a panel is open
        const dy = e.deltaMode === 1 ? e.deltaY * 24 : e.deltaY;
        // Scroll up / pinch-out → glide forward; decays in the animate loop
        wheelVel = Math.max(-140, Math.min(140, wheelVel - dy * 0.35));
      };
      renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

      // ─── HOVER SMOKE EFFECT ───────────────────────────────────────────────
      // When the mouse rests on a star for 500 ms, its answer text rises up
      // word-by-word like smoke and drifts away. Clicking still works normally.

      // Inject CSS keyframes once per document lifetime
      const SMOKE_STYLE_ID = 'btw-smoke-css';
      if (!document.getElementById(SMOKE_STYLE_ID)) {
        const ss = document.createElement('style');
        ss.id = SMOKE_STYLE_ID;
        ss.textContent = `
          @keyframes btwSmokeRise {
            0%   { opacity:0;    transform: translate(-50%,-100%) translateY(0px); }
            30%  { opacity:0.85; }
            100% { opacity:0.85; transform: translate(-50%,-100%) translateY(-24px); }
          }
          @keyframes btwSmokeSplit {
            0%   { opacity:0.85; transform: translate(0,0) scale(1);   filter:blur(0px); }
            100% { opacity:0;    transform: translate(var(--btw-sdx),var(--btw-sdy)) scale(0.65); filter:blur(6px); }
          }
        `;
        document.head.appendChild(ss);
      }

      // Overlay sits on top of the canvas, pointer-events:none so clicks pass through
      const smokeOverlay = document.createElement('div');
      smokeOverlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:1;';
      container.appendChild(smokeOverlay);

      // ─── DRIFT DWELL TEXT ─────────────────────────────────────────────────
      // During a drift dwell the star's answer + unique fact render as stable,
      // readable typography (panel type rules) near — never covering — the
      // star, persisting for the whole dwell. pointer-events:none so clicks
      // pass through to picking / drift interruption.
      const dwellOverlay = document.createElement('div');
      dwellOverlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:2;';
      container.appendChild(dwellOverlay);
      const dwellBox = document.createElement('div');
      dwellBox.style.cssText = [
        'position:absolute',
        'transform:translateX(-50%)',
        'width:min(420px, calc(100vw - 48px))',
        'text-align:center',
        'opacity:0',
        'transition:opacity 0.9s ease',
        'pointer-events:none',
      ].join(';');
      const dwellQuote = document.createElement('div');
      dwellQuote.style.cssText = [
        "font-family:'Cormorant Garamond','Playfair Display',Georgia,'Times New Roman',serif",
        'font-weight:400',
        'font-size:clamp(18px, 4vw, 22px)',
        'line-height:1.45',
        'color:#F0E8E0',
        'text-shadow:0 1px 24px rgba(10,6,24,0.85), 0 0 8px rgba(10,6,24,0.6)',
      ].join(';');
      const dwellFact = document.createElement('div');
      dwellFact.style.cssText = [
        'margin-top:10px',
        "font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif",
        'font-style:italic',
        'font-size:13px',
        'line-height:1.45',
        'color:#C8B0E0',
        'text-shadow:0 1px 16px rgba(10,6,24,0.85)',
      ].join(';');
      dwellBox.appendChild(dwellQuote);
      dwellBox.appendChild(dwellFact);
      dwellOverlay.appendChild(dwellBox);

      const dwellProj = new THREE.Vector3();
      function updateDwellTextPosition(g: THREE.Group) {
        if (!container) return; // hoisted fn — re-narrow for TS
        const w = container.clientWidth;
        const h = container.clientHeight;
        dwellProj.copy(g.position).project(camera);
        const sx = (dwellProj.x + 1) / 2 * w;
        const sy = (-dwellProj.y + 1) / 2 * h;
        // Star half-height in px (sprite half-extent ≈ 8 world units × scale;
        // 60° vertical FOV → px = world/dist × h / (2·tan 30°))
        const dist = camera.position.distanceTo(g.position);
        const halfPx = (8 * g.scale.x / Math.max(dist, 1)) * (h / (2 * Math.tan(Math.PI / 6)));
        const boxW = Math.min(420, w - 48);
        const left = Math.max(24 + boxW / 2, Math.min(w - 24 - boxW / 2, sx));
        const top = Math.min(sy + halfPx + 22, h * 0.62);
        dwellBox.style.left = `${left}px`;
        dwellBox.style.top = `${top}px`;
      }
      function showDwellText(g: THREE.Group) {
        const answer = ((g.userData.answer as string | undefined) ?? '').trim();
        if (!answer) return;
        const fact = ((g.userData.uniqueFact as string | undefined) ?? '').trim();
        dwellQuote.textContent = `“${answer}”`;
        dwellFact.textContent = fact ? `— ${fact}` : '';
        dwellFact.style.display = fact ? 'block' : 'none';
        updateDwellTextPosition(g);
        dwellBox.style.opacity = '1';
        // Phase 7 — the arrival chime, pitched from the star's emotionIndex.
        sound.play('chime', { emotionIndex: (g.userData.emotionIndex as number) ?? 3 });
        const dwellId = g.userData.id as string | undefined;
        if (dwellId) onDwellRef.current?.(dwellId);
      }
      function hideDwellText() {
        dwellBox.style.opacity = '0';
      }

      let hoverStarId: string | null = null;
      let hoverTimer: ReturnType<typeof setTimeout> | null = null;
      let smokeDisperseTimer: ReturnType<typeof setTimeout> | null = null;
      let smokeCleanupTimer: ReturnType<typeof setTimeout> | null = null;
      let smokeInFlight = false;
      let smokeNextStarId: string | null = null;

      // clearSmoke is only called for hard resets (star selected, component cleanup).
      // It force-stops any in-flight animation immediately.
      function clearSmoke() {
        if (smokeDisperseTimer) { clearTimeout(smokeDisperseTimer); smokeDisperseTimer = null; }
        if (smokeCleanupTimer)  { clearTimeout(smokeCleanupTimer);  smokeCleanupTimer  = null; }
        smokeInFlight = false;
        smokeNextStarId = null;
        smokeOverlay.innerHTML = '';
      }

      function triggerSmoke(starId: string) {
        if (!container) return;
        const g = thoughtGroups.get(starId);
        if (!g) return;
        const answer = (g.userData.answer as string | undefined) ?? '';
        if (!answer.trim()) return;

        // Project 3D position to screen space
        const pos3d = g.position.clone();
        pos3d.project(camera);
        const sx = Math.round((pos3d.x + 1) / 2 * container.clientWidth);
        const sy = Math.round((-pos3d.y + 1) / 2 * container.clientHeight);

        clearSmoke();

        // Whole phrase rises as one block, then each word scatters
        const bubble = document.createElement('div');
        bubble.style.cssText = [
          'position:absolute',
          `left:${sx}px`,
          `top:${sy - 36}px`,
          'text-align:center',
          'max-width:300px',
          'pointer-events:none',
          "font-family:'Cormorant Garamond','Playfair Display',Georgia,serif",
          'font-style:italic',
          'font-weight:300',
          'font-size:20px',
          'line-height:1.65',
          'color:rgba(240,232,224,0.82)',
          'text-shadow:0 0 22px rgba(240,200,150,0.22)',
          'letter-spacing:0.02em',
          'opacity:0',
          'animation:btwSmokeRise 2s ease-out forwards',
        ].join(';');

        const words = answer.trim().split(/\s+/).filter(Boolean);
        const spans: HTMLSpanElement[] = [];
        words.forEach(word => {
          const span = document.createElement('span');
          span.textContent = word + ' ';
          span.style.display = 'inline-block';
          bubble.appendChild(span);
          spans.push(span);
        });

        smokeInFlight = true;
        smokeOverlay.appendChild(bubble);

        // Phase 2 @ 1.3 s: freeze phrase, scatter each word (total ~2.5 s)
        smokeDisperseTimer = setTimeout(() => {
          smokeDisperseTimer = null;
          bubble.style.animation = 'none';
          bubble.style.opacity = '0.85';
          bubble.style.transform = 'translate(-50%, -100%) translateY(-24px)';
          spans.forEach((span, i) => {
            const angle = Math.random() * Math.PI * 2;
            const dist  = 45 + Math.random() * 80;
            const dx = (Math.cos(angle) * dist).toFixed(0);
            const dy = (Math.sin(angle) * dist - 40).toFixed(0); // bias upward
            span.style.setProperty('--btw-sdx', `${dx}px`);
            span.style.setProperty('--btw-sdy', `${dy}px`);
            const delay = (i * 30 + Math.random() * 40).toFixed(0);
            span.style.animation = `btwSmokeSplit 1.2s ease-out ${delay}ms forwards`;
          });
        }, 1300);

        // Cleanup after full animation completes (~2.6 s total)
        smokeCleanupTimer = setTimeout(() => {
          smokeCleanupTimer = null;
          smokeInFlight = false;
          if (smokeOverlay.contains(bubble)) smokeOverlay.removeChild(bubble);
          // Trigger queued next star if any
          const next = smokeNextStarId;
          smokeNextStarId = null;
          if (next) triggerSmoke(next);
        }, 2600);
      }
      const onMouseMove = (e: MouseEvent) => {
        if (mouseDrag.active) {
          renderer.domElement.style.cursor = mouseDrag.moved ? 'grabbing' : '';
          return;
        }
        const hitId = pickStar(e.clientX, e.clientY);
        // Pointer cursor over any pickable star
        renderer.domElement.style.cursor = hitId ? 'pointer' : '';
        // Smoke is a hover garnish only — skip while a panel is open, and skip
        // the current dwell star (its thought is already on screen as text)
        if (activeStarRef.current) return;
        const dwellId = camMode === 'drift' && driftPhase === 'dwell' ? driftTargetId : null;
        const smokeId = hitId && hitId !== dwellId ? hitId : null;
        if (smokeId !== hoverStarId) {
          if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
          hoverStarId = smokeId;
          if (smokeId) {
            if (!smokeInFlight) {
              // Nothing playing — start immediately after short delay
              hoverTimer = setTimeout(() => triggerSmoke(smokeId), 80);
            } else {
              // Let current smoke finish, queue this star for after
              smokeNextStarId = smokeId;
            }
          } else {
            // Moved to empty space — cancel queued next but let current finish
            smokeNextStarId = null;
          }
        }
      };
      renderer.domElement.addEventListener('mousemove', onMouseMove);

      // ─── TOUCH CONTROLS ─────────────────────────────────────────────────
      // Swipe → yaw/pitch with momentum, pinch → move, tap → select, double-tap → boost
      const touch = {
        active: false,
        startX: 0, startY: 0,
        lastX: 0, lastY: 0,
        startTime: 0,
        lastTapTime: 0,   // for double-tap detection
        pinchDist: 0,
        pinchVel: 0,       // forward/backward velocity (units/frame), decays
      };

      const onTouchStart = (e: TouchEvent) => {
        // Always prevent default — stops pull-to-refresh and page rubber-band
        e.preventDefault();
        interruptDriftForInput();
        if (e.touches.length === 1) {
          const t = e.touches[0];
          touch.active = true;
          touch.startX = touch.lastX = t.clientX;
          touch.startY = touch.lastY = t.clientY;
          touch.startTime = Date.now();
          lookVel.x = 0;
          lookVel.y = 0;
        } else if (e.touches.length === 2) {
          // Pinch start — record initial distance
          const dx = e.touches[1].clientX - e.touches[0].clientX;
          const dy = e.touches[1].clientY - e.touches[0].clientY;
          touch.pinchDist = Math.sqrt(dx * dx + dy * dy);
          touch.active = false; // cancel any pending single-touch state
        }
      };

      const onTouchMove = (e: TouchEvent) => {
        e.preventDefault();
        idleSec = 0;
        if (e.touches.length === 1 && touch.active) {
          const t = e.touches[0];
          const dx = t.clientX - touch.lastX;
          const dy = t.clientY - touch.lastY;
          touch.lastX = t.clientX;
          touch.lastY = t.clientY;
          if (camMode !== 'manual') return; // focused: camera stays framed

          // Sensitivity: pixels → radians. Tuned so a full-width swipe ≈ 180°.
          const sensX = (Math.PI * 1.4) / container.clientWidth;
          const sensY = (Math.PI * 0.7) / container.clientHeight;

          // Immediately apply delta (no lag) AND store as velocity for momentum
          heading += dx * sensX;
          pitch = clampPitch(pitch - dy * sensY);
          lookVel.x = dx * sensX;
          lookVel.y = -dy * sensY;
        } else if (e.touches.length === 2) {
          const dx = e.touches[1].clientX - e.touches[0].clientX;
          const dy = e.touches[1].clientY - e.touches[0].clientY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const delta = dist - touch.pinchDist;
          touch.pinchDist = dist;
          // Pinch out (dist grows) → move forward; pinch in → pull back
          if (camMode === 'manual') touch.pinchVel = delta * 0.22;
        }
      };

      const onTouchEnd = () => {
        if (!touch.active) return;
        const moveDist = Math.sqrt(
          (touch.lastX - touch.startX) ** 2 + (touch.lastY - touch.startY) ** 2,
        );
        const duration = Date.now() - touch.startTime;
        touch.active = false;

        // Tap: < 12px movement and < 300ms — treat as a click
        if (moveDist < 12 && duration < 300) {
          const now = Date.now();
          const isDoubleTap = now - touch.lastTapTime < 350;
          touch.lastTapTime = now;

          if (isDoubleTap) {
            // Double-tap: temporary speed boost (replaces Space bar)
            if (camMode === 'manual') speed = 28;
          } else {
            // Single tap: generous screen-space pick
            const hitId = pickStar(touch.lastX, touch.lastY);
            if (hitId) {
              lastUserSelectAt = performance.now();
              onClickRef.current?.(hitId);
            } else if (activeStarRef.current) {
              onBgClickRef.current?.();
            }
            // Missed tap with no panel open: does nothing (drift already
            // paused by the touchstart) — never moves the camera
          }
        }
        // If it was a swipe, lookVel is already set — momentum decays in animate loop
      };

      renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: false });
      renderer.domElement.addEventListener('touchmove',  onTouchMove,  { passive: false });
      renderer.domElement.addEventListener('touchend',   onTouchEnd,   { passive: false });

      const onResize = () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
      };
      window.addEventListener('resize', onResize);

      // ─── ANIMATION ───
      const clock = new THREE.Clock();
      let prevActiveStar: string | null = null;
      // Phase 7 — camera speed feeds the near-silent wind. Horizontal only:
      // the altitude lerp shouldn't read as movement.
      let prevCamX = camera.position.x;
      let prevCamZ = camera.position.z;

      function animate() {
        if (disposed) return;
        requestAnimationFrame(animate);
        const dt = Math.min(clock.getDelta(), 0.05);
        const time = clock.getElapsedTime();

        skyMat.uniforms.uTime.value     = time;
        skyMat.uniforms.uGradLift.value  = gradLiftRef.current;
        skyMat.uniforms.uGradSteep.value = gradSteepRef.current;
        skyMat.uniforms.uSunShift.value  = sunShiftRef.current;
        terrainMat.uniforms.uTerrainGlow.value = dbgTerrainGlowRef.current;
        starMat.uniforms.uStarDensity.value    = dbgStarDensityRef.current;
        starMat.uniforms.uStarSpeed.value      = dbgStarSpeedRef.current;
        starMat.uniforms.uStarFloor.value      = dbgStarFloorRef.current;
        skyDome.position.copy(camera.position);
        bgStars.position.copy(camera.position);
        starMat.uniforms.uTime.value = time;

        // Activate/deactivate high-res live texture as active star changes,
        // and drive the focused-mode transitions of the state machine.
        const currentActiveStar = activeStarRef.current;
        if (currentActiveStar !== prevActiveStar) {
          if (prevActiveStar) deactivateLive(prevActiveStar);
          if (currentActiveStar) {
            activateLive(currentActiveStar);
            // Clear any lingering smoke when a star is selected
            clearSmoke();
            if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
            hoverStarId = null;
            setMode('focused');
          } else if (camMode === 'focused') {
            // Panel dismissed — back to manual; the idle timer restarts.
            flyTargetXZ = null;
            setMode('manual');
            // Deep-link / autofocus dismissal: drift begins after a short beat
            if (focusWasAuto && driftEnabled) idleSec = IDLE_RESUME_SEC - 1.2;
          }
          prevActiveStar = currentActiveStar;
        }

        // ── WORLD CROSSFADE TICK (Phase 4) — additive, doesn't touch camera ──
        if (fadeOutActive) {
          fadeOutT += dt;
          const u = Math.min(fadeOutT / FADE_OUT_DUR, 1);
          const e = u * u * (3 - 2 * u); // smoothstep
          thoughtGroups.forEach(g => setGroupOpacity(g, 1 - e));
          skyMat.uniforms.uMix.value = e;
          dbgTerrainGlowRef.current = lerp(atmoFrom.terrainGlow, atmoTo.terrainGlow, e);
          dbgStarDensityRef.current = lerp(atmoFrom.starDensity, atmoTo.starDensity, e);
          dbgStarFloorRef.current   = lerp(atmoFrom.starFloor, atmoTo.starFloor, e);
          gradLiftRef.current  = lerp(atmoFrom.gradLift, atmoTo.gradLift, e);
          gradSteepRef.current = lerp(atmoFrom.gradSteep, atmoTo.gradSteep, e);
          sunShiftRef.current  = lerp(atmoFrom.sunShift, atmoTo.sunShift, e);
          if (u >= 1) {
            fadeOutActive = false;
            // Commit incoming (B) → current (A); reassign before disposing
            // the old texture so a live sampler uniform is never left
            // pointing at a disposed one.
            const oldTex = skyMat.uniforms.uSkyGrad.value as THREE.Texture | null;
            skyMat.uniforms.uSkyGrad.value = skyGradTexB;
            skyMat.uniforms.uMix.value = 0;
            oldTex?.dispose();
            skyGradTexB = null;
            proximityUpgradeCount = 0;
            fadeInActive = true;
            fadeInT = 0;
            const cb = fadeOutMidCb;
            fadeOutMidCb = null;
            cb?.(); // caller swaps thoughts/bonds props now — new stars arrive at opacity 0
          }
        }
        if (fadeInActive) {
          fadeInT += dt;
          const u = Math.min(fadeInT / FADE_IN_DUR, 1);
          const e = u * u * (3 - 2 * u);
          thoughtGroups.forEach(g => { if (g.userData.fadingIn) setGroupOpacity(g, e); });
          if (u >= 1) {
            fadeInActive = false;
            fadeInPendingStars = false;
            thoughtGroups.forEach(g => { g.userData.fadingIn = false; });
          }
        }

        // ── CAMERA — exactly one mode owns position/orientation per frame ────
        if (camMode === 'drift') {
          runDrift(dt);
        } else if (camMode === 'focused') {
          // Glide toward the framing point, easing out into the stop
          if (flyTargetXZ) {
            const fdx = flyTargetXZ.x - camera.position.x;
            const fdz = flyTargetXZ.z - camera.position.z;
            const fdist = Math.sqrt(fdx * fdx + fdz * fdz);
            if (fdist < 1.5) {
              flyTargetXZ = null;
            } else {
              const flySpeed = Math.min(90, Math.max(10, fdist * 1.6));
              const amt = Math.min(fdist, flySpeed * dt);
              camera.position.x += (fdx / fdist) * amt;
              camera.position.z += (fdz / fdist) * amt;
            }
          }
          const ag = activeStarRef.current ? thoughtGroups.get(activeStarRef.current) : null;
          if (ag) faceStar(ag, FOCUS_PITCH_OFFSET, dt, 2.5, 1.2, 0.8);
        } else {
          // ── manual — drag momentum, wheel/pinch move, silent WASD layer ────
          if (Math.abs(lookVel.x) > 0.0002) {
            heading += lookVel.x;
            lookVel.x *= 0.87; // friction: ~12 frames to stop from a medium swipe
          } else { lookVel.x = 0; }
          if (Math.abs(lookVel.y) > 0.0002) {
            pitch = clampPitch(pitch + lookVel.y);
            lookVel.y *= 0.87;
          } else { lookVel.y = 0; }
          if (Math.abs(touch.pinchVel) > 0.05) {
            camera.position.x += Math.sin(heading) * touch.pinchVel;
            camera.position.z += -Math.cos(heading) * touch.pinchVel;
            touch.pinchVel *= 0.82;
          } else { touch.pinchVel = 0; }
          if (Math.abs(wheelVel) > 0.3) {
            camera.position.x += Math.sin(heading) * wheelVel * dt;
            camera.position.z += -Math.cos(heading) * wheelVel * dt;
            wheelVel *= Math.exp(-2.2 * dt); // ~0.3 s half-life
          } else { wheelVel = 0; }

          // Eased keyboard turning: A/ArrowLeft = left, D/ArrowRight = right
          // Q/E = lateral strafe (slide perpendicular to heading)
          const MAX_TURN_VEL  = 1.8;  // max rad/s
          const TURN_ACCEL    = 5.0;  // rad/s² spin-up
          const TURN_DECEL    = 8.0;  // rad/s² spin-down (snappier to stop)
          const MAX_STRAFE    = 22;   // units/s
          const STRAFE_ACCEL  = 55;
          const STRAFE_DECEL  = 80;
          const wantLeft  = keys['KeyA'] || keys['ArrowLeft'];
          const wantRight = keys['KeyD'] || keys['ArrowRight'];
          if (wantLeft) {
            turnVel = Math.max(turnVel - TURN_ACCEL * dt, -MAX_TURN_VEL);
          } else if (wantRight) {
            turnVel = Math.min(turnVel + TURN_ACCEL * dt, MAX_TURN_VEL);
          } else {
            const decel = TURN_DECEL * dt;
            if (Math.abs(turnVel) <= decel) turnVel = 0;
            else turnVel -= Math.sign(turnVel) * decel;
          }
          if (turnVel !== 0) heading += turnVel * dt;

          if (keys['KeyQ']) {
            strafeVel = Math.max(strafeVel - STRAFE_ACCEL * dt, -MAX_STRAFE);
          } else if (keys['KeyE']) {
            strafeVel = Math.min(strafeVel + STRAFE_ACCEL * dt, MAX_STRAFE);
          } else {
            const sd = STRAFE_DECEL * dt;
            if (Math.abs(strafeVel) <= sd) strafeVel = 0;
            else strafeVel -= Math.sign(strafeVel) * sd;
          }

          // W/Space/↑ move forward; no baseline auto-cruise — the camera only
          // moves when asked, so missed clicks and stillness stay still.
          const wantForward = keys['Space'] || keys['KeyW'] || keys['ArrowUp'];
          const targetSpeed = wantForward ? 25 : 0;
          speed += (targetSpeed - speed) * dt * 3;
          if (Math.abs(speed) > 0.05) {
            camera.position.x += Math.sin(heading) * speed * dt;
            camera.position.z += -Math.cos(heading) * speed * dt;
          }
          if (strafeVel !== 0) {
            const sideX = Math.cos(heading);  // perpendicular X (sin(h+π/2) = cos h)
            const sideZ = Math.sin(heading);  // perpendicular Z
            camera.position.x += sideX * strafeVel * dt;
            camera.position.z += sideZ * strafeVel * dt;
          }

          // Idle → drift resumes from wherever the camera is
          const inputActive =
            mouseDrag.active || touch.active || wantLeft || wantRight || wantForward ||
            keys['KeyS'] || keys['ArrowDown'] || keys['KeyQ'] || keys['KeyE'] ||
            lookVel.x !== 0 || lookVel.y !== 0 ||
            wheelVel !== 0 || touch.pinchVel !== 0 || Math.abs(speed) > 0.5;
          if (inputActive) idleSec = 0;
          else idleSec += dt;
          if (idleSec >= IDLE_RESUME_SEC && driftEnabled && !activeStarRef.current) {
            setMode('drift');
          }
        }

        const fwdX = Math.sin(heading);
        const fwdZ = -Math.cos(heading);
        // Sun always in front of camera so warm glow stays ahead
        skyMat.uniforms.uSunDir.value.set(fwdX, -0.15, fwdZ).normalize();

        // Camera Y — cruise altitude, floored by terrain; stars (y=80-140) sit
        // above so we always look up
        const terrainFloor = Math.max(getHeight(camera.position.x, camera.position.z) + 40, 55);
        camTargetY = Math.max(BASE_CAM_Y, terrainFloor);
        camera.position.y += (camTargetY - camera.position.y) * Math.min(dt * 2.5, 1);

        const cosP = Math.cos(pitch);
        const sinP = Math.sin(pitch);
        camera.lookAt(new THREE.Vector3(
          camera.position.x + fwdX * cosP * 200,
          camera.position.y + sinP * 200,
          camera.position.z + fwdZ * cosP * 200,
        ));

        if (dt > 0.0005) {
          sound.setCameraSpeed(
            Math.hypot(camera.position.x - prevCamX, camera.position.z - prevCamZ) / dt,
          );
        }
        prevCamX = camera.position.x;
        prevCamZ = camera.position.z;

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
          // Skip micro-animation for very distant stars — invisible at that distance
          if (camera.position.distanceTo(g.position) > 500) return;
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
        // ── MOMENTS TICK (Phase 8) — runs after the orbit pass so the
        // inscription is aimed at where the stars are this frame, and before
        // the scale pass, which samples the blooms. ──
        blooms.update(dt, id => {
          const g = thoughtGroups.get(id);
          return g ? camera.position.distanceTo(g.position) : null;
        });
        if (pendingFinale) {
          const fg = thoughtGroups.get(pendingFinale.fromId);
          pendingFinale.waited += dt;
          // Let the mutual bloom lead by a beat, then write — once the bond's
          // orbit actually exists.
          if (pendingFinale.waited >= 0.55 && fg?.userData.orbit) {
            const pts = projectOrbitRing(
              pendingFinale.fromId, pendingFinale.toId, pendingFinale.reason.trim().length,
            );
            if (pts && inscription.begin(pts, pendingFinale.reason)) {
              activeFinale = {
                fromId: pendingFinale.fromId,
                toId: pendingFinale.toId,
                textLen: pendingFinale.reason.trim().length,
              };
              pendingFinale = null;
            }
          }
          // The orbit never arrived (or never projected): the blooms stand alone.
          if (pendingFinale && pendingFinale.waited > 3) pendingFinale = null;
        }
        if (inscription.active) {
          const pts = activeFinale
            ? projectOrbitRing(activeFinale.fromId, activeFinale.toId, activeFinale.textLen)
            : null;
          if (pts) inscription.setPath(pts);
          inscription.update(dt);
          if (!inscription.active) activeFinale = null;
        }

        // Pass 3: scale pulse + spiro animation for all stars
        // Throttle dot→spiro upgrades to 2 per frame to avoid mid-frame hitching.
        let dotUpgradesThisFrame = 0;
        thoughtGroups.forEach(g => {
          const id = g.userData.id as string;
          const isSelected = id === activeStarRef.current;
          const baseScale = 1.0 + Math.sin(time * 0.8 + (g.userData.pulsePhase as number)) * 0.05;
          const targetMult = isSelected ? SELECTED_SCALE_MULT : 1.0;
          const curMult = g.userData.scaleMult as number;
          const newMult = curMult + (targetMult - curMult) * Math.min(dt * 3.5, 1);
          g.userData.scaleMult = newMult;
          // Phase 8 — a birth/finale bloom multiplies into the star's own
          // scale rather than replacing it, so focus framing keeps working.
          const bloom = blooms.sample(id);
          g.scale.setScalar(baseScale * newMult * (bloom ? bloom.scale : 1));
          if (bloom) {
            setGroupOpacity(g, bloom.opacity);
            const glowSprite = g.userData.glow as THREE.Sprite | null;
            if (glowSprite) {
              const gs = SPRITE_SCALE * 2.2 * bloom.glow;
              glowSprite.scale.set(gs, gs, 1);
            }
          }

          // Proximity upgrade: dot-fallback stars get a real spirograph once they're
          // close enough to be clearly visible (~20+ px on screen ≈ dist < 350).
          // activateLive() already handles the dot upgrade on click, but this path
          // upgrades proactively so the star animates before the user clicks it.
          if (g.userData.dotDims && !g.userData.spiro && dotUpgradesThisFrame < 2) {
            const distToDot = camera.position.distanceTo(g.position);
            if (distToDot < 350) {
              upgradeDotToSpiro(id, g);
              dotUpgradesThisFrame++;
            }
          }

          const spiro = g.userData.spiro as StarSpiro | null;
          if (!spiro) return; // still a dot (beyond proximity threshold or pool full)

          const live = liveStars.get(id);
          if (live) {
            // Selected star: full 60 fps, driven from the single main RAF loop.
            live.inst.renderStatic(time);
            live.texture.needsUpdate = true;
          } else {
            // ── Distance-based animation tiers for baked/proximity-upgraded stars ─
            // Closer = more frequent re-renders = livelier. Each tier is cheap
            // (one canvas draw + one GPU upload) and only fires when its frame
            // counter hits the interval, so the total uploads/frame stays low.
            //
            //  dist < 55  →  every  3 frames  (~20 fps) — close, clearly alive
            //  dist < 140 →  every  8 frames  (~7.5 fps) — medium, noticeably moving
            //  dist < 350 →  every 30 frames  (~2 fps)   — distant, slow subtle cycle
            //  dist ≥ 350 →  never            (0 fps)    — below upgrade threshold
            const dist = camera.position.distanceTo(g.position);
            spiro.frameCount++;
            let interval = 0;
            if      (dist < 55)  interval = 3;
            else if (dist < 140) interval = 8;
            else if (dist < 350) interval = 30;

            if (interval > 0 && spiro.frameCount % interval === 0) {
              spiro.inst.renderStatic(time + spiro.timeOffset);
              spiro.texture.needsUpdate = true;
            }
          }
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

        // Perf overlay — only active when ?perf=1 is in the URL
        if (perfOverlayRef.current) {
          const info = renderer.info;
          perfOverlayRef.current.textContent =
            `Draw calls : ${info.render.calls}\n` +
            `Triangles  : ${info.render.triangles.toLocaleString()}\n` +
            `Textures   : ${info.memory.textures}\n` +
            `Geometries : ${info.memory.geometries}\n` +
            `Programs   : ${info.programs?.length ?? '–'}\n` +
            `Stars baked: ${bakedStarCount}\n` +
            `Stars live : ${liveStars.size}`;
        }
      }
      animate();

      return () => {
        disposed = true;
        addThoughtFnRef.current = null;
        removeThoughtFnRef.current = null;
        flyToFnRef.current = null;
        setDriftingFnRef.current = null;
        addBondFnRef.current = null;
        removeBondFnRef.current = null;
        crossfadeFnRef.current = null;
        bloomStarFnRef.current = null;
        bondFinaleFnRef.current = null;
        blooms.clear();
        inscription.dispose();
        skyGradTexB?.dispose();
        (skyMat.uniforms.uSkyGrad.value as THREE.Texture | null)?.dispose();

        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('resize', onResize);
        window.removeEventListener('mousemove', onMouseMoveWindow);
        window.removeEventListener('mouseup', onMouseUpWindow);
        renderer.domElement.removeEventListener('mousedown', onMouseDown);
        renderer.domElement.removeEventListener('click', onClickCanvas);
        renderer.domElement.removeEventListener('wheel', onWheel);
        renderer.domElement.removeEventListener('mousemove', onMouseMove);
        renderer.domElement.removeEventListener('touchstart', onTouchStart);
        renderer.domElement.removeEventListener('touchmove',  onTouchMove);
        renderer.domElement.removeEventListener('touchend',   onTouchEnd);
        sound.setCameraSpeed(0); // the wind stops with the scene
        if (hoverTimer) clearTimeout(hoverTimer);
        if (smokeDisperseTimer) clearTimeout(smokeDisperseTimer);
        if (smokeCleanupTimer)  clearTimeout(smokeCleanupTimer);
        if (container.contains(smokeOverlay)) container.removeChild(smokeOverlay);
        if (container.contains(dwellOverlay)) container.removeChild(dwellOverlay);

        liveStars.forEach(live => { live.inst.stop(); live.texture.dispose(); });
        liveStars.clear();
        bondOrbitals.forEach((_, id) => destroyBond(id));
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
    // initialAtmosphere is intentionally read once at mount only — every
    // subsequent world change goes through the crossfadeToWorld() handle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      // Removals FIRST. A bond owns the from-star's single orbit slot, and the
      // optimistic id ("local-…") is swapped for the real one the moment
      // /api/connect answers: adding before removing would set the orbit from
      // the new id and then have the old id's teardown null it again, leaving
      // the just-bound star frozen off its orbit.
      for (const id of [...activeBondIds.current]) {
        if (!next.has(id)) {
          remove(id);
          activeBondIds.current.delete(id);
        }
      }

      for (const b of (bonds ?? [])) {
        if (!activeBondIds.current.has(b.id)) {
          add(b);
          activeBondIds.current.add(b.id);
        }
      }
    }, [bonds]);

    // Read ?perf= after mount only — reading window.location during render
    // makes the server and client render different HTML (hydration error).
    const [showPerf, setShowPerf] = useState(false);
    useEffect(() => {
      if (new URLSearchParams(window.location.search).has('perf')) {
        setShowPerf(true);
      }
    }, []);
    return (
      <>
        <div ref={containerRef} style={{ position: 'fixed', inset: 0, zIndex: 0 }} />
        {showPerf && (
          <pre
            ref={perfOverlayRef}
            style={{
              position: 'fixed', top: 12, left: 12, zIndex: 100,
              margin: 0, padding: '10px 14px',
              background: 'rgba(0,0,0,0.72)', color: '#b0ffb0',
              fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6,
              borderRadius: 6, pointerEvents: 'none',
              whiteSpace: 'pre',
            }}
          />
        )}
      </>
    );
  },
);

export default CosmosScene;
