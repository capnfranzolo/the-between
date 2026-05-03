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
function WelcomeOverlay({ onDismiss, questionId }: { onDismiss: () => void; questionId: string | null }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setVisible(true); }, []);

  function dismiss() {
    setVisible(false);
    setTimeout(onDismiss, 300);
  }

  function lookAround() {
    localStorage.setItem('btw_welcomed', '1');
    window.location.href = `/cosmos/${questionId}`;
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
        background: 'rgba(10, 6, 28, 0.75)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        transition: 'opacity 0.3s ease',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        overflowY: 'auto',
      }}
    >
      <div style={{
        background: 'rgba(30, 24, 64, 0.90)',
        border: `1px solid ${withAlpha(BTW.textPri, 0.14)}`,
        borderRadius: 20,
        padding: 'clamp(32px, 5vw, 52px) clamp(28px, 5vw, 60px)',
        maxWidth: 580,
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      }}>
        {/* Title */}
        <div style={{
          fontFamily: SERIF,
          fontWeight: 400,
          fontSize: 'clamp(22px, 4vw, 30px)',
          letterSpacing: '0.02em',
          color: BTW.textPri,
          marginBottom: 28,
          lineHeight: 1.2,
        }}>
          Welcome to The Between.
        </div>

        {/* Body copy */}
        <div style={{
          fontFamily: SERIF,
          fontSize: 'clamp(15px, 2.2vw, 17px)',
          color: 'rgba(240,232,224,0.75)',
          lineHeight: 1.8,
          marginBottom: 36,
          textAlign: 'left',
        }}>
          <p style={{ margin: '0 0 1.1em' }}>
            These days we&rsquo;re eager to sort each other into categories before we&rsquo;ve met the real person.
          </p>
          <p style={{ margin: '0 0 1.1em' }}>
            This is an experiment in getting past that. You answer one question, honestly. Your answer becomes a star, and joins a sky of other stars from strangers who answered the same thing. When you find one whose thought feels like a relative of yours, you can choose to orbit it.
          </p>
          <p style={{ margin: 0 }}>
            Somewhere in here is a worthy stranger. The person the media may tell you is &ldquo;the other&rdquo; but may be closer to you than you think. We have more in common than we&rsquo;re told. This is a place to notice it.
          </p>
        </div>

        {/* Two CTAs */}
        <div style={{
          display: 'flex',
          gap: 12,
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}>
          <button
            onClick={dismiss}
            style={{
              background: withAlpha(BTW.horizon[3], 0.14),
              border: `1px solid ${withAlpha(BTW.horizon[3], 0.7)}`,
              color: BTW.horizon[3],
              padding: '13px 28px',
              borderRadius: 999,
              fontFamily: SANS,
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = withAlpha(BTW.horizon[3], 0.26); }}
            onMouseLeave={e => { e.currentTarget.style.background = withAlpha(BTW.horizon[3], 0.14); }}
          >
            Answer a question
          </button>
          <button
            onClick={lookAround}
            disabled={!questionId}
            style={{
              background: 'transparent',
              border: `1px solid ${withAlpha(BTW.textPri, questionId ? 0.32 : 0.12)}`,
              color: questionId ? BTW.textDim : withAlpha(BTW.textDim, 0.35),
              padding: '13px 28px',
              borderRadius: 999,
              fontFamily: SANS,
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              cursor: questionId ? 'pointer' : 'default',
              whiteSpace: 'nowrap',
              transition: 'color .2s, border-color .2s',
            }}
            onMouseEnter={e => { if (questionId) e.currentTarget.style.color = BTW.textPri; }}
            onMouseLeave={e => { if (questionId) e.currentTarget.style.color = BTW.textDim; }}
          >
            Look around first
          </button>
        </div>
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
          <div style={{ pointerEvents: 'auto', width: '100%', maxWidth: 'min(820px, 92vw)' }}>
            <QuestionCycler
              onQuestionChange={setQuestionId}
              onValidated={setPending}
              initialQuestionId={initialQuestionId}
            />
          </div>
        </div>
      </div>

      {showWelcome && <WelcomeOverlay onDismiss={dismissWelcome} questionId={questionId} />}

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
