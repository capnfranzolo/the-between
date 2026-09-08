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

/**
 * Phase 7 — the sound of a world. Purely additive: these fields feed the
 * procedural ambient bed (src/lib/sound/), never the visuals. A world with no
 * `sound` block falls back to DEFAULT_WORLD_SOUND.
 */
export interface WorldSoundConfig {
  /** Tonal root of the world in Hz. Also the base every interaction sound is
   *  tuned from, so a chime is always in key with the sky it rings in. */
  droneHz: number;
  /** Semitones above the root for the drone's companion voice. */
  droneInterval: number;
  /** Lowpass cutoff (Hz) of the night-air noise — low reads as still and
   *  far away, higher as open and breezy. */
  airCutoff: number;
  /** Relative level of the air (0-1, scaled by the near-silent bed gain). */
  airLevel: number;
  /** Relative level of the drone (0-1). */
  droneLevel: number;
  /** Speed (Hz) of the slow breathing swell on the air. */
  breathHz: number;
}

export const DEFAULT_WORLD_SOUND: WorldSoundConfig = {
  droneHz: 55,        // A1 — the reference hour
  droneInterval: 7,   // a fifth
  airCutoff: 520,
  airLevel: 0.90,
  droneLevel: 0.80,
  breathHz: 0.055,
};

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
  /** Phase 7 — the world's ambient voice. Optional: absent means
   *  DEFAULT_WORLD_SOUND (see getWorldSound()). */
  sound?: WorldSoundConfig;
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
  sound: DEFAULT_WORLD_SOUND,
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
    sound: { droneHz: 61.74, droneInterval: 7, airCutoff: 620, airLevel: 1.00, droneLevel: 0.85, breathHz: 0.070 },
  },
  '00000000-0000-4000-8000-000000000003': { // "ordinary sacred" — cooler, deeper indigo, quieter stars
    skyStops: tintStops([100, 115, 215], 0.20),
    starDensity: 0.68, starFloor: 0.56,
    terrainGlow: 0.30,
    cloudTint: '110,110,195',
    gradLift: 0.19, gradSteep: 1.98, sunShift: 0.02,
    // deeper, stiller: G1 with an open fourth, air pulled well back
    sound: { droneHz: 49.00, droneInterval: 5, airCutoff: 380, airLevel: 0.75, droneLevel: 0.90, breathHz: 0.040 },
  },
  '00000000-0000-4000-8000-000000000004': { // "kindest thing witnessed" — golden, later dusk, warm terrain glow
    skyStops: tintStops([245, 172, 80], 0.24),
    starDensity: 0.78, starFloor: 0.66,
    terrainGlow: 0.66,
    cloudTint: '200,145,100',
    gradLift: 0.24, gradSteep: 1.72, sunShift: 0.11,
    // golden and major: C2 with a third above, the most open air of the six
    sound: { droneHz: 65.41, droneInterval: 4, airCutoff: 700, airLevel: 0.95, droneLevel: 0.75, breathHz: 0.065 },
  },
  '00000000-0000-4000-8000-000000000005': { // "after you're gone" — muted, near-night violet, sparse dim stars
    skyStops: tintStops([80, 60, 130], 0.18),
    starDensity: 0.60, starFloor: 0.50,
    terrainGlow: 0.24,
    cloudTint: '100,80,150',
    gradLift: 0.17, gradSteep: 2.08, sunShift: 0.01,
    // the lowest, slowest world: F1, almost no air, drone carries it alone
    sound: { droneHz: 43.65, droneInterval: 7, airCutoff: 300, airLevel: 0.60, droneLevel: 1.00, breathHz: 0.030 },
  },
  '00000000-0000-4000-8000-000000000006': { // "younger self surprised" — bright fresh dusk, most stars, airy
    skyStops: tintStops([150, 200, 220], 0.22),
    starDensity: 0.94, starFloor: 0.74,
    terrainGlow: 0.50,
    cloudTint: '155,160,190',
    gradLift: 0.27, gradSteep: 1.80, sunShift: 0.06,
    // brightest and airiest: D2 with a sixth above, quickest breath
    sound: { droneHz: 73.42, droneInterval: 9, airCutoff: 860, airLevel: 1.00, droneLevel: 0.65, breathHz: 0.080 },
  },
};

/** Returns the atmosphere for a question id, or the sane default for an
 *  unrecognized one. */
export function getAtmosphere(questionId: string | null | undefined): AtmosphereConfig {
  if (!questionId) return DEFAULT_ATMOSPHERE;
  return ATMOSPHERES[questionId] ?? DEFAULT_ATMOSPHERE;
}

/** Phase 7 — the ambient voice for a question id, with the sane default for
 *  an unrecognized one. */
export function getWorldSound(questionId: string | null | undefined): WorldSoundConfig {
  return getAtmosphere(questionId).sound ?? DEFAULT_WORLD_SOUND;
}
