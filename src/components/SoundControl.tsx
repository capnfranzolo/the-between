'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { BTW, SANS } from '@/lib/btw';
import { sound, installSoundDebugHandle } from '@/lib/sound';

/**
 * Phase 7 — the entire visible surface of sound.
 *
 * First arrival gets one quiet pill: "sound?" with a dismiss. Whatever they
 * choose is remembered, and afterwards all that remains is a 16 px glyph in
 * the same spot — small enough to ignore forever, findable when wanted.
 *
 * The choice is read from localStorage after mount (never during render) so
 * the server and client agree on the first paint.
 */
export default function SoundControl() {
  const [visible, setVisible] = useState(false);

  // The stored choice is unknowable during SSR, so the server snapshot is
  // always 'unset' and React re-renders with the real one after hydration —
  // no mismatch, and no flash (the invitation starts fully transparent).
  const pref = useSyncExternalStore(
    sound.subscribe,
    () => sound.getPreference(),
    () => 'unset' as const,
  );

  useEffect(() => {
    installSoundDebugHandle();
    sound.attach();
    // The invitation fades in a beat after arrival — the sky gets the first
    // moment to itself (and, on a first visit, the scripted intro's opening).
    const t = window.setTimeout(() => setVisible(true), 2200);
    return () => { window.clearTimeout(t); sound.detach(); };
  }, []);

  // Both states share one anchor, so answering the invitation reads as the
  // pill collapsing into a glyph rather than a control moving. The band sits
  // above the bottom controls and below the sky rail, clear of both.
  const shell: React.CSSProperties = {
    position: 'fixed',
    right: 20,
    bottom: 'calc(env(safe-area-inset-bottom, 0px) + 58px)',
    zIndex: 0,          // above the canvas, below any open panel — like the "+"
    pointerEvents: 'auto',
    fontFamily: SANS,
  };

  // ── The invitation — first arrival only ────────────────────────────────────
  if (pref === 'unset') {
    return (
      <div
        data-btw-sound-control=""
        style={{
          ...shell,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          border: '1px solid rgba(240,232,224,0.14)',
          borderRadius: 999,
          background: 'transparent',
          opacity: visible ? 1 : 0,
          transition: 'opacity 1.4s ease',
        }}
      >
        <button
          onClick={() => sound.enable()}
          title="Turn sound on"
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: BTW.textDim,
            fontFamily: SANS, fontSize: 10,
            letterSpacing: '0.24em', textTransform: 'uppercase',
            padding: '9px 4px 9px 15px',
            touchAction: 'manipulation',
            transition: 'color .25s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = BTW.textPri; }}
          onMouseLeave={e => { e.currentTarget.style.color = BTW.textDim; }}
        >
          sound?
        </button>
        <span aria-hidden style={{ width: 1, height: 12, background: 'rgba(240,232,224,0.14)' }} />
        <button
          onClick={() => sound.disable()}
          aria-label="Keep it silent"
          title="Keep it silent"
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'rgba(240,232,224,0.34)',
            fontSize: 13, lineHeight: 1,
            padding: '9px 14px 9px 10px',
            touchAction: 'manipulation',
            transition: 'color .25s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = BTW.textPri; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(240,232,224,0.34)'; }}
        >
          ×
        </button>
      </div>
    );
  }

  // ── After the choice — a glyph, and nothing else ───────────────────────────
  const on = pref === 'on';
  return (
    <button
      data-btw-sound-control=""
      onClick={() => sound.toggle()}
      aria-label={on ? 'Turn sound off' : 'Turn sound on'}
      aria-pressed={on}
      title={on ? 'Sound on' : 'Sound off'}
      style={{
        ...shell,
        width: 40, height: 34,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', border: 'none', padding: 0,
        cursor: 'pointer',
        touchAction: 'manipulation',
        opacity: on ? 0.55 : 0.4,
        transition: 'opacity .25s',
      }}
      onMouseEnter={e => { e.currentTarget.style.opacity = '0.95'; }}
      onMouseLeave={e => { e.currentTarget.style.opacity = on ? '0.55' : '0.4'; }}
    >
      {/* A source and its two waves — dimmed to nearly nothing when silent. */}
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="4" cy="8" r="1.9" fill={BTW.textPri} />
        <g stroke={BTW.textPri} strokeWidth="1" strokeLinecap="round" fill="none" opacity={on ? 0.9 : 0.14}>
          <path d="M8 5.2 A 3.6 3.6 0 0 1 8 10.8" />
          <path d="M11 3 A 6.6 6.6 0 0 1 11 13" />
        </g>
      </svg>
    </button>
  );
}
