import { NextRequest } from 'next/server';
import { ImageResponse } from 'next/og';
import { supabaseServer } from '@/lib/supabase/server';
import { BTW } from '@/lib/btw';
import { SITE_URL } from '@/lib/constants';
import type { SpiroDimensions } from '@/lib/spirograph/renderer';

// Dynamic import so the route still works when @napi-rs/canvas isn't installed.
async function tryRenderSpiro(dims: SpiroDimensions, size: number, dpr = 1): Promise<string | null> {
  try {
    const { renderSpirographToBase64 } = await import('@/lib/spirograph/server-render');
    return await renderSpirographToBase64(dims, size, dpr);
  } catch (err) {
    console.error('[og] spirograph render failed:', err);
    return null;
  }
}

export const runtime = 'nodejs';

// Render at 2× so the image stays sharp on retina / high-DPR screens.
// All pixel values below are in 2× space (i.e. double the "design" values).
const W = 2400;
const H = 1260;

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
function truncate(text: string, max = 120): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + '…';
}

// Scale answer font size so longer text doesn't overflow the image.
// Values are in 2× space.
function answerFontSize(text: string): number {
  if (text.length <= 55)  return 84;
  if (text.length <= 90)  return 68;
  if (text.length <= 120) return 58;
  return 52;
}

// Satori quirk: text only truly centers when its container is an explicit
// flex row with justifyContent AND textAlign (justifyContent centers the
// single-line case, textAlign centers wrapped lines).
const CENTER: Record<string, string | number> = {
  width: '100%',
  display: 'flex',
  justifyContent: 'center',
  textAlign: 'center',
};

// ─── Default / fallback image ─────────────────────────────────────────────────
function defaultImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: BG }}>
        <div style={{ fontSize: 32, letterSpacing: '0.32em', textTransform: 'uppercase', color: 'rgba(240,232,224,0.45)', marginBottom: 64, fontFamily: 'sans-serif' }}>
          The Between
        </div>
        <div style={{ width: '100%', fontSize: 76, fontFamily: 'serif', color: BTW.textPri, textAlign: 'center', maxWidth: 1400, lineHeight: 1.25 }}>
          What shape are your thoughts?
        </div>
        <div style={{ marginTop: 96, display: 'flex', alignItems: 'center', gap: 20, padding: '24px 48px', border: `2px solid ${BTW.horizon[3]}`, borderRadius: 999, color: BTW.horizon[3], fontSize: 28, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'sans-serif' }}>
          <div style={{ width: 14, height: 14, borderRadius: '50%', background: BTW.horizon[3] }} />
          see your thoughts in the cosmos
        </div>
        <div style={{ marginTop: 64, fontSize: 30, color: 'rgba(240,232,224,0.35)', fontFamily: 'sans-serif', letterSpacing: '0.06em' }}>
          {SITE_URL}
        </div>
      </div>
    ),
    { width: W, height: H },
  );
}

// ─── Main route ────────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ shortcode: string }> },
) {
  const { shortcode } = await params;

  if (shortcode === 'default') return defaultImage();

  // 1. Fetch star — approved only. A star still awaiting the human queue
  // never gets an unfurl-able image: the submitter's own ShareButton is
  // active before that clears (the LLM gate never tells them they're
  // flagged), so this is the guard that keeps a third party from ever
  // seeing pending content via a link preview.
  const { data: star } = await supabaseServer
    .from('stars')
    .select('id, answer, unique_fact, dimensions, question_id')
    .eq('shortcode', shortcode)
    .eq('status', 'approved')
    .single();

  if (!star || !star.dimensions) return defaultImage();

  // 2. Fetch question text
  const { data: questionRow } = await supabaseServer
    .from('questions')
    .select('text')
    .eq('id', star.question_id)
    .single();

  const questionText = questionRow?.text ?? "What do you know is true but you can't prove?";
  const answerText = truncate(star.answer ?? '');
  const byline: string | null = star.unique_fact ?? null;

  // `seed: shortcode` is what makes the shared image show the *same* structural
  // archetype (Phase 5) the cosmos and the panel mini preview draw for this star.
  const dims: SpiroDimensions = {
    ...DIM_DEFAULTS,
    ...(star.dimensions as Partial<SpiroDimensions>),
    seed: shortcode,
  };

  // 3. The spirograph's pixel geometry is fixed (zoom × radius), so a bigger
  // canvas alone just adds padding — dpr scales the whole drawing uniformly,
  // line weights included. 560 logical (the glow-safe minimum) × dpr 3 gives
  // a large, sharp star; the box's negative margins trim the glow padding.
  const STAR_PX = 820;
  const spiroBg = await tryRenderSpiro(dims, 560, 3);

  // ── Card layout: question above the star, star large, everything centered ──
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
          padding: '64px 160px',
          gap: 0,
        }}
      >
        <div style={{
          ...CENTER,
          fontSize: 54,
          fontFamily: 'serif',
          color: 'rgba(240,232,224,0.75)',
          maxWidth: 2000,
          lineHeight: 1.25,
        }}>
          {questionText}
        </div>

        {spiroBg && (
          // Satori renders this JSX to a PNG, not to the DOM, so next/image
          // (a React DOM component) cannot be used here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={spiroBg}
            alt=""
            width={STAR_PX}
            height={STAR_PX}
            style={{ display: 'block', marginTop: -64, marginBottom: -36 }}
          />
        )}

        <div style={{
          ...CENTER,
          fontSize: answerFontSize(answerText),
          fontFamily: 'serif',
          fontStyle: 'italic',
          color: BTW.textPri,
          maxWidth: 2000,
          lineHeight: 1.3,
        }}>
          {`"${answerText}"`}
        </div>

        {byline && (
          <div style={{
            ...CENTER,
            fontSize: 40,
            fontFamily: 'sans-serif',
            color: 'rgba(240,232,224,0.6)',
            marginTop: 26,
          }}>
            {`— ${byline}`}
          </div>
        )}
      </div>
    ),
    { width: W, height: H },
  );
}
