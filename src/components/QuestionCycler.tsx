'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { BTW, SERIF, SANS, withAlpha } from '@/lib/btw';
import { MIN_ANSWER_LENGTH, MAX_ANSWER_LENGTH, QUESTION_TEXT } from '@/lib/constants';
import { supabaseClient } from '@/lib/supabase/client';

interface Question {
  id: string;
  text: string;
}

const FALLBACK: Question[] = [{ id: 'fallback', text: QUESTION_TEXT }];

export default function QuestionCycler() {
  const [questions, setQuestions] = useState<Question[]>(FALLBACK);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fadingOut, setFadingOut] = useState(false);
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    supabaseClient
      .from('questions')
      .select('id, text')
      .eq('active', true)
      .order('display_order')
      .then(({ data }) => {
        if (data && data.length > 0) setQuestions(data as Question[]);
      });
  }, []);

  const nextQuestion = useCallback(() => {
    if (fadingOut) return;
    setFadingOut(true);
    setText('');
    setTimeout(() => {
      setCurrentIndex(i => (i + 1) % questions.length);
      setFadingOut(false);
    }, 400);
  }, [fadingOut, questions.length]);

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
        body: JSON.stringify({ answer: text.trim(), question_id: questions[currentIndex].id }),
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

  const question = questions[currentIndex];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      {/* Question heading */}
      <h1
        style={{
          fontFamily: SERIF, fontWeight: 400,
          fontSize: 'clamp(24px, 5vw, 32px)', lineHeight: 1.18,
          margin: 0, color: BTW.textPri,
          maxWidth: 360,
          letterSpacing: '0.005em',
          textShadow: '0 1px 24px rgba(30,24,64,0.6)',
          textAlign: 'center',
          textWrap: 'pretty',
          transition: 'opacity 400ms ease',
          opacity: fadingOut ? 0 : 1,
        }}
      >
        {question.text}
      </h1>

      {/* Form */}
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

          {questions.length > 1 && (
            <button
              onClick={nextQuestion}
              style={{
                marginTop: 20,
                background: 'transparent',
                border: 'none',
                color: BTW.textDim,
                fontFamily: SANS,
                fontSize: 12,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                padding: '14px 8px',
                transition: 'opacity 400ms ease',
                opacity: fadingOut ? 0.3 : 1,
                pointerEvents: fadingOut ? 'none' : 'auto',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = BTW.textPri; }}
              onMouseLeave={e => { e.currentTarget.style.color = BTW.textDim; }}
            >
              not this one →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
