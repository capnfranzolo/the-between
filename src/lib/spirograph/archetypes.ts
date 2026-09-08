/**
 * The Between — Structural archetypes (Phase 5)
 *
 * The curve type says *what* a star is; the archetype says *how it holds
 * itself*. Six structures layer on top of the five existing curve types,
 * resolved deterministically from the star's stored `dimensions` plus its
 * shortcode. No schema change — existing stars gain their archetype the moment
 * they are next drawn, and because every renderer (cosmos sprite bake, live
 * selected star, panel mini preview, OG image) goes through the one
 * `renderFrame`, all of them agree on the form.
 *
 *   low rootedness  → satellites   1–3 motes on slow orbits around the form
 *   high tension    → binary       a double core, two nuclei instead of one
 *   high scope      → halo         one faint inclined ring, wider than the curve
 *   low certainty   → comet        a drifting plume trailing off the form
 *   high certainty  → crystal      a tighter, slower knot laced with chords
 *   ~1 % of stars   → armillary    three luminous rings caging the whole form
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
  halo: boolean;
  comet: boolean;
  crystal: boolean;
  rare: boolean;
  /** How many archetypes are active — used to quieten busy combinations. */
  count: number;
  binaryAxis: number;
  binaryTilt: number;
  binarySep: number;      // fraction of R
  haloRadius: number;     // fraction of R
  haloTilt: number;
  haloSpin: number;
  cometDir: number;
  cometTilt: number;
  cometLen: number;       // fraction of R
  crystalChords: number;
  crystalSkip: number;
  rareTilts: number[];
  rareSpins: number[];
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
  halo:       0.88,   // scope above this
  comet:      0.36,   // certainty below this
  crystal:    0.80,   // certainty above this
  /** Rare form: 10 in 1000 shortcodes. */
  rarePerMille: 10,
} as const;

/** Geometry adjustments the crystalline knot applies to the base curve. */
export const CRYSTAL_TIGHTEN = 0.86;   // knot pulls in
export const CRYSTAL_SLOW    = 0.62;   // and turns slower

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

  // The rare form uses its own slice of the hash so it stays independent of the
  // jitter draws below.
  const rare = ((seed >>> 7) % 1000) < T.rarePerMille;

  const wantsSat = dims.rootedness < T.satellites;
  const binary   = dims.tension    > T.binary;
  // The armillary already rings the form — a halo on top of it is noise.
  const halo     = dims.scope      > T.halo && !rare;
  const comet    = dims.certainty  < T.comet;
  const crystal  = dims.certainty  > T.crystal;

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
        speed: 0.10 + rand() * 0.08,
        size: 3.2 + rand() * 1.6,
      });
    }
  }

  const count =
    (satellites.length ? 1 : 0) + (binary ? 1 : 0) + (halo ? 1 : 0) +
    (comet ? 1 : 0) + (crystal ? 1 : 0) + (rare ? 1 : 0);

  return {
    seed,
    satellites,
    binary, halo, comet, crystal, rare, count,
    binaryAxis: rand() * Math.PI * 2,
    binaryTilt: (rand() - 0.5) * 1.2,
    binarySep: 0.20 + (dims.tension - T.binary) * 0.35,
    // The halo has to clear the curve to read as a ring rather than as another
    // winding of it — but 1.18 R is about as far as the canvas allows before
    // the near side of the ellipse clips.
    haloRadius: 1.10 + rand() * 0.08,
    // Kept well away from edge-on so the halo always reads as a ring around the
    // form rather than as a stray line through it.
    haloTilt: 0.30 + rand() * 0.55,
    haloSpin: rand() * Math.PI * 2,
    // The plume is aimed well away from the camera axis — the form turns as it
    // animates, and a tail pointing at the viewer is a tail nobody can see.
    // Biasing it towards the vertical guarantees visible extent at every angle.
    cometDir: (Math.PI / 2 + (rand() - 0.5) * 1.6) * (rand() < 0.5 ? 1 : -1),
    cometTilt: (rand() - 0.5) * 0.8,
    cometLen: 1.20 + (T.comet - dims.certainty) * 1.0,
    crystalChords: 7 + Math.floor(rand() * 4),
    crystalSkip: 2 + Math.floor(rand() * 2),
    // Three mutually orthogonal rings — a real armillary. Orthogonality is what
    // keeps at least one ring open to the viewer no matter how the form has
    // turned, so the rare star never collapses into a flat scribble.
    rareTilts: [0.22, Math.PI / 2 - 0.12, 0.22],
    rareSpins: (b => [b, b, b + Math.PI / 2])(rand() * Math.PI * 2),
  };
}

/**
 * Short human-readable summary of a star's archetype ("binary + comet", or
 * "plain" when it has none). Not used by the rendered product — it exists for
 * moderation, debugging and the review contact sheets.
 */
export function archetypeLabel(spec: ArchetypeSpec): string {
  const parts: string[] = [];
  if (spec.rare) parts.push('armillary');
  if (spec.satellites.length) parts.push(`satellites×${spec.satellites.length}`);
  if (spec.binary) parts.push('binary');
  if (spec.halo) parts.push('halo');
  if (spec.comet) parts.push('comet');
  if (spec.crystal) parts.push('crystal');
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
 * Structures that sit behind the curve: the halo ring, the armillary cage and
 * the comet plume. Called before the ghost trace and the fireflies.
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

  // ── Halo: one faint inclined ring, a shade wider than the curve ──────────
  if (spec.halo) {
    strokeRing(ctx, pj, R, spec.haloRadius, spec.haloTilt,
      spec.haloSpin + time * 0.05, 80, color, 0.26 * b, 1.2);
  }

  // ── Armillary (rare): three rings caging the form, counter-turning ───────
  if (spec.rare) {
    // Slightly different rates so the cage precesses instead of turning as a
    // rigid lump — the one flourish the rare star is allowed.
    const rate = [0.045, -0.032, 0.038];
    for (let i = 0; i < 3; i++) {
      strokeRing(ctx, pj, R, 0.96 - i * 0.025, spec.rareTilts[i],
        spec.rareSpins[i] + time * rate[i], 68, color, 0.28 * b, 1.2);
    }
  }

  // ── Comet: a plume drifting off the form, tapering into nothing ─────────
  if (spec.comet) {
    const dirV = ringPoint(1, spec.cometDir, spec.cometTilt, 0);
    // A perpendicular in the same plane, for the plume's slow sway.
    const perpV = ringPoint(1, spec.cometDir + Math.PI / 2, spec.cometTilt, 0);
    const len = spec.cometLen * R;
    const STEPS = 16;
    const F0 = 0.55;                 // leaves the form's edge, not its centre
    const point = (f: number, lane: number) => {
      const spread = (lane * 0.17 + Math.sin(time * 0.35 + f * 2.2) * 0.05) * (f - F0) * 2.2;
      const off = spread * len;
      return pj(
        dirV.x * f * len + perpV.x * off,
        dirV.y * f * len + perpV.y * off,
        dirV.z * f * len + perpV.z * off,
      );
    };
    // A bright coma where the plume leaves the form, then three lanes fanning
    // outward, each tapering segment by segment so the tail thins into nothing.
    for (const lane of [0, 1, -1]) {
      // Weighted to survive being scaled down to a distant sprite: a hairline
      // averages away to nothing, and the plume is this star's whole silhouette.
      const w0 = lane === 0 ? 3.4 : 1.8;
      const a0 = (lane === 0 ? 0.52 : 0.24) * b;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      let prev = point(F0, lane);
      for (let i = 1; i <= STEPS; i++) {
        const k = i / STEPS;
        const s = point(F0 + k * (1 - F0), lane);
        ctx.beginPath();
        ctx.strokeStyle = rgba(color, a0 * (1 - k) * (1 - k * 0.55));
        ctx.lineWidth = w0 * (1 - k * 0.78);
        ctx.moveTo(prev.sx, prev.sy);
        ctx.lineTo(s.sx, s.sy);
        ctx.stroke();
        prev = s;
      }
    }
    const coma = point(F0, 0);
    softGlow(ctx, coma.sx, coma.sy, 15 * coma.scale, color, 0.36 * b);
    // Motes strung along the plume so it reads as drift, not as a whisker.
    for (let i = 0; i < 3; i++) {
      const f = 0.70 + i * 0.13;
      const s = point(f, 0);
      softGlow(ctx, s.sx, s.sy, (5.5 - i * 1.2) * s.scale, color, 0.24 * b);
    }
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

  // ── Binary: the form holds two nuclei instead of one ────────────────────
  if (spec.binary) {
    const axis = spec.binaryAxis + time * 0.07;
    for (const sign of [1, -1] as const) {
      const p = ringPoint(spec.binarySep * R * sign, axis, spec.binaryTilt, 0);
      const s = pj(p.x, p.y, p.z);
      softGlow(ctx, s.sx, s.sy, 18 * s.scale, color, 0.34 * b);
      // A tight ring around each nucleus — the double core reads as structure,
      // not just as two brighter smudges.
      ctx.save();
      ctx.translate(s.sx, s.sy);
      ctx.beginPath();
      ctx.strokeStyle = rgba(color, 0.36 * b);
      ctx.lineWidth = 1.1;
      ctx.ellipse(0, 0, 9.5 * s.scale, 9.5 * s.scale * Math.abs(Math.cos(spec.binaryTilt)) + 1.5,
        axis, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ── Satellites: loose motes still orbiting a form that can't hold them ──
  for (const sat of spec.satellites) {
    const th = sat.phase + time * sat.speed;
    // Short trailing arc, then the mote itself.
    const TRAIL = 9;
    ctx.beginPath();
    ctx.strokeStyle = rgba(color, 0.16 * b);
    ctx.lineWidth = 0.9;
    ctx.lineCap = 'round';
    for (let i = 0; i <= TRAIL; i++) {
      const p = ringPoint(sat.radius * R, th - (i / TRAIL) * 0.55, sat.tiltX, sat.spin);
      const s = pj(p.x, p.y, p.z);
      if (i === 0) ctx.moveTo(s.sx, s.sy);
      else ctx.lineTo(s.sx, s.sy);
    }
    ctx.stroke();

    const p = ringPoint(sat.radius * R, th, sat.tiltX, sat.spin);
    const s = pj(p.x, p.y, p.z);
    softGlow(ctx, s.sx, s.sy, sat.size * 2.6 * s.scale, color, 0.34 * b);
    ctx.beginPath();
    ctx.fillStyle = rgba(color, 0.82 * b);
    ctx.arc(s.sx, s.sy, Math.max(0.8, sat.size * 0.45 * s.scale), 0, Math.PI * 2);
    ctx.fill();
  }
}
