import { NextRequest } from 'next/server';
import { ImageResponse } from 'next/og';
import { supabaseServer } from '@/lib/supabase/server';
import { BTW } from '@/lib/btw';
import { SITE_URL } from '@/lib/constants';
import type { SpiroDimensions } from '@/lib/spirograph/renderer';

// Dynamic import so the route still works when @napi-rs/canvas isn't installed.
async function tryRenderSpiro(dims: SpiroDimensions, size: number): Promise<string | null> {
  try {
    const { renderSpirographToBase64 } = await import('@/lib/spirograph/server-render');
    return await renderSpirographToBase64(dims, size);
  } catch (err) {
    console.error('[og/bond] spirograph render failed:', err);
    return null;
  }
}

export const runtime = 'nodejs';

// Render at 2× so the image stays sharp on retina / high-DPR screens.
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

function truncate(text: string, max = 90): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + '…';
}

function defaultImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: BG }}>
        <div style={{ fontSize: 32, letterSpacing: '0.32em', textTransform: 'uppercase', color: 'rgba(240,232,224,0.45)', marginBottom: 64, fontFamily: 'sans-serif' }}>
          The Between
        </div>
        <div style={{ width: '100%', fontSize: 64, fontFamily: 'serif', color: BTW.textPri, textAlign: 'center', maxWidth: 1400, lineHeight: 1.25 }}>
          Two stars, bound.
        </div>
        <div style={{ marginTop: 64, fontSize: 30, color: 'rgba(240,232,224,0.35)', fontFamily: 'sans-serif', letterSpacing: '0.06em' }}>
          {SITE_URL}
        </div>
      </div>
    ),
    { width: W, height: H },
  );
}

interface StarRow {
  id: string;
  shortcode: string;
  answer: string;
  dimensions: Record<string, unknown> | null;
}

// ─── Main route ────────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const { connectionId } = await params;

  // 1. Fetch the bond
  const { data: conn } = await supabaseServer
    .from('connections')
    .select('id, from_star_id, to_star_id, reason, question_id, status')
    .eq('id', connectionId)
    .eq('status', 'approved')
    .maybeSingle();

  if (!conn) return defaultImage();

  // 2. Fetch both stars
  const [fromRes, toRes] = await Promise.all([
    supabaseServer.from('stars').select('id, shortcode, answer, dimensions').eq('id', conn.from_star_id).maybeSingle(),
    supabaseServer.from('stars').select('id, shortcode, answer, dimensions').eq('id', conn.to_star_id).maybeSingle(),
  ]);

  const from = fromRes.data as StarRow | null;
  const to = toRes.data as StarRow | null;
  if (!from || !to) return defaultImage();

  // `seed: shortcode` — same Phase 5 archetype contract as the single-star OG
  // route, so each half of the pair matches its cosmos/panel appearance.
  const fromDims: SpiroDimensions = { ...DIM_DEFAULTS, ...(from.dimensions as Partial<SpiroDimensions> ?? {}), seed: from.shortcode };
  const toDims: SpiroDimensions = { ...DIM_DEFAULTS, ...(to.dimensions as Partial<SpiroDimensions> ?? {}), seed: to.shortcode };

  const [fromSpiro, toSpiro] = await Promise.all([
    tryRenderSpiro(fromDims, 640),
    tryRenderSpiro(toDims, 640),
  ]);

  const reason = conn.reason as string;

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
          padding: '96px 140px',
        }}
      >
        <div style={{ fontSize: 30, letterSpacing: '0.32em', textTransform: 'uppercase', color: 'rgba(240,232,224,0.45)', marginBottom: 48, fontFamily: 'sans-serif' }}>
          A bond formed
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 48 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 620 }}>
            {fromSpiro && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fromSpiro} alt="" width={320} height={320} style={{ display: 'block' }} />
            )}
            <div style={{
              marginTop: 24, fontSize: 32, fontFamily: 'serif', fontStyle: 'italic',
              color: BTW.textSec, textAlign: 'center', lineHeight: 1.35,
            }}>
              {`"${truncate(from.answer)}"`}
            </div>
          </div>

          <div style={{ display: 'flex', fontSize: 56, color: 'rgba(240,232,224,0.35)', fontFamily: 'serif' }}>
            ·
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 620 }}>
            {toSpiro && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={toSpiro} alt="" width={320} height={320} style={{ display: 'block' }} />
            )}
            <div style={{
              marginTop: 24, fontSize: 32, fontFamily: 'serif', fontStyle: 'italic',
              color: BTW.textSec, textAlign: 'center', lineHeight: 1.35,
            }}>
              {`"${truncate(to.answer)}"`}
            </div>
          </div>
        </div>

        <div style={{
          marginTop: 56,
          fontSize: 48,
          fontFamily: 'serif',
          color: BTW.textPri,
          textAlign: 'center',
          maxWidth: 1800,
          lineHeight: 1.35,
        }}>
          {`— ${reason}`}
        </div>
      </div>
    ),
    { width: W, height: H },
  );
}
