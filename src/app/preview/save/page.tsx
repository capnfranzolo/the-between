'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import SaveStarPanel from '@/components/SaveStarPanel';
import { BTW, SANS, SERIF } from '@/lib/btw';
import type { CosmosStarData } from '@/components/StarDetail';

// ── /preview/save — unlisted dev preview for SaveStarPanel (Stage B) ───────
// Fetches the seeded star `4xh8` from the mock supabase (via /api/stars/
// [shortcode]) and mounts the panel standalone, so it can be verified without
// going through the full cosmos flow. Not linked from the product.
//
//   /preview/save              → seeded star 4xh8
//   /preview/save?code=g6b5    → any other seeded shortcode

const DEFAULT_SHORTCODE = '4xh8';

// Hardcoded fallback in case the API/mock supabase is unreachable — keeps
// this preview usable in isolation.
const FALLBACK_STAR: Pick<CosmosStarData, 'text' | 'dimensions' | 'shortcode'> = {
  shortcode: DEFAULT_SHORTCODE,
  text: 'My dog understood me better than most people ever have.',
  dimensions: {
    certainty: 0.57,
    warmth: 0.23,
    tension: 0.56,
    vulnerability: 0.34,
    scope: 0.99,
    rootedness: 0,
    resolve: 0.6,
    charge: 0.4,
    connection: 0.5,
    temporality: 0.5,
    emotionIndex: 6,
    reasoning: 'seeded',
    publishable: true,
    flagReason: null,
    curveType: 'epitrochoid',
  },
};

function PreviewSaveInner() {
  const params = useSearchParams();
  const shortcode = params.get('code') || DEFAULT_SHORTCODE;
  const [star, setStar] = useState<Pick<CosmosStarData, 'text' | 'dimensions' | 'shortcode'> | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/stars/${shortcode}`)
      .then(res => (res.ok ? res.json() : Promise.reject(res.status)))
      .then(data => {
        if (cancelled) return;
        setStar({
          shortcode: data.shortcode ?? shortcode,
          text: data.answer ?? data.text ?? '',
          dimensions: data.dimensions,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setStar(shortcode === DEFAULT_SHORTCODE ? FALLBACK_STAR : { ...FALLBACK_STAR, shortcode });
      });
    return () => { cancelled = true; };
  }, [shortcode]);

  return (
    <div className="btw-viewport" style={{
      background: `linear-gradient(180deg, ${BTW.sky[0]}, ${BTW.sky[1]})`,
      color: BTW.textPri, fontFamily: SANS,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative',
    }}>
      <div style={{
        position: 'absolute', top: 20, left: 24,
        fontFamily: SERIF, fontStyle: 'italic', fontSize: 15, opacity: 0.55,
      }}>
        /preview/save — {shortcode}
      </div>

      {closed && (
        <button
          onClick={() => setClosed(false)}
          style={{
            background: 'transparent',
            border: `1px solid rgba(240,232,224,0.3)`,
            color: BTW.textPri,
            padding: '10px 18px',
            borderRadius: 999,
            fontFamily: SANS, fontSize: 13, letterSpacing: '0.08em',
            textTransform: 'uppercase', cursor: 'pointer',
          }}
        >
          Reopen panel
        </button>
      )}

      {!closed && star && (
        <SaveStarPanel
          shortcode={shortcode}
          star={star}
          onClose={() => setClosed(true)}
        />
      )}
    </div>
  );
}

export default function PreviewSavePage() {
  return <Suspense fallback={null}><PreviewSaveInner /></Suspense>;
}
