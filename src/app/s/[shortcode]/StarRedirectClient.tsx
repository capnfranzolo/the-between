'use client';
import { useEffect } from 'react';
import { BTW, SERIF, SANS } from '@/lib/btw';

interface Props {
  to: string;
  answer?: string | null;
  byline?: string | null;
  question?: string | null;
}

/**
 * A /s/ link goes STRAIGHT into the star's sky (R3): the card below is
 * crawler fodder and a noscript fallback, never a stop on the way. Social
 * crawlers (Facebook, Twitter, …) still read the og: meta tags and the
 * rendered answer without following the JS navigation; a person sees the
 * world, because the card read as "an input box with my answer" (owner
 * review, 2026-09-19) rather than as an arrival.
 */
export default function StarRedirectClient({ to, answer, question }: Props) {
  // Immediate — no interstitial beat. `replace` so Back leaves The Between
  // rather than bouncing through this page again.
  useEffect(() => {
    window.location.replace(to);
  }, [to]);

  return (
    <div style={{
      background: BTW.sky[0],
      position: 'fixed', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '32px 24px',
      fontFamily: SANS,
    }}>
      {/* Eyebrow */}
      <div style={{
        fontSize: 11, letterSpacing: '0.32em', textTransform: 'uppercase',
        color: BTW.textDim, marginBottom: 32,
      }}>
        The Between
      </div>

      {/* Card */}
      <div style={{
        width: '100%', maxWidth: 520,
        background: 'rgba(20,14,40,0.72)',
        border: `1px solid rgba(240,232,224,0.1)`,
        borderRadius: 20,
        padding: '32px 36px',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        textAlign: 'center',
      }}>
        {question && (
          <div style={{
            fontFamily: SERIF, fontStyle: 'italic',
            fontSize: 'clamp(14px, 3vw, 18px)',
            color: BTW.textSec, marginBottom: 20, lineHeight: 1.4,
            opacity: 0.8,
          }}>
            {question}
          </div>
        )}
        {answer && (
          <div style={{
            fontFamily: SERIF, fontSize: 'clamp(20px, 4vw, 26px)',
            color: BTW.textPri, lineHeight: 1.45,
          }}>
            &ldquo;{answer}&rdquo;
          </div>
        )}
      </div>

      {/* Skip link */}
      <a
        href={to}
        style={{
          marginTop: 28,
          fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase',
          color: BTW.textDim, textDecoration: 'none',
          opacity: 0.7,
        }}
      >
        View in the cosmos →
      </a>
    </div>
  );
}
