'use client';
import { useState } from 'react';
import { BTW, withAlpha, SANS } from '@/lib/btw';

interface PathCardProps {
  label: string;
  sub: string;
  onClick: () => void;
  tone?: 'quiet' | 'warm' | 'bright';
}

export default function PathCard({ label, sub, onClick, tone = 'quiet' }: PathCardProps) {
  const [hover, setHover] = useState(false);
  const accent =
    tone === 'bright' ? BTW.horizon[3] :
    tone === 'warm' ? BTW.horizon[1] :
    BTW.textPri;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        textAlign: 'left',
        background: hover ? withAlpha(accent, 0.08) : 'rgba(240,232,224,0.03)',
        border: `1px solid ${withAlpha(accent, hover ? 0.5 : 0.2)}`,
        borderRadius: 12,
        padding: '14px 16px',
        cursor: 'pointer',
        transition: 'all .3s ease',
        fontFamily: SANS,
        color: BTW.textPri,
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        width: '100%',
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 500, letterSpacing: '0.01em', color: accent, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: BTW.textDim, lineHeight: 1.45 }}>
        {sub}
      </div>
    </button>
  );
}
