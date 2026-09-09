/**
 * The Between — star families (the round-6 remap, owner-designed 2026-09-09)
 *
 * One star = COLOR + FAMILY + TYPE + VARIANT.
 *   color   — the 7-emotion palette, unchanged: it always did the loudest talking.
 *   family  — chosen from the thought's MEANING via the four semantic axes
 *             (resolve, charge, connection, temporality). Six families:
 *
 *               tangle    the classic spirograph (+ satellites/binary/saturn/
 *                         comet dressings) — inward thoughts, self-reflection
 *               currents  flowing lines wandering in space — wonder, longing,
 *                         questions, memory
 *               lattice   built, connective, architectural — conviction,
 *                         insight, things linked to things
 *               radiance  energy bursting from a heart — intensity, passion,
 *                         declarations
 *               field     living multitudes, one-from-many — growth, nature,
 *                         people, the collective
 *               void      absence with a burning rim — grief, loss, the unsaid
 *
 *   type    — a seeded uniform pick among the family's forms (one-of-a-kind
 *             stays guaranteed by the per-star seed).
 *   variant — each form's own seeded parameters, plus the first six vectors
 *             modulating its dials.
 *
 * Resolution is PURE and happens in exactly one place (computeGeometry calls
 * resolveFamily) so the cosmos sprite, the live star, the panel mini and the
 * OG image always agree — the same discipline that gave Phase 5 its parity.
 *
 * Stars whose stored dimensions predate the four semantic axes resolve to
 * tangle/spirograph — pixel-identical to their look before this change —
 * until the re-extraction backfill reaches them.
 */

import { mulberry32 } from '../btw';

export type FamilyName = 'tangle' | 'currents' | 'lattice' | 'radiance' | 'field' | 'void';

/** Forms per family. 'spirograph' is the classic tangle; every other name is
 *  a form in proposals.ts (standalone unless noted — pulsar and eclipse are
 *  overlays drawn onto a plain spirograph base). */
export const FAMILY_TYPES: Record<FamilyName, readonly string[]> = {
  tangle:   ['spirograph'],
  currents: ['harmonograph', 'knot', 'mystery', 'clothoid'],
  lattice:  ['constellation', 'stringart', 'maurer', 'spirolateral', 'shatter'],
  radiance: ['corona', 'vortex', 'shard', 'superformula', 'pulsar'],
  field:    ['phyllotaxis', 'attractor'],
  void:     ['eclipse'],
} as const;

/** The semantic slice of a star's dimensions that families are chosen from.
 *  The four axes are optional: stars extracted before the remap lack them. */
export interface FamilySource {
  emotionIndex: number;
  vulnerability: number;
  resolve?: number;
  charge?: number;
  connection?: number;
  temporality?: number;
}

export interface FamilySpec {
  family: FamilyName;
  /** The concrete form: 'spirograph' or a proposals.ts kind. */
  type: string;
}

/**
 * THE MAPPING — precedence is the semantics, so it is deliberate and visible.
 * Each rule is checked in order; the first match wins. Thresholds are the
 * knobs the owner tunes after seeing a real sky's distribution.
 *
 *  1. void      grief held quietly and alone: sadness + very exposed + still.
 *               Deliberately narrow — if a third of the sky goes dark, grief
 *               stops being special.
 *  2. radiance  the thought is burning. Intensity outranks subject matter:
 *               a fierce declaration about people still bursts.
 *  3. field     other people are the subject.
 *  4. lattice   a landed conviction.
 *  5. currents  still in flight — an open wondering — or anchored in memory.
 *  6. tangle    everything else: the inward default.
 */
export const FAMILY_THRESHOLDS = {
  // Calibrated 2026-09-09 against the real extraction distribution (103 mock
  // stars): Haiku's resolve clusters at 0.62-0.81 and charge at 0.28-0.58, so
  // the cuts sit at the observed tails, not at intuition. Resulting sky:
  // tangle 29% / field 20% / lattice 19% / radiance 17% / currents 8% / void 7%.
  voidVulnerability: 0.70, // above this (with sadness + stillness) → void
  voidCharge: 0.40,        // below this
  radianceCharge: 0.55,    // above this → radiance
  fieldConnection: 0.89,   // above this → field
  latticeResolve: 0.78,    // above this → lattice
  currentsResolve: 0.68,   // below this → currents
  currentsMemory: 0.24,    // temporality below this → currents
} as const;

export function resolveFamily(dims: FamilySource, seed: number): FamilySpec {
  const { resolve, charge, connection, temporality } = dims;

  // Pre-remap stars (no semantic axes yet) keep their classic look untouched.
  if (
    resolve === undefined || charge === undefined ||
    connection === undefined || temporality === undefined
  ) {
    return { family: 'tangle', type: 'spirograph' };
  }

  const T = FAMILY_THRESHOLDS;
  let family: FamilyName = 'tangle';
  if (dims.emotionIndex === 4 && dims.vulnerability > T.voidVulnerability && charge < T.voidCharge) {
    family = 'void';
  } else if (charge > T.radianceCharge) {
    family = 'radiance';
  } else if (connection > T.fieldConnection) {
    family = 'field';
  } else if (resolve > T.latticeResolve) {
    family = 'lattice';
  } else if (resolve < T.currentsResolve || temporality < T.currentsMemory) {
    family = 'currents';
  }

  const types = FAMILY_TYPES[family];
  const rand = mulberry32(seed ^ 0xfa311e5);
  return { family, type: types[Math.floor(rand() * types.length)] };
}

/** Debug/contact-sheet label, mirror of archetypeLabel. */
export function familyLabel(spec: FamilySpec): string {
  return spec.type === 'spirograph' ? spec.family : `${spec.family}/${spec.type}`;
}
