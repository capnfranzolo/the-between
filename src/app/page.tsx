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

      <div style={{
        position: 'fixed', inset: 0, zIndex: 1,
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center',
        padding: '0 28px', textAlign: 'center',
        fontFamily: SANS, color: BTW.textPri,
        pointerEvents: 'none',
      }}>
        <div style={{
          fontSize: 11, letterSpacing: '0.32em',
          textTransform: 'uppercase', color: BTW.textDim,
          marginBottom: 36, pointerEvents: 'none',
        }}>
          The Between
        </div>
        <div style={{ pointerEvents: 'auto' }}>
          <QuestionCycler
            onQuestionChange={setQuestionId}
            onValidated={setPending}
          />
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
