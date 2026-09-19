'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { BTW, SERIF, SANS, withAlpha } from '@/lib/btw';
import { MAX_UNIQUE_LENGTH, MIN_UNIQUE_LENGTH, BIRTH_FLAG_KEY } from '@/lib/constants';
import type { CurveType } from '@/lib/spirograph/renderer';
import type { DimensionResult } from '@/lib/dimensions/prompt';

const Spirograph = dynamic(() => import('@/components/Spirograph'), { ssr: false });

interface UniqueOverlayProps {
  answer: string;
  questionId: string;
  dimensions: DimensionResult & { curveType: CurveType; seed?: string };
  /**
   * Stage G — the shortcode minted at validate time. Defaults to the copy
   * carried on `dimensions.seed`, which is how it arrives from the composer.
   */
  shortcode?: string;
  onBack: () => void;
}

export default function UniqueOverlay({ answer, questionId, dimensions, shortcode, onBack }: UniqueOverlayProps) {
  // The star previewed here must be the star met in the sky: same dimensions
  // (all ten axes), same archetype seed. The seed is the shortcode the server
  // minted alongside the dimensions and will use at birth.
  const seed = shortcode ?? dimensions.seed;
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooLong = text.length > MAX_UNIQUE_LENGTH;
  // The trace is the step, not a formality (locked decision 8) — the button
  // stays visibly inert until there is something to leave behind (defect #7).
  const ready = text.trim().length >= MIN_UNIQUE_LENGTH && !tooLong;

  const handleSubmit = async () => {
    if (submitting || !ready) return;
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
          shortcode: seed,
        }),
      });
      const data = await res.json();
      if (data.shortcode) {
        localStorage.setItem('my_star', data.shortcode);
        // Phase 7 — the cosmos this navigates to plays the birth bloom for
        // this star, once. (Phase 8 will hang the visual bloom off the same
        // flag; the sound already knows when the moment is.)
        try { sessionStorage.setItem(BIRTH_FLAG_KEY, data.shortcode); } catch { /* private mode */ }
        // Hard navigation (not router.push): this overlay can be opened from
        // /cosmos/[questionId] itself (Phase 6 "What shape are you?" CTA), where
        // a client-side push to the same route segment (only `?star=` differs)
        // would not remount the page or refetch cosmos data — the new star
        // would never appear. A full navigation guarantees the fresh mount.
        window.location.assign(`/cosmos/${data.questionId}?star=${data.shortcode}`);
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
      <div style={{ width: '100%', maxWidth: 560, textAlign: 'center' }}>
        {/* Star preview — the forming animation itself reads as "your star is
            forming"; a redundant eyebrow label was dropped (R1: fewer words). */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <Spirograph dimensions={dimensions} seed={seed} size={320} animate={true} forming={true} />
        </div>

        <h2 style={{
          fontFamily: SERIF, fontWeight: 400, fontSize: 33, lineHeight: 1.2,
          margin: '0 0 10px', color: BTW.textPri,
        }}>
          Make your mark
        </h2>
        <div style={{
          fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400, fontSize: 16,
          lineHeight: 1.4, color: BTW.textDim, marginBottom: 10,
        }}>
          Leave a trace beside your star today.
        </div>
        <div style={{ fontFamily: SANS, fontSize: 12, color: BTW.textDim, letterSpacing: '0.02em', marginBottom: 22 }}>
          An anonymous byline.
        </div>

        <textarea
          value={text}
          onChange={e => { setText(e.target.value.slice(0, MAX_UNIQUE_LENGTH + 20)); setError(null); }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="an adventurer…"
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
          display: 'flex', justifyContent: 'flex-end',
          alignItems: 'center', marginTop: 8,
          fontSize: 12, color: tooLong ? '#F0B878' : BTW.textDim, letterSpacing: '0.04em',
        }}>
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
            disabled={!ready || submitting}
            style={{
              background: 'transparent',
              border: `1px solid ${ready ? withAlpha(BTW.horizon[3], 0.7) : withAlpha(BTW.textPri, 0.16)}`,
              color: ready ? BTW.horizon[3] : BTW.textDim,
              padding: '14px 28px', borderRadius: 999,
              fontFamily: SANS, fontSize: 13, fontWeight: 500,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              cursor: ready && !submitting ? 'pointer' : 'default',
              backdropFilter: 'blur(6px)',
              opacity: !ready || submitting ? 0.55 : 1,
              transition: 'opacity .3s ease, border-color .3s ease, color .3s ease',
            }}
            onMouseEnter={e => { if (ready && !submitting) e.currentTarget.style.background = withAlpha(BTW.horizon[3], 0.14); }}
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
