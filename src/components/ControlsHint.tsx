'use client';
import { useState, useEffect, useRef } from 'react';
import { SERIF } from '@/lib/btw';

const HINT_KEY  = 'btw_controls_v2';
const STYLE_ID  = 'btw-controls-css';

// Inject keyframes once
function ensureCSS() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    @keyframes btwKeyIn {
      from { opacity:0; transform:translateY(8px); }
      to   { opacity:1; transform:translateY(0); }
    }
    @keyframes btwKeyOut {
      0%   { opacity: var(--key-op,0.9); transform: translate(0,0) scale(1);   filter:blur(0px); }
      100% { opacity: 0;                 transform: translate(var(--kx),var(--ky)) scale(0.6); filter:blur(6px); }
    }
  `;
  document.head.appendChild(s);
}

interface FloatKeyProps {
  label: string;
  arrow: string;
  driftX: number;
  driftY: number;
  delay: number;
  dispersing: boolean;
  opacity: number;
}

function FloatKey({ label, arrow, driftX, driftY, delay, dispersing, opacity }: FloatKeyProps) {
  const outStyle: React.CSSProperties = dispersing ? {
    '--kx': `${driftX}px`,
    '--ky': `${driftY}px`,
    '--key-op': String(opacity),
    animation: `btwKeyOut 1.6s ease-out ${delay}ms forwards`,
  } as React.CSSProperties : {};

  return (
    <div style={{
      width: 42, height: 42,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'rgba(255,255,255,0.08)',
      border: '1.5px solid rgba(255,255,255,0.55)',
      borderBottom: '3px solid rgba(255,255,255,0.28)',
      borderRadius: 8,
      color: 'rgba(255,255,255,0.90)',
      userSelect: 'none',
      gap: 1,
      opacity,
      animation: dispersing ? undefined : 'btwKeyIn .4s ease-out forwards',
      ...outStyle,
    }}>
      <span style={{ fontSize: 11, lineHeight: 1, opacity: 0.55 }}>{arrow}</span>
      <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1, fontFamily: 'system-ui,sans-serif' }}>{label}</span>
    </div>
  );
}

export default function ControlsHint({ trigger, onDone }: { trigger: boolean; onDone: () => void }) {
  const [phase, setPhase] = useState<'hidden' | 'visible' | 'dispersing'>('hidden');
  // Random drift values, computed once on mount
  const drifts = useRef<Array<{ x: number; y: number; delay: number }>>([]);

  useEffect(() => {
    if (!trigger) return;
    if (typeof localStorage !== 'undefined' && localStorage.getItem(HINT_KEY)) {
      onDone(); return;
    }
    ensureCSS();

    // Pre-compute random drift per element (4 keys + 1 text = 5 elements)
    drifts.current = Array.from({ length: 5 }, (_, i) => {
      const angle = (Math.random() * Math.PI * 2);
      const dist  = 70 + Math.random() * 80;
      return {
        x: Math.round(Math.cos(angle) * dist),
        y: Math.round(Math.sin(angle) * dist - 30), // bias upward
        delay: Math.round(i * 90 + Math.random() * 120),
      };
    });

    setPhase('visible');
    const disperseTimer = setTimeout(() => setPhase('dispersing'), 6500);
    const doneTimer     = setTimeout(() => {
      if (typeof localStorage !== 'undefined') localStorage.setItem(HINT_KEY, '1');
      setPhase('hidden');
      onDone();
    }, 8400);

    return () => { clearTimeout(disperseTimer); clearTimeout(doneTimer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  if (phase === 'hidden') return null;

  const dispersing = phase === 'dispersing';
  const d = drifts.current;

  // Text drift
  const textOut: React.CSSProperties = dispersing ? {
    '--kx': `${d[4]?.x ?? 0}px`,
    '--ky': `${d[4]?.y ?? -60}px`,
    '--key-op': '0.75',
    animation: `btwKeyOut 1.6s ease-out ${d[4]?.delay ?? 300}ms forwards`,
  } as React.CSSProperties : {};

  return (
    <div style={{
      position: 'fixed',
      top: '38%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: 12,
      pointerEvents: 'none',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
    }}>
      {/* W key (top row, centered) */}
      <FloatKey label="W" arrow="↑" driftX={d[0]?.x ?? -40} driftY={d[0]?.y ?? -80} delay={d[0]?.delay ?? 0} dispersing={dispersing} opacity={0.9} />

      {/* A S D row */}
      <div style={{ display: 'flex', gap: 6 }}>
        <FloatKey label="A" arrow="←" driftX={d[1]?.x ?? -80} driftY={d[1]?.y ?? 30}  delay={d[1]?.delay ?? 60}  dispersing={dispersing} opacity={0.9} />
        <FloatKey label="S" arrow="↓" driftX={d[2]?.x ?? 10}  driftY={d[2]?.y ?? 80}  delay={d[2]?.delay ?? 120} dispersing={dispersing} opacity={0.9} />
        <FloatKey label="D" arrow="→" driftX={d[3]?.x ?? 80}  driftY={d[3]?.y ?? 20}  delay={d[3]?.delay ?? 180} dispersing={dispersing} opacity={0.9} />
      </div>

      {/* "Click any star." */}
      <div style={{
        marginTop: 12,
        fontFamily: SERIF,
        fontStyle: 'italic',
        fontSize: 21,
        color: 'rgba(255,255,255,0.82)',
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
        opacity: 0.82,
        animation: dispersing ? undefined : 'btwKeyIn .5s ease-out 200ms both',
        ...textOut,
      }}>
        Click any star.
      </div>
    </div>
  );
}
