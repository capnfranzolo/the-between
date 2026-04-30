'use client';
import TwilightSky from '@/components/TwilightSky';
import AmbientField from '@/components/AmbientField';
import Terrain from '@/components/Terrain';
import QuestionCycler from '@/components/QuestionCycler';
import { BTW, SANS } from '@/lib/btw';

export default function LandingPage() {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden', fontFamily: SANS, color: BTW.textPri }}>
      <TwilightSky>
        <AmbientField count={4} seedBase="landing-amb" maxSize={120} />
        <Terrain height={120} />
      </TwilightSky>

      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center',
        padding: '0 28px',
        textAlign: 'center',
        zIndex: 2,
      }}>
        <div style={{
          fontFamily: SANS, fontSize: 11, letterSpacing: '0.32em',
          textTransform: 'uppercase', color: BTW.textDim,
          marginBottom: 36,
        }}>
          The Between
        </div>

        <QuestionCycler />
      </div>
    </div>
  );
}
