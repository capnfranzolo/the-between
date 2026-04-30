'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BTW, SERIF, SANS, withAlpha } from '@/lib/btw';
import { MIN_ANSWER_LENGTH, MAX_ANSWER_LENGTH } from '@/lib/constants';

export default function QuestionForm() {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const ready = text.trim().length >= MIN_ANSWER_LENGTH;
  const tooLong = text.length > MAX_ANSWER_LENGTH;
  const counterColor = tooLong ? '#F0B878' : text.length >= MIN_ANSWER_LENGTH ? BTW.textPri : BTW.textDim;

  const handleSubmit = async () => {
    if (!ready || tooLong || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: text.trim() }),
      });
      const data = await res.json();
      if (data.shortcode) {
        localStorage.setItem('my_star', data.shortcode);
        router.push(`/s/${data.shortcode}`);
      }
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ width: '100%', maxWidth: 340, marginTop: 44 }}>
      <textarea
        value={text}
        onChange={e => setText(e.target.value.slice(0, 600))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleSubmit(); }}
        placeholder="Write what you know…"
        rows={4}
        style={{
          width: '100%',
          background: 'rgba(240,232,224,0.06)',
          border: `1px solid ${focused ? withAlpha(BTW.textPri, 0.35) : withAlpha(BTW.textPri, 0.15)}`,
          borderRadius: 14,
          color: BTW.textPri,
          fontFamily: SERIF,
          fontSize: 19,
          lineHeight: 1.5,
          padding: '16px 18px',
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
        alignItems: 'center', marginTop: 12,
        fontSize: 12, fontFamily: SANS,
        color: counterColor,
        letterSpacing: '0.04em',
        transition: 'color .3s',
      }}>
        <span style={{ opacity: text.length > 0 ? 1 : 0, transition: 'opacity .3s' }}>
          {text.length < MIN_ANSWER_LENGTH ? `${MIN_ANSWER_LENGTH - text.length} more to bloom` : 'ready'}
        </span>
        <span>{text.length} / {MAX_ANSWER_LENGTH}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 28 }}>
        <button
          onClick={handleSubmit}
          disabled={!ready || tooLong || submitting}
          style={{
            opacity: ready && !tooLong ? 1 : 0,
            transform: ready && !tooLong ? 'translateY(0)' : 'translateY(8px)',
            transition: 'opacity .6s ease, transform .6s ease',
            pointerEvents: ready && !tooLong ? 'auto' : 'none',
            background: 'transparent',
            border: `1px solid ${withAlpha(BTW.horizon[3], 0.7)}`,
            color: BTW.horizon[3],
            padding: '14px 32px',
            borderRadius: 999,
            fontFamily: SANS,
            fontSize: 14,
            fontWeight: 500,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
            backdropFilter: 'blur(6px)',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = withAlpha(BTW.horizon[3], 0.14); }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          {submitting ? 'Sending…' : 'See your thought →'}
        </button>

        <div id="turnstile-widget" style={{ marginTop: 16 }} />
      </div>
    </div>
  );
}
