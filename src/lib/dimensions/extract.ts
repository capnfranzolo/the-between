import type { Dimensions } from './types';

export async function extractDimensions(_answer: string): Promise<Dimensions> {
  return {
    certainty: 0.6,
    warmth: 0.5,
    tension: 0.4,
    vulnerability: 0.7,
    scope: 0.3,
    rootedness: 0.5,
  };
}
