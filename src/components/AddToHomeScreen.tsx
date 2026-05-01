'use client';
import { useEffect, useState } from 'react';
import { BTW, SANS, SERIF, withAlpha } from '@/lib/btw';

const STORAGE_KEY = 'btw_ath_dismissed';

/** Shows once on iOS Safari (non-standalone) after a 10-second delay. */
export default function AddToHomeScreen() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only show on iOS Safari outside of standalone mode
    const isIOS = /iPhone|iPad/.test(navigator.userAgent);
    const isStandalone =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (navigator as any).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches;
    const dismissed = !!localStorage.getItem(STORAGE_KEY);

    if (!isIOS || isStandalone || dismissed) return;

    const timer = window.setTimeout(() => setVisible(true), 10_000);
    return () => window.clearTimeout(timer);
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      onClick={dismiss}
      style={{
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(340px, 88%)',
        background: 'rgba(20,14,40,0.88)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: `1px solid ${withAlpha(BTW.textPri, 0.14)}`,
        borderRadius: 16,
        padding: '16px 20px 14px',
        zIndex: 50,
        pointerEvents: 'auto',
        animation: 'btwRise .4s cubic-bezier(.2,.8,.3,1)',
        color: BTW.textPri,
        fontFamily: SANS,
      }}
    >
      {/* Down-pointing caret towards the iOS share button */}
      <div style={{
        position: 'absolute',
        bottom: -8,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 0, height: 0,
        borderLeft: '8px solid transparent',
        borderRight: '8px solid transparent',
        borderTop: `8px solid ${withAlpha(BTW.textPri, 0.14)}`,
      }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Share icon */}
        <div style={{
          flexShrink: 0,
          width: 36, height: 36,
          background: withAlpha(BTW.horizon[3], 0.15),
          border: `1px solid ${withAlpha(BTW.horizon[3], 0.4)}`,
          borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18,
        }}>
          ↑
        </div>

        <div>
          <div style={{ fontFamily: SERIF, fontSize: 15, lineHeight: 1.35, color: BTW.textPri, marginBottom: 4 }}>
            Add to your home screen
          </div>
          <div style={{ fontSize: 12, color: BTW.textSec, lineHeight: 1.45 }}>
            Tap <span style={{ fontWeight: 600 }}>Share</span> then{' '}
            <span style={{ fontWeight: 600 }}>Add to Home Screen</span> for the best experience.
          </div>
        </div>

        <button
          onClick={e => { e.stopPropagation(); dismiss(); }}
          style={{
            flexShrink: 0,
            background: 'transparent',
            border: 'none',
            color: BTW.textDim,
            fontSize: 20,
            lineHeight: 1,
            cursor: 'pointer',
            padding: '0 4px',
            marginTop: -2,
          }}
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}
