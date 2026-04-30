'use client';
import { useParams } from 'next/navigation';
import TwilightSky from '@/components/TwilightSky';
import AmbientField from '@/components/AmbientField';
import Terrain from '@/components/Terrain';
import UniqueForm from '@/components/UniqueForm';
import { BTW, SERIF, SANS } from '@/lib/btw';

export default function UniquePage() {
  const { shortcode } = useParams<{ shortcode: string }>();

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden', fontFamily: SANS, color: BTW.textPri }}>
      <TwilightSky>
        <AmbientField count={3} seedBase="unique-amb" maxSize={90} />
        <Terrain height={110} />
      </TwilightSky>

      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center',
        padding: '0 28px', textAlign: 'center', zIndex: 2,
      }}>
        <div style={{
          fontFamily: SANS, fontSize: 11, letterSpacing: '0.32em',
          textTransform: 'uppercase', color: BTW.horizon[3],
          opacity: 0.85, marginBottom: 28,
        }}>
          One more thing
        </div>

        <h1 style={{
          fontFamily: SERIF, fontWeight: 400,
          fontSize: 30, lineHeight: 1.22,
          margin: 0, color: BTW.textPri,
          maxWidth: 360,
          textShadow: '0 1px 24px rgba(30,24,64,0.6)',
        }}>
          <span style={{ display: 'block', whiteSpace: 'nowrap' }}>Who are you?</span>
        </h1>

        <div style={{ marginTop: 14, fontSize: 13, color: BTW.textDim, maxWidth: 280, lineHeight: 1.5 }}>
          How do you identify? What&rsquo;s a favorite thing?
        </div>

        <UniqueForm shortcode={shortcode} />
      </div>
    </div>
  );
}
