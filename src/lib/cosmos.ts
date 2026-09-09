import { mulberry32, hashString } from './btw';

/** A bond between two stars. Relocated here from the retired `BondCurves`
 *  component (Phase 9 sweep) — the component was dead, but this shape is
 *  still the shared bond type for both cosmos pages. */
export interface CosmosBond {
  id: string;
  from_id: string;
  to_id: string;
  reason: string;
}

export function starWorldPos(shortcode: string): { x: number; y: number; z: number } {
  const rand = mulberry32(hashString(shortcode));
  const x = (rand() - 0.5) * 1000;
  const z = (rand() - 0.5) * 1000;
  const y = 80 + rand() * 60;
  return { x, y, z };
}
