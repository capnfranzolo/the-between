import { NextRequest } from 'next/server';
import { ImageResponse } from 'next/og';
import { supabaseServer } from '@/lib/supabase/server';
import { BTW, withAlpha } from '@/lib/btw';
import { SITE_URL } from '@/lib/constants';
import type { SpiroDimensions } from '@/lib/spirograph/renderer';

// Dynamic import so the route still works when @napi-rs/canvas isn't installed.
async function tryRenderSpiro(dims: SpiroDimensions, size: number): Promise<string | null> {
  try {
    const { renderSpirographToBase64 } = await import('@/lib/spirograph/server-render');
    return await renderSpirographToBase64(dims, size);
  } catch (err) {
    console.error('[og] spirograph render failed:', err);
    return null;
  }
}

export const runtime = 'nodejs';

const DIM_DEFAULTS: SpiroDimensions = {
  certainty: 0.5,
  warmth: 0.5,
  tension: 0.5,
  vulnerability: 0.5,
  scope: 0.5,
  rootedness: 0.5,
  emotionIndex: 3,
  curveType: 'hypotrochoid',
};

// Twilight gradient stops (no gold — keep purple/mauve for readability)
const BG = `linear-gradient(180deg, #1E1840 0%, #2A1D52 18%, #3D2D65 36%, #5A3D78 54%, #7B5088 72%, #9A6080 90%, #A06880 100%)`;

// Truncate long answers for balanced layout
function truncate(text: string, max = 200): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + '…';
}

// ─── Default / fallback image ─────────────────────────────────────────────────
function defaultImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: BG }}>
        {/* Eyebrow */}
        <div style={{ fontSize: 16, letterSpacing: '0.32em', textTransform: 'uppercase', color: 'rgba(240,232,224,0.45)', marginBottom: 32, fontFamily: 'sans-serif' }}>
          The Between
        </div>

        {/* Hero text */}
        <div style={{ fontSize: 38, fontFamily: 'serif', color: BTW.textPri, textAlign: 'center', maxWidth: 700, lineHeight: 1.25 }}>
          What shape are your thoughts?
        </div>

        {/* CTA pill */}
        <div style={{ marginTop: 48, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 24px', border: `1px solid ${BTW.horizon[3]}`, borderRadius: 999, color: BTW.horizon[3], fontSize: 14, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'sans-serif' }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: BTW.horizon[3] }} />
          see your thoughts in the cosmos
        </div>

        {/* URL */}
        <div style={{ marginTop: 32, fontSize: 15, color: 'rgba(240,232,224,0.35)', fontFamily: 'sans-serif', letterSpacing: '0.06em' }}>
          {SITE_URL}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}

// ─── Main route ────────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ shortcode: string }> },
) {
  const { shortcode } = await params;

  // Debug endpoint — remove after verifying production reachability
  const url = new URL(_req.url);
  if (url.searchParams.get('debug') === '1') {
    return Response.json({
      ok: true,
      shortcode,
      env: {
        hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasSupabaseKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
    });
  }

  // Handle the /api/og/default route
  if (shortcode === 'default') return defaultImage();

  // 1. Fetch star
  const { data: star } = await supabaseServer
    .from('stars')
    .select('id, answer, unique_fact, dimensions, question_id')
    .eq('shortcode', shortcode)
    .single();

  if (!star || !star.dimensions) return defaultImage();

  // 2. Fetch question text
  const { data: questionRow } = await supabaseServer
    .from('questions')
    .select('text')
    .eq('id', star.question_id)
    .single();

  const questionText = questionRow?.text ?? "What do you know is true but you can't prove?";
  const answerText = truncate(star.answer ?? '', 200);
  const byline: string | null = star.unique_fact ?? null;

  const dims: SpiroDimensions = { ...DIM_DEFAULTS, ...(star.dimensions as Partial<SpiroDimensions>) };

  // 3. Render spirograph to base64 PNG (480×480, then display at 240×240)
  const spiroBg = await tryRenderSpiro(dims, 480);

  // ── Card layout ────────────────────────────────────────────────────────────
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: BG,
          padding: '40px 80px',
          gap: 0,
        }}
      >
        {/* Spirograph */}
        {spiroBg && (
          <img
            src={spiroBg}
            width={320}
            height={320}
            style={{ marginBottom: 36, display: 'block' }}
          />
        )}

        {/* Question text */}
        <div style={{
          fontSize: 26,
          fontFamily: 'serif',
          color: BTW.textSec,
          textAlign: 'center',
          maxWidth: 800,
          lineHeight: 1.3,
          marginBottom: 20,
        }}>
          {questionText}
        </div>

        {/* Answer text — single string child so Satori doesn't complain about multiple nodes */}
        <div style={{
          fontSize: 42,
          fontFamily: 'serif',
          fontStyle: 'italic',
          color: BTW.textPri,
          textAlign: 'center',
          maxWidth: 960,
          lineHeight: 1.3,
          marginBottom: byline ? 20 : 0,
        }}>
          {`”${answerText}”`}
        </div>

        {/* Byline — single string child */}
        {byline && (
          <div style={{
            fontSize: 22,
            fontFamily: 'sans-serif',
            color: 'rgba(240,232,224,0.55)',
            textAlign: 'center',
          }}>
            {`— ${byline}`}
          </div>
        )}
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
