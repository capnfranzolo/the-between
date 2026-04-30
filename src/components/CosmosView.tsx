'use client';
import { useState, useMemo, useEffect } from 'react';
import { BTW, SANS, withAlpha } from '@/lib/btw';
import TwilightSky from './TwilightSky';
import Terrain from './Terrain';
import AmbientField from './AmbientField';
import BondCurves, { CosmosBond } from './BondCurves';
import StarDetail, { CosmosStarData } from './StarDetail';
import ConnectionDrawer from './ConnectionDrawer';
import Spirograph from './Spirograph';
import { EMOTIONS } from '@/lib/spirograph/renderer';

interface CosmosViewProps {
  stars: CosmosStarData[];
  bonds: CosmosBond[];
  questionId: string;
}

interface HoveredBond {
  idx: number;
  bond: CosmosBond;
  xPct: number;
  yPct: number;
}

const depthProps = (d: number) => {
  if (d === 0) return { size: 92, blur: 0, opacity: 1.0 };
  if (d === 1) return { size: 60, blur: 1.2, opacity: 0.88 };
  return { size: 30, blur: 4, opacity: 0.65 };
};

export default function CosmosView({ stars: initialStars, bonds: initialBonds, questionId }: CosmosViewProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hoveredBond, setHoveredBond] = useState<HoveredBond | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [reason, setReason] = useState('');
  const [bonds, setBonds] = useState<CosmosBond[]>(initialBonds);
  const [myShortcode, setMyShortcode] = useState<string | null>(null);

  useEffect(() => {
    setMyShortcode(sessionStorage.getItem('my_star'));
  }, []);

  const stars = useMemo(() => {
    if (!myShortcode) return initialStars;
    return initialStars.map(s => ({ ...s, mine: s.shortcode === myShortcode }));
  }, [initialStars, myShortcode]);

  const byId = useMemo(() => {
    const m: Record<string, CosmosStarData> = {};
    stars.forEach(s => { m[s.id] = s; });
    return m;
  }, [stars]);

  const starPositions = useMemo(() => {
    const m: Record<string, { id: string; x: number; y: number; text: string }> = {};
    stars.forEach(s => { m[s.id] = { id: s.id, x: s.x ?? 0, y: s.y ?? 0, text: s.text }; });
    return m;
  }, [stars]);

  const active = hovered || selected;
  const activeT = active ? byId[active] : null;
  const hasMyStar = !!myShortcode;

  const handleConnect = async (targetId: string) => {
    if (!myShortcode || reason.trim().length < 4) return;
    const newBond: CosmosBond = {
      id: 'local-' + Date.now(),
      from_id: myShortcode,
      to_id: targetId,
      reason: reason.trim(),
    };
    try {
      await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_shortcode: myShortcode, to_star_id: targetId, reason: reason.trim(), question_id: questionId }),
      });
    } catch { /* optimistic */ }
    setBonds(b => [...b, newBond]);
    setReason('');
    setConnecting(false);
    setSelected(targetId);
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden', fontFamily: SANS, color: BTW.textPri }}>
      <TwilightSky>
        <AmbientField count={6} seedBase="cosmos-bg" maxSize={50} />
        <Terrain height={140} />
      </TwilightSky>

      <BondCurves
        bonds={bonds}
        starPositions={starPositions}
        hoveredBond={hoveredBond}
        onBondEnter={setHoveredBond}
        onBondLeave={() => setHoveredBond(null)}
      />

      {/* background click clears selection */}
      <div
        onClick={() => { setSelected(null); setConnecting(false); setReason(''); }}
        style={{ position: 'absolute', inset: 0, zIndex: 1 }}
      />

      {/* Stars */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 3 }}>
        {stars.map(t => {
          const dp = depthProps(t.depth ?? 0);
          const isHov = hovered === t.id;
          const isSel = selected === t.id;
          const isActive = isHov || isSel;
          const dimmed = !!(active && !isActive);
          const emotionRGB = EMOTIONS[t.dimensions.emotionIndex]?.rgb ?? [255, 255, 255];
          const emotionColor = `rgb(${emotionRGB[0]},${emotionRGB[1]},${emotionRGB[2]})`;

          return (
            <div
              key={t.id}
              onMouseEnter={() => setHovered(t.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={e => {
                e.stopPropagation();
                setSelected(t.id);
                setConnecting(false);
                setReason('');
              }}
              style={{
                position: 'absolute',
                left: `${(t.x ?? 0) * 100}%`,
                top: `${(t.y ?? 0) * 100}%`,
                transform: `translate(-50%, -50%) scale(${isActive ? 1.18 : 1})`,
                opacity: dp.opacity * (dimmed ? 0.5 : 1),
                transition: 'transform .7s cubic-bezier(.2,.7,.3,1), opacity .5s',
                cursor: 'pointer',
                filter: isActive ? `drop-shadow(0 0 22px ${withAlpha(emotionColor, 0.45)})` : undefined,
              }}
            >
              <Spirograph
                dimensions={t.dimensions}
                size={dp.size}
                animate={(t.depth ?? 0) < 2}
                style={{ filter: dp.blur && !isActive ? `blur(${dp.blur}px)` : undefined }}
              />
              {t.mine && (
                <div style={{
                  position: 'absolute', top: -22, left: '50%',
                  transform: 'translateX(-50%)',
                  fontSize: 10, letterSpacing: '0.32em', textTransform: 'uppercase',
                  color: BTW.horizon[3],
                  textShadow: '0 0 10px rgba(240,200,120,0.6)',
                  whiteSpace: 'nowrap',
                }}>
                  yours
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Top chrome */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        padding: '22px 30px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        zIndex: 5, pointerEvents: 'none',
      }}>
        <div style={{ fontSize: 12, letterSpacing: '0.34em', textTransform: 'uppercase', color: BTW.textDim, fontFamily: SANS }}>
          The Between · cosmos
        </div>
        <div style={{ fontSize: 12, color: BTW.textDim, fontFamily: SANS, letterSpacing: '0.1em' }}>
          {stars.length} stars · {bonds.length} bonds
        </div>
      </div>

      {/* Bottom hint */}
      {!active && !connecting && (
        <div style={{
          position: 'absolute', left: '50%', bottom: 28,
          transform: 'translateX(-50%)',
          fontFamily: SANS, fontSize: 13, color: BTW.textDim,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          zIndex: 4, pointerEvents: 'none',
        }}>
          hover a star to read it · click to pin
        </div>
      )}

      {/* Detail card */}
      {activeT && !connecting && (
        <StarDetail
          star={activeT}
          hasMystar={hasMyStar}
          onConnect={() => setConnecting(true)}
        />
      )}

      {/* Connection drawer */}
      {connecting && activeT && (
        <ConnectionDrawer
          reason={reason}
          onChange={setReason}
          onCancel={() => { setConnecting(false); setReason(''); }}
          onSubmit={() => handleConnect(activeT.id)}
        />
      )}

      <style>{`
        @keyframes btwRise {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}
