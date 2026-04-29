'use client';
import { useState, useMemo, useEffect, useRef } from 'react';
import { BTW, SANS, withAlpha, mulberry32, hashString, warmthColor } from '@/lib/btw';
import TwilightSky from './TwilightSky';
import Terrain from './Terrain';
import AmbientField from './AmbientField';
import BondCurves, { CosmosBond } from './BondCurves';
import StarDetail, { CosmosStarData } from './StarDetail';
import ConnectionDrawer from './ConnectionDrawer';

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
    stars.forEach(s => { m[s.id] = { id: s.id, x: s.x, y: s.y, text: s.text }; });
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
          const dp = depthProps(t.depth);
          const isHov = hovered === t.id;
          const isSel = selected === t.id;
          const isActive = isHov || isSel;
          const dimmed = !!(active && !isActive);

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
                left: `${t.x * 100}%`,
                top: `${t.y * 100}%`,
                transform: `translate(-50%, -50%) scale(${isActive ? 1.18 : 1})`,
                opacity: dp.opacity * (dimmed ? 0.5 : 1),
                transition: 'transform .7s cubic-bezier(.2,.7,.3,1), opacity .5s',
                cursor: 'pointer',
                filter: isActive ? 'drop-shadow(0 0 22px rgba(240,200,120,0.45))' : undefined,
              }}
            >
              {/* Import Spirograph inline to avoid circular deps through StarRenderer */}
              <SpirographInline
                seed={t.id + ':' + t.text}
                size={dp.size}
                warmth={t.warmth}
                blur={isActive ? 0 : dp.blur}
                speedMul={t.depth === 0 ? 1 : 0.5}
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

function SpirographInline({ seed = 'between', size = 140, warmth = 0.5, blur = 0, speedMul = 1 }: {
  seed?: string; size?: number; warmth?: number; blur?: number; speedMul?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(performance.now());

  const params = useMemo(() => {
    const rng = mulberry32(hashString(seed));
    const lyr = 3 + Math.floor(rng() * 3);
    const ellipses = [];
    for (let i = 0; i < lyr; i++) {
      const aspect = rng();
      const rx = aspect < 0.5 ? 0.85 + rng() * 0.25 : 0.55 + rng() * 0.25;
      const ry = aspect < 0.5 ? 0.55 + rng() * 0.25 : 0.85 + rng() * 0.25;
      ellipses.push({ rx, ry, rot: (i / lyr) * Math.PI + rng() * 0.4, spin: (rng() - 0.5) * 0.6 });
    }
    return { ellipses };
  }, [seed]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    const W = size * 2, H = size * 2;
    el.width = W * dpr; el.height = H * dpr;
    el.style.width = W + 'px'; el.style.height = H + 'px';
    const ctx = el.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const baseColor = warmthColor(warmth);
    const draw = (now: number) => {
      const t = (now - startRef.current) / 1000;
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2;
      const haloR = size * 0.95;
      const grad = ctx.createRadialGradient(cx, cy, size * 0.1, cx, cy, haloR);
      grad.addColorStop(0, withAlpha(baseColor, 0.22));
      grad.addColorStop(0.5, withAlpha(baseColor, 0.07));
      grad.addColorStop(1, withAlpha(baseColor, 0));
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(cx, cy, haloR, 0, Math.PI * 2); ctx.fill();
      const masterRot = t * 0.18 * speedMul;
      const alphas = [0.85, 0.55, 0.32, 0.18, 0.10];
      const strokes = [1.4, 0.9, 0.6, 0.45, 0.35];
      for (let i = 0; i < params.ellipses.length; i++) {
        const e = params.ellipses[i];
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(e.rot + masterRot * (1 + e.spin * 0.4));
        ctx.strokeStyle = withAlpha(baseColor, (alphas[i] ?? 0.1));
        ctx.lineWidth = (strokes[i] ?? 0.3) * (size / 60);
        ctx.shadowColor = withAlpha(baseColor, 0.5); ctx.shadowBlur = i === 0 ? 6 : 0;
        ctx.beginPath(); ctx.ellipse(0, 0, size * 0.78 * e.rx, size * 0.78 * e.ry, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      ctx.shadowBlur = 0;
      const coreR = Math.max(1.2, size / 50);
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 5);
      cg.addColorStop(0, 'rgba(255,248,235,0.9)'); cg.addColorStop(0.4, withAlpha(baseColor, 0.4)); cg.addColorStop(1, withAlpha(baseColor, 0));
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, coreR * 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,250,240,1)'; ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, Math.PI * 2); ctx.fill();
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [size, warmth, params, speedMul]);

  return <canvas ref={ref} style={{ display: 'block', filter: blur ? `blur(${blur}px)` : undefined }} />;
}
