'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import CosmosScene, { type ThoughtData } from '@/components/cosmos/CosmosScene';
import QuestionCycler, { type ValidatedPayload } from '@/components/QuestionCycler';
import UniqueOverlay from '@/components/UniqueOverlay';
import { BTW, SANS, SERIF, mulberry32, hashString, withAlpha } from '@/lib/btw';

function starWorldPos(shortcode: string) {
  const rand = mulberry32(hashString(shortcode));
  const x = (rand() - 0.5) * 1000;
  const z = (rand() - 0.5) * 1000;
  const y = 80 + rand() * 60;
  return { x, y, z };
}

interface CosmosStarRaw {
  id: string;
  shortcode: string;
  dimensions: { emotionIndex: number; [k: string]: unknown };
}

// ── Welcome overlay — shown once per browser, dismissed via localStorage ──────
function WelcomeOverlay({ onDismiss }: { onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setVisible(true); }, []);

  function dismiss() {
    setVisible(false);
    setTimeout(onDismiss, 300);
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 24px',
        background: 'rgba(10, 6, 28, 0.72)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        transition: 'opacity 0.3s ease',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <div style={{
        background: 'rgba(30, 24, 64, 0.90)',
        border: `1px solid ${withAlpha(BTW.textPri, 0.14)}`,
        borderRadius: 18,
        padding: 'clamp(32px, 6vw, 52px) clamp(28px, 6vw, 56px)',
        maxWidth: 360,
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      }}>
        {/* Title */}
        <div style={{
          fontSize: 10,
          letterSpacing: '0.28em',
          textTransform: 'uppercase',
          color: BTW.textDim,
          fontFamily: SANS,
          marginBottom: 20,
        }}>
          The Between
        </div>
        <div style={{
          fontFamily: SERIF,
          fontSize: 'clamp(15px, 3.5vw, 17px)',
          color: BTW.textDim,
          letterSpacing: '0.06em',
          marginBottom: 28,
          lineHeight: 1.3,
        }}>
          An Art Project
        </div>

        {/* Body lines */}
        <div style={{
          fontFamily: SERIF,
          fontSize: 'clamp(17px, 4vw, 21px)',
          color: BTW.textPri,
          lineHeight: 2.0,
          marginBottom: 36,
        }}>
          Answer a question.<br />
          Your thought becomes a star.<br />
          Find a star for yours to orbit.
        </div>

        {/* CTA */}
        <button
          onClick={dismiss}
          style={{
            background: 'transparent',
            border: `1px solid ${withAlpha(BTW.horizon[3], 0.7)}`,
            color: BTW.horizon[3],
            padding: '13px 36px',
            borderRadius: 999,
            fontFamily: SANS,
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = withAlpha(BTW.horizon[3], 0.14); }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          Begin →
        </button>
      </div>
    </div>
  );
}

// Inner component that uses useSearchParams — must be wrapped in <Suspense>
// so Next.js can statically pre-render the shell without blocking on params.
function LandingPageInner() {
  const searchParams = useSearchParams();
  const initialQuestionId = searchParams.get('question');
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [thoughts, setThoughts] = useState<ThoughtData[]>([]);
  const [pending, setPending] = useState<ValidatedPayload | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);

  // Check localStorage after mount (SSR-safe)
  useEffect(() => {
    if (!localStorage.getItem('btw_welcomed')) {
      setShowWelcome(true);
    }
  }, []);

  function dismissWelcome() {
    localStorage.setItem('btw_welcomed', '1');
    setShowWelcome(false);
  }

  useEffect(() => {
    if (!questionId || questionId === 'fallback') return;
    fetch(`/api/cosmos/${questionId}`)
      .then(r => r.json())
      .then(d => {
        const t: ThoughtData[] = (d.stars ?? []).map((s: CosmosStarRaw) => ({
          id: s.id,
          ...starWorldPos(s.shortcode),
          emotionIndex: s.dimensions.emotionIndex ?? 0,
          dimensions: s.dimensions as unknown as ThoughtData['dimensions'],
        }));
        setThoughts(t);
      })
      .catch(() => {});
  }, [questionId]);

  return (
    <>
      <CosmosScene mode="passive" thoughts={thoughts} bonds={[]} />

      <div style={{
        position: 'fixed', inset: 0, zIndex: 1,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 'max(env(safe-area-inset-top, 0px) + 16px, clamp(40px, 20vh, 180px))',
        padding: '0 clamp(16px, 5vw, 40px)',
        textAlign: 'center',
        fontFamily: SANS, color: BTW.textPri,
        pointerEvents: 'none',
        justifyContent: 'center',
      }}>
        <div style={{ marginTop: 'min(0px, 10vh)' }}>
          <div style={{
            fontSize: 11, letterSpacing: '0.32em',
            textTransform: 'uppercase', color: BTW.textDim,
            marginBottom: 36, pointerEvents: 'none',
          }}>
            The Between
          </div>
          <div style={{ pointerEvents: 'auto', width: '100%', maxWidth: 640 }}>
            <QuestionCycler
              onQuestionChange={setQuestionId}
              onValidated={setPending}
              initialQuestionId={initialQuestionId}
            />
          </div>
        </div>
      </div>

      {showWelcome && <WelcomeOverlay onDismiss={dismissWelcome} />}

      {pending && (
        <UniqueOverlay
          answer={pending.answer}
          questionId={pending.questionId}
          dimensions={pending.dimensions}
          onBack={() => setPending(null)}
        />
      )}
    </>
  );
}

export default function LandingPage() {
  return (
    <Suspense>
      <LandingPageInner />
    </Suspense>
  );
}
