// Per-question atmosphere variants — Phase 4 ("Six skies you can feel").
//
// The twilight sunset world (sky dome gradient, terrain silhouette, star
// field, clouds) is sacred and lives in CosmosScene.tsx. This file only
// supplies the *parameters* that scene's existing shaders/materials already
// accept — no new shaders, no replacing the look. Every world below is the
// same base gradient (BASE_STOPS) nudged toward a tint, plus small shifts to
// star density/floor, terrain glow, cloud tint, and sky-dome shape. Same
// world, different hour of twilight.

export interface SkyStop {
  offset: number;
  color: string;
}

export interface AtmosphereConfig {
  /** Sky dome gradient stops (horizon → zenith), t = 0..1. */
  skyStops: SkyStop[];
  /** Background star field density and flicker floor. */
  starDensity: number;
  starFloor: number;
  /** Terrain silhouette warmth: 0 = near-black, 1 = warm amber. */
  terrainGlow: number;
  /** Cloud tint base color as an "r,g,b" string (0-255 each). */
  cloudTint: string;
  /** Sky-dome shape — subtle shifts read as a different hour of twilight. */
  gradLift: number;
  gradSteep: number;
  sunShift: number;
}

// The sacred base gradient — exactly the stops CosmosScene has always used.
// Every world is this same family, nudged toward a tint; the zenith stays
// anchored near-black so the sky never stops reading as night.
const BASE_STOPS: SkyStop[] = [
  { offset: 0.000, color: '#d2a480' },
  { offset: 0.025, color: '#b27f7e' },
  { offset: 0.055, color: '#93637f' },
  { offset: 0.085, color: '#7d5784' },
  { offset: 0.140, color: '#5a4177' },
  { offset: 0.230, color: '#443469' },
  { offset: 0.360, color: '#352a5c' },
  { offset: 0.510, color: '#2a214e' },
  { offset: 0.680, color: '#1e1a40' },
  { offset: 0.820, color: '#120e30' },
  { offset: 0.920, color: '#07051e' },
  { offset: 1.000, color: '#000000' },
];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Nudges the sacred base gradient toward `tint`, strongest near the horizon
 *  (offset 0) and fading out by mid-sky, so the deep-space zenith black stays
 *  put and only the "hour of twilight" shifts. */
function tintStops(tint: [number, number, number], strength: number): SkyStop[] {
  return BASE_STOPS.map(s => {
    const [r, g, b] = hexToRgb(s.color);
    const w = strength * Math.max(0, 1 - s.offset * 1.6);
    return {
      offset: s.offset,
      color: rgbToHex(r + (tint[0] - r) * w, g + (tint[1] - g) * w, b + (tint[2] - b) * w),
    };
  });
}

export const DEFAULT_ATMOSPHERE: AtmosphereConfig = {
  skyStops: BASE_STOPS,
  starDensity: 0.80,
  starFloor: 0.65,
  terrainGlow: 0.46,
  cloudTint: '140,100,170',
  gradLift: 0.22,
  gradSteep: 1.85,
  sunShift: 0.05,
};

// Keyed by the seeded question ids (00000000-0000-4000-8000-00000000000{1..6}).
// A question id not in this map (e.g. future content) falls back to the
// default — see getAtmosphere().
export const ATMOSPHERES: Record<string, AtmosphereConfig> = {
  '00000000-0000-4000-8000-000000000001': DEFAULT_ATMOSPHERE, // "what do you know is true" — the reference hour
  '00000000-0000-4000-8000-000000000002': { // "what feels like home" — warmer, rosier dusk, denser stars
    skyStops: tintStops([232, 150, 120], 0.22),
    starDensity: 0.90, starFloor: 0.70,
    terrainGlow: 0.60,
    cloudTint: '190,125,135',
    gradLift: 0.25, gradSteep: 1.76, sunShift: 0.09,
    // warmer air, a step up the scale (B1), fifth above — closer, breathing
  },
  '00000000-0000-4000-8000-000000000003': { // "ordinary sacred" — cooler, deeper indigo, quieter stars
    skyStops: tintStops([100, 115, 215], 0.20),
    starDensity: 0.68, starFloor: 0.56,
    terrainGlow: 0.30,
    cloudTint: '110,110,195',
    gradLift: 0.19, gradSteep: 1.98, sunShift: 0.02,
    // deeper, stiller: G1 with an open fourth, air pulled well back
  },
  '00000000-0000-4000-8000-000000000004': { // "kindest thing witnessed" — golden, later dusk, warm terrain glow
    skyStops: tintStops([245, 172, 80], 0.24),
    starDensity: 0.78, starFloor: 0.66,
    terrainGlow: 0.66,
    cloudTint: '200,145,100',
    gradLift: 0.24, gradSteep: 1.72, sunShift: 0.11,
    // golden and major: C2 with a third above, the most open air of the six
  },
  '00000000-0000-4000-8000-000000000005': { // "after you're gone" — muted, near-night violet, sparse dim stars
    skyStops: tintStops([80, 60, 130], 0.18),
    starDensity: 0.60, starFloor: 0.50,
    terrainGlow: 0.24,
    cloudTint: '100,80,150',
    gradLift: 0.17, gradSteep: 2.08, sunShift: 0.01,
    // the lowest, slowest world: F1, almost no air, drone carries it alone
  },
  '00000000-0000-4000-8000-000000000006': { // "younger self surprised" — bright fresh dusk, most stars, airy
    skyStops: tintStops([150, 200, 220], 0.22),
    starDensity: 0.94, starFloor: 0.74,
    terrainGlow: 0.50,
    cloudTint: '155,160,190',
    gradLift: 0.27, gradSteep: 1.80, sunShift: 0.06,
    // brightest and airiest: D2 with a sixth above, quickest breath
  },
};

/** Returns the atmosphere for a question id, or the sane default for an
 *  unrecognized one. */
export function getAtmosphere(questionId: string | null | undefined): AtmosphereConfig {
  if (!questionId) return DEFAULT_ATMOSPHERE;
  return ATMOSPHERES[questionId] ?? DEFAULT_ATMOSPHERE;
}

