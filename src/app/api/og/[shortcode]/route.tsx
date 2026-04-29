import { NextRequest } from 'next/server';
import { ImageResponse } from 'next/og';
import { BTW, withAlpha, hashString } from '@/lib/btw';
import { QUESTION_TEXT, SITE_URL } from '@/lib/constants';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ shortcode: string }> }
) {
  const { shortcode } = await params;

  const skyGrad = `linear-gradient(180deg, ${BTW.sky[0]} 0%, #2A2050 20%, ${BTW.sky[1]} 40%, ${BTW.sky[2]} 68%, ${BTW.horizon[2]} 92%, ${BTW.horizon[3]} 100%)`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: skyGrad,
          padding: '0 80px',
          alignItems: 'center',
          fontFamily: 'serif',
        }}
      >
        {/* Left */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{
            fontSize: 15, letterSpacing: '0.3em', textTransform: 'uppercase',
            color: BTW.horizon[3], marginBottom: 30,
          }}>
            The Between
          </div>
          <div style={{
            fontSize: 52, lineHeight: 1.1,
            color: BTW.textPri, maxWidth: 480,
            fontWeight: 400,
          }}>
            {QUESTION_TEXT}
          </div>
          <div style={{
            marginTop: 36, display: 'flex', alignItems: 'center', gap: 14,
            padding: '14px 22px',
            border: `1px solid ${withAlpha(BTW.horizon[3], 0.6)}`,
            borderRadius: 999,
            color: BTW.horizon[3],
            fontSize: 13, letterSpacing: '0.2em', textTransform: 'uppercase',
            width: 'fit-content',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: BTW.horizon[3] }} />
            Your thoughts connect us
          </div>
          <div style={{ marginTop: 22, fontFamily: 'monospace', fontSize: 14, color: BTW.textDim, letterSpacing: '0.1em' }}>
            {SITE_URL}
          </div>
        </div>

        {/* Right: abstract star visual */}
        <div style={{ width: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: 210, height: 210, borderRadius: '50%',
            background: `radial-gradient(circle, ${withAlpha(BTW.warmth[3], 0.4)} 0%, ${withAlpha(BTW.warmth[2], 0.2)} 50%, transparent 100%)`,
            border: `1px solid ${withAlpha(BTW.warmth[3], 0.5)}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: 'rgba(255,250,240,0.9)',
            }} />
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
