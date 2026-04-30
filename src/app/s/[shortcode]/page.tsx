'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import TwilightSky from '@/components/TwilightSky';
import AmbientField from '@/components/AmbientField';
import Terrain from '@/components/Terrain';
import Spirograph from '@/components/Spirograph';
import PathCard from '@/components/PathCard';
import { BTW, SERIF, SANS, withAlpha } from '@/lib/btw';
import { SITE_URL } from '@/lib/constants';
import type { DimensionResult } from '@/lib/dimensions/prompt';
import type { CurveType } from '@/lib/spirograph/renderer';

type StarDimensions = DimensionResult & { curveType: CurveType };

const DEFAULT_DIMS: StarDimensions = {
  certainty: 0.5, warmth: 0.5, tension: 0.4, vulnerability: 0.7,
  scope: 0.3, rootedness: 0.5, emotionIndex: 3,
  curveType: 'hypotrochoid', reasoning: '',
};

interface StarData {
  shortcode: string;
  answer: string;
  question_id: string;
  dimensions?: StarDimensions;
  questions?: { id: string; text: string } | null;
}

type Stage = 'blooming' | 'revealed';

export default function RevealPage() {
  const { shortcode } = useParams<{ shortcode: string }>();
  const router = useRouter();
  const [star, setStar] = useState<StarData | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [stage, setStage] = useState<Stage>('blooming');
  const [copied, setCopied] = useState(false);
  const [showKept, setShowKept] = useState(false);

  useEffect(() => {
    const myStar = localStorage.getItem('my_star');
    setIsOwner(myStar === shortcode);

    fetch(`/api/stars/${shortcode}`)
      .then(r => r.json())
      .then(data => setStar(data))
      .catch(() => {});

    const t = setTimeout(() => setStage('revealed'), 2200);
    return () => clearTimeout(t);
  }, [shortcode]);

  const dimensions = star?.dimensions ?? DEFAULT_DIMS;
  const url = `https://${SITE_URL}/s/${shortcode}`;

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleCosmos = () => {
    router.push(`/unique/${shortcode}`);
  };

  if (!star) {
    return (
      <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden' }}>
        <TwilightSky />
      </div>
    );
  }

  // Visitor view
  if (!isOwner) {
    return (
      <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden', fontFamily: SANS, color: BTW.textPri }}>
        <TwilightSky>
          <AmbientField count={3} seedBase="reveal-amb" maxSize={90} />
          <Terrain height={100} />
        </TwilightSky>
        <div style={{
          position: 'absolute', inset: 0, zIndex: 2,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '40px 24px', textAlign: 'center',
          overflowY: 'auto',
        }}>
          <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 15, lineHeight: 1.5, color: BTW.textDim, maxWidth: 320, margin: '0 0 12px' }}>
            {star.questions?.text ?? "What do you know is true but you can't prove?"}
          </div>
          <div style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 19, lineHeight: 1.45, color: BTW.textPri, maxWidth: 320, margin: '0 0 28px', opacity: stage === 'blooming' ? 0 : 0.95, transition: 'opacity 1.2s ease 0.2s' }}>
            &ldquo;{star.answer}&rdquo;
          </div>
          <Spirograph dimensions={dimensions} size={200} animate />
          <div style={{ marginTop: 36 }}>
            <a
              href="/"
              style={{
                display: 'inline-block',
                border: `1px solid ${withAlpha(BTW.horizon[3], 0.7)}`,
                color: BTW.horizon[3], padding: '14px 32px', borderRadius: 999,
                fontFamily: SANS, fontSize: 14, fontWeight: 500,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                textDecoration: 'none',
              }}
            >
              What&rsquo;s yours? →
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Owner view
  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden', fontFamily: SANS, color: BTW.textPri }}>
      <TwilightSky>
        <AmbientField count={3} seedBase="reveal-amb" maxSize={90} />
        <Terrain height={100} />
      </TwilightSky>

      <div style={{
        position: 'absolute', inset: 0, zIndex: 2,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '40px 24px 32px', textAlign: 'center',
        overflowY: 'auto',
      }}>
        <div style={{
          fontFamily: SERIF, fontStyle: 'italic', fontSize: 15, lineHeight: 1.5,
          color: BTW.textDim, maxWidth: 320, margin: '0 0 12px',
        }}>
          {star.questions?.text ?? "What do you know is true but you can't prove?"}
        </div>

        <div style={{
          fontFamily: SERIF, fontWeight: 400, fontSize: 19, lineHeight: 1.45,
          color: BTW.textPri, opacity: stage === 'blooming' ? 0 : 0.95,
          maxWidth: 320, margin: '0 0 28px',
          transition: 'opacity 1.2s ease 0.2s',
        }}>
          &ldquo;{star.answer}&rdquo;
        </div>

        <div style={{
          marginBottom: 28,
          transform: stage === 'blooming' ? 'scale(0.92)' : 'scale(1)',
          transition: 'transform 2.2s cubic-bezier(.2,.7,.3,1)',
        }}>
          <Spirograph dimensions={dimensions} size={200} animate />
        </div>

        <div style={{
          opacity: stage === 'revealed' ? 1 : 0,
          transform: stage === 'revealed' ? 'translateY(0)' : 'translateY(10px)',
          transition: 'opacity .8s ease 0.3s, transform .8s ease 0.3s',
          marginBottom: 26,
        }}>
          <div style={{ fontSize: 11, letterSpacing: '0.32em', textTransform: 'uppercase', color: BTW.textDim, marginBottom: 8 }}>
            your star lives here
          </div>
          <div
            onClick={handleShare}
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 17, color: BTW.textPri,
              padding: '10px 16px',
              border: `1px solid ${withAlpha(BTW.textPri, 0.2)}`,
              borderRadius: 8,
              background: 'rgba(240,232,224,0.04)',
              display: 'inline-flex', alignItems: 'center', gap: 10,
              cursor: 'pointer',
            }}
          >
            {url}
            <span style={{ fontSize: 10, letterSpacing: '0.2em', transition: 'color .3s', color: copied ? BTW.horizon[3] : 'transparent' }}>
              COPIED
            </span>
          </div>
        </div>

        <div style={{
          display: 'flex', flexDirection: 'column', gap: 10,
          width: '100%', maxWidth: 320,
          opacity: stage === 'revealed' && !showKept ? 1 : 0,
          transform: stage === 'revealed' ? 'translateY(0)' : 'translateY(10px)',
          transition: 'opacity .8s ease 0.6s, transform .8s ease 0.6s',
          pointerEvents: showKept ? 'none' : 'auto',
        }}>
          <PathCard tone="warm" label="Share it" sub="Send your URL to someone you trust." onClick={handleShare} />
          <PathCard tone="bright" label="Enter the cosmos" sub="Let strangers see your shape." onClick={handleCosmos} />
        </div>
      </div>

      {showKept && (
        <div
          onClick={() => setShowKept(false)}
          style={{
            position: 'absolute', inset: 0, zIndex: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(30,24,64,0.55)', backdropFilter: 'blur(8px)',
            animation: 'btwFade .4s ease',
          }}
        >
          <div style={{ maxWidth: 280, textAlign: 'center', padding: 24 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: SERIF, fontSize: 26, lineHeight: 1.3, color: BTW.textPri, marginBottom: 14 }}>
              Your star is kept.
            </div>
            <div style={{ fontSize: 15, color: BTW.textSec, lineHeight: 1.55 }}>
              Bookmark <span style={{ color: BTW.textPri, fontFamily: 'monospace' }}>{url}</span> — it will be here when you return.
            </div>
            <button onClick={() => setShowKept(false)} style={{
              marginTop: 22, background: 'transparent',
              border: `1px solid ${withAlpha(BTW.textPri, 0.35)}`,
              color: BTW.textPri, padding: '8px 20px', borderRadius: 999,
              fontSize: 11, fontWeight: 500, letterSpacing: '0.1em',
              textTransform: 'uppercase', cursor: 'pointer', fontFamily: SANS,
            }}>
              Tap to close
            </button>
          </div>
        </div>
      )}

      <style>{`@keyframes btwFade { from { opacity: 0; } to { opacity: 1; } }`}</style>
    </div>
  );
}
