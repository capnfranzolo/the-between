/**
 * EXPLORATORY star-form proposals — rendered only by /preview/stars via
 * `dims.experiment`. Nothing in the product (cosmos, panel, OG) sets that
 * field, so shipping code never reaches this module at runtime.
 *
 * Round 3 (owner review 2026-09-09): most forms redrawn as genuinely
 * three-dimensional objects. The recurring critique was "a 2D object rotating"
 * — the fix is `orient()`: every element (each pendulum trace, each shell,
 * each generator, each shard) gets its own seeded plane in space, so the
 * shared camera yaw separates them instead of turning one flat sheet.
 * The second critique was static light: paths are now shown as moving heads
 * with fading tails (`tracedPath` with a continuous, interpolated head — no
 * frame-chunking), and several forms lost their static under-drawing
 * entirely.
 */

import type { Projector, RGB } from './archetypes';

interface CurveAccess {
  ev: (theta: number) => { x: number; y: number; z: number };
  totalTheta: number;
  angularSpeed: number;
  /** Deterministic per-star seed (the archetype seed) for parameter draws. */
  seed?: number;
}

/** Overlays — dressings on the familiar spirograph form. */
export const PROPOSAL_KINDS = ['saturn', 'pulsar', 'eclipse'] as const;

/**
 * Standalone geometries: whole different curve families that REPLACE the
 * spirograph (renderer skips the base form for these). All draw through the
 * shared projector, so the one slow world-turn animates everything.
 */
export const STANDALONE_KINDS = [
  'geode', 'quartz', 'shard', 'facet',
  'shatter', 'constellation', 'vortex', 'corona',
  'harmonograph', 'maurer', 'superformula', 'mystery', 'phyllotaxis',
  'clothoid', 'attractor', 'stringart', 'spirolateral', 'knot',
] as const;

export type ProposalKind = (typeof PROPOSAL_KINDS)[number] | (typeof STANDALONE_KINDS)[number];

export function isStandaloneProposal(kind: string): boolean {
  return (STANDALONE_KINDS as readonly string[]).includes(kind);
}

// ═══════════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════════

type Pt3 = { x: number; y: number; z: number };

function rgba(c: RGB, a: number): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}

function glow(ctx: CanvasRenderingContext2D, sx: number, sy: number, r: number, c: RGB, a: number) {
  if (r <= 0.5) return;
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
  g.addColorStop(0, rgba(c, a));
  g.addColorStop(0.45, rgba(c, a * 0.42));
  g.addColorStop(1, rgba(c, 0));
  ctx.beginPath();
  ctx.fillStyle = g;
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fill();
}

function mulberry(seed: number) {
  let t = (seed || 1) >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** A plane orientation in space: rotate about X, then about Y. */
interface Orient { rx: number; ry: number }

function randOrient(rnd: () => number): Orient {
  return { rx: 0.25 + rnd() * 1.2, ry: rnd() * Math.PI * 2 };
}

/** Place a (possibly flat) point into an oriented plane. This is the whole
 *  round-3 fix: elements in *different* planes, so the camera yaw parts them. */
function orient(p: { x: number; y: number; z?: number }, o: Orient): Pt3 {
  const z0 = p.z ?? 0;
  const cx = Math.cos(o.rx), sx = Math.sin(o.rx);
  const y1 = p.y * cx - z0 * sx;
  const z1 = p.y * sx + z0 * cx;
  const cy = Math.cos(o.ry), sy = Math.sin(o.ry);
  return { x: p.x * cy + z1 * sy, y: y1, z: -p.x * sy + z1 * cy };
}

/** Normalize a 2D point cloud to fit radius `target`, centered on centroid. */
function fit(pts: { x: number; y: number }[], target: number) {
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p.x; cy += p.y; }
  cx /= pts.length; cy /= pts.length;
  let m = 0;
  for (const p of pts) m = Math.max(m, Math.hypot(p.x - cx, p.y - cy));
  const s = m > 1e-6 ? target / m : 1;
  return pts.map(p => ({ x: (p.x - cx) * s, y: (p.y - cy) * s }));
}

/** Smoothstep. */
const ss = (u: number) => { const t = Math.max(0, Math.min(1, u)); return t * t * (3 - 2 * t); };

/**
 * The house animation language: an optional faint full trace, plus bright
 * tracer heads sliding along the path with fading tails. The head position is
 * interpolated *continuously* between samples (float index), so motion never
 * chunks frame to frame no matter how coarse the polyline.
 */
function tracedPath(
  ctx: CanvasRenderingContext2D,
  pj: Projector,
  pts: Pt3[],
  c: RGB,
  time: number,
  opts: {
    pathAlpha?: number; width?: number; tracers?: number; speed?: number;
    closed?: boolean; tailFrac?: number; headGlow?: number;
  } = {},
) {
  const {
    pathAlpha = 0.22, width = 0.8, tracers = 3, speed = 0.02,
    closed = true, tailFrac = 0.07, headGlow = 13,
  } = opts;
  const n = pts.length;
  if (n < 2) return;
  const proj = pts.map(p => pj(p.x, p.y, p.z));

  if (pathAlpha > 0) {
    ctx.beginPath();
    ctx.strokeStyle = rgba(c, pathAlpha);
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    proj.forEach((s, i) => (i ? ctx.lineTo(s.sx, s.sy) : ctx.moveTo(s.sx, s.sy)));
    if (closed) ctx.closePath();
    ctx.stroke();
  }

  // Continuous point along the polyline at float index fi ∈ [0, n).
  const at = (fi: number) => {
    let i = closed ? ((fi % n) + n) % n : Math.max(0, Math.min(n - 1.0001, fi));
    const i0 = Math.floor(i), f = i - i0;
    const a = proj[i0], b = proj[(i0 + 1) % n];
    return { sx: a.sx + (b.sx - a.sx) * f, sy: a.sy + (b.sy - a.sy) * f, scale: a.scale + (b.scale - a.scale) * f };
  };

  const SEG = 16;
  const tailLen = tailFrac * n;
  for (let k = 0; k < tracers; k++) {
    const u = ((time * speed + k / tracers) % 1 + 1) % 1;
    const head = u * n;
    let prev = at(head);
    for (let j = 1; j <= SEG; j++) {
      const fi = head - (j / SEG) * tailLen;
      if (!closed && fi < 0) break;
      const s = at(fi);
      const a = 0.85 * (1 - j / SEG);
      ctx.beginPath();
      ctx.strokeStyle = rgba(c, a);
      ctx.lineWidth = 1.7 * (1 - (j / SEG) * 0.6);
      ctx.lineCap = 'round';
      ctx.moveTo(prev.sx, prev.sy);
      ctx.lineTo(s.sx, s.sy);
      ctx.stroke();
      prev = s;
    }
    const h = at(head);
    glow(ctx, h.sx, h.sy, headGlow * h.scale, c, 0.4);
  }
}

/** A point on an inclined, yawed circle — same spatial grammar as archetypes. */
function ring(radius: number, theta: number, tiltX: number, spin: number): Pt3 {
  return orient({ x: Math.cos(theta) * radius, y: Math.sin(theta) * radius }, { rx: tiltX, ry: spin });
}

/** Depth-lit line: brighter and thicker on the camera's near side. */
function litEdge(
  ctx: CanvasRenderingContext2D, pj: Projector, a: Pt3, b: Pt3, c: RGB, boost = 1, widthBase = 1.0,
) {
  const sa = pj(a.x, a.y, a.z), sb = pj(b.x, b.y, b.z);
  const depth = (sa.scale + sb.scale) / 2;
  const lit = Math.min(1, Math.max(0.15, (depth - 0.8) * 2.4));
  ctx.beginPath();
  ctx.strokeStyle = rgba(c, (0.18 + 0.55 * lit) * boost);
  ctx.lineWidth = widthBase * (1.0 + 1.3 * lit);
  ctx.lineCap = 'round';
  ctx.moveTo(sa.sx, sa.sy);
  ctx.lineTo(sb.sx, sb.sy);
  ctx.stroke();
  return lit;
}

function vertexSpark(ctx: CanvasRenderingContext2D, pj: Projector, v: Pt3, c: RGB, boost = 1) {
  const s = pj(v.x, v.y, v.z);
  const lit = Math.min(1, Math.max(0.2, (s.scale - 0.8) * 2.4));
  glow(ctx, s.sx, s.sy, 8 * s.scale * lit, c, 0.4 * lit * boost);
  ctx.beginPath();
  ctx.fillStyle = rgba(c, 0.9 * lit * boost);
  ctx.arc(s.sx, s.sy, Math.max(0.8, 1.6 * s.scale), 0, Math.PI * 2);
  ctx.fill();
}

// ═══════════════════════════════════════════════════════
// OVERLAYS (on the spirograph)
// ═══════════════════════════════════════════════════════

// ── saturn — broad bright bands with a Cassini gap, now alive: dust bodies
// sweep the rings with long tails, the way rings actually are. ───────────────
function saturn(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number, seed: number) {
  const rnd = mulberry(seed ^ 0x5a7);
  const tiltX = 0.42, spin = time * 0.04;
  const bands: [number, number, number][] = [
    [0.98, 0.65, 1.6], [1.03, 0.5, 3.2], [1.09, 0.38, 4.2], [1.15, 0.24, 4.6], [1.20, 0.12, 5.0],
  ];
  for (const [rad, a, w] of bands) {
    ctx.beginPath();
    ctx.strokeStyle = rgba(c, a);
    ctx.lineWidth = w;
    for (let i = 0; i <= 96; i++) {
      const p = ring(rad * R, (i / 96) * Math.PI * 2, tiltX, spin);
      const s = pj(p.x, p.y, p.z);
      if (i === 0) ctx.moveTo(s.sx, s.sy); else ctx.lineTo(s.sx, s.sy);
    }
    ctx.stroke();
  }
  // The Cassini gap.
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.lineWidth = 1.8;
  for (let i = 0; i <= 96; i++) {
    const p = ring(1.065 * R, (i / 96) * Math.PI * 2, tiltX, spin);
    const s = pj(p.x, p.y, p.z);
    if (i === 0) ctx.moveTo(s.sx, s.sy); else ctx.lineTo(s.sx, s.sy);
  }
  ctx.stroke();
  ctx.restore();
  // Ring dust: bright grains racing the bands, each with a long trailing arc.
  const DUST = 9;
  for (let d = 0; d < DUST; d++) {
    const rad = (0.99 + rnd() * 0.2) * R;
    const speed = 0.32 + rnd() * 0.22;
    const phase = rnd() * Math.PI * 2;
    const th = phase + time * speed;
    let prev = ring(rad, th, tiltX, spin);
    for (let j = 1; j <= 10; j++) {
      const p = ring(rad, th - (j / 10) * 0.7, tiltX, spin);
      const sa = pj(prev.x, prev.y, prev.z), sb = pj(p.x, p.y, p.z);
      ctx.beginPath();
      ctx.strokeStyle = rgba(c, 0.5 * (1 - j / 10));
      ctx.lineWidth = 1.5 * (1 - (j / 10) * 0.6);
      ctx.lineCap = 'round';
      ctx.moveTo(sa.sx, sa.sy);
      ctx.lineTo(sb.sx, sb.sy);
      ctx.stroke();
      prev = p;
    }
    const h = pj(ring(rad, th, tiltX, spin).x, ring(rad, th, tiltX, spin).y, ring(rad, th, tiltX, spin).z);
    glow(ctx, h.sx, h.sy, 6 * h.scale, c, 0.4);
  }
}

// ── pulsar — hot core, opposed beams, now with a real heartbeat. ─────────────
function pulsar(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number) {
  const pulse = 0.55 + 0.45 * Math.sin(time * 2.1);
  const core = pj(0, 0, 0);
  glow(ctx, core.sx, core.sy, (26 + 14 * pulse) * core.scale, c, 0.45 + 0.25 * pulse);
  ctx.beginPath();
  ctx.fillStyle = rgba(c, 1);
  ctx.arc(core.sx, core.sy, Math.max(1.6, (2.6 + 1.2 * pulse) * core.scale), 0, Math.PI * 2);
  ctx.fill();
  const axis = time * 0.55;
  for (const sign of [1, -1]) {
    for (const fan of [-0.05, 0, 0.05]) {
      const th = axis + fan;
      const tip = ring(1.3 * R * sign, th, 0.35, 0);
      const s = pj(tip.x, tip.y, tip.z);
      const grad = ctx.createLinearGradient(core.sx, core.sy, s.sx, s.sy);
      grad.addColorStop(0, rgba(c, (fan === 0 ? 0.55 : 0.22) * (0.55 + 0.45 * pulse)));
      grad.addColorStop(1, rgba(c, 0));
      ctx.beginPath();
      ctx.strokeStyle = grad;
      ctx.lineWidth = fan === 0 ? 3.2 : 5.5;
      ctx.lineCap = 'round';
      ctx.moveTo(core.sx, core.sy);
      ctx.lineTo(s.sx, s.sy);
      ctx.stroke();
    }
  }
}

// ── eclipse — a black hole: a fully dark disk swallowing the heart, a burning
// rim, and the diamond-ring flare of a true totality. ────────────────────────
function eclipse(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number) {
  const core = pj(0, 0, 0);
  const rim = 0.58 * R * core.scale;
  // The disk is genuinely black — an object, not a hole to the background.
  ctx.beginPath();
  ctx.fillStyle = 'rgba(7,5,16,0.97)';
  ctx.arc(core.sx, core.sy, rim, 0, Math.PI * 2);
  ctx.fill();
  // The burning rim, brightest toward the flare.
  const lead = time * 0.15;
  for (let i = 0; i < 72; i++) {
    const th = (i / 72) * Math.PI * 2;
    const bright = 0.3 + 0.7 * Math.max(0, Math.cos(th - lead)) ** 2;
    ctx.beginPath();
    ctx.strokeStyle = rgba(c, 0.8 * bright);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.arc(core.sx, core.sy, rim, th, th + (Math.PI * 2) / 72 + 0.01);
    ctx.stroke();
  }
  // The diamond ring: one compact, brilliant point on the rim.
  const fx = core.sx + Math.cos(lead) * rim;
  const fy = core.sy + Math.sin(lead) * rim;
  glow(ctx, fx, fy, 26 * core.scale, c, 0.65);
  ctx.beginPath();
  ctx.fillStyle = 'rgba(255,246,235,0.9)';
  ctx.arc(fx, fy, Math.max(1.4, 2.4 * core.scale), 0, Math.PI * 2);
  ctx.fill();
}

// ═══════════════════════════════════════════════════════
// STANDALONE — CRYSTAL FAMILY
// ═══════════════════════════════════════════════════════

// ── geode — the crystal rock (unchanged; owner-approved). ────────────────────
function geode(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number, seed: number) {
  const rnd = mulberry(seed ^ 0x9e0de);
  const NV = 5 + Math.floor(rnd() * 3);
  const wobble = 0.10 * Math.sin(time * 0.05);
  const mk = (yFrac: number, rFrac: number): Pt3[] => {
    const ringPts: Pt3[] = [];
    const base = rnd() * Math.PI * 2;
    for (let i = 0; i < NV; i++) {
      const th = base + (i / NV) * Math.PI * 2 + (rnd() - 0.5) * 0.35;
      const r = R * rFrac * (0.82 + rnd() * 0.36);
      ringPts.push({ x: Math.cos(th) * r, y: R * yFrac + (rnd() - 0.5) * R * 0.12, z: Math.sin(th) * r });
    }
    return ringPts;
  };
  const top = mk(0.34 + wobble * 0.3, 0.58);
  const bot = mk(-0.34, 0.62);
  const apexT: Pt3 = { x: (rnd() - 0.5) * R * 0.2, y: R * (0.85 + rnd() * 0.2), z: (rnd() - 0.5) * R * 0.2 };
  const apexB: Pt3 = { x: (rnd() - 0.5) * R * 0.2, y: -R * (0.8 + rnd() * 0.2), z: (rnd() - 0.5) * R * 0.2 };
  const face = (pts: Pt3[]) => {
    const sp = pts.map(p => pj(p.x, p.y, p.z));
    ctx.beginPath();
    ctx.fillStyle = rgba(c, 0.05);
    sp.forEach((s, i) => (i ? ctx.lineTo(s.sx, s.sy) : ctx.moveTo(s.sx, s.sy)));
    ctx.closePath();
    ctx.fill();
  };
  for (let i = 0; i < NV; i++) {
    const j = (i + 1) % NV;
    face([top[i], top[j], bot[j], bot[i]]);
    face([apexT, top[i], top[j]]);
    face([apexB, bot[j], bot[i]]);
  }
  for (let i = 0; i < 3; i++) litEdge(ctx, pj, top[Math.floor(rnd() * NV)], bot[Math.floor(rnd() * NV)], c, 0.35);
  for (let i = 0; i < NV; i++) {
    const j = (i + 1) % NV;
    litEdge(ctx, pj, top[i], top[j], c);
    litEdge(ctx, pj, bot[i], bot[j], c);
    litEdge(ctx, pj, top[i], bot[i], c);
    litEdge(ctx, pj, apexT, top[i], c);
    litEdge(ctx, pj, apexB, bot[i], c);
  }
  for (const v of [...top, ...bot, apexT, apexB]) vertexSpark(ctx, pj, v, c);
}

// ── quartz — a cluster of hexagonal prism points with pyramid tips, grown
// outward from a shared base the way real quartz grows. ──────────────────────
function quartz(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number, seed: number) {
  const rnd = mulberry(seed ^ 0x9142);
  const N = 4 + Math.floor(rnd() * 3); // 4-6 points in the cluster
  for (let q = 0; q < N; q++) {
    // Each crystal points outward-ish from the cluster heart.
    const o: Orient = { rx: 0.5 + rnd() * 1.6, ry: rnd() * Math.PI * 2 };
    const len = R * (0.5 + rnd() * 0.55);
    const rad = R * (0.09 + rnd() * 0.07);
    const base = R * (0.02 + rnd() * 0.12);
    const twist = rnd() * Math.PI;
    // Hexagonal cross-sections at base and shoulder, then the tip.
    const hex = (y: number, r: number): Pt3[] => {
      const pts: Pt3[] = [];
      for (let i = 0; i < 6; i++) {
        const th = twist + (i / 6) * Math.PI * 2;
        pts.push(orient({ x: Math.cos(th) * r, y, z: Math.sin(th) * r }, o));
      }
      return pts;
    };
    const b0 = hex(base, rad * 0.9);
    const b1 = hex(base + len * 0.72, rad);
    const tip = orient({ x: 0, y: base + len, z: 0 }, o);
    for (let i = 0; i < 6; i++) {
      const j = (i + 1) % 6;
      litEdge(ctx, pj, b0[i], b0[j], c, 0.7, 0.8);
      litEdge(ctx, pj, b1[i], b1[j], c, 0.9, 0.8);
      litEdge(ctx, pj, b0[i], b1[i], c, 0.9, 0.8);
      litEdge(ctx, pj, b1[i], tip, c, 1.0, 0.8);
    }
    // A faint internal gleam line and the hot tip.
    litEdge(ctx, pj, orient({ x: 0, y: base, z: 0 }, o), tip, c, 0.3, 0.8);
    vertexSpark(ctx, pj, tip, c, 1.1);
    // A glint slides up one prism edge and rings the tip on arrival.
    const gu = ((time * 0.18 + q / N) % 1 + 1) % 1;
    const gi = Math.floor(rnd() * 6);
    const gp: Pt3 = {
      x: b1[gi].x + (tip.x - b1[gi].x) * gu,
      y: b1[gi].y + (tip.y - b1[gi].y) * gu,
      z: b1[gi].z + (tip.z - b1[gi].z) * gu,
    };
    const gs = pj(gp.x, gp.y, gp.z);
    glow(ctx, gs.sx, gs.sy, 7 * gs.scale, c, 0.45 * (0.4 + 0.6 * gu));
  }
  const heart = pj(0, 0, 0);
  glow(ctx, heart.sx, heart.sy, 20 * heart.scale, c, 0.3);
}

// ── shard — long linear splinters radiating from a bright heart: the most
// linear of the crystal family. ──────────────────────────────────────────────
function shard(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number, seed: number) {
  const rnd = mulberry(seed ^ 0x54a4d);
  const N = 8 + Math.floor(rnd() * 5);
  for (let i = 0; i < N; i++) {
    const o: Orient = { rx: rnd() * Math.PI, ry: rnd() * Math.PI * 2 };
    const inner = R * (0.06 + rnd() * 0.1);
    const outer = R * (0.7 + rnd() * 0.55);
    const halfW = R * (0.015 + rnd() * 0.02);
    // A blade: two base corners near the heart, one far tip.
    const baseA = orient({ x: -halfW, y: inner }, o);
    const baseB = orient({ x: halfW, y: inner }, o);
    const tip = orient({ x: 0, y: outer }, o);
    litEdge(ctx, pj, baseA, tip, c, 0.9, 0.7);
    litEdge(ctx, pj, baseB, tip, c, 0.6, 0.7);
    litEdge(ctx, pj, baseA, baseB, c, 0.5, 0.7);
    // Glint racing up the blade, brightest as it leaves the tip.
    const gu = ((time * 0.22 + i / N) % 1 + 1) % 1;
    const gp: Pt3 = { x: baseA.x + (tip.x - baseA.x) * gu, y: baseA.y + (tip.y - baseA.y) * gu, z: baseA.z + (tip.z - baseA.z) * gu };
    const gs = pj(gp.x, gp.y, gp.z);
    glow(ctx, gs.sx, gs.sy, 6 * gs.scale, c, 0.5 * (0.3 + 0.7 * gu));
    if (gu > 0.92) vertexSpark(ctx, pj, tip, c, 1.2);
  }
  const heart = pj(0, 0, 0);
  glow(ctx, heart.sx, heart.sy, 24 * heart.scale, c, 0.5);
  ctx.beginPath();
  ctx.fillStyle = rgba(c, 0.95);
  ctx.arc(heart.sx, heart.sy, Math.max(1.4, 2.4 * heart.scale), 0, Math.PI * 2);
  ctx.fill();
}

// ── facet — a brilliant-cut gem: table, crown kites, girdle, pavilion — the
// most-faceted of the family, with a flash walking its crown. ────────────────
function facet(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number, seed: number) {
  const rnd = mulberry(seed ^ 0xface7);
  const N = 8 + Math.floor(rnd() * 3) * 2; // 8/10/12 girdle facets
  const girdleR = R * 0.72, tableR = R * 0.42;
  const girdleY = R * 0.08, tableY = R * 0.42;
  const culet: Pt3 = { x: 0, y: -R * 0.78, z: 0 };
  const phase = rnd() * Math.PI * 2;
  const girdle: Pt3[] = [], table: Pt3[] = [];
  for (let i = 0; i < N; i++) {
    const th = phase + (i / N) * Math.PI * 2;
    girdle.push({ x: Math.cos(th) * girdleR, y: girdleY + (rnd() - 0.5) * R * 0.03, z: Math.sin(th) * girdleR });
    const th2 = th + Math.PI / N; // crown kites offset half a step
    table.push({ x: Math.cos(th2) * tableR, y: tableY, z: Math.sin(th2) * tableR });
  }
  // A facet flash walks the crown — one kite at a time catches the light.
  const flashI = Math.floor(((time * 0.5) % N + N) % N);
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    if (i === flashI) {
      const sp = [girdle[i], table[i], girdle[j]].map(p => pj(p.x, p.y, p.z));
      ctx.beginPath();
      ctx.fillStyle = rgba(c, 0.16 + 0.1 * Math.sin(time * 3));
      sp.forEach((s, k) => (k ? ctx.lineTo(s.sx, s.sy) : ctx.moveTo(s.sx, s.sy)));
      ctx.closePath();
      ctx.fill();
    }
    litEdge(ctx, pj, girdle[i], girdle[j], c, 0.95, 0.8);   // girdle
    litEdge(ctx, pj, table[i], table[j], c, 0.8, 0.8);      // table rim
    litEdge(ctx, pj, girdle[i], table[i], c, 0.65, 0.7);    // crown kites
    litEdge(ctx, pj, girdle[j], table[i], c, 0.65, 0.7);
    litEdge(ctx, pj, girdle[i], culet, c, 0.5, 0.7);        // pavilion
  }
  for (const v of girdle) vertexSpark(ctx, pj, v, c, 0.7);
  vertexSpark(ctx, pj, culet, c, 1.1);
}

// ── shatter — a caged burst in true 3D; every vertex eases to a new resting
// place on a slow cycle (the drift the owner liked, now deliberate). ─────────
function shatter(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number, seed: number) {
  const rnd = mulberry(seed ^ 0x54a);
  const N = 10;
  const CYCLE = 9; // seconds per drift
  const verts: Pt3[] = [];
  for (let i = 0; i < N; i++) {
    // Two seeded resting positions per vertex, on a jittered sphere.
    const mkPos = () => {
      const th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1);
      const r = R * (0.72 + rnd() * 0.3);
      return { x: r * Math.sin(ph) * Math.cos(th), y: r * Math.cos(ph), z: r * Math.sin(ph) * Math.sin(th) };
    };
    const a = mkPos(), b2 = mkPos();
    const off = rnd();
    // Ping-pong with smoothstep easing between the two rests.
    const cyc = (time / CYCLE + off) % 2;
    const u = ss(cyc < 1 ? cyc : 2 - cyc);
    verts.push({ x: a.x + (b2.x - a.x) * u, y: a.y + (b2.y - a.y) * u, z: a.z + (b2.z - a.z) * u });
  }
  // Cage: ring order + a few cross-facets.
  for (let i = 0; i < N; i++) {
    litEdge(ctx, pj, verts[i], verts[(i + 1) % N], c, 0.95, 0.9);
    litEdge(ctx, pj, verts[i], verts[(i + 3) % N], c, 0.35, 0.7);
  }
  // Shard spikes + hot vertices.
  for (const v of verts) {
    litEdge(ctx, pj, v, { x: v.x * 1.2, y: v.y * 1.2, z: v.z * 1.2 }, c, 0.5, 0.7);
    vertexSpark(ctx, pj, v, c);
  }
  const heart = pj(0, 0, 0);
  glow(ctx, heart.sx, heart.sy, 18 * heart.scale, c, 0.35);
}

// ═══════════════════════════════════════════════════════
// STANDALONE — LIGHT FORMS
// ═══════════════════════════════════════════════════════

// ── constellation — bright nodes in true 3D, joined by survey lines, with a
// pulse of light walking the links. ──────────────────────────────────────────
function constellation(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number, seed: number) {
  const rnd = mulberry(seed ^ 0xc0135);
  const N = 7;
  const nodes: Pt3[] = [];
  for (let i = 0; i < N; i++) {
    const th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1);
    const r = R * (0.45 + rnd() * 0.55);
    nodes.push({ x: r * Math.sin(ph) * Math.cos(th), y: r * Math.cos(ph), z: r * Math.sin(ph) * Math.sin(th) });
  }
  const links: [number, number][] = [];
  for (let i = 0; i < N - 1; i++) links.push([i, i + 1]);
  links.push([0, 3], [2, 5]);
  for (const [a, b] of links) litEdge(ctx, pj, nodes[a], nodes[b], c, 0.55, 0.7);
  // A pulse walks the chain of links.
  const totalU = links.length;
  const pu = ((time * 0.14) % 1) * totalU;
  const li = Math.floor(pu), lf = pu - li;
  const [a, b] = links[li % totalU];
  const pp: Pt3 = {
    x: nodes[a].x + (nodes[b].x - nodes[a].x) * lf,
    y: nodes[a].y + (nodes[b].y - nodes[a].y) * lf,
    z: nodes[a].z + (nodes[b].z - nodes[a].z) * lf,
  };
  const ps = pj(pp.x, pp.y, pp.z);
  glow(ctx, ps.sx, ps.sy, 10 * ps.scale, c, 0.5);
  nodes.forEach((v, i) => {
    const s = pj(v.x, v.y, v.z);
    const big = i % 3 === 0;
    const tw = 0.75 + 0.25 * Math.sin(time * 1.3 + i * 2.4);
    glow(ctx, s.sx, s.sy, (big ? 14 : 8) * s.scale, c, 0.5 * tw);
    ctx.beginPath();
    ctx.fillStyle = rgba(c, 0.95 * tw);
    ctx.arc(s.sx, s.sy, Math.max(1, (big ? 2.6 : 1.6) * s.scale), 0, Math.PI * 2);
    ctx.fill();
  });
}

// ── vortex — spiral arms alone, quicker, with light flowing outward. ─────────
function vortex(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number) {
  const ARMS = 3, STEPS = 34;
  const spin = time * 0.22;
  for (let a = 0; a < ARMS; a++) {
    const phase = (a / ARMS) * Math.PI * 2 + spin;
    let prev: { sx: number; sy: number } | null = null;
    for (let i = 0; i <= STEPS; i++) {
      const k = i / STEPS;
      const p = ring((0.12 + k * 1.02) * R, phase + k * 3.6, 0.5, 0);
      const s = pj(p.x, p.y, p.z);
      if (prev) {
        ctx.beginPath();
        ctx.strokeStyle = rgba(c, 0.5 * (1 - k * 0.85));
        ctx.lineWidth = 2.4 * (1 - k * 0.6);
        ctx.lineCap = 'round';
        ctx.moveTo(prev.sx, prev.sy);
        ctx.lineTo(s.sx, s.sy);
        ctx.stroke();
      }
      prev = s;
    }
    // Light flows outward along the arm.
    for (let f = 0; f < 2; f++) {
      const k = ((time * 0.24 + f / 2 + a / ARMS) % 1 + 1) % 1;
      const p = ring((0.12 + k * 1.02) * R, phase + k * 3.6, 0.5, 0);
      const s = pj(p.x, p.y, p.z);
      glow(ctx, s.sx, s.sy, 9 * s.scale * (1 - k * 0.4), c, 0.5 * (1 - k * 0.5));
    }
  }
  const core = pj(0, 0, 0);
  glow(ctx, core.sx, core.sy, 22 * core.scale, c, 0.55);
}

// ── corona — three nested spike crowns, breathing and counter-rotating. ──────
function corona(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number) {
  const shells: { base: number; spin: number; rate: number; phase: number; spikes: number }[] = [
    { base: 0.5, spin: 0.14, rate: 0.9, phase: 0, spikes: 10 },
    { base: 0.74, spin: -0.1, rate: 0.9, phase: 2.1, spikes: 12 },
    { base: 0.98, spin: 0.07, rate: 0.9, phase: 4.2, spikes: 14 },
  ];
  for (const sh of shells) {
    const breathe = 1 + 0.16 * Math.sin(time * sh.rate + sh.phase);
    const rBase = sh.base * R * breathe;
    const spin = time * sh.spin;
    const pulse = 0.55 + 0.45 * Math.sin(time * sh.rate + sh.phase);
    // Base ring.
    ctx.beginPath();
    ctx.strokeStyle = rgba(c, 0.24 * pulse + 0.08);
    ctx.lineWidth = 1.2;
    for (let i = 0; i <= 60; i++) {
      const p = ring(rBase, (i / 60) * Math.PI * 2, 0.3, spin);
      const s = pj(p.x, p.y, p.z);
      if (i === 0) ctx.moveTo(s.sx, s.sy); else ctx.lineTo(s.sx, s.sy);
    }
    ctx.stroke();
    for (let i = 0; i < sh.spikes; i++) {
      const th = (i / sh.spikes) * Math.PI * 2;
      const len = (i % 2 === 0 ? 1.28 : 1.12) * breathe;
      const b = ring(rBase, th, 0.3, spin);
      const t = ring(rBase * len, th, 0.3, spin);
      const sb = pj(b.x, b.y, b.z), st = pj(t.x, t.y, t.z);
      const grad = ctx.createLinearGradient(sb.sx, sb.sy, st.sx, st.sy);
      grad.addColorStop(0, rgba(c, 0.55 * pulse + 0.1));
      grad.addColorStop(1, rgba(c, 0));
      ctx.beginPath();
      ctx.strokeStyle = grad;
      ctx.lineWidth = i % 2 === 0 ? 2.2 : 1.4;
      ctx.lineCap = 'round';
      ctx.moveTo(sb.sx, sb.sy);
      ctx.lineTo(st.sx, st.sy);
      ctx.stroke();
    }
  }
  const core = pj(0, 0, 0);
  glow(ctx, core.sx, core.sy, (20 + 8 * Math.sin(time * 0.9)) * core.scale, c, 0.5);
}

// ═══════════════════════════════════════════════════════
// STANDALONE — CURVE FAMILIES
// ═══════════════════════════════════════════════════════

// ── harmonograph — three damped traces, each pendulum in its own plane. ──────
function harmonograph(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number, seed: number) {
  const rnd = mulberry(seed ^ 0x4a2);
  for (let tr = 0; tr < 3; tr++) {
    const f1 = 2 + Math.floor(rnd() * 2), f2 = f1 + 1;
    const det = 0.004 + rnd() * 0.01;
    const p1 = rnd() * Math.PI * 2, p2 = rnd() * Math.PI * 2, p3 = rnd() * Math.PI * 2;
    const d1 = 0.015 + rnd() * 0.02, d2 = 0.02 + rnd() * 0.02;
    const o = randOrient(rnd);
    const amp = R * (0.95 - tr * 0.16);
    const N = 700, T = 55;
    const flat: { x: number; y: number }[] = [];
    for (let i = 0; i < N; i++) {
      const t = (i / N) * T;
      flat.push({
        x: Math.sin(f1 * t + p1) * Math.exp(-d1 * t) + 0.6 * Math.sin((f2 + det) * t + p2) * Math.exp(-d2 * t),
        y: Math.sin((f1 + det) * t + p3) * Math.exp(-d2 * t) + 0.6 * Math.sin(f2 * t + p1) * Math.exp(-d1 * t),
      });
    }
    const pts = fit(flat, amp).map(p => orient(p, o));
    tracedPath(ctx, pj, pts, c, time, { pathAlpha: 0.24, width: 0.7, tracers: 2, speed: 0.018, closed: false });
  }
}

// ── maurer — the angular web, now with depth: each sample lifted by a third
// harmonic so the web is a 3D star, and smooth continuous tracers. ───────────
function maurer(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number, seed: number) {
  const rnd = mulberry(seed ^ 0x3a0e);
  const n = [3, 4, 5, 6, 7][Math.floor(rnd() * 5)];
  const step = [71, 97, 29, 47, 111][Math.floor(rnd() * 5)];
  const zAmp = R * 0.4;
  const o = randOrient(rnd);
  const flat: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i <= 300; i++) {
    const th = (i * step * Math.PI) / 180;
    const r = Math.sin(n * th);
    flat.push({ x: r * Math.cos(th), y: r * Math.sin(th), z: Math.sin((n + 2) * th) * 0.5 });
  }
  const fitted = fit(flat, R * 0.95);
  const pts = fitted.map((p, i) => orient({ x: p.x, y: p.y, z: flat[i].z * zAmp / (R * 0.95) * R }, o));
  tracedPath(ctx, pj, pts, c, time, { pathAlpha: 0.15, width: 0.6, tracers: 3, speed: 0.01 });
  for (let i = 0; i < 300; i += 42) {
    const s = pj(pts[i].x, pts[i].y, pts[i].z);
    glow(ctx, s.sx, s.sy, 7 * s.scale, c, 0.35);
  }
}

// ── superformula — four shells, each generator in its own plane. ─────────────
function superformula(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number, seed: number) {
  const rnd = mulberry(seed ^ 0x5f0);
  const m = 5 + Math.floor(rnd() * 5);
  const n1 = 0.22 + rnd() * 0.5, n2 = 0.3 + rnd() * 1.4, n3 = n2;
  const scales = [1.0, 0.76, 0.55, 0.38];
  scales.forEach((scale, si) => {
    const o = randOrient(rnd);
    const dir = si % 2 === 0 ? 1 : -1;
    const phase = dir * time * 0.03 + si;
    const flat: { x: number; y: number }[] = [];
    for (let i = 0; i <= 200; i++) {
      const phi = (i / 200) * Math.PI * 2;
      const t1 = Math.pow(Math.abs(Math.cos((m * phi) / 4)), n2);
      const t2 = Math.pow(Math.abs(Math.sin((m * phi) / 4)), n3);
      const r = Math.pow(t1 + t2, -1 / n1);
      flat.push({ x: r * Math.cos(phi + phase), y: r * Math.sin(phi + phase) });
    }
    const pts = fit(flat, R * scale).map(p => orient(p, o));
    tracedPath(ctx, pj, pts, c, time, {
      pathAlpha: 0.38 - si * 0.07, width: 1.2 - si * 0.2, tracers: si < 2 ? 3 : 2, speed: 0.014 + si * 0.004,
    });
  });
}

// ── mystery — Farris curves given real depth: a fourth exponential lifts the
// curve out of the plane while keeping its n-fold symmetry. ──────────────────
function mystery(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number, seed: number) {
  const rnd = mulberry(seed ^ 0x7f3);
  const sets = [
    { k: [1, 6, -14], a: [1, 0.5, 0.33], n: 5 },
    { k: [1, 7, -11], a: [1, 0.45, 0.4], n: 6 },
    { k: [1, 5, -7],  a: [1, 0.55, 0.3], n: 4 },
  ];
  const s = sets[Math.floor(rnd() * sets.length)];
  const zPhase = rnd() * Math.PI * 2;
  const o = randOrient(rnd);
  const raw: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i <= 640; i++) {
    const t = (i / 640) * Math.PI * 2;
    let x = 0, y = 0;
    for (let j = 0; j < 3; j++) {
      x += s.a[j] * Math.cos(s.k[j] * t);
      y += s.a[j] * Math.sin(s.k[j] * t);
    }
    // The lift: same period, n-fold — a ribbon, not a sheet.
    raw.push({ x, y, z: 0.55 * Math.sin(s.n * t + zPhase) });
  }
  const fitted = fit(raw, R * 0.95);
  const pts = fitted.map((p, i) => orient({ x: p.x, y: p.y, z: raw[i].z * R * 0.5 }, o));
  tracedPath(ctx, pj, pts, c, time, { pathAlpha: 0.26, width: 0.9, tracers: 4, speed: 0.01 });
}

// ── phyllotaxis — the seed head now emanates: every seed is born at the
// heart, rides the golden spiral out, and dissolves at the rim. ──────────────
function phyllotaxis(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number, seed: number) {
  const rnd = mulberry(seed ^ 0xf10);
  const N = 240 + Math.floor(rnd() * 60);
  const GA = Math.PI * (3 - Math.sqrt(5));
  const spin = time * 0.05;
  for (let i = 0; i < N; i++) {
    // Outward flow: each slot's age advances with time, wrapping at the rim.
    const age = (((i / N) + time * 0.045) % 1 + 1) % 1;
    const rf = Math.sqrt(age);
    const th = i * GA + spin;
    const r = rf * R * 0.95;
    const dome = R * 0.28 * (1 - rf * rf);
    const p = orient({ x: Math.cos(th) * r, y: Math.sin(th) * r, z: dome }, { rx: 0.5, ry: 0 });
    const sp = pj(p.x, p.y, p.z);
    // Born dim, brighten mid-journey, dissolve at the rim.
    const life = Math.pow(Math.sin(Math.PI * age), 0.7);
    ctx.beginPath();
    ctx.fillStyle = rgba(c, 0.75 * life);
    ctx.arc(sp.sx, sp.sy, Math.max(0.7, (0.9 + 1.6 * (1 - rf)) * sp.scale), 0, Math.PI * 2);
    ctx.fill();
    if (i % 24 === 0) glow(ctx, sp.sx, sp.sy, 6 * sp.scale, c, 0.25 * life);
  }
  const hp = orient({ x: 0, y: 0, z: R * 0.28 }, { rx: 0.5, ry: 0 });
  const heart = pj(hp.x, hp.y, hp.z);
  glow(ctx, heart.sx, heart.sy, 16 * heart.scale, c, 0.4);
}

// ── clothoid — no track left behind: arms are FIRED, one after another, each
// in a fresh plane, existing only as a moving head and its dissolving tail. ──
function clothoid(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number, seed: number) {
  // The arm's shape, computed once per call (deterministic).
  const STEPS = 200;
  const armShape: { x: number; y: number }[] = [];
  {
    let x = 0, y = 0;
    const ds = 1 / STEPS;
    for (let i = 0; i < STEPS; i++) {
      const sf = i / STEPS;
      const phi = 18 * sf * sf;
      x += Math.cos(phi) * ds;
      y += Math.sin(phi) * ds;
      armShape.push({ x, y });
    }
  }
  const fitted = fit(armShape, R * 0.85);
  const dx = fitted[0].x, dy = fitted[0].y;
  const K = 4;           // arms in flight at once
  const RATE = 0.18;     // arms per second, per slot — quick, not frantic
  for (let k = 0; k < K; k++) {
    const slot = time * RATE + k / K;
    const cyc = Math.floor(slot);
    const u = slot - cyc;
    // Fresh orientation each firing, seeded so replays are stable.
    const rnd = mulberry((seed ^ 0xc10) + cyc * 7919 + k * 104729);
    const o: Orient = { rx: rnd() * Math.PI, ry: rnd() * Math.PI * 2 };
    const headF = u * STEPS;
    const TAIL = 60;
    const fade = 1 - ss((u - 0.8) / 0.2); // the whole arm dissolves at the end
    let prev: { sx: number; sy: number } | null = null;
    for (let j = 0; j <= 14; j++) {
      const fi = headF - (j / 14) * TAIL;
      if (fi < 0) break;
      const i0 = Math.min(STEPS - 1, Math.floor(fi));
      const p2 = fitted[i0];
      const p = orient({ x: p2.x - dx, y: p2.y - dy }, o);
      const sp = pj(p.x, p.y, p.z);
      if (prev) {
        ctx.beginPath();
        ctx.strokeStyle = rgba(c, 0.85 * (1 - j / 14) * fade);
        ctx.lineWidth = 2.8 * (1 - (j / 14) * 0.6);
        ctx.lineCap = 'round';
        ctx.moveTo(prev.sx, prev.sy);
        ctx.lineTo(sp.sx, sp.sy);
        ctx.stroke();
      }
      prev = sp;
      if (j === 0) glow(ctx, sp.sx, sp.sy, 10 * sp.scale, c, 0.5 * fade);
    }
  }
  const core = pj(0, 0, 0);
  glow(ctx, core.sx, core.sy, 24 * core.scale, c, 0.55);
  ctx.beginPath();
  ctx.fillStyle = rgba(c, 0.95);
  ctx.arc(core.sx, core.sy, Math.max(1.4, 2.6 * core.scale), 0, Math.PI * 2);
  ctx.fill();
}

// ── attractor — the feathered wing, now with wind: light rushes through the
// dust along the map's own iteration order. ──────────────────────────────────
function attractor(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number, seed: number) {
  const rnd = mulberry(seed ^ 0xa77);
  const mu = [-0.75, -0.55, -0.48, -0.31, -0.23][Math.floor(rnd() * 5)] + (rnd() - 0.5) * 0.04;
  const a = 0.008, b = 0.05;
  const G = (x: number) => mu * x + (2 * (1 - mu) * x * x) / (1 + x * x);
  let x = 2 + rnd() * 4, y = 0;
  const flat: { x: number; y: number }[] = [];
  for (let i = 0; i < 6000; i++) {
    const xn = y + a * (1 - b * y * y) * y + G(x);
    const yn = -x + G(xn);
    x = xn; y = yn;
    if (i > 80) flat.push({ x, y });
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 80 || Math.abs(y) > 80) break;
  }
  if (flat.length < 400) return attractor(ctx, pj, R, c, time, seed + 7);
  const mirrored = flat.concat(flat.map(p => ({ x: -p.x, y: -p.y })));
  const pts = fit(mirrored, R * 0.95).map(p => orient(p, { rx: 0.38, ry: 0 }));
  for (let i = 0; i < pts.length; i++) {
    const s = pj(pts[i].x, pts[i].y, pts[i].z);
    // The wind: a wave of light travelling the iteration order.
    const wind = Math.pow(0.5 + 0.5 * Math.sin(i * 0.004 - time * 1.6), 3);
    ctx.fillStyle = rgba(c, 0.1 + 0.55 * wind);
    ctx.fillRect(s.sx - 0.75, s.sy - 0.75, 1.5, 1.5);
  }
  const core = pj(0, 0, 0);
  glow(ctx, core.sx, core.sy, 18 * core.scale, c, 0.3);
}

// ── stringart — the chords are never drawn: beads shuttle along them with
// fading trails, and the cardioid envelope emerges from pure motion. ─────────
function stringart(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number, seed: number) {
  const rnd = mulberry(seed ^ 0x57a);
  const N = 72;
  const k = 2 + Math.floor(rnd() * 3);
  const tiltX = 0.4;
  const pt = (i: number): Pt3 => ring(R * 0.96, (i / N) * Math.PI * 2, tiltX, 0);
  // Faint rim so the beads have a shore.
  ctx.beginPath();
  ctx.strokeStyle = rgba(c, 0.2);
  ctx.lineWidth = 0.9;
  for (let i = 0; i <= N; i++) {
    const s = pj(pt(i).x, pt(i).y, pt(i).z);
    if (i === 0) ctx.moveTo(s.sx, s.sy); else ctx.lineTo(s.sx, s.sy);
  }
  ctx.stroke();
  // A whisper of the chord structure, so the beads sketch over something.
  for (let i = 0; i < N; i += 2) {
    const A = pt(i), B = pt((i * k) % N);
    const sa = pj(A.x, A.y, A.z), sb = pj(B.x, B.y, B.z);
    ctx.beginPath();
    ctx.strokeStyle = rgba(c, 0.05);
    ctx.lineWidth = 0.5;
    ctx.moveTo(sa.sx, sa.sy);
    ctx.lineTo(sb.sx, sb.sy);
    ctx.stroke();
  }
  // Beads: each owns a chord (i → k·i), shuttles along it, then advances to
  // the next chord — over time the whole envelope gets swept.
  const BEADS = 14;
  for (let bd = 0; bd < BEADS; bd++) {
    const chordF = ((time * 0.05 + bd / BEADS) % 1 + 1) % 1;
    const i = chordF * N;
    const A = pt(i), B = pt((i * k) % N);
    // Ping-pong along the chord, each bead at its own phase.
    const cyc = (((time * 0.5 + bd * 0.37) % 2) + 2) % 2;
    const rising = cyc < 1;
    const u = ss(rising ? cyc : 2 - cyc);
    const dir = rising ? 1 : -1;
    const TR = 8;
    let prev: { sx: number; sy: number } | null = null;
    for (let j = 0; j <= TR; j++) {
      // Trail behind the direction of travel.
      const uu = Math.max(0, Math.min(1, u - (j / TR) * 0.35 * dir));
      const p: Pt3 = { x: A.x + (B.x - A.x) * uu, y: A.y + (B.y - A.y) * uu, z: A.z + (B.z - A.z) * uu };
      const s = pj(p.x, p.y, p.z);
      if (prev) {
        ctx.beginPath();
        ctx.strokeStyle = rgba(c, 0.6 * (1 - j / TR));
        ctx.lineWidth = 1.6 * (1 - (j / TR) * 0.5);
        ctx.lineCap = 'round';
        ctx.moveTo(prev.sx, prev.sy);
        ctx.lineTo(s.sx, s.sy);
        ctx.stroke();
      }
      prev = s;
      if (j === 0) glow(ctx, s.sx, s.sy, 7 * s.scale, c, 0.45);
    }
  }
}

// ── spirolateral — the turtle walk as a 3D object: three generators sharing
// one center, each walking its own plane. ────────────────────────────────────
function spirolateral(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number, seed: number) {
  const rnd = mulberry(seed ^ 0x59a1);
  const G = 3;
  for (let g = 0; g < G; g++) {
    const alpha = ([144, 100, 108, 72, 135][Math.floor(rnd() * 5)] * Math.PI) / 180;
    const m = 3 + Math.floor(rnd() * 4);
    const drift = (0.15 + rnd() * 0.5) * (Math.PI / 180);
    const o = randOrient(rnd);
    const flat: { x: number; y: number }[] = [{ x: 0, y: 0 }];
    let x = 0, y = 0, phi = rnd() * Math.PI * 2;
    for (let i = 0; i < 300; i++) {
      const len = ((i % m) + 1);
      x += Math.cos(phi) * len;
      y += Math.sin(phi) * len;
      flat.push({ x, y });
      phi += alpha + drift * i;
    }
    // Center the walk on its own start so all generators share the heart.
    const fitted = fit(flat, R * (0.9 - g * 0.12));
    const dx = fitted[0].x, dy = fitted[0].y;
    const pts = fitted.map(p => orient({ x: p.x - dx, y: p.y - dy }, o));
    tracedPath(ctx, pj, pts, c, time, {
      pathAlpha: 0.14, width: 0.7, tracers: 2, speed: 0.014 + g * 0.004, closed: false,
    });
  }
  const heart = pj(0, 0, 0);
  glow(ctx, heart.sx, heart.sy, 12 * heart.scale, c, 0.35);
}

// ── knot — owner-approved as is. ─────────────────────────────────────────────
function knot(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number, seed: number) {
  const rnd = mulberry(seed ^ 0x40b);
  const trips: [number, number, number][] = [[3, 4, 5], [2, 3, 5], [3, 5, 7]];
  const [fx, fy, fz] = trips[Math.floor(rnd() * trips.length)];
  const px = rnd() * Math.PI, pz = rnd() * Math.PI;
  const pts: Pt3[] = [];
  for (let i = 0; i <= 900; i++) {
    const t = (i / 900) * Math.PI * 2;
    pts.push({
      x: Math.sin(fx * t + px) * R * 0.9,
      y: Math.sin(fy * t) * R * 0.72,
      z: Math.sin(fz * t + pz) * R * 0.72,
    });
  }
  tracedPath(ctx, pj, pts, c, time, { pathAlpha: 0.2, width: 0.8, tracers: 5, speed: 0.012 });
}

// ═══════════════════════════════════════════════════════
// DISPATCH
// ═══════════════════════════════════════════════════════

export function drawProposal(
  kind: string,
  ctx: CanvasRenderingContext2D,
  pj: Projector,
  R: number,
  color: RGB,
  time: number,
  curve: CurveAccess,
): void {
  const seed = curve.seed ?? 1;
  switch (kind as ProposalKind) {
    case 'saturn':        return saturn(ctx, pj, R, color, time, seed);
    case 'pulsar':        return pulsar(ctx, pj, R, color, time);
    case 'eclipse':       return eclipse(ctx, pj, R, color, time);
    case 'geode':         return geode(ctx, pj, R, color, time, seed);
    case 'quartz':        return quartz(ctx, pj, R, color, time, seed);
    case 'shard':         return shard(ctx, pj, R, color, time, seed);
    case 'facet':         return facet(ctx, pj, R, color, time, seed);
    case 'shatter':       return shatter(ctx, pj, R, color, time, seed);
    case 'constellation': return constellation(ctx, pj, R, color, time, seed);
    case 'vortex':        return vortex(ctx, pj, R, color, time);
    case 'corona':        return corona(ctx, pj, R, color, time);
    case 'harmonograph':  return harmonograph(ctx, pj, R, color, time, seed);
    case 'maurer':        return maurer(ctx, pj, R, color, time, seed);
    case 'superformula':  return superformula(ctx, pj, R, color, time, seed);
    case 'mystery':       return mystery(ctx, pj, R, color, time, seed);
    case 'phyllotaxis':   return phyllotaxis(ctx, pj, R, color, time, seed);
    case 'clothoid':      return clothoid(ctx, pj, R, color, time, seed);
    case 'attractor':     return attractor(ctx, pj, R, color, time, seed);
    case 'stringart':     return stringart(ctx, pj, R, color, time, seed);
    case 'spirolateral':  return spirolateral(ctx, pj, R, color, time, seed);
    case 'knot':          return knot(ctx, pj, R, color, time, seed);
  }
}
