'use client';
import { useState, useEffect } from 'react';
import CosmosScene, { type ThoughtData } from '@/components/cosmos/CosmosScene';
import QuestionCycler, { type ValidatedPayload } from '@/components/QuestionCycler';
import UniqueOverlay from '@/components/UniqueOverlay';
import { BTW, SANS, mulberry32, hashString } from '@/lib/btw';

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

export default function LandingPage() {
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [thoughts, setThoughts] = useState<ThoughtData[]>([]);
  const [pending, setPending] = useState<ValidatedPayload | null>(null);

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

      {/*
        On desktop: vertically centred.
        On mobile: placed at ~55% from top so it sits in the natural thumb zone,
        clear of the status bar (top safe-area) and the bottom sheet / home bar.
      */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 'max(env(safe-area-inset-top, 0px) + 16px, clamp(40px, 20vh, 180px))',
        padding: '0 clamp(16px, 5vw, 40px)',
        textAlign: 'center',
        fontFamily: SANS, color: BTW.textPri,
        pointerEvents: 'none',
        // Push content down on mobile to the ~55% thumb-reach zone
        justifyContent: 'center',
      }}>
        <div style={{
          // Nudge downward on small screens so the form sits in thumb reach
          marginTop: 'min(0px, 10vh)',
        }}>
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
            />
          </div>
        </div>
      </div>

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
