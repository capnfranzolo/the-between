/**
 * The Between — Spirograph Renderer
 * 
 * Canvas 2D renderer for individual spirograph forms.
 * Takes six dimension floats, an emotion, and a curve type.
 * Renders animated firefly tracers on a 3D hypotrochoid path.
 * 
 * Usage:
 *   import { createSpirograph } from './spirograph-renderer';
 * 
 *   const spiro = createSpirograph(canvas, {
 *     certainty: 0.5,
 *     warmth: 0.7,
 *     tension: 0.3,
 *     vulnerability: 0.8,
 *     scope: 0.4,
 *     rootedness: 0.2,
 *     emotionIndex: 6,
 *     curveType: 'rose',
 *   });
 *   spiro.start();       // begins animation loop
 *   spiro.stop();        // stops animation
 *   spiro.update(dims);  // update dimensions live
 *   spiro.renderFrame(); // render a single frame (for OG image generation)
 */


// ═══════════════════════════════════════════════════════
// CONFIG — edit these to tune the visual system
// ═══════════════════════════════════════════════════════

export const EMOTIONS = [
  { name: 'Anger / Passion',      rgb: [230,  57,  70] },  // 0 — red
  { name: 'Joy / Delight',        rgb: [247, 127,   0] },  // 1 — orange
  { name: 'Hope / Anticipation',  rgb: [252, 191,  73] },  // 2 — yellow
  { name: 'Peace / Acceptance',   rgb: [ 42, 157, 143] },  // 3 — green
  { name: 'Sadness / Longing',    rgb: [ 69, 123, 157] },  // 4 — blue
  { name: 'Fear / Awe',           rgb: [ 92,  75, 138] },  // 5 — indigo
  { name: 'Love / Tenderness',    rgb: [155,  93, 229] },  // 6 — violet
];

export const CURVE_TYPES = [
  'hypotrochoid',
  'epitrochoid',
  'rose',
  'lissajous',
  'rhodonea',
];

// Dimension → visual parameter ranges
// Edit these objects to retune without touching renderer logic
export const CONFIG = {
  // Base geometry
  outerRadius: 120,

  // VULNERABILITY → petal count
  petals: { min: 2, max: 14 },             // vulnerability 0→1

  // SCOPE → 3D tilt
  maxTiltFactor: Math.PI * 0.45,           // scope * this = maxTilt radians

  // WARMTH → tracer speed (angular velocity, rad/s)
  // INVERTED: cold (0) = fast, warm (1) = slow
  speed: { atWarm: 0.8, atCold: 2.8 },

  // CERTAINTY → tail
  tailFraction: { min: 0.02, max: 0.17 },  // % of total path
  tailFadeExp: { atZero: 6.0, atOne: 3.1 },
  tailStroke: { min: 1.2, max: 2.7 },
  ghostThreshold: 0.7,                     // certainty above this shows ghost trace
  ghostAlphaFactor: 0.15,

  // ROOTEDNESS → firefly count
  // INVERTED: experience (0) = many, principle (1) = few
  fireflies: { min: 1, max: 6 },

  // TENSION → wobble
  wobbleThreshold: 0.2,                    // tension below this = no wobble
  wobbleScale: 4.0,                        // multiplier for wobble amplitude

  // Rendering quality
  tailSegments: 40,
  subPointsPerSegment: 8,
  ghostSteps: 800,

  // Camera
  camera: {
    angleX: 0.3,
    rotateSpeed: 0.08,                     // rad/s for auto-rotate
    yOffset: 30,
    zoom: 1.4,
    focal: 600,
  },

  // Hue pulsation along tail
  huePulse: {
    speed: 0.8,
    amplitude: 15,
  },
};


// ═══════════════════════════════════════════════════════
// CURVE EVALUATION — analytical, never pre-sampled
// ═══════════════════════════════════════════════════════

function evalPoint(theta, geo) {
  const { R, r, d, scope, totalRevolutions, maxTilt, tension, curveType, vulnerability } = geo;
  const diff = R - r;
  const ratio = diff / r;
  let px, py;

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

  // Multi-plane orbit: scope controls tilt axis rotation
  const revFrac = (theta / (2 * Math.PI)) / totalRevolutions;
  const tiltAngle = revFrac * maxTilt;
  const tiltAxis = revFrac * Math.PI * 2 * (1 + scope);

  const cosT = Math.cos(tiltAngle), sinT = Math.sin(tiltAngle);
  const cosA = Math.cos(tiltAxis), sinA = Math.sin(tiltAxis);

  let x = px * cosA - py * cosT * sinA;
  let y = px * sinA + py * cosT * cosA;
  let z = py * sinT;

  // Tension → organic wobble
  if (tension > CONFIG.wobbleThreshold) {
    const w = (tension - CONFIG.wobbleThreshold) * CONFIG.wobbleScale;
    x += Math.sin(theta * 3.7) * w;
    y += Math.cos(theta * 5.3) * w;
    z += Math.sin(theta * 2.1) * w;
  }

  return { x, y, z };
}

function project(x, y, z, cam) {
  const { cosY, sinY, cosX, sinX, cx, cy, yOffset, zoom, focal } = cam;
  let rx = x * cosY - z * sinY;
  let rz = x * sinY + z * cosY;
  let ry = y * cosX - rz * sinX;
  rz = y * sinX + rz * cosX;
  const p = focal / (focal + rz);
  return { sx: cx + rx * p * zoom, sy: cy + yOffset + ry * p * zoom, scale: p * zoom };
}


// ═══════════════════════════════════════════════════════
// GEOMETRY — derive all curve parameters from dimensions
// ═══════════════════════════════════════════════════════

function computeGeometry(dims) {
  const { certainty, warmth, tension, vulnerability, scope, rootedness, curveType } = dims;
  const R = CONFIG.outerRadius;

  // Vulnerability → petals
  const petalTarget = CONFIG.petals.min + vulnerability * (CONFIG.petals.max - CONFIG.petals.min);
  const petals = tension < 0.3 ? Math.round(petalTarget) : petalTarget;
  const r = R / (petals + 1);
  const d = r * (0.5 + 0.5 * (1 - scope * 0.3));
  const totalRevolutions = Math.ceil(petals);
  const totalTheta = totalRevolutions * 2 * Math.PI * (petals + 1);

  // Scope → 3D tilt
  const maxTilt = scope * CONFIG.maxTiltFactor;

  // Warmth → speed (inverted)
  const angularSpeed = CONFIG.speed.atWarm + (1 - warmth) * (CONFIG.speed.atCold - CONFIG.speed.atWarm);

  // Rootedness → firefly count (inverted)
  const fireflyCount = Math.max(CONFIG.fireflies.min,
    Math.round((1 - rootedness) * (CONFIG.fireflies.max - CONFIG.fireflies.min) + CONFIG.fireflies.min));

  // Certainty → tail
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

function renderFrame(ctx, logW, logH, geo, baseRGB, time) {
  const cx = logW / 2;
  const cy = logH / 2;
  const c = CONFIG.camera;

  const camAngleY = time * c.rotateSpeed;
  const cosY = Math.cos(camAngleY), sinY = Math.sin(camAngleY);
  const cosX = Math.cos(c.angleX), sinX = Math.sin(c.angleX);
  const cam = { cosY, sinY, cosX, sinX, cx, cy, yOffset: c.yOffset, zoom: c.zoom, focal: c.focal };

  const ev = (theta) => evalPoint(theta, geo);
  const pj = (pt) => project(pt.x, pt.y, pt.z, cam);

  ctx.clearRect(0, 0, logW, logH);

  // Ghost trace
  if (geo.certainty > CONFIG.ghostThreshold) {
    const ghostAlpha = (geo.certainty - CONFIG.ghostThreshold) * CONFIG.ghostAlphaFactor;
    ctx.beginPath();
    ctx.strokeStyle = `rgba(${baseRGB[0]},${baseRGB[1]},${baseRGB[2]},${ghostAlpha})`;
    ctx.lineWidth = 0.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    let prevSx, prevSy, first = true;
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

    // Tail segments
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

      let prevSx, prevSy, isFirst = true;
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

/**
 * Pick a random curve type. Call this once per star at creation time.
 */
export function randomCurveType() {
  return CURVE_TYPES[Math.floor(Math.random() * CURVE_TYPES.length)];
}

/**
 * Create an animated spirograph on a canvas element.
 * 
 * @param {HTMLCanvasElement} canvas
 * @param {Object} dims — { certainty, warmth, tension, vulnerability, scope, rootedness, emotionIndex, curveType }
 * @param {Object} options — { size?: number, dpr?: number, autoRotate?: boolean }
 * @returns {{ start, stop, update, renderFrame }}
 */
export function createSpirograph(canvas, dims, options = {}) {
  const {
    size = 600,
    dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1,
    autoRotate = true,
  } = options;

  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';

  const ctx = canvas.getContext('2d');
  let currentDims = { ...dims };
  let geo = computeGeometry(currentDims);
  let baseRGB = EMOTIONS[currentDims.emotionIndex]?.rgb || [180, 120, 200];
  let animId = null;
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
      if (animId) {
        cancelAnimationFrame(animId);
        animId = null;
      }
    },
    update(newDims) {
      currentDims = { ...newDims };
      geo = computeGeometry(currentDims);
      baseRGB = EMOTIONS[currentDims.emotionIndex]?.rgb || [180, 120, 200];
    },
    /** Render a single frame at a given time (seconds). For OG image generation. */
    renderStatic(time = 2.5) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderFrame(ctx, size, size, geo, baseRGB, time);
    },
    getCanvas() { return canvas; },
  };
}
