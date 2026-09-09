'use client';
import { useEffect, useRef, useState } from 'react';
import { BTW, SERIF } from '@/lib/btw';

// ── Arrival beat ──────────────────────────────────────────────────────────────
// On a fresh entry the question stands alone, centered over the empty sky in
// the same white the answers use, holds for a beat, then rises into its usual
// quiet place at the top as the stars come in. Any input skips straight to the
// rise — the card never blocks the visitor.
//
// `onRelease` fires the moment the rise begins (the page releases the scene's
// arrival hold there, so the stars fade in while the question travels up);
// `onDone` fires when the card has landed and the page should swap in the
// real header.

const ENTER_MS = 700;   // fade the question in
const HOLD_MS = 1900;   // a beat to read it
const RISE_MS = 1200;   // travel up + shrink + go quiet

// Matches the pages' top-chrome header exactly — the swap must be invisible.
const HEADER_FONT = 'clamp(22px, 3.2vw, 36px)';
const CENTER_FONT = 'clamp(26px, 4.6vw, 46px)';

export default function ArrivalTitle({
  text,
  onRelease,
  onDone,
}: {
  text: string;
  onRelease: () => void;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<'enter' | 'hold' | 'rise'>('enter');
  const releasedRef = useRef(false);
  const doneRef = useRef(false);
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const onReleaseRef = useRef(onRelease);
  useEffect(() => { onReleaseRef.current = onRelease; }, [onRelease]);
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    const release = () => {
      if (releasedRef.current) return;
      releasedRef.current = true;
      onReleaseRef.current();
    };
    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      release(); // never leave the scene held
      onDoneRef.current();
    };
    const beginRise = () => {
      if (phaseRef.current === 'rise') return;
      setPhase('rise');
      release();
      window.setTimeout(finish, RISE_MS + 150);
    };

    // Reduced motion: no theatre — hand over immediately.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      finish();
      return;
    }

    const t1 = window.setTimeout(() => setPhase('hold'), 40); // next frame-ish
    const t2 = window.setTimeout(beginRise, ENTER_MS + HOLD_MS);

    // Any deliberate input skips the beat, same ethos as the intro — except
    // answering the "sound?" invitation, which is not a gesture at the sky.
    const skip = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('[data-btw-sound-control]')) return;
      beginRise();
    };
    const opts = { capture: true, passive: true } as const;
    window.addEventListener('pointerdown', skip, opts);
    window.addEventListener('keydown', skip, opts);
    window.addEventListener('wheel', skip, opts);
    window.addEventListener('touchstart', skip, opts);
    return () => {
      clearTimeout(t1); clearTimeout(t2);
      window.removeEventListener('pointerdown', skip, { capture: true });
      window.removeEventListener('keydown', skip, { capture: true });
      window.removeEventListener('wheel', skip, { capture: true });
      window.removeEventListener('touchstart', skip, { capture: true });
    };
  }, []);

  const risen = phase === 'rise';
  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 20, pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: risen ? 22 : '50%',
          transform: risen ? 'translate(-50%, 0)' : 'translate(-50%, -50%)',
          width: 'min(900px, calc(100vw - 60px))',
          textAlign: 'center',
          fontFamily: SERIF,
          fontStyle: 'italic',
          fontWeight: 400,
          lineHeight: 1.2,
          letterSpacing: '0.01em',
          fontSize: risen ? HEADER_FONT : CENTER_FONT,
          // Centered: the answers' white, fully present. Risen: the header's
          // quiet transparency.
          color: risen ? BTW.textPri : '#F0E8E0',
          opacity: phase === 'enter' ? 0 : risen ? 0.35 : 1,
          textShadow: '0 1px 24px rgba(10,6,24,0.6)',
          transition: risen
            ? `top ${RISE_MS}ms cubic-bezier(0.4, 0, 0.2, 1), transform ${RISE_MS}ms cubic-bezier(0.4, 0, 0.2, 1), font-size ${RISE_MS}ms cubic-bezier(0.4, 0, 0.2, 1), opacity ${RISE_MS}ms ease, color ${RISE_MS}ms ease`
            : `opacity ${ENTER_MS}ms ease`,
        }}
      >
        {text}
      </div>
    </div>
  );
}
