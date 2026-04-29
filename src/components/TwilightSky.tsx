'use client';
import { useRef, useEffect } from 'react';
import { BTW, withAlpha, mulberry32 } from '@/lib/btw';

function StarField() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    const dpr = window.devicePixelRatio || 1;
    el.width = w * dpr;
    el.height = h * dpr;
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    const ctx = el.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const rng = mulberry32(11);
    const count = Math.floor((w * h) / 4500);
    for (let i = 0; i < count; i++) {
      const x = rng() * w;
      const y = rng() * h * 0.75;
      const r = rng() * 0.9 + 0.2;
      const a = rng() * 0.5 + 0.1;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(240,232,224,${a})`;
      ctx.fill();
    }
  }, []);

  return (
    <canvas
      ref={ref}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.7 }}
    />
  );
}

interface TwilightSkyProps {
  children?: React.ReactNode;
  style?: React.CSSProperties;
  showHorizon?: boolean;
}

export default function TwilightSky({ children, style, showHorizon = true }: TwilightSkyProps) {
  const skyGrad = [
    'linear-gradient(180deg,',
    `${BTW.sky[0]} 0%,`,
    '#2A2050 20%,',
    `${BTW.sky[1]} 40%,`,
    '#5A3D78 56%,',
    `${BTW.sky[2]} 68%,`,
    `${BTW.sky[3]} 78%,`,
    `${BTW.horizon[0]} 86%,`,
    `${BTW.horizon[1]} 92%,`,
    `${BTW.horizon[2]} 96%,`,
    `${BTW.horizon[3]} 100%)`,
  ].join(' ');

  const hazeGrad = `linear-gradient(0deg, ${withAlpha(BTW.horizon[3], 0.45)} 0%, ${withAlpha(BTW.horizon[1], 0.12)} 40%, ${withAlpha(BTW.horizon[1], 0)} 100%)`;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: skyGrad,
        overflow: 'hidden',
        ...style,
      }}
    >
      {showHorizon && (
        <div
          style={{
            position: 'absolute',
            left: 0, right: 0, bottom: 0,
            height: '20%',
            background: hazeGrad,
            pointerEvents: 'none',
            mixBlendMode: 'screen',
          }}
        />
      )}
      <StarField />
      {children}
    </div>
  );
}
