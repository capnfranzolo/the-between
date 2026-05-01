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
 * Renders a brief star-card landing page, then navigates to the cosmos view.
 * Keeping actual content here (not just a redirect) lets social crawlers
 * (Facebook, Twitter, etc.) read the og: meta tags without following a JS
 * redirect to a page that has no og:image.
 */
export default function StarRedirectClient({ to, answer, question }: Props) {
  // Delayed navigation — give crawlers time to read the page, and let users
  // see the card before being whisked away.
  useEffect(() => {
    const t = setTimeout(() => {
      window.location.replace(to);
    }, 2200);
    return () => clearTimeout(t);
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
