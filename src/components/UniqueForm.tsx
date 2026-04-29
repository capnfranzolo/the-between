'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BTW, SERIF, SANS, withAlpha } from '@/lib/btw';
import { MIN_UNIQUE_LENGTH, MAX_UNIQUE_LENGTH, QUESTION_ID_MOCK } from '@/lib/constants';

interface UniqueFormProps {
  shortcode: string;
}

export default function UniqueForm({ shortcode }: UniqueFormProps) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const tooLong = text.length > MAX_UNIQUE_LENGTH;
  const ready = text.trim().length >= MIN_UNIQUE_LENGTH && !tooLong;

  const handleSubmit = async () => {
    if (!ready || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/stars/${shortcode}/unique`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unique_fact: text.trim() }),
      });
      const data = await res.json();
      if (data.questionId) {
        router.push(`/cosmos/${data.questionId}`);
      }
    } catch {
      setSubmitting(false);
    }
  };

  const handleBack = () => router.back();

  return (
    <div style={{ width: '100%', maxWidth: 340, marginTop: 36 }}>
      <textarea
        value={text}
        onChange={e => setText(e.target.value.slice(0, 140))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="I collect rainwater… / I hum without noticing…"
        rows={2}
        style={{
          width: '100%',
          background: 'rgba(240,232,224,0.06)',
          border: `1px solid ${focused ? withAlpha(BTW.textPri, 0.35) : withAlpha(BTW.textPri, 0.15)}`,
          borderRadius: 14,
          color: BTW.textPri,
          fontFamily: SERIF,
          fontSize: 17,
          lineHeight: 1.5,
          padding: '14px 16px',
          outline: 'none',
          resize: 'none',
          transition: 'border-color .4s ease, background .4s ease',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          boxSizing: 'border-box',
        }}
      />
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginTop: 10,
        fontSize: 12, color: tooLong ? '#F0B878' : BTW.textDim,
        letterSpacing: '0.04em',
      }}>
        <span style={{ opacity: text.length ? 1 : 0, transition: 'opacity .3s' }}>
          {tooLong ? 'a little shorter' : 'optional, but specific helps'}
        </span>
        <span>{text.length} / {MAX_UNIQUE_LENGTH}</span>
      </div>

      <div style={{ marginTop: 28, display: 'flex', gap: 14, alignItems: 'center' }}>
        <button
          onClick={handleBack}
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
            opacity: ready ? 1 : 0.4,
            transition: 'opacity .4s ease, background .3s ease',
            pointerEvents: ready ? 'auto' : 'none',
            background: 'transparent',
            border: `1px solid ${withAlpha(BTW.horizon[3], 0.7)}`,
            color: BTW.horizon[3],
            padding: '14px 28px', borderRadius: 999,
            fontFamily: SANS, fontSize: 13, fontWeight: 500,
            letterSpacing: '0.08em',
            textTransform: 'uppercase', whiteSpace: 'nowrap',
            cursor: ready ? 'pointer' : 'default',
            backdropFilter: 'blur(6px)',
          }}
          onMouseEnter={e => { if (ready) e.currentTarget.style.background = withAlpha(BTW.horizon[3], 0.14); }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          {submitting ? 'Entering…' : 'Enter the cosmos →'}
        </button>
      </div>
    </div>
  );
}
