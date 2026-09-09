/**
 * EXPLORATORY star-form proposals — rendered only by /preview/stars via
 * `dims.experiment`. Nothing in the product (cosmos, panel, OG) sets that
 * field, so shipping code never reaches this module at runtime.
 *
 * Each proposal is a candidate "dramatic archetype": a structure loud enough
 * to be told apart across the sky at a glance, still drawn in the line-drawn
 * luminous language. The ones the owner picks graduate into archetypes.ts
 * with real dimension triggers; the rest get deleted.
 */

import type { Projector, RGB } from './archetypes';

interface CurveAccess {
  ev: (theta: number) => { x: number; y: number; z: number };
  totalTheta: number;
  angularSpeed: number;
  /** Deterministic per-star seed (the archetype seed) for parameter draws. */
  seed?: number;
}

/** Round 1 — overlays on the familiar spirograph form. */
export const PROPOSAL_KINDS = [
  'shatter', 'saturn', 'constellation', 'pulsar', 'eclipse', 'vortex', 'corona',
] as const;

/**
 * Round 2 — standalone geometries: whole different curve families that REPLACE
 * the spirograph (renderer skips the base form for these). All are drawn
 * through the shared projector, so the same slow world-turn that animates the
 * spirographs animates them — no bolted-on secondary motion.
 */
export const STANDALONE_KINDS = [
  'geode', 'harmonograph', 'maurer', 'superformula', 'mystery', 'phyllotaxis',
  'clothoid', 'attractor', 'stringart', 'spirolateral', 'knot',
] as const;

export type ProposalKind = (typeof PROPOSAL_KINDS)[number] | (typeof STANDALONE_KINDS)[number];

export function isStandaloneProposal(kind: string): boolean {
  return (STANDALONE_KINDS as readonly string[]).includes(kind);
}

function rgba(c: RGB, a: number): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, a).toFixed(3)})`;
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

/** A point on an inclined, yawed circle — same spatial grammar as archetypes. */
function ring(radius: number, theta: number, tiltX: number, spin: number) {
  const x0 = Math.cos(theta) * radius;
  const y0 = Math.sin(theta) * radius;
  const y1 = y0 * Math.cos(tiltX);
  const z1 = y0 * Math.sin(tiltX);
  const cs = Math.cos(spin), ss = Math.sin(spin);
  return { x: x0 * cs + z1 * ss, y: y1, z: -x0 * ss + z1 * cs };
}

// ── shatter — the crystal taken all the way: the tangle caged in hard facets,
// bright vertices, shard spikes. Organic curve inside geometric armor. ───────
function shatter(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number, curve: CurveAccess) {
  const N = 9;
  const pts: { sx: number; sy: number; scale: number; x: number; y: number; z: number }[] = [];
  for (let i = 0; i < N; i++) {
    const p = curve.ev((i / N) * curve.totalTheta + time * curve.angularSpeed * 0.08);
    // Push each sample outward to ~1.02R so the cage sits just outside the curve.
    const m = Math.hypot(p.x, p.y, p.z) || 1;
    const f = (R * 1.02) / m;
    const q = { x: p.x * f, y: p.y * f, z: p.z * f };
    pts.push({ ...pj(q.x, q.y, q.z), ...q });
  }
  // Facet polygon.
  ctx.beginPath();
  ctx.strokeStyle = rgba(c, 0.62);
  ctx.lineWidth = 1.9;
  ctx.lineJoin = 'round';
  pts.forEach((s, i) => (i ? ctx.lineTo(s.sx, s.sy) : ctx.moveTo(s.sx, s.sy)));
  ctx.closePath();
  ctx.stroke();
  // Interior facets.
  ctx.beginPath();
  ctx.strokeStyle = rgba(c, 0.20);
  ctx.lineWidth = 0.9;
  for (let i = 0; i < N; i++) {
    const a = pts[i], b = pts[(i + 3) % N];
    ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy);
  }
  ctx.stroke();
  // Shard spikes + hot vertices.
  for (const p of pts) {
    const tip = pj(p.x * 1.22, p.y * 1.22, p.z * 1.22);
    ctx.beginPath();
    ctx.strokeStyle = rgba(c, 0.4);
    ctx.lineWidth = 1.3;
    ctx.moveTo(p.sx, p.sy); ctx.lineTo(tip.sx, tip.sy);
    ctx.stroke();
    ctx.beginPath();
    ctx.fillStyle = rgba(c, 0.9);
    ctx.arc(p.sx, p.sy, Math.max(1, 2.2 * p.scale), 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── saturn — the halo idea taken to a planet's band: a broad, bright,
// unmistakable ring system. ─────────────────────────────────────────────────
function saturn(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number) {
  const tilt = 0.42, spin = time * 0.04;
  const bands: [number, number, number][] = [
    [0.98, 0.65, 1.6], [1.03, 0.5, 3.2], [1.09, 0.38, 4.2], [1.15, 0.24, 4.6], [1.20, 0.12, 5.0],
  ];
  for (const [rad, a, w] of bands) {
    ctx.beginPath();
    ctx.strokeStyle = rgba(c, a);
    ctx.lineWidth = w;
    for (let i = 0; i <= 96; i++) {
      const p = ring(rad * R, (i / 96) * Math.PI * 2, tilt, spin);
      const s = pj(p.x, p.y, p.z);
      if (i === 0) ctx.moveTo(s.sx, s.sy); else ctx.lineTo(s.sx, s.sy);
    }
    ctx.stroke();
  }
  // The Cassini gap — a dark lane that makes it read as a ring system.
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.lineWidth = 1.8;
  for (let i = 0; i <= 96; i++) {
    const p = ring(1.065 * R, (i / 96) * Math.PI * 2, tilt, spin);
    const s = pj(p.x, p.y, p.z);
    if (i === 0) ctx.moveTo(s.sx, s.sy); else ctx.lineTo(s.sx, s.sy);
  }
  ctx.stroke();
  ctx.restore();
}

// ── constellation — the thought as a chart: the tangle dims behind bright
// named-star nodes joined by survey lines. A silhouette of points, not fuzz. ─
function constellation(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number, curve: CurveAccess) {
  const N = 7;
  const pts: { sx: number; sy: number; scale: number }[] = [];
  for (let i = 0; i < N; i++) {
    // Uneven spacing so it reads as a constellation, not a polygon.
    const jitter = Math.sin(i * 12.9898) * 0.5 + 0.5;
    const p = curve.ev(((i + jitter * 0.6) / N) * curve.totalTheta + time * curve.angularSpeed * 0.05);
    const m = Math.hypot(p.x, p.y, p.z) || 1;
    const f = (R * (0.72 + 0.3 * jitter)) / m;
    pts.push(pj(p.x * f, p.y * f, p.z * f));
  }
  ctx.beginPath();
  ctx.strokeStyle = rgba(c, 0.42);
  ctx.lineWidth = 1.1;
  pts.forEach((s, i) => (i ? ctx.lineTo(s.sx, s.sy) : ctx.moveTo(s.sx, s.sy)));
  // Two cross-links so it has structure beyond a path.
  ctx.moveTo(pts[0].sx, pts[0].sy); ctx.lineTo(pts[3].sx, pts[3].sy);
  ctx.moveTo(pts[2].sx, pts[2].sy); ctx.lineTo(pts[5].sx, pts[5].sy);
  ctx.stroke();
  pts.forEach((s, i) => {
    const big = i % 3 === 0;
    glow(ctx, s.sx, s.sy, (big ? 14 : 8) * s.scale, c, 0.5);
    ctx.beginPath();
    ctx.fillStyle = rgba(c, 0.95);
    ctx.arc(s.sx, s.sy, Math.max(1, (big ? 2.6 : 1.6) * s.scale), 0, Math.PI * 2);
    ctx.fill();
  });
}

// ── pulsar — a lighthouse: hot core, two opposed beams sweeping slowly. ─────
function pulsar(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number) {
  const core = pj(0, 0, 0);
  glow(ctx, core.sx, core.sy, 34 * core.scale, c, 0.6);
  ctx.beginPath();
  ctx.fillStyle = rgba(c, 1);
  ctx.arc(core.sx, core.sy, Math.max(1.6, 3.2 * core.scale), 0, Math.PI * 2);
  ctx.fill();
  const axis = time * 0.22;
  for (const sign of [1, -1]) {
    for (const fan of [-0.05, 0, 0.05]) {
      const th = axis + fan;
      const tip = ring(1.3 * R * sign, th, 0.35, 0);
      const s = pj(tip.x, tip.y, tip.z);
      const grad = ctx.createLinearGradient(core.sx, core.sy, s.sx, s.sy);
      grad.addColorStop(0, rgba(c, fan === 0 ? 0.55 : 0.22));
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

// ── eclipse — negative space: a dark disk swallows the form's heart and only
// a burning rim survives. The one star that is mostly absence. ──────────────
function eclipse(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number) {
  const core = pj(0, 0, 0);
  const rim = 0.52 * R * core.scale;
  // Swallow the center.
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.fillStyle = 'rgba(0,0,0,0.96)';
  ctx.arc(core.sx, core.sy, rim, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // The burning rim — brightest along a slowly-moving crescent.
  const lead = time * 0.15;
  for (let i = 0; i < 72; i++) {
    const th = (i / 72) * Math.PI * 2;
    const bright = 0.35 + 0.65 * Math.max(0, Math.cos(th - lead));
    ctx.beginPath();
    ctx.strokeStyle = rgba(c, 0.75 * bright);
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.arc(core.sx, core.sy, rim, th, th + (Math.PI * 2) / 72 + 0.01);
    ctx.stroke();
  }
  glow(ctx, core.sx + Math.cos(lead) * rim, core.sy + Math.sin(lead) * rim, 16 * core.scale, c, 0.5);
}

// ── vortex — the tangle unwound into a slow spiral galaxy: three arms
// trailing light out to the edge. ───────────────────────────────────────────
function vortex(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number) {
  const ARMS = 3, STEPS = 34;
  const spin = time * 0.06;
  for (let a = 0; a < ARMS; a++) {
    const phase = (a / ARMS) * Math.PI * 2 + spin;
    let prev: { sx: number; sy: number } | null = null;
    for (let i = 0; i <= STEPS; i++) {
      const k = i / STEPS;
      const rad = (0.12 + k * 1.02) * R;
      const th = phase + k * 3.6;
      const p = ring(rad, th, 0.5, 0);
      const s = pj(p.x, p.y, p.z);
      if (prev) {
        ctx.beginPath();
        ctx.strokeStyle = rgba(c, 0.55 * (1 - k * 0.85));
        ctx.lineWidth = 2.4 * (1 - k * 0.6);
        ctx.lineCap = 'round';
        ctx.moveTo(prev.sx, prev.sy);
        ctx.lineTo(s.sx, s.sy);
        ctx.stroke();
      }
      if (i % 8 === 3) glow(ctx, s.sx, s.sy, 7 * s.scale * (1 - k * 0.5), c, 0.3);
      prev = s;
    }
  }
  const core = pj(0, 0, 0);
  glow(ctx, core.sx, core.sy, 22 * core.scale, c, 0.55);
}

// ── corona — a sun: spikes of light radiating from the whole form, long and
// short alternating, with a base ring holding them together. ────────────────
function corona(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number) {
  const N = 14;
  const spin = time * 0.03;
  // Base ring.
  ctx.beginPath();
  ctx.strokeStyle = rgba(c, 0.3);
  ctx.lineWidth = 1.4;
  for (let i = 0; i <= 72; i++) {
    const p = ring(0.98 * R, (i / 72) * Math.PI * 2, 0.3, spin);
    const s = pj(p.x, p.y, p.z);
    if (i === 0) ctx.moveTo(s.sx, s.sy); else ctx.lineTo(s.sx, s.sy);
  }
  ctx.stroke();
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2;
    const len = i % 2 === 0 ? 1.3 : 1.12;
    const base = ring(0.98 * R, th, 0.3, spin);
    const tip = ring(len * R, th, 0.3, spin);
    const b = pj(base.x, base.y, base.z);
    const t = pj(tip.x, tip.y, tip.z);
    const grad = ctx.createLinearGradient(b.sx, b.sy, t.sx, t.sy);
    grad.addColorStop(0, rgba(c, 0.55));
    grad.addColorStop(1, rgba(c, 0));
    ctx.beginPath();
    ctx.strokeStyle = grad;
    ctx.lineWidth = i % 2 === 0 ? 2.4 : 1.5;
    ctx.lineCap = 'round';
    ctx.moveTo(b.sx, b.sy);
    ctx.lineTo(t.sx, t.sy);
    ctx.stroke();
  }
}

// ═══════════════════════════════════════════════════════
// ROUND 2 — STANDALONE GEOMETRIES
// ═══════════════════════════════════════════════════════

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

type Pt3 = { x: number; y: number; z: number };

/** Lift a flat curve into a gently tilted plane — the shared camera's slow
 *  yaw then turns the whole form in space, exactly like the spirographs. */
function tilt(p: { x: number; y: number }, tiltX: number, z0 = 0): Pt3 {
  const ct = Math.cos(tiltX), st = Math.sin(tiltX);
  return { x: p.x, y: p.y * ct - z0 * st, z: p.y * st + z0 * ct };
}

/** Normalize a 2D point cloud to fit radius `target`, centered. */
function fit(pts: { x: number; y: number }[], target: number) {
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p.x; cy += p.y; }
  cx /= pts.length; cy /= pts.length;
  let m = 0;
  for (const p of pts) m = Math.max(m, Math.hypot(p.x - cx, p.y - cy));
  const s = m > 1e-6 ? target / m : 1;
  return pts.map(p => ({ x: (p.x - cx) * s, y: (p.y - cy) * s }));
}

/** The house animation language: the full path as a faint constant trace,
 *  with a few bright tracer heads sliding along it, tails fading — the same
 *  grammar as the spirograph's fireflies, at the same unhurried pace. */
function tracedPath(
  ctx: CanvasRenderingContext2D,
  pj: Projector,
  pts: Pt3[],
  c: RGB,
  time: number,
  opts: { pathAlpha?: number; width?: number; tracers?: number; speed?: number; closed?: boolean } = {},
) {
  const { pathAlpha = 0.22, width = 0.8, tracers = 4, speed = 0.02, closed = true } = opts;
  const n = pts.length;
  const proj = pts.map(p => pj(p.x, p.y, p.z));
  // Faint full trace.
  ctx.beginPath();
  ctx.strokeStyle = rgba(c, pathAlpha);
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  proj.forEach((s, i) => (i ? ctx.lineTo(s.sx, s.sy) : ctx.moveTo(s.sx, s.sy)));
  if (closed) ctx.closePath();
  ctx.stroke();
  // Tracers with fading tails.
  const TAIL = Math.max(8, Math.floor(n * 0.06));
  for (let k = 0; k < tracers; k++) {
    const u = ((time * speed + k / tracers) % 1 + 1) % 1;
    const head = Math.floor(u * n);
    for (let j = 0; j < TAIL; j++) {
      const i0 = ((head - j) % n + n) % n;
      const i1 = ((head - j - 1) % n + n) % n;
      if (!closed && i1 > i0) continue;
      const a = 0.85 * (1 - j / TAIL);
      ctx.beginPath();
      ctx.strokeStyle = rgba(c, a);
      ctx.lineWidth = 1.6 * (1 - (j / TAIL) * 0.6);
      ctx.lineCap = 'round';
      ctx.moveTo(proj[i0].sx, proj[i0].sy);
      ctx.lineTo(proj[i1].sx, proj[i1].sy);
      ctx.stroke();
    }
    const h = proj[head];
    glow(ctx, h.sx, h.sy, 13 * h.scale, c, 0.4);
  }
}

// ── geode — the crystal rock: an irregular luminous polyhedron, edges lit by
// depth, faint facet fills, internal refraction lines. Turns with the world. ─
function geode(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number, seed: number) {
  const rnd = mulberry(seed ^ 0x9e0de);
  const NV = 5 + Math.floor(rnd() * 3); // 5-7 vertices per ring
  const wobble = 0.10 * Math.sin(time * 0.05);
  const mk = (yFrac: number, rFrac: number): Pt3[] => {
    const ring: Pt3[] = [];
    const base = rnd() * Math.PI * 2;
    for (let i = 0; i < NV; i++) {
      const th = base + (i / NV) * Math.PI * 2 + (rnd() - 0.5) * 0.35;
      const r = R * rFrac * (0.82 + rnd() * 0.36);
      ring.push({
        x: Math.cos(th) * r,
        y: R * yFrac + (rnd() - 0.5) * R * 0.12,
        z: Math.sin(th) * r,
      });
    }
    return ring;
  };
  const top = mk(0.34 + wobble * 0.3, 0.58);
  const bot = mk(-0.34, 0.62);
  const apexT: Pt3 = { x: (rnd() - 0.5) * R * 0.2, y: R * (0.85 + rnd() * 0.2), z: (rnd() - 0.5) * R * 0.2 };
  const apexB: Pt3 = { x: (rnd() - 0.5) * R * 0.2, y: -R * (0.8 + rnd() * 0.2), z: (rnd() - 0.5) * R * 0.2 };

  const P = (p: Pt3) => pj(p.x, p.y, p.z);
  const edge = (a: Pt3, b: Pt3, boost = 1) => {
    const sa = P(a), sb = P(b);
    // Depth cue: projected scale is larger when nearer — light the near edges.
    const depth = (sa.scale + sb.scale) / 2;
    const lit = Math.min(1, Math.max(0.15, (depth - 0.8) * 2.4));
    ctx.beginPath();
    ctx.strokeStyle = rgba(c, (0.18 + 0.55 * lit) * boost);
    ctx.lineWidth = 1.0 + 1.3 * lit;
    ctx.lineCap = 'round';
    ctx.moveTo(sa.sx, sa.sy);
    ctx.lineTo(sb.sx, sb.sy);
    ctx.stroke();
  };
  const face = (pts: Pt3[]) => {
    const ss = pts.map(P);
    ctx.beginPath();
    ctx.fillStyle = rgba(c, 0.05);
    ss.forEach((s, i) => (i ? ctx.lineTo(s.sx, s.sy) : ctx.moveTo(s.sx, s.sy)));
    ctx.closePath();
    ctx.fill();
  };

  // Facet fills first (they are the body of the rock).
  for (let i = 0; i < NV; i++) {
    const j = (i + 1) % NV;
    face([top[i], top[j], bot[j], bot[i]]);
    face([apexT, top[i], top[j]]);
    face([apexB, bot[j], bot[i]]);
  }
  // Internal refraction lines — light caught inside the stone.
  for (let i = 0; i < 3; i++) {
    edge(top[Math.floor(rnd() * NV)], bot[Math.floor(rnd() * NV)], 0.35);
  }
  // Edges.
  for (let i = 0; i < NV; i++) {
    const j = (i + 1) % NV;
    edge(top[i], top[j]);
    edge(bot[i], bot[j]);
    edge(top[i], bot[i]);
    edge(apexT, top[i]);
    edge(apexB, bot[i]);
  }
  // Vertex sparks.
  for (const v of [...top, ...bot, apexT, apexB]) {
    const s = P(v);
    const lit = Math.min(1, Math.max(0.2, (s.scale - 0.8) * 2.4));
    glow(ctx, s.sx, s.sy, 8 * s.scale * lit, c, 0.4 * lit);
    ctx.beginPath();
    ctx.fillStyle = rgba(c, 0.9 * lit);
    ctx.arc(s.sx, s.sy, Math.max(0.8, 1.6 * s.scale), 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── harmonograph — damped double-pendulum Lissajous; the decay is what makes
// it look hand-drawn. ────────────────────────────────────────────────────────
function harmonograph(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number, seed: number) {
  const rnd = mulberry(seed ^ 0x4a2);
  const f1 = 2 + Math.floor(rnd() * 2), f2 = f1 + 1;
  const det = 0.004 + rnd() * 0.01; // slight detune → precession
  const p1 = rnd() * Math.PI * 2, p2 = rnd() * Math.PI * 2, p3 = rnd() * Math.PI * 2;
  const d1 = 0.015 + rnd() * 0.02, d2 = 0.02 + rnd() * 0.02;
  const N = 1400, T = 70;
  const flat: { x: number; y: number }[] = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * T;
    flat.push({
      x: Math.sin(f1 * t + p1) * Math.exp(-d1 * t) + 0.6 * Math.sin((f2 + det) * t + p2) * Math.exp(-d2 * t),
      y: Math.sin((f1 + det) * t + p3) * Math.exp(-d2 * t) + 0.6 * Math.sin(f2 * t + p1) * Math.exp(-d1 * t),
    });
  }
  const pts = fit(flat, R * 0.98).map(p => tilt(p, 0.35));
  tracedPath(ctx, pj, pts, c, time, { pathAlpha: 0.3, width: 0.7, tracers: 3, speed: 0.015, closed: false });
}

// ── maurer — a rose sampled at a big fixed angular step, dots connected: an
// angular web utterly unlike a trochoid. ─────────────────────────────────────
function maurer(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number, seed: number) {
  const rnd = mulberry(seed ^ 0x3a0e);
  const n = [3, 4, 5, 6, 7][Math.floor(rnd() * 5)];
  const step = [71, 97, 29, 47, 111][Math.floor(rnd() * 5)];
  const flat: { x: number; y: number }[] = [];
  for (let i = 0; i <= 360; i++) {
    const th = (i * step * Math.PI) / 180;
    const r = Math.sin(n * th);
    flat.push({ x: r * Math.cos(th), y: r * Math.sin(th) });
  }
  const pts = fit(flat, R * 0.98).map(p => tilt(p, 0.4));
  tracedPath(ctx, pj, pts, c, time, { pathAlpha: 0.16, width: 0.6, tracers: 5, speed: 0.012 });
  // Bright rose-tip nodes over the web.
  for (let i = 0; i < 360; i += 45) {
    const s = pj(pts[i].x, pts[i].y, pts[i].z);
    glow(ctx, s.sx, s.sy, 7 * s.scale, c, 0.35);
  }
}

// ── superformula — Gielis' generalized star/polygon outline, two nested
// shells breathing against each other. ───────────────────────────────────────
function superformula(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number, seed: number) {
  const rnd = mulberry(seed ^ 0x5f0);
  const m = 5 + Math.floor(rnd() * 5);
  const n1 = 0.22 + rnd() * 0.5, n2 = 0.3 + rnd() * 1.4, n3 = n2;
  const shape = (scale: number, phase: number): Pt3[] => {
    const flat: { x: number; y: number }[] = [];
    for (let i = 0; i <= 240; i++) {
      const phi = (i / 240) * Math.PI * 2;
      const t1 = Math.pow(Math.abs(Math.cos((m * phi) / 4)), n2);
      const t2 = Math.pow(Math.abs(Math.sin((m * phi) / 4)), n3);
      const r = Math.pow(t1 + t2, -1 / n1);
      flat.push({ x: r * Math.cos(phi + phase), y: r * Math.sin(phi + phase) });
    }
    return fit(flat, R * scale).map(p => tilt(p, 0.32));
  };
  tracedPath(ctx, pj, shape(1.0, time * 0.02), c, time, { pathAlpha: 0.4, width: 1.3, tracers: m >= 8 ? 4 : 3, speed: 0.014 });
  tracedPath(ctx, pj, shape(0.55, -time * 0.03), c, time, { pathAlpha: 0.22, width: 0.8, tracers: 2, speed: 0.02 });
}

// ── mystery — Farris' sums of three complex exponentials: perfect n-fold
// symmetry no trochoid can produce. ──────────────────────────────────────────
function mystery(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number, seed: number) {
  const rnd = mulberry(seed ^ 0x7f3);
  const sets = [
    { k: [1, 6, -14], a: [1, 0.5, 0.33] },   // 5-fold
    { k: [1, 7, -11], a: [1, 0.45, 0.4] },   // 6-fold
    { k: [1, 5, -7],  a: [1, 0.55, 0.3] },   // 4-fold
  ];
  const s = sets[Math.floor(rnd() * sets.length)];
  const flat: { x: number; y: number }[] = [];
  for (let i = 0; i <= 720; i++) {
    const t = (i / 720) * Math.PI * 2;
    let x = 0, y = 0;
    for (let j = 0; j < 3; j++) {
      x += s.a[j] * Math.cos(s.k[j] * t);
      y += s.a[j] * Math.sin(s.k[j] * t);
    }
    flat.push({ x, y });
  }
  const pts = fit(flat, R * 0.98).map(p => tilt(p, 0.36));
  tracedPath(ctx, pj, pts, c, time, { pathAlpha: 0.28, width: 0.9, tracers: 5, speed: 0.01 });
}

// ── phyllotaxis — a sunflower seed head on the golden angle, domed so the
// camera's turn gives it parallax; a brightness wave blooms outward. ─────────
function phyllotaxis(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number, seed: number) {
  const rnd = mulberry(seed ^ 0xf10);
  const N = 260 + Math.floor(rnd() * 80);
  const GA = Math.PI * (3 - Math.sqrt(5));
  const spin = time * 0.03;
  for (let i = 0; i < N; i++) {
    const rf = Math.sqrt(i / N);
    const th = i * GA + spin;
    const r = rf * R * 0.95;
    const dome = R * 0.28 * (1 - rf * rf);
    const p = tilt({ x: Math.cos(th) * r, y: Math.sin(th) * r }, 0.5, dome);
    const sp = pj(p.x, p.y, p.z);
    // Bloom wave: a pulse of brightness travels from center to rim and back.
    const wave = 0.5 + 0.5 * Math.sin(rf * 6 - time * 0.35);
    const a = 0.25 + 0.6 * wave * (1 - rf * 0.4);
    ctx.beginPath();
    ctx.fillStyle = rgba(c, a);
    ctx.arc(sp.sx, sp.sy, Math.max(0.7, (0.9 + 1.8 * (1 - rf)) * sp.scale), 0, Math.PI * 2);
    ctx.fill();
    if (i % 21 === 0) glow(ctx, sp.sx, sp.sy, 6 * sp.scale, c, 0.22 * wave);
  }
}

// ── clothoid — three Euler-spiral arms: straight from the heart, then each
// winds into its own tightening focus. ───────────────────────────────────────
function clothoid(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number, seed: number) {
  const rnd = mulberry(seed ^ 0xc10);
  const ARMS = 2 + Math.floor(rnd() * 2);
  const turn = 14 + rnd() * 8;
  const STEPS = 320;
  const armPts: { x: number; y: number }[] = [];
  {
    let x = 0, y = 0, phi = 0;
    const ds = 1 / STEPS;
    for (let i = 0; i < STEPS; i++) {
      const sfrac = i / STEPS;
      phi = turn * sfrac * sfrac;
      x += Math.cos(phi) * ds;
      y += Math.sin(phi) * ds;
      armPts.push({ x, y });
    }
  }
  const fitted = fit(armPts, R * 0.52);
  // fit() centers on the centroid; shift so the arm starts at the origin.
  const dx = fitted[0].x, dy = fitted[0].y;
  for (let a = 0; a < ARMS; a++) {
    const rot = (a / ARMS) * Math.PI * 2;
    const cs = Math.cos(rot), ss = Math.sin(rot);
    const pts = fitted.map(p => {
      const px = p.x - dx, py = p.y - dy;
      return tilt({ x: px * cs - py * ss, y: px * ss + py * cs }, 0.42);
    });
    tracedPath(ctx, pj, pts, c, time, { pathAlpha: 0.3, width: 1.0, tracers: 2, speed: 0.02, closed: false });
    const focus = pj(pts[pts.length - 1].x, pts[pts.length - 1].y, pts[pts.length - 1].z);
    glow(ctx, focus.sx, focus.sy, 10 * focus.scale, c, 0.45);
  }
  const core = pj(0, 0, 0);
  glow(ctx, core.sx, core.sy, 14 * core.scale, c, 0.4);
}

// ── attractor — a Gumowski-Mira map: thousands of luminous dust points that
// organize into organic, symmetric-feeling nebulae. ──────────────────────────
function attractor(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number, seed: number) {
  const rnd = mulberry(seed ^ 0xa77);
  // μ values chosen from Gumowski-Mira's dense, flower-like band.
  const mu = [-0.75, -0.55, -0.48, -0.31, -0.23][Math.floor(rnd() * 5)] + (rnd() - 0.5) * 0.04;
  const a = 0.008, b = 0.05;
  const G = (x: number) => mu * x + (2 * (1 - mu) * x * x) / (1 + x * x);
  let x = 2 + rnd() * 4, y = 0;
  const flat: { x: number; y: number }[] = [];
  for (let i = 0; i < 7000; i++) {
    const xn = y + a * (1 - b * y * y) * y + G(x);
    const yn = -x + G(xn);
    x = xn; y = yn;
    if (i > 80) flat.push({ x, y });
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 80 || Math.abs(y) > 80) break;
  }
  if (flat.length < 400) { // diverged — fall back to a tame μ
    return attractor(ctx, pj, R, c, time, seed + 7);
  }
  // Symmetrize (the map is odd-symmetric in spirit; the mirror fills it out
  // into something that reads as one radiant object).
  const mirrored = flat.concat(flat.map(p => ({ x: -p.x, y: -p.y })));
  const pts = fit(mirrored, R * 0.95).map(p => tilt(p, 0.38));
  // Dust, with a slow shimmer: each point flickers on its own phase.
  for (let i = 0; i < pts.length; i++) {
    const s = pj(pts[i].x, pts[i].y, pts[i].z);
    const tw = 0.6 + 0.4 * Math.sin(time * 0.4 + i * 1.7);
    ctx.fillStyle = rgba(c, 0.34 * tw);
    ctx.fillRect(s.sx - 0.75, s.sy - 0.75, 1.5, 1.5);
    if (i % 120 === 0) glow(ctx, s.sx, s.sy, 6 * s.scale, c, 0.2 * tw);
  }
  const core = pj(0, 0, 0);
  glow(ctx, core.sx, core.sy, 18 * core.scale, c, 0.3);
}

// ── stringart — times-tables on a circle: chords from i to k·i mod n, whose
// envelope is a cardioid; k drifts slowly so the envelope breathes. ──────────
function stringart(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number, seed: number) {
  const rnd = mulberry(seed ^ 0x57a);
  const N = 84;
  const kBase = 2 + Math.floor(rnd() * 3);
  const k = kBase + 0.5 + 0.5 * Math.sin(time * 0.05); // breathes between tables
  const T = 0.4;
  const pt = (i: number): Pt3 => {
    const th = (i / N) * Math.PI * 2;
    return tilt({ x: Math.cos(th) * R * 0.96, y: Math.sin(th) * R * 0.96 }, T);
  };
  // Rim.
  ctx.beginPath();
  ctx.strokeStyle = rgba(c, 0.3);
  ctx.lineWidth = 1.0;
  for (let i = 0; i <= N; i++) {
    const s = pj(pt(i).x, pt(i).y, pt(i).z);
    if (i === 0) ctx.moveTo(s.sx, s.sy); else ctx.lineTo(s.sx, s.sy);
  }
  ctx.stroke();
  // Chords.
  for (let i = 0; i < N; i++) {
    const a = pt(i), b = pt((i * k) % N);
    const sa = pj(a.x, a.y, a.z), sb = pj(b.x, b.y, b.z);
    ctx.beginPath();
    ctx.strokeStyle = rgba(c, 0.13);
    ctx.lineWidth = 0.6;
    ctx.moveTo(sa.sx, sa.sy);
    ctx.lineTo(sb.sx, sb.sy);
    ctx.stroke();
  }
  // A few beads riding the rim.
  for (let j = 0; j < 3; j++) {
    const u = ((time * 0.02 + j / 3) % 1) * N;
    const p = pt(u);
    const s = pj(p.x, p.y, p.z);
    glow(ctx, s.sx, s.sy, 9 * s.scale, c, 0.4);
  }
}

// ── spirolateral — turtle geometry: forward i·u, turn α, repeat. Angular,
// architectural, nothing like a roulette. ────────────────────────────────────
function spirolateral(ctx: CanvasRenderingContext2D, pj: Projector, R: number, c: RGB, time: number, seed: number) {
  const rnd = mulberry(seed ^ 0x59a1);
  const alpha = ([144, 100, 108, 72, 135][Math.floor(rnd() * 5)] * Math.PI) / 180;
  const m = 3 + Math.floor(rnd() * 4);
  // The rotation drift is the trick: "turn α + k·i" keeps the path from
  // closing after one lap, so it precesses into a spirographic knot instead
  // of collapsing to a bowtie.
  const drift = (0.15 + rnd() * 0.5) * (Math.PI / 180);
  const flat: { x: number; y: number }[] = [{ x: 0, y: 0 }];
  let x = 0, y = 0, phi = 0;
  for (let i = 0; i < 340; i++) {
    const len = ((i % m) + 1);
    x += Math.cos(phi) * len;
    y += Math.sin(phi) * len;
    flat.push({ x, y });
    phi += alpha + drift * i;
  }
  const pts = fit(flat, R * 0.95).map(p => tilt(p, 0.38));
  tracedPath(ctx, pj, pts, c, time, { pathAlpha: 0.26, width: 0.8, tracers: 4, speed: 0.012, closed: false });
  // Corner sparks at the sharpest turns.
  for (let i = m; i < pts.length; i += m * 4) {
    const s = pj(pts[i].x, pts[i].y, pts[i].z);
    ctx.beginPath();
    ctx.fillStyle = rgba(c, 0.7);
    ctx.arc(s.sx, s.sy, Math.max(0.8, 1.2 * s.scale), 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── knot — a true 3D Lissajous knot; the camera's turn is what reveals it. ──
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
    case 'shatter':       return shatter(ctx, pj, R, color, time, curve);
    case 'saturn':        return saturn(ctx, pj, R, color, time);
    case 'constellation': return constellation(ctx, pj, R, color, time, curve);
    case 'pulsar':        return pulsar(ctx, pj, R, color, time);
    case 'eclipse':       return eclipse(ctx, pj, R, color, time);
    case 'vortex':        return vortex(ctx, pj, R, color, time);
    case 'corona':        return corona(ctx, pj, R, color, time);
    case 'geode':         return geode(ctx, pj, R, color, time, seed);
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
