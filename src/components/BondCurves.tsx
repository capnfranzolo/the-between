'use client';
import { BTW, withAlpha } from '@/lib/btw';
import { SERIF, SANS } from '@/lib/btw';

export interface CosmosBond {
  id: string;
  from_id: string;
  to_id: string;
  reason: string;
}

interface StarPos {
  id: string;
  x: number;
  y: number;
  text: string;
}

interface HoveredBond {
  idx: number;
  bond: CosmosBond;
  xPct: number;
  yPct: number;
}

interface BondCurvesProps {
  bonds: CosmosBond[];
  starPositions: Record<string, StarPos>;
  hoveredBond: HoveredBond | null;
  onBondEnter: (info: HoveredBond) => void;
  onBondLeave: () => void;
  VBW?: number;
  VBH?: number;
}

export default function BondCurves({
  bonds,
  starPositions,
  hoveredBond,
  onBondEnter,
  onBondLeave,
  VBW = 1280,
  VBH = 760,
}: BondCurvesProps) {
  const px = (id: string) => {
    const s = starPositions[id];
    return s ? { x: s.x * VBW, y: s.y * VBH } : null;
  };

  return (
    <>
      <svg
        viewBox={`0 0 ${VBW} ${VBH}`}
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none', width: '100%', height: '100%' }}
      >
        <defs>
          <filter id="bondGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        {bonds.map((bo, i) => {
          const a = px(bo.from_id), b = px(bo.to_id);
          if (!a || !b) return null;
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2 - 28;
          const isBondHover = hoveredBond?.idx === i;
          const dimmed = hoveredBond && !isBondHover;
          const lit = isBondHover;
          const stroke = lit ? BTW.horizon[3] : withAlpha(BTW.textPri, 0.55);

          return (
            <g key={bo.id} opacity={dimmed ? 0.12 : lit ? 0.95 : 0.45}>
              {lit && (
                <path
                  d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
                  fill="none"
                  stroke={BTW.horizon[3]}
                  strokeWidth="6"
                  filter="url(#bondGlow)"
                  opacity="0.5"
                />
              )}
              <path
                d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
                fill="none"
                stroke={stroke}
                strokeWidth={lit ? 1.4 : 0.9}
                strokeDasharray={lit ? '0' : '3 6'}
              />
              <path
                d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
                fill="none"
                stroke="transparent"
                strokeWidth="14"
                style={{ pointerEvents: 'stroke', cursor: 'help' }}
                onMouseEnter={() =>
                  onBondEnter({
                    idx: i,
                    bond: bo,
                    xPct: (mx / VBW) * 100,
                    yPct: (my / VBH) * 100,
                  })
                }
                onMouseLeave={onBondLeave}
              />
            </g>
          );
        })}
      </svg>

      {hoveredBond && (() => {
        const bo = hoveredBond.bond;
        const A = starPositions[bo.from_id];
        const B = starPositions[bo.to_id];
        if (!A || !B) return null;
        return (
          <div
            style={{
              position: 'absolute',
              left: `${hoveredBond.xPct}%`,
              top: `${hoveredBond.yPct}%`,
              transform: 'translate(-50%, calc(-100% - 14px))',
              maxWidth: 320, minWidth: 220,
              padding: '14px 16px',
              background: 'rgba(20, 16, 36, 0.92)',
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
              border: `1px solid ${withAlpha(BTW.horizon[3], 0.45)}`,
              borderRadius: 14,
              color: BTW.textPri,
              zIndex: 5,
              pointerEvents: 'none',
              boxShadow: `0 12px 40px ${withAlpha(BTW.horizon[3], 0.25)}`,
              animation: 'btwRise .25s cubic-bezier(.2,.7,.3,1)',
            }}
          >
            <div style={{ fontSize: 10, letterSpacing: '0.32em', textTransform: 'uppercase', color: BTW.horizon[3], opacity: 0.9, marginBottom: 8 }}>
              bond
            </div>
            <div style={{ fontFamily: SERIF, fontSize: 17, lineHeight: 1.4, color: BTW.textPri }}>
              "{bo.reason}"
            </div>
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${withAlpha(BTW.textPri, 0.12)}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[A, B].map(s => (
                <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <div style={{
                    flexShrink: 0, width: 6, height: 6, borderRadius: '50%',
                    background: BTW.horizon[3], boxShadow: `0 0 6px ${BTW.horizon[3]}`,
                    transform: 'translateY(-1px)',
                  }} />
                  <div style={{ fontFamily: SERIF, fontSize: 13, lineHeight: 1.45, color: BTW.textSec }}>
                    "{s.text}"
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </>
  );
}
