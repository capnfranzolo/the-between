'use client';
import { useEffect, useRef, useState } from 'react';
import { BTW, SERIF, SANS, withAlpha } from '@/lib/btw';
import { MAX_REASON_LENGTH, MIN_REASON_LENGTH } from '@/lib/constants';

interface ConnectionDrawerProps {
  reason: string;
  onChange: (val: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

export default function ConnectionDrawer({ reason, onChange, onCancel, onSubmit }: ConnectionDrawerProps) {
  const ready = reason.trim().length >= MIN_REASON_LENGTH;
  // Extra bottom offset so the drawer sits above the software keyboard
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Track the visual viewport (software keyboard shrinks it)
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      // How much the keyboard pushes the viewport up from the bottom of the layout viewport
      const pushed = window.innerHeight - vv.height - vv.offsetTop;
      setKeyboardOffset(Math.max(0, pushed));
    };

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return (
    <div
      onClick={e => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: '50%',
        bottom: keyboardOffset > 0
          ? keyboardOffset + 8   // sit just above keyboard
          : 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
        transform: 'translateX(-50%)',
        width: 'min(640px, 94%)',
        background: 'rgba(20,14,40,0.82)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        border: `1px solid ${withAlpha(BTW.horizon[3], 0.4)}`,
        borderRadius: 18,
        padding: '20px 20px calc(env(safe-area-inset-bottom, 0px) + 20px)',
        color: BTW.textPri,
        zIndex: 7,
        pointerEvents: 'auto',
        transition: 'bottom .15s ease-out',
        animation: 'btwRise .35s cubic-bezier(.2,.8,.3,1)',
      }}
    >
      <div style={{ fontFamily: SERIF, fontSize: 20, color: BTW.textPri, marginBottom: 14 }}>
        Why do these belong together?
      </div>

      {/* Textarea — ≥16px prevents iOS auto-zoom; grows up to ~4 lines */}
      <textarea
        ref={inputRef}
        value={reason}
        onChange={e => onChange(e.target.value.slice(0, MAX_REASON_LENGTH))}
        autoFocus
        rows={2}
        placeholder="Because they're both about…"
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && ready) { e.preventDefault(); onSubmit(); } }}
        style={{
          width: '100%',
          background: 'rgba(240,232,224,0.06)',
          border: `1px solid ${withAlpha(BTW.textPri, 0.25)}`,
          borderRadius: 12,
          color: BTW.textPri,
          fontFamily: SERIF,
          fontSize: 19,
          lineHeight: 1.4,
          padding: '14px 16px',
          outline: 'none',
          boxSizing: 'border-box',
          resize: 'none',
          // Minimum 44px touch target height
          minHeight: 52,
        }}
      />

      <div style={{ fontSize: 12, color: BTW.textDim, letterSpacing: '0.1em', marginTop: 6, textAlign: 'right' }}>
        {reason.length}/{MAX_REASON_LENGTH}
      </div>

      {/* Full-width primary CTA, then cancel below */}
      <button
        onClick={onSubmit}
        disabled={!ready}
        style={{
          marginTop: 10,
          width: '100%',
          background: ready ? withAlpha(BTW.horizon[3], 0.22) : 'rgba(240,232,224,0.04)',
          border: `1px solid ${withAlpha(BTW.horizon[3], ready ? 0.7 : 0.2)}`,
          color: ready ? BTW.horizon[3] : BTW.textDim,
          // 48px height — comfortable thumb tap target
          padding: '14px 20px',
          minHeight: 48,
          borderRadius: 999,
          fontSize: 13, fontWeight: 500, letterSpacing: '0.1em',
          textTransform: 'uppercase',
          cursor: ready ? 'pointer' : 'default',
          fontFamily: SANS, transition: 'all .25s',
        }}
      >
        Bind them
      </button>

      <button
        onClick={onCancel}
        style={{
          marginTop: 8,
          width: '100%',
          background: 'transparent',
          border: 'none',
          color: BTW.textDim,
          padding: '10px 18px',
          minHeight: 44,
          borderRadius: 999,
          fontSize: 12, letterSpacing: '0.1em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          fontFamily: SANS,
        }}
      >
        Cancel
      </button>
    </div>
  );
}
