/**
 * The Between — Spirograph Renderer (TypeScript)
 *
 * Canvas 2D renderer. Takes six dimension floats, an emotion index, and a curve type.
 * Renders animated firefly tracers on a 3D-projected parametric curve.
 */

import {
  resolveArchetype, drawArchetypeUnder, drawArchetypeOver,
  CRYSTAL_TIGHTEN, CRYSTAL_SLOW,
  type ArchetypeSpec, type Projector, type RGB,
} from './archetypes';

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface SpiroDimensions {
  certainty: number;
  warmth: number;
  tension: number;
  vulnerability: number;
  scope: number;
  rootedness: number;
  emotionIndex: number;
  curveType: CurveType;
  /**
   * Phase 5 — the star's shortcode, used as the archetype seed so the cosmos,
   * the panel mini preview and the OG image resolve the same structure.
   * Optional: pre-birth previews have no shortcode and fall back to a hash of
   * the dimension values (see `archetypeSeed`).
   */
  seed?: string;
}

export type CurveType = 'hypotrochoid' | 'epitrochoid' | 'rose' | 'lissajous' | 'rhodonea';

export interface EmotionDef {
  name: string;
  rgb: [number, number, number];
}

interface SpiroConfig {
  outerRadius: number;
  petals: { min: number; max: number };
  maxTiltFactor: number;
  speed: { atWarm: number; atCold: number };
  tailFraction: { min: number; max: number };
  tailFadeExp: { atZero: number; atOne: number };
  tailStroke: { min: number; max: number };
  ghostThreshold: number;
  ghostAlphaFactor: number;
  fireflies: { min: number; max: number };
  wobbleThreshold: number;
  wobbleScale: number;
  tailSegments: number;
  subPointsPerSegment: number;
  ghostSteps: number;
  camera: {
    angleX: number;
    rotateSpeed: number;
    yOffset: number;
    zoom: number;
    focal: number;
  };
  huePulse: { speed: number; amplitude: number };
}

interface Geometry {
  R: number;
  r: number;
  d: number;
  petals: number;
  totalRevolutions: number;
  totalTheta: number;
  maxTilt: number;
  angularSpeed: number;
  fireflyCount: number;
  tailFraction: number;
  fadeExp: number;
  strokeBase: number;
  scope: number;
  tension: number;
  vulnerability: number;
  curveType: CurveType;
  certainty: number;
  /** Phase 5 — structural archetype resolved once, alongside the geometry. */
  arch: ArchetypeSpec;
}

interface CamState {
  cosY: number;
  sinY: number;
  cosX: number;
  sinX: number;
  cx: number;
  cy: number;
  yOffset: number;
  zoom: number;
  focal: number;
}

export interface SpirographInstance {
  start: () => void;
  stop: () => void;
  update: (dims: SpiroDimensions) => void;
  renderStatic: (time?: number) => void;
  getCanvas: () => HTMLCanvasElement;
}


// ═══════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════

export const EMOTIONS: EmotionDef[] = [
  { name: 'Anger / Passion',      rgb: [232,  80, 106] },  // 0  #E8506A
  { name: 'Joy / Delight',        rgb: [232, 132,  90] },  // 1  #E8845A
  { name: 'Hope / Anticipation',  rgb: [232, 200, 120] },  // 2  #E8C878
  { name: 'Peace / Acceptance',   rgb: [ 90, 184, 154] },  // 3  #5AB89A
  { name: 'Sadness / Longing',    rgb: [ 90, 138, 224] },  // 4  #5A8AE0
  { name: 'Fear / Awe',           rgb: [123, 104, 200] },  // 5  #7B68C8
  { name: 'Love / Tenderness',    rgb: [176, 104, 200] },  // 6  #B068C8
];

export const CURVE_TYPES: CurveType[] = [
  'hypotrochoid',
  'epitrochoid',
  'rose',
  'lissajous',
  'rhodonea',
];

export const CONFIG: SpiroConfig = {
  outerRadius: 120,
  petals: { min: 2, max: 14 },
  maxTiltFactor: Math.PI * 0.45,
  speed: { atWarm: 0.8, atCold: 2.8 },
  tailFraction: { min: 0.02, max: 0.17 },
  tailFadeExp: { atZero: 6.0, atOne: 3.1 },
  tailStroke: { min: 1.2, max: 2.7 },
  ghostThreshold: 0.7,
  ghostAlphaFactor: 0.15,
  fireflies: { min: 1, max: 6 },
  wobbleThreshold: 0.2,
  wobbleScale: 4.0,
  tailSegments: 40,
  subPointsPerSegment: 8,
  ghostSteps: 800,
  camera: {
    angleX: 0.3,
    rotateSpeed: 0.08,
    yOffset: 30,
    zoom: 1.4,
    focal: 600,
  },
  huePulse: { speed: 0.8, amplitude: 15 },
};


// ═══════════════════════════════════════════════════════
// CURVE EVALUATION
// ═══════════════════════════════════════════════════════

function evalPoint(theta: number, geo: Geometry): { x: number; y: number; z: number } {
  const { R, r, d, scope, totalRevolutions, maxTilt, tension, curveType, vulnerability } = geo;
  const diff = R - r;
  const ratio = diff / r;
  let px: number, py: number;

  switch (curveType) {
    case 'epitrochoid': {
      const sum = R + r;
      px = sum * Math.cos(theta) - d * Math.cos((sum / r) * theta);
      py = sum * Math.sin(theta) - d * Math.sin((sum / r) * theta);
      break;
    }
    case 'rose': {
      const k = 2 + vulnerability * 5;
      const roseR = R * 0.7 * Math.cos(k * theta) + d * 0.3;
      px = roseR * Math.cos(theta);
      py = roseR * Math.sin(theta);
      break;
    }
    case 'lissajous': {
      const a = 2 + Math.floor(vulnerability * 4);
      const b = 3 + Math.floor(scope * 3);
      const delta = tension * Math.PI;
      px = R * 0.75 * Math.sin(a * theta + delta);
      py = R * 0.75 * Math.sin(b * theta);
      break;
    }
    case 'rhodonea': {
      const rk = 3 + vulnerability * 4;
      const spiral = 1 + theta * 0.002 * tension;
      const rhoR = R * 0.6 * Math.cos(rk * theta) * spiral;
      px = rhoR * Math.cos(theta);
      py = rhoR * Math.sin(theta);
      break;
    }
    default: { // hypotrochoid
      px = diff * Math.cos(theta) + d * Math.cos(ratio * theta);
      py = diff * Math.sin(theta) - d * Math.sin(ratio * theta);
    }
  }

  const revFrac = (theta / (2 * Math.PI)) / totalRevolutions;
  const tiltAngle = revFrac * maxTilt;
  const tiltAxis = revFrac * Math.PI * 2 * (1 + scope);

  const cosT = Math.cos(tiltAngle), sinT = Math.sin(tiltAngle);
  const cosA = Math.cos(tiltAxis), sinA = Math.sin(tiltAxis);

  let x = px * cosA - py * cosT * sinA;
  let y = px * sinA + py * cosT * cosA;
  let z = py * sinT;

  if (tension > CONFIG.wobbleThreshold) {
    const w = (tension - CONFIG.wobbleThreshold) * CONFIG.wobbleScale;
    x += Math.sin(theta * 3.7) * w;
    y += Math.cos(theta * 5.3) * w;
    z += Math.sin(theta * 2.1) * w;
  }

  return { x, y, z };
}

function project(x: number, y: number, z: number, cam: CamState): { sx: number; sy: number; scale: number } {
  const { cosY, sinY, cosX, sinX, cx, cy, yOffset, zoom, focal } = cam;
  const rx = x * cosY - z * sinY;
  const rz = x * sinY + z * cosY;
  const ry = y * cosX - rz * sinX;
  const rz2 = y * sinX + rz * cosX;
  const p = focal / (focal + rz2);
  return { sx: cx + rx * p * zoom, sy: cy + yOffset + ry * p * zoom, scale: p * zoom };
}


// ═══════════════════════════════════════════════════════
// GEOMETRY
// ═══════════════════════════════════════════════════════

function computeGeometry(dims: SpiroDimensions): Geometry {
  const { certainty, warmth, tension, vulnerability, scope, rootedness, curveType } = dims;
  const arch = resolveArchetype(dims);

  // Phase 5 — the crystalline knot draws the same curve pulled tighter and
  // turned slower. Everything else about the form is untouched.
  const R = CONFIG.outerRadius * (arch.crystal ? CRYSTAL_TIGHTEN : 1);

  const petalTarget = CONFIG.petals.min + vulnerability * (CONFIG.petals.max - CONFIG.petals.min);
  const petals = tension < 0.3 ? Math.round(petalTarget) : petalTarget;
  const r = R / (petals + 1);
  const d = r * (0.5 + 0.5 * (1 - scope * 0.3));
  const totalRevolutions = Math.ceil(petals);
  const totalTheta = totalRevolutions * 2 * Math.PI * (petals + 1);

  const maxTilt = scope * CONFIG.maxTiltFactor;
  const angularSpeed = (CONFIG.speed.atWarm + (1 - warmth) * (CONFIG.speed.atCold - CONFIG.speed.atWarm))
    * (arch.crystal ? CRYSTAL_SLOW : 1);
  const fireflyCount = Math.max(CONFIG.fireflies.min,
    Math.round((1 - rootedness) * (CONFIG.fireflies.max - CONFIG.fireflies.min) + CONFIG.fireflies.min));

  const tailFraction = CONFIG.tailFraction.min + certainty * (CONFIG.tailFraction.max - CONFIG.tailFraction.min);
  const fadeExp = CONFIG.tailFadeExp.atZero + certainty * (CONFIG.tailFadeExp.atOne - CONFIG.tailFadeExp.atZero);
  const strokeBase = CONFIG.tailStroke.min + certainty * (CONFIG.tailStroke.max - CONFIG.tailStroke.min);

  return {
    R, r, d, petals, totalRevolutions, totalTheta, maxTilt,
    angularSpeed, fireflyCount, tailFraction, fadeExp, strokeBase,
    scope, tension, vulnerability, curveType, certainty, arch,
  };
}


// ═══════════════════════════════════════════════════════
// RENDER FRAME
// ═══════════════════════════════════════════════════════

function renderFrame(
  ctx: CanvasRenderingContext2D,
  logW: number,
  logH: number,
  geo: Geometry,
  baseRGB: [number, number, number],
  time: number,
): void {
  const cx = logW / 2;
  const cy = logH / 2;
  const c = CONFIG.camera;

  const camAngleY = time * c.rotateSpeed;
  const cosY = Math.cos(camAngleY), sinY = Math.sin(camAngleY);
  const cosX = Math.cos(c.angleX), sinX = Math.sin(c.angleX);
  const cam: CamState = { cosY, sinY, cosX, sinX, cx, cy, yOffset: c.yOffset, zoom: c.zoom, focal: c.focal };

  const ev = (theta: number) => evalPoint(theta, geo);
  const pj = (pt: { x: number; y: number; z: number }) => project(pt.x, pt.y, pt.z, cam);

  ctx.clearRect(0, 0, logW, logH);

  // Phase 5 — structural archetypes. `archR` is the *untightened* radius so a
  // crystalline knot's rings and motes keep their normal reach around the
  // pulled-in curve.
  const archR = CONFIG.outerRadius;
  const projector: Projector = (x, y, z) => project(x, y, z, cam);
  drawArchetypeUnder(ctx, geo.arch, projector, archR, baseRGB, time);

  // Ghost trace
  if (geo.certainty > CONFIG.ghostThreshold) {
    const ghostAlpha = (geo.certainty - CONFIG.ghostThreshold) * CONFIG.ghostAlphaFactor;
    ctx.beginPath();
    ctx.strokeStyle = `rgba(${baseRGB[0]},${baseRGB[1]},${baseRGB[2]},${ghostAlpha})`;
    ctx.lineWidth = 0.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    let prevSx = 0, prevSy = 0, first = true;
    for (let i = 0; i <= CONFIG.ghostSteps; i++) {
      const theta = (i / CONFIG.ghostSteps) * geo.totalTheta;
      const proj = pj(ev(theta));
      if (first) { ctx.moveTo(proj.sx, proj.sy); first = false; }
      else {
        ctx.quadraticCurveTo(prevSx, prevSy, (prevSx + proj.sx) / 2, (prevSy + proj.sy) / 2);
      }
      prevSx = proj.sx; prevSy = proj.sy;
    }
    ctx.stroke();
  }

  // Phase 5 — crystalline lattice. Chords struck straight across the curve
  // between evenly-spaced points on it: the one archetype that has to sample
  // the curve itself, so it lives here rather than in archetypes.ts.
  if (geo.arch.crystal) {
    const n = geo.arch.crystalChords;
    const skip = geo.arch.crystalSkip;
    const pts: { sx: number; sy: number }[] = [];
    for (let i = 0; i < n; i++) {
      const proj = pj(ev((i / n) * geo.totalTheta + time * geo.angularSpeed * 0.15));
      pts.push({ sx: proj.sx, sy: proj.sy });
    }
    ctx.beginPath();
    ctx.strokeStyle = `rgba(${baseRGB[0]},${baseRGB[1]},${baseRGB[2]},0.15)`;
    ctx.lineWidth = 0.85;
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + skip) % n];
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
    }
    ctx.stroke();
  }

  // Fireflies
  const tailThetaLen = geo.tailFraction * geo.totalTheta;

  for (let f = 0; f < geo.fireflyCount; f++) {
    const headTheta = (time * geo.angularSpeed + (f / geo.fireflyCount) * geo.totalTheta) % geo.totalTheta;

    for (let seg = CONFIG.tailSegments - 1; seg >= 0; seg--) {
      const segFrac0 = seg / CONFIG.tailSegments;
      const segFrac1 = (seg + 1) / CONFIG.tailSegments;
      const alpha = Math.pow(1 - segFrac1, geo.fadeExp) * 0.9;
      if (alpha < 0.005) continue;

      const sw = geo.strokeBase * (1 - segFrac1 * 0.5);
      const hp = CONFIG.huePulse;
      const hShift = Math.sin(time * hp.speed + segFrac1 * 2) * hp.amplitude;
      const rc = Math.min(255, Math.max(0, baseRGB[0] + hShift * 0.3));
      const gc = Math.min(255, Math.max(0, baseRGB[1] + hShift * 0.1));
      const bc = Math.min(255, Math.max(0, baseRGB[2] - hShift * 0.2));

      ctx.beginPath();
      ctx.strokeStyle = `rgba(${Math.round(rc)},${Math.round(gc)},${Math.round(bc)},${alpha})`;
      ctx.lineWidth = sw;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      let prevSx = 0, prevSy = 0, isFirst = true;
      for (let k = 0; k <= CONFIG.subPointsPerSegment; k++) {
        const frac = segFrac0 + (segFrac1 - segFrac0) * (k / CONFIG.subPointsPerSegment);
        const theta = headTheta - frac * tailThetaLen;
        const proj = pj(ev(theta));
        if (isFirst) { ctx.moveTo(proj.sx, proj.sy); isFirst = false; }
        else {
          ctx.quadraticCurveTo(prevSx, prevSy, (prevSx + proj.sx) / 2, (prevSy + proj.sy) / 2);
        }
        prevSx = proj.sx; prevSy = proj.sy;
      }
      ctx.stroke();
    }

    // Head glow — palette color at low alpha; no white boost, NormalBlending handles compositing
    const headProj = pj(ev(headTheta));
    const glowR = 24 * headProj.scale;
    const grad = ctx.createRadialGradient(headProj.sx, headProj.sy, 0, headProj.sx, headProj.sy, glowR);
    const [gr, gg, gb] = baseRGB;
    grad.addColorStop(0,   `rgba(${gr},${gg},${gb},0.22)`);
    grad.addColorStop(0.4, `rgba(${gr},${gg},${gb},0.10)`);
    grad.addColorStop(1,   `rgba(${gr},${gg},${gb},0)`);
    ctx.beginPath();
    ctx.fillStyle = grad;
    ctx.arc(headProj.sx, headProj.sy, glowR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Phase 5 — foreground structures (binary cores, satellite motes) draw last
  // so they stay legible over the firefly tangle.
  drawArchetypeOver(ctx, geo.arch, projector, archR, baseRGB as RGB, time);
}


// ═══════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════

/**
 * Phase 5 — stamps a star's shortcode onto its dimensions as the archetype
 * seed. Call this wherever dimensions come out of the database and are about to
 * be drawn, so the cosmos sprite, the panel mini preview and the OG image all
 * resolve the same structure for the same star.
 */
export function withSeed<T extends SpiroDimensions>(dims: T, shortcode: string | null | undefined): T {
  return shortcode ? { ...dims, seed: shortcode } : dims;
}

export function randomCurveType(): CurveType {
  return CURVE_TYPES[Math.floor(Math.random() * CURVE_TYPES.length)];
}

export function createSpirograph(
  canvas: HTMLCanvasElement,
  dims: SpiroDimensions,
  options: { size?: number; dpr?: number; autoRotate?: boolean } = {},
): SpirographInstance {
  const {
    size = 600,
    dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1,
  } = options;

  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';

  const ctx = canvas.getContext('2d')!;
  let currentDims = { ...dims };
  let geo = computeGeometry(currentDims);
  let baseRGB: [number, number, number] = EMOTIONS[currentDims.emotionIndex]?.rgb ?? [255, 255, 255];
  let animId: number | null = null;
  let startTime = Date.now();

  function frame() {
    const t = (Date.now() - startTime) / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderFrame(ctx, size, size, geo, baseRGB, t);
    animId = requestAnimationFrame(frame);
  }

  return {
    start() {
      if (animId) return;
      startTime = Date.now();
      frame();
    },
    stop() {
      if (animId !== null) {
        cancelAnimationFrame(animId);
        animId = null;
      }
    },
    update(newDims: SpiroDimensions) {
      currentDims = { ...newDims };
      geo = computeGeometry(currentDims);
      baseRGB = EMOTIONS[currentDims.emotionIndex]?.rgb ?? [255, 255, 255];
    },
    renderStatic(time = 2.5) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderFrame(ctx, size, size, geo, baseRGB, time);
    },
    getCanvas() { return canvas; },
  };
}
