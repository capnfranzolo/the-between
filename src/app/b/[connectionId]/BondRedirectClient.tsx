'use client';
import { useEffect } from 'react';
import { BTW, SERIF, SANS } from '@/lib/btw';

interface Props {
  to: string;
  fromAnswer: string | null;
  toAnswer: string | null;
  reason: string | null;
}

/**
 * Renders a brief bond-card landing page, then navigates into the cosmos.
 * Mirrors StarRedirectClient's pattern: real content in the initial render
 * (not a bare redirect) so crawlers reading og: tags see something, and a
 * human sees the pair before being carried into the sky.
 */
export default function BondRedirectClient({ to, fromAnswer, toAnswer, reason }: Props) {
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
      <div style={{
        fontSize: 11, letterSpacing: '0.32em', textTransform: 'uppercase',
        color: BTW.textDim, marginBottom: 32,
      }}>
        A bond formed
      </div>

      <div style={{
        width: '100%', maxWidth: 560,
        background: 'rgba(20,14,40,0.72)',
        border: `1px solid rgba(240,232,224,0.1)`,
        borderRadius: 20,
        padding: '32px 36px',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        textAlign: 'center',
      }}>
        {fromAnswer && (
          <div style={{
            fontFamily: SERIF, fontStyle: 'italic',
            fontSize: 'clamp(15px, 3vw, 19px)',
            color: BTW.textSec, marginBottom: 14, lineHeight: 1.4,
          }}>
            &ldquo;{fromAnswer}&rdquo;
          </div>
        )}
        {toAnswer && (
          <div style={{
            fontFamily: SERIF, fontStyle: 'italic',
            fontSize: 'clamp(15px, 3vw, 19px)',
            color: BTW.textSec, marginBottom: 20, lineHeight: 1.4,
          }}>
            &ldquo;{toAnswer}&rdquo;
          </div>
        )}
        {reason && (
          <div style={{
            fontFamily: SERIF, fontSize: 'clamp(19px, 4vw, 24px)',
            color: BTW.textPri, lineHeight: 1.45,
          }}>
            — {reason}
          </div>
        )}
      </div>

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
