'use client';
import { useState } from 'react';
import { BTW, withAlpha } from '@/lib/btw';

interface ShareButtonProps {
  url: string;
  style?: React.CSSProperties;
}

export default function ShareButton({ url, style }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: do nothing
    }
  };

  return (
    <button
      onClick={handleClick}
      title="Share this star"
      aria-label="Share this star"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 34,
        height: 34,
        borderRadius: '50%',
        background: 'transparent',
        border: `1px solid ${withAlpha(BTW.textPri, 0.18)}`,
        color: copied ? BTW.horizon[3] : BTW.textDim,
        cursor: 'pointer',
        transition: 'color .2s, border-color .2s, background .2s',
        ...style,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.color = BTW.textPri;
        e.currentTarget.style.borderColor = withAlpha(BTW.horizon[3], 0.7);
      }}
      onMouseLeave={e => {
        e.currentTarget.style.color = copied ? BTW.horizon[3] : BTW.textDim;
        e.currentTarget.style.borderColor = withAlpha(BTW.textPri, 0.18);
      }}
    >
      {copied ? (
        <span style={{ fontSize: 9, letterSpacing: '0.15em', fontWeight: 600 }}>✓</span>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
      )}
    </button>
  );
}
