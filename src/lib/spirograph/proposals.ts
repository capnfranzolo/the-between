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
}

export const PROPOSAL_KINDS = [
  'shatter', 'saturn', 'constellation', 'pulsar', 'eclipse', 'vortex', 'corona',
] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];

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

export function drawProposal(
  kind: string,
  ctx: CanvasRenderingContext2D,
  pj: Projector,
  R: number,
  color: RGB,
  time: number,
  curve: CurveAccess,
): void {
  switch (kind as ProposalKind) {
    case 'shatter':       return shatter(ctx, pj, R, color, time, curve);
    case 'saturn':        return saturn(ctx, pj, R, color, time);
    case 'constellation': return constellation(ctx, pj, R, color, time, curve);
    case 'pulsar':        return pulsar(ctx, pj, R, color, time);
    case 'eclipse':       return eclipse(ctx, pj, R, color, time);
    case 'vortex':        return vortex(ctx, pj, R, color, time);
    case 'corona':        return corona(ctx, pj, R, color, time);
  }
}
