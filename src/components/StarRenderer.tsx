'use client';
import { useState } from 'react';
import Spirograph from './Spirograph';
import { BTW, withAlpha, hashString } from '@/lib/btw';

interface StarRendererProps {
  seed: string;
  warmth: number;
  size: number;
  blur?: number;
  isMine?: boolean;
  isActive?: boolean;
  isDimmed?: boolean;
  speedMul?: number;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  style?: React.CSSProperties;
}

export default function StarRenderer({
  seed,
  warmth,
  size,
  blur = 0,
  isMine = false,
  isActive = false,
  isDimmed = false,
  speedMul = 1,
  onClick,
  onMouseEnter,
  onMouseLeave,
  style,
}: StarRendererProps) {
  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'relative',
        cursor: onClick ? 'pointer' : 'default',
        transform: `scale(${isActive ? 1.18 : 1})`,
        opacity: isDimmed ? 0.5 : 1,
        transition: 'transform .7s cubic-bezier(.2,.7,.3,1), opacity .5s',
        filter: isActive ? 'drop-shadow(0 0 22px rgba(240,200,120,0.45))' : undefined,
        ...style,
      }}
    >
      <Spirograph
        seed={seed}
        size={size}
        warmth={warmth}
        blur={isActive ? 0 : blur}
        speedMul={speedMul}
      />
      {isMine && (
        <div style={{
          position: 'absolute', top: -22, left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 10, letterSpacing: '0.32em', textTransform: 'uppercase',
          color: BTW.horizon[3],
          textShadow: '0 0 10px rgba(240,200,120,0.6)',
          whiteSpace: 'nowrap',
        }}>
          yours
        </div>
      )}
    </div>
  );
}
