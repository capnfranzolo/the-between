import type { Dimensions } from '../dimensions/types';
import type { SpirographParams } from './types';

export function dimensionsToParams(dims: Dimensions): SpirographParams {
  return {
    warmth: dims.warmth,
    layers: Math.round(3 + dims.vulnerability * 2),
    speedMul: 0.6 + dims.tension * 0.8,
  };
}
