/**
 * The Between — Spirograph Renderer (TypeScript)
 *
 * Canvas 2D renderer. Takes six dimension floats, an emotion index, and a curve type.
 * Renders animated firefly tracers on a 3D-projected parametric curve.
 */

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
  { name: 'Anger / Passion',      rgb: [230,  57,  70] },  // 0
  { name: 'Joy / Delight',        rgb: [247, 127,   0] },  // 1
  { name: 'Hope / Anticipation',  rgb: [252, 191,  73] },  // 2
  { name: 'Peace / Acceptance',   rgb: [ 42, 157, 143] },  // 3
  { name: 'Sadness / Longing',    rgb: [ 69, 123, 157] },  // 4
  { name: 'Fear / Awe',           rgb: [ 92,  75, 138] },  // 5
  { name: 'Love / Tenderness',    rgb: [155,  93, 229] },  // 6
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
  const R = CONFIG.outerRadius;

  const petalTarget = CONFIG.petals.min + vulnerability * (CONFIG.petals.max - CONFIG.petals.min);
  const petals = tension < 0.3 ? Math.round(petalTarget) : petalTarget;
  const r = R / (petals + 1);
  const d = r * (0.5 + 0.5 * (1 - scope * 0.3));
  const totalRevolutions = Math.ceil(petals);
  const totalTheta = totalRevolutions * 2 * Math.PI * (petals + 1);

  const maxTilt = scope * CONFIG.maxTiltFactor;
  const angularSpeed = CONFIG.speed.atWarm + (1 - warmth) * (CONFIG.speed.atCold - CONFIG.speed.atWarm);
  const fireflyCount = Math.max(CONFIG.fireflies.min,
    Math.round((1 - rootedness) * (CONFIG.fireflies.max - CONFIG.fireflies.min) + CONFIG.fireflies.min));

  const tailFraction = CONFIG.tailFraction.min + certainty * (CONFIG.tailFraction.max - CONFIG.tailFraction.min);
  const fadeExp = CONFIG.tailFadeExp.atZero + certainty * (CONFIG.tailFadeExp.atOne - CONFIG.tailFadeExp.atZero);
  const strokeBase = CONFIG.tailStroke.min + certainty * (CONFIG.tailStroke.max - CONFIG.tailStroke.min);

  return {
    R, r, d, petals, totalRevolutions, totalTheta, maxTilt,
    angularSpeed, fireflyCount, tailFraction, fadeExp, strokeBase,
    scope, tension, vulnerability, curveType, certainty,
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

    // Head glow
    const headProj = pj(ev(headTheta));
    const glowR = 14 * headProj.scale;
    const grad = ctx.createRadialGradient(headProj.sx, headProj.sy, 0, headProj.sx, headProj.sy, glowR);
    const wr = Math.min(255, baseRGB[0] + 100);
    const wg = Math.min(255, baseRGB[1] + 100);
    const wb = Math.min(255, baseRGB[2] + 100);
    grad.addColorStop(0, `rgba(${wr},${wg},${wb},1)`);
    grad.addColorStop(0.3, `rgba(${Math.min(255, baseRGB[0]+50)},${Math.min(255, baseRGB[1]+50)},${Math.min(255, baseRGB[2]+50)},0.6)`);
    grad.addColorStop(1, `rgba(${baseRGB[0]},${baseRGB[1]},${baseRGB[2]},0)`);
    ctx.beginPath();
    ctx.fillStyle = grad;
    ctx.arc(headProj.sx, headProj.sy, glowR, 0, Math.PI * 2);
    ctx.fill();
  }
}


// ═══════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════

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
  let baseRGB: [number, number, number] = EMOTIONS[currentDims.emotionIndex]?.rgb ?? [180, 120, 200];
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
      baseRGB = EMOTIONS[currentDims.emotionIndex]?.rgb ?? [180, 120, 200];
    },
    renderStatic(time = 2.5) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderFrame(ctx, size, size, geo, baseRGB, time);
    },
    getCanvas() { return canvas; },
  };
}
