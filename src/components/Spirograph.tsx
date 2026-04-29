'use client';
import { useRef, useEffect, useState } from 'react';
import { createSpirograph, type SpiroDimensions, type CurveType } from '@/lib/spirograph/renderer';
import type { DimensionResult } from '@/lib/dimensions/prompt';

export interface SpirographProps {
  dimensions: DimensionResult & { curveType: CurveType };
  size?: number;
  animate?: boolean;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export default function Spirograph({
  dimensions,
  size = 300,
  animate = true,
  style,
  onClick,
}: SpirographProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dims: SpiroDimensions = {
      certainty:     dimensions.certainty,
      warmth:        dimensions.warmth,
      tension:       dimensions.tension,
      vulnerability: dimensions.vulnerability,
      scope:         dimensions.scope,
      rootedness:    dimensions.rootedness,
      emotionIndex:  dimensions.emotionIndex,
      curveType:     dimensions.curveType,
    };

    const spiro = createSpirograph(canvas, dims, { size });

    if (animate) {
      spiro.start();
    } else {
      spiro.renderStatic(2.5);
    }

    // Trigger bloom fade after first frame
    const raf = requestAnimationFrame(() => setVisible(true));

    return () => {
      spiro.stop();
      cancelAnimationFrame(raf);
    };
  }, [
    dimensions.certainty,
    dimensions.warmth,
    dimensions.tension,
    dimensions.vulnerability,
    dimensions.scope,
    dimensions.rootedness,
    dimensions.emotionIndex,
    dimensions.curveType,
    size,
    animate,
  ]);

  return (
    <canvas
      ref={canvasRef}
      onClick={onClick}
      style={{
        display: 'block',
        opacity: visible ? 1 : 0,
        transition: 'opacity 2.2s ease',
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    />
  );
}
