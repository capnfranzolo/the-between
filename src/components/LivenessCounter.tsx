import { SANS, BTW } from '@/lib/btw';

interface LivenessCounterProps {
  thoughts: number;
  bonds: number;
}

// Phase 6 — a quiet corner counter, cosmos-wide (not per-question). Visually
// recessive: small, low-contrast, no chrome. Never competes with a star.
export default function LivenessCounter({ thoughts, bonds }: LivenessCounterProps) {
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 14px)',
        right: 16,
        zIndex: 1,
        fontFamily: SANS,
        fontSize: 10,
        letterSpacing: '0.1em',
        color: BTW.textDim,
        opacity: 0.5,
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {thoughts.toLocaleString()} thoughts · {bonds.toLocaleString()} bonds
    </div>
  );
}
