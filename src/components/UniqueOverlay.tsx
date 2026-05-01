'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { BTW, SERIF, SANS, withAlpha } from '@/lib/btw';
import { MIN_UNIQUE_LENGTH, MAX_UNIQUE_LENGTH } from '@/lib/constants';
import type { CurveType } from '@/lib/spirograph/renderer';
import type { DimensionResult } from '@/lib/dimensions/prompt';

const Spirograph = dynamic(() => import('@/components/Spirograph'), { ssr: false });

interface UniqueOverlayProps {
  answer: string;
  questionId: string;
  dimensions: DimensionResult & { curveType: CurveType };
  onBack: () => void;
}

export default function UniqueOverlay({ answer, questionId, dimensions, onBack }: UniqueOverlayProps) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const tooLong = text.length > MAX_UNIQUE_LENGTH;

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answer,
          question_id: questionId,
          unique_fact: text.trim() || null,
          dimensions,
        }),
      });
      const data = await res.json();
      if (data.shortcode) {
        localStorage.setItem('my_star', data.shortcode);
        router.push(`/cosmos/${data.questionId}?star=${data.shortcode}`);
      } else {
        setError(data.error ?? 'Something went wrong. Try again.');
        setSubmitting(false);
      }
    } catch {
      setError('Connection error. Try again.');
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10,
        background: 'rgba(13,10,32,0.82)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '28px',
        animation: 'btwFade .4s ease',
      }}
    >
      <div style={{ width: '100%', maxWidth: 520, textAlign: 'center' }}>
        {/* Star preview */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <Spirograph dimensions={dimensions} size={160} animate={true} />
        </div>

        <div style={{
          fontFamily: SANS, fontSize: 11, letterSpacing: '0.32em',
          textTransform: 'uppercase', color: BTW.horizon[3], opacity: 0.85, marginBottom: 16,
        }}>
          Your star is forming
        </div>
        <h2 style={{
          fontFamily: SERIF, fontWeight: 400, fontSize: 26, lineHeight: 1.22,
          margin: '0 0 8px', color: BTW.textPri,
        }}>
          Who are you?
        </h2>
        <div style={{ fontSize: 13, color: BTW.textDim, marginBottom: 24, lineHeight: 1.5 }}>
          How do you identify? What&rsquo;s a favorite thing?
        </div>

        <textarea
          value={text}
          onChange={e => { setText(e.target.value.slice(0, MAX_UNIQUE_LENGTH + 20)); setError(null); }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="I collect rainwater… / I hum without noticing…"
          rows={2}
          style={{
            width: '100%',
            background: 'rgba(240,232,224,0.06)',
            border: `1px solid ${focused ? withAlpha(BTW.textPri, 0.35) : withAlpha(BTW.textPri, 0.15)}`,
            borderRadius: 14, color: BTW.textPri,
            fontFamily: SERIF, fontSize: 17, lineHeight: 1.5,
            padding: '14px 16px', outline: 'none', resize: 'none',
            transition: 'border-color .4s ease',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            boxSizing: 'border-box',
          }}
        />
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginTop: 8,
          fontSize: 12, color: tooLong ? '#F0B878' : BTW.textDim, letterSpacing: '0.04em',
        }}>
          <span style={{ opacity: text.length ? 1 : 0, transition: 'opacity .3s' }}>
            {tooLong ? 'a little shorter' : 'optional, anonymous, simple'}
          </span>
          <span>{text.length} / {MAX_UNIQUE_LENGTH}</span>
        </div>

        {error && (
          <div style={{
            marginTop: 10, fontSize: 13, color: '#E07060',
            fontFamily: SANS, letterSpacing: '0.02em', lineHeight: 1.4,
          }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 24, display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'center' }}>
          <button
            onClick={onBack}
            style={{
              background: 'transparent', border: 'none',
              color: BTW.textDim, fontFamily: SANS, fontSize: 12,
              letterSpacing: '0.18em', textTransform: 'uppercase',
              cursor: 'pointer', padding: '14px 8px',
            }}
          >
            ← back
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || tooLong}
            style={{
              background: 'transparent',
              border: `1px solid ${withAlpha(BTW.horizon[3], 0.7)}`,
              color: BTW.horizon[3], padding: '14px 28px', borderRadius: 999,
              fontFamily: SANS, fontSize: 13, fontWeight: 500,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              whiteSpace: 'nowrap', cursor: 'pointer',
              backdropFilter: 'blur(6px)',
              opacity: submitting || tooLong ? 0.6 : 1,
            }}
            onMouseEnter={e => { if (!submitting) e.currentTarget.style.background = withAlpha(BTW.horizon[3], 0.14); }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            {submitting ? 'Entering…' : 'Enter the cosmos →'}
          </button>
        </div>
      </div>
      <style>{`@keyframes btwFade { from { opacity: 0; } to { opacity: 1; } }`}</style>
    </div>
  );
}
