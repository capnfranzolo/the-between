'use client';
import { useRef, useEffect, useState } from 'react';
import { createSpirograph, type SpiroDimensions, type CurveType } from '@/lib/spirograph/renderer';
import type { DimensionResult } from '@/lib/dimensions/prompt';

// The renderer was built around outerRadius=120 and zoom=1.4.
// Epitrochoid can extend ~224px from center, so we need a canvas radius > 224.
// We always render at this internal size and CSS-scale down to the display size.
const RENDER_SIZE = 480;

export interface SpirographProps {
  dimensions: DimensionResult & { curveType: CurveType };
  size?: number;
  animate?: boolean;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export default function Spirograph({
  dimensions,
  size = 220,
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

    // Render at full size to avoid clipping, then override CSS to display smaller
    const spiro = createSpirograph(canvas, dims, { size: RENDER_SIZE });
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';

    if (animate) {
      spiro.start();
    } else {
      spiro.renderStatic(2.5);
    }

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
        zIndex: 1,
        position: 'relative',
        ...style,
      }}
    />
  );
}
