/**
 * The Between — Structural archetypes (Phase 5)
 *
 * The curve type says *what* a star is; the archetype says *how it holds
 * itself*. The structures layer on top of the five existing curve types,
 * resolved deterministically from the star's stored `dimensions` plus its
 * shortcode. No schema change — existing stars gain their archetype the moment
 * they are next drawn, and because every renderer (cosmos sprite bake, live
 * selected star, panel mini preview, OG image) goes through the one
 * `renderFrame`, all of them agree on the form.
 *
 *   low rootedness  → satellites   1–3 motes on slow orbits around the form
 *   high tension    → binary       a double core, two nuclei instead of one
 *   low certainty   → comet        a bright head in eccentric orbit, tail streaming
 *
 * Everything drawn here stays inside the line-drawn luminous language: thin
 * strokes and soft radial falloffs, always in the star's own emotion colour,
 * never a solid fill and never a colour outside the palette.
 */

import { hashString, mulberry32 } from '../btw';

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export type RGB = [number, number, number];

/** Projected screen position of a model-space point (see renderer's `project`). */
export interface Projected { sx: number; sy: number; scale: number }
export type Projector = (x: number, y: number, z: number) => Projected;

interface Vec3 { x: number; y: number; z: number }

interface SatelliteSpec {
  radius: number;   // orbit radius as a fraction of R
  tiltX: number;    // orbital plane inclination
  spin: number;     // orbital plane's yaw
  phase: number;    // starting angle
  speed: number;    // rad/s — deliberately slow
  size: number;     // mote radius in canvas px at scale 1
}

export interface ArchetypeSpec {
  seed: number;
  satellites: SatelliteSpec[];
  binary: boolean;
  comet: boolean;
  /** How many archetypes are active — used to quieten busy combinations. */
  count: number;
  binaryAxis: number;
  binaryTilt: number;
  binarySep: number;      // fraction of R
  /** The comet is a body in orbit: a bright head sweeping the form on an
   *  inclined ellipse, its tail streaming behind along the path. */
  cometTilt: number;      // orbital plane inclination
  cometSpin: number;      // orbital plane yaw
  cometPhase: number;     // starting anomaly
  cometSpeed: number;     // rad/s — visibly faster than satellites
  cometRadius: number;    // mean orbit radius, fraction of R
  cometEcc: number;       // 0..0.35 — radius swells and shrinks per lap
}

/** Minimal shape of the dimensions an archetype is resolved from. */
export interface ArchetypeSource {
  certainty: number;
  warmth: number;
  tension: number;
  vulnerability: number;
  scope: number;
  rootedness: number;
  emotionIndex: number;
  curveType: string;
  /** Stable per-star seed — the shortcode. */
  seed?: string;
}

// ═══════════════════════════════════════════════════════
// THRESHOLDS
// ═══════════════════════════════════════════════════════

/**
 * Tuned against the real dimension distribution so roughly 15–20 % of stars
 * carry any one archetype and a healthy third stay plain. Archetypes are meant
 * to be legible punctuation, not the default state of the sky.
 */
export const ARCHETYPE_THRESHOLDS = {
  satellites: 0.16,   // rootedness below this
  binary:     0.70,   // tension above this
  comet:      0.36,   // certainty below this
} as const;
// Retired by owner review (2026-09) — crystalline knot ("a denser tangle"),
// armillary rare ("a lesser halo"), and the halo band itself (the saturn
// proposal does that idea better). Their trigger slots (high certainty,
// high scope, 1%-rare) are open for graduating /preview/stars proposals.

// ═══════════════════════════════════════════════════════
// SEED
// ═══════════════════════════════════════════════════════

/**
 * A star's seed is its shortcode. Pre-birth previews (the submit flow) have no
 * shortcode yet, so they fall back to a hash of the dimension values — still
 * deterministic, just not shortcode-stable.
 */
export function archetypeSeed(dims: ArchetypeSource): number {
  if (dims.seed) return hashString(dims.seed);
  return hashString(
    [dims.certainty, dims.warmth, dims.tension, dims.vulnerability, dims.scope, dims.rootedness]
      .map(v => v.toFixed(4)).join(':') + `:${dims.emotionIndex}:${dims.curveType}`,
  );
}

// ═══════════════════════════════════════════════════════
// RESOLUTION
// ═══════════════════════════════════════════════════════

export function resolveArchetype(dims: ArchetypeSource): ArchetypeSpec {
  const seed = archetypeSeed(dims);
  const rand = mulberry32(seed ^ 0x5f3a7c11);
  const T = ARCHETYPE_THRESHOLDS;

  const wantsSat = dims.rootedness < T.satellites;
  const binary   = dims.tension    > T.binary;
  const comet    = dims.certainty  < T.comet;

  const satellites: SatelliteSpec[] = [];
  if (wantsSat) {
    // The less rooted, the more motes have come loose.
    const n = Math.min(3, 1 + Math.floor(((T.satellites - dims.rootedness) / T.satellites) * 3));
    for (let i = 0; i < n; i++) {
      satellites.push({
        radius: 0.88 + rand() * 0.17,      // ≤1.05 R — stays inside the canvas
        tiltX: (rand() - 0.5) * 1.7,
        spin: rand() * Math.PI * 2,
        phase: (i / n) * Math.PI * 2 + rand() * 0.8,
        // Quick enough to belong to the same sky as the firefly tracers —
        // escaped moons, not parked ones (owner review 2026-09-09).
        speed: 0.34 + rand() * 0.16,
        size: 4.5 + rand() * 2.0,
      });
    }
  }

  const count =
    (satellites.length ? 1 : 0) + (binary ? 1 : 0) + (comet ? 1 : 0);

  return {
    seed,
    satellites,
    binary, comet, count,
    binaryAxis: rand() * Math.PI * 2,
    binaryTilt: (rand() - 0.5) * 1.2,
    // Wide enough apart that two suns read as two suns, not a smeared one.
    binarySep: 0.32 + (dims.tension - T.binary) * 0.5,
    // Comet orbit — inclined so the sweep stays visible as the form turns,
    // eccentric so each lap swells toward a perihelion and falls away.
    cometTilt: 0.35 + rand() * 0.6,
    cometSpin: rand() * Math.PI * 2,
    cometPhase: rand() * Math.PI * 2,
    cometSpeed: 0.55 + rand() * 0.2,
    cometRadius: 0.98 + rand() * 0.1,
    cometEcc: 0.15 + (T.comet - dims.certainty) * 0.5,
  };
}

/**
 * Short human-readable summary of a star's archetype ("binary + comet", or
 * "plain" when it has none). Not used by the rendered product — it exists for
 * moderation, debugging and the review contact sheets.
 */
export function archetypeLabel(spec: ArchetypeSpec): string {
  const parts: string[] = [];
  if (spec.satellites.length) parts.push(`satellites×${spec.satellites.length}`);
  if (spec.binary) parts.push('binary');
  if (spec.comet) parts.push('comet');
  return parts.length ? parts.join(' + ') : 'plain';
}

// ═══════════════════════════════════════════════════════
// DRAWING
// ═══════════════════════════════════════════════════════

/**
 * A point on a circle of `radius`, inclined by `tiltX` and yawed by `spin`.
 * Everything structural is built from this so the archetypes share the curve's
 * sense of a form turning in space rather than a flat overlay.
 */
function ringPoint(radius: number, theta: number, tiltX: number, spin: number): Vec3 {
  const x0 = Math.cos(theta) * radius;
  const y0 = Math.sin(theta) * radius;
  const y1 = y0 * Math.cos(tiltX);
  const z1 = y0 * Math.sin(tiltX);
  const cs = Math.cos(spin), ss = Math.sin(spin);
  return { x: x0 * cs + z1 * ss, y: y1, z: -x0 * ss + z1 * cs };
}

/** Busy stars dim their extras so combinations stay quiet. */
function budget(spec: ArchetypeSpec): number {
  return 1 / (1 + 0.28 * Math.max(0, spec.count - 1));
}

function rgba(c: RGB, a: number): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;
}

function strokeRing(
  ctx: CanvasRenderingContext2D,
  pj: Projector,
  R: number,
  radiusFrac: number,
  tiltX: number,
  spin: number,
  steps: number,
  color: RGB,
  alpha: number,
  width: number,
): void {
  ctx.beginPath();
  ctx.strokeStyle = rgba(color, alpha);
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 0; i <= steps; i++) {
    const th = (i / steps) * Math.PI * 2;
    const p = ringPoint(radiusFrac * R, th, tiltX, spin);
    const s = pj(p.x, p.y, p.z);
    if (i === 0) ctx.moveTo(s.sx, s.sy);
    else ctx.lineTo(s.sx, s.sy);
  }
  ctx.stroke();
}

function softGlow(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number,
  color: RGB, alpha: number,
): void {
  if (r <= 0.5) return;
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(0.45, rgba(color, alpha * 0.42));
  g.addColorStop(1, rgba(color, 0));
  ctx.beginPath();
  ctx.fillStyle = g;
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Structures that sit behind the curve: the comet's orbit.
 * Called before the ghost trace and the fireflies.
 */
export function drawArchetypeUnder(
  ctx: CanvasRenderingContext2D,
  spec: ArchetypeSpec,
  pj: Projector,
  R: number,
  color: RGB,
  time: number,
): void {
  if (spec.count === 0) return;
  const b = budget(spec);

  // ── Comet: a body in orbit — a bright head sweeping the form at pace,
  // its tail streaming behind along the path and flaring outward, away from
  // the star, the way a real tail points away from its sun. ────────────────
  if (spec.comet) {
    const th = spec.cometPhase + time * spec.cometSpeed;
    // Eccentric radius: swells toward perihelion and falls away each lap.
    const orbitR = (a: number) => spec.cometRadius * R * (1 + spec.cometEcc * Math.cos(a * 0.9));
    const at = (a: number) => {
      const p = ringPoint(orbitR(a), a, spec.cometTilt, spec.cometSpin);
      return { p, s: pj(p.x, p.y, p.z) };
    };
    const head = at(th);
    // Depth cue so the sweep reads as an orbit: brighter on the near side.
    const lit = Math.min(1, Math.max(0.35, (head.s.scale - 0.8) * 2.4));

    // The tail: a trailing arc of ~1.4 rad, each segment nudged outward more
    // the further behind the head it is.
    const STEPS = 20;
    ctx.lineCap = 'round';
    let prev = head.s;
    for (let i = 1; i <= STEPS; i++) {
      const k = i / STEPS;
      const a = th - k * 1.4;
      const { p } = at(a);
      const flare = 1 + k * 0.22; // drifts radially away from the star as it ages
      const s2 = pj(p.x * flare, p.y * flare, p.z * flare);
      ctx.beginPath();
      ctx.strokeStyle = rgba(color, 0.6 * (1 - k) * (1 - k * 0.4) * b * lit);
      ctx.lineWidth = 3.2 * (1 - k * 0.75);
      ctx.moveTo(prev.sx, prev.sy);
      ctx.lineTo(s2.sx, s2.sy);
      ctx.stroke();
      prev = s2;
      // Sparse motes shed along the tail.
      if (i % 6 === 3) softGlow(ctx, s2.sx, s2.sy, 5 * s2.scale * (1 - k), color, 0.28 * b * lit);
    }

    // The coma and nucleus.
    softGlow(ctx, head.s.sx, head.s.sy, 16 * head.s.scale, color, 0.5 * b * lit);
    ctx.beginPath();
    ctx.fillStyle = rgba(color, 0.95 * b * lit);
    ctx.arc(head.s.sx, head.s.sy, Math.max(1.2, 2.6 * head.s.scale), 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Structures that sit in front: the binary cores and the satellite motes.
 * Called after the fireflies so the motes stay legible over the tangle.
 */
export function drawArchetypeOver(
  ctx: CanvasRenderingContext2D,
  spec: ArchetypeSpec,
  pj: Projector,
  R: number,
  color: RGB,
  time: number,
): void {
  if (spec.count === 0) return;
  const b = budget(spec);

  // ── Binary: the form holds two nuclei instead of one. They must read as
  // two suns inside one tangle — big, bright, unmistakably a pair — so the
  // cores blaze and a faint bridge of light spans them. ───────────────────
  if (spec.binary) {
    // The pair orbits at the tangle's own pace (owner review 2026-09-09).
    const axis = spec.binaryAxis + time * 0.62;
    const pts: { sx: number; sy: number; scale: number }[] = [];
    for (const sign of [1, -1] as const) {
      const p = ringPoint(spec.binarySep * R * sign, axis, spec.binaryTilt, 0);
      const s = pj(p.x, p.y, p.z);
      pts.push(s);
      softGlow(ctx, s.sx, s.sy, 30 * s.scale, color, 0.55 * b);
      // A hot center inside the glow — the nucleus itself.
      ctx.beginPath();
      ctx.fillStyle = rgba(color, 0.95 * b);
      ctx.arc(s.sx, s.sy, Math.max(1.5, 3.4 * s.scale), 0, Math.PI * 2);
      ctx.fill();
      // A ring around each nucleus so the pair reads as structure.
      ctx.save();
      ctx.translate(s.sx, s.sy);
      ctx.beginPath();
      ctx.strokeStyle = rgba(color, 0.55 * b);
      ctx.lineWidth = 1.6;
      ctx.ellipse(0, 0, 13 * s.scale, 13 * s.scale * Math.abs(Math.cos(spec.binaryTilt)) + 2,
        axis, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // The bridge — matter drawn between the two, the mark of a true binary.
    ctx.beginPath();
    ctx.strokeStyle = rgba(color, 0.22 * b);
    ctx.lineWidth = 5.5;
    ctx.lineCap = 'round';
    ctx.moveTo(pts[0].sx, pts[0].sy);
    ctx.lineTo(pts[1].sx, pts[1].sy);
    ctx.stroke();
  }

  // ── Satellites: loose motes still orbiting a form that can't hold them.
  // Each mote's whole orbit is faintly drawn — that visible path is what
  // separates "escaped moons" from binary's two suns at a glance. ─────────
  for (const sat of spec.satellites) {
    const th = sat.phase + time * sat.speed;

    // The orbit itself, whisper-thin but complete.
    strokeRing(ctx, pj, R, sat.radius, sat.tiltX, sat.spin, 60, color, 0.14 * b, 0.9);

    // A longer trailing arc brightening into the mote.
    const TRAIL = 12;
    ctx.lineCap = 'round';
    let prev: Projected | null = null;
    for (let i = TRAIL; i >= 0; i--) {
      const p = ringPoint(sat.radius * R, th - (i / TRAIL) * 0.9, sat.tiltX, sat.spin);
      const s = pj(p.x, p.y, p.z);
      if (prev) {
        ctx.beginPath();
        ctx.strokeStyle = rgba(color, (0.42 * (1 - i / TRAIL)) * b);
        ctx.lineWidth = 1.0 + (1 - i / TRAIL) * 1.4;
        ctx.moveTo(prev.sx, prev.sy);
        ctx.lineTo(s.sx, s.sy);
        ctx.stroke();
      }
      prev = s;
    }

    const p = ringPoint(sat.radius * R, th, sat.tiltX, sat.spin);
    const s = pj(p.x, p.y, p.z);
    softGlow(ctx, s.sx, s.sy, sat.size * 4.2 * s.scale, color, 0.5 * b);
    ctx.beginPath();
    ctx.fillStyle = rgba(color, 0.95 * b);
    ctx.arc(s.sx, s.sy, Math.max(1.2, sat.size * 0.8 * s.scale), 0, Math.PI * 2);
    ctx.fill();
  }
}
