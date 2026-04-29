'use client';
import TwilightSky from '@/components/TwilightSky';
import AmbientField from '@/components/AmbientField';
import Terrain from '@/components/Terrain';
import QuestionForm from '@/components/QuestionForm';
import { BTW, SERIF, SANS } from '@/lib/btw';
import { QUESTION_TEXT } from '@/lib/constants';

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

        <h1 style={{
          fontFamily: SERIF, fontWeight: 400,
          fontSize: 'clamp(24px, 5vw, 32px)', lineHeight: 1.18,
          margin: 0, color: BTW.textPri,
          maxWidth: 360,
          letterSpacing: '0.005em',
          textShadow: '0 1px 24px rgba(30,24,64,0.6)',
        }}>
          <span style={{ display: 'block', whiteSpace: 'nowrap' }}>What do you know is true</span>
          <span style={{ display: 'block', whiteSpace: 'nowrap' }}>but you can&rsquo;t prove?</span>
        </h1>

        <QuestionForm />
      </div>
    </div>
  );
}
