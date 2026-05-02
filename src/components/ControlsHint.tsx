'use client';
import { useState, useEffect } from 'react';
import { BTW, SERIF, SANS, withAlpha } from '@/lib/btw';

const HINT_KEY = 'btw_controls_seen';

interface ControlsHintProps {
  /** Pass true to trigger the hint; it shows once and then sets the seen flag */
  trigger: boolean;
  onDone: () => void;
}

// A single illustrated keyboard key
function Key({ label, wide, sub }: { label: string; wide?: boolean; sub?: string }) {
  return (
    <div style={{
      display: 'inline-flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      width: wide ? 56 : 36,
      height: 36,
      background: 'rgba(240,232,224,0.07)',
      border: `1px solid ${withAlpha(BTW.textPri, 0.30)}`,
      borderBottom: `3px solid ${withAlpha(BTW.textPri, 0.22)}`,
      borderRadius: 6,
      fontFamily: SANS,
      fontSize: sub ? 9 : 12,
      fontWeight: 600,
      color: BTW.textPri,
      letterSpacing: '0.02em',
      lineHeight: 1.1,
      userSelect: 'none',
      flexShrink: 0,
    }}>
      {sub && <span style={{ fontSize: 7, opacity: 0.5, marginBottom: 1 }}>{sub}</span>}
      {label}
    </div>
  );
}

// A row of keys with optional label
function KeyRow({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ display: 'flex', gap: 4 }}>{children}</div>
      {label && (
        <span style={{
          marginLeft: 8,
          fontFamily: SANS,
          fontSize: 11,
          color: BTW.textDim,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}>
          {label}
        </span>
      )}
    </div>
  );
}

export default function ControlsHint({ trigger, onDone }: ControlsHintProps) {
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in');

  useEffect(() => {
    if (!trigger) return;
    if (typeof localStorage !== 'undefined' && localStorage.getItem(HINT_KEY)) {
      onDone();
      return;
    }
    setVisible(true);
    setPhase('in');
    // Auto-dismiss after 5s
    const holdTimer = setTimeout(() => setPhase('out'), 5000);
    const doneTimer = setTimeout(() => {
      if (typeof localStorage !== 'undefined') localStorage.setItem(HINT_KEY, '1');
      setVisible(false);
      onDone();
    }, 5500);
    return () => { clearTimeout(holdTimer); clearTimeout(doneTimer); };
  }, [trigger]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = () => {
    setPhase('out');
    if (typeof localStorage !== 'undefined') localStorage.setItem(HINT_KEY, '1');
    setTimeout(() => { setVisible(false); onDone(); }, 400);
  };

  if (!visible) return null;

  return (
    <div
      onClick={dismiss}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        opacity: phase === 'out' ? 0 : 1,
        transition: 'opacity .4s ease',
        cursor: 'pointer',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'rgba(14,10,32,0.94)',
          border: `1px solid ${withAlpha(BTW.textPri, 0.14)}`,
          borderRadius: 20,
          padding: '32px 36px',
          maxWidth: 420,
          width: '90%',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          transform: phase === 'out' ? 'translateY(12px)' : 'translateY(0)',
          transition: 'transform .4s ease',
          animation: 'btwRise .4s cubic-bezier(.2,.8,.3,1)',
        }}
      >
        {/* Title */}
        <div style={{
          fontFamily: SERIF,
          fontStyle: 'italic',
          fontSize: 18,
          color: BTW.textPri,
          textAlign: 'center',
          opacity: 0.85,
        }}>
          Navigating the cosmos
        </div>

        {/* Key grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* WASD row */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
            {/* Top row: W / ↑ */}
            <div style={{ display: 'flex', gap: 8, marginLeft: 40 }}>
              <Key label="W" sub="↑" />
              <Key label="↑" />
            </div>
            {/* Middle row: A S D / ← ↓ → */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                <Key label="A" sub="←" />
                <Key label="S" sub="↓" />
                <Key label="D" sub="→" />
              </div>
              <span style={{ color: BTW.textDim, opacity: 0.4, fontSize: 12 }}>/</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <Key label="←" />
                <Key label="↓" />
                <Key label="→" />
              </div>
              <span style={{ marginLeft: 8, fontFamily: SANS, fontSize: 11, color: BTW.textDim, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                turn &amp; move
              </span>
            </div>
          </div>

          {/* Q E row */}
          <KeyRow label="slide left / right">
            <Key label="Q" />
            <Key label="E" />
          </KeyRow>

          {/* Space */}
          <KeyRow label="boost">
            <Key label="Space" wide />
          </KeyRow>
        </div>

        {/* Divider + click instruction */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          borderTop: `1px solid ${withAlpha(BTW.textPri, 0.10)}`,
          paddingTop: 16,
        }}>
          <div style={{
            fontFamily: SERIF,
            fontStyle: 'italic',
            fontSize: 22,
            color: BTW.horizon[3],
            opacity: 0.9,
            flexShrink: 0,
          }}>
            ✦
          </div>
          <div style={{
            fontFamily: SERIF,
            fontStyle: 'italic',
            fontSize: 17,
            color: BTW.textPri,
            lineHeight: 1.4,
          }}>
            click a star to read it
          </div>
        </div>

        {/* Dismiss hint */}
        <div style={{
          textAlign: 'center',
          fontFamily: SANS,
          fontSize: 10,
          color: BTW.textDim,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          opacity: 0.5,
        }}>
          click anywhere to dismiss
        </div>
      </div>
    </div>
  );
}
