'use client';
import { useMemo } from 'react';
import { mulberry32, hashString } from '@/lib/btw';
import Spirograph from './SpirographSeed';

interface AmbientFieldProps {
  count?: number;
  seedBase?: string;
  maxSize?: number;
}

export default function AmbientField({ count = 5, seedBase = 'amb', maxSize = 100 }: AmbientFieldProps) {
  const items = useMemo(() => {
    const rng = mulberry32(hashString(seedBase));
    const arr = [];
    for (let i = 0; i < count; i++) {
      arr.push({
        seed: seedBase + ':' + i,
        x: rng(),
        y: rng() * 0.7,
        s: 0.35 + rng() * 0.65,
        warmth: rng(),
        blur: 4 + rng() * 8,
        speed: 0.4 + rng() * 0.6,
      });
    }
    return arr;
  }, [count, seedBase]);

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.55 }}>
      {items.map((it, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${it.x * 100}%`,
            top: `${it.y * 100}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <Spirograph
            seed={it.seed}
            size={maxSize * it.s}
            warmth={it.warmth}
            blur={it.blur}
            speedMul={it.speed}
          />
        </div>
      ))}
    </div>
  );
}
