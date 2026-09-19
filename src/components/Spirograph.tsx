'use client';
import { useRef, useEffect, useState } from 'react';
import {
  createSpirograph, formingProgress, FORMING_DURATION_MS,
  type SpiroDimensions, type CurveType,
} from '@/lib/spirograph/renderer';
import type { DimensionResult } from '@/lib/dimensions/prompt';

// The renderer was built around outerRadius=120 and zoom=1.4.
// Epitrochoid can extend ~224px from center, so we need a canvas radius > 224.
// We always render at this internal size and CSS-scale down to the display size.
const RENDER_SIZE = 480;

export interface SpirographProps {
  /**
   * The star's full dimension set. Every field the renderer understands is
   * passed through — including the four semantic axes (resolve/charge/
   * connection/temporality), which choose the star's FAMILY. Dropping them here
   * used to make a preview show a tangle where the born star was a lattice.
   */
  dimensions: DimensionResult & { curveType: CurveType; seed?: string };
  /** The archetype seed — a star's shortcode. Overrides `dimensions.seed`. */
  seed?: string;
  size?: number;
  animate?: boolean;
  /**
   * Stage G — play the forming reveal: the star comes together over ~5s (one
   * firefly, then another; the trace inscribing itself) and then hands off
   * seamlessly into the ordinary live animation on the same clock.
   */
  forming?: boolean;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export default function Spirograph({
  dimensions,
  seed,
  size = 220,
  animate = true,
  forming = false,
  style,
  onClick,
}: SpirographProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);

  const starSeed = seed ?? dimensions.seed;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dims: SpiroDimensions = { ...dimensions, ...(starSeed ? { seed: starSeed } : {}) };

    // Render at full size to avoid clipping, then override CSS to display smaller
    const spiro = createSpirograph(canvas, dims, { size: RENDER_SIZE });
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';

    let raf = 0;
    if (animate && forming) {
      // One clock drives both: `t` is the renderer's ordinary time, `p` the
      // forming progress alongside it. When p reaches 1 we simply stop passing
      // it — the handoff frame IS the normal frame at that same t.
      const startTime = Date.now();
      const tick = () => {
        const elapsed = Date.now() - startTime;
        const t = elapsed / 1000;
        if (elapsed < FORMING_DURATION_MS) spiro.renderStatic(t, { forming: formingProgress(elapsed) });
        else spiro.renderStatic(t);
        raf = requestAnimationFrame(tick);
      };
      tick();
    } else if (animate) {
      spiro.start();
    } else {
      spiro.renderStatic(2.5);
    }

    const fadeRaf = requestAnimationFrame(() => setVisible(true));

    return () => {
      spiro.stop();
      if (raf) cancelAnimationFrame(raf);
      cancelAnimationFrame(fadeRaf);
    };
    // `dimensions` is depended on whole (it is spread, axes and all) — both
    // call sites hold it in state, so its identity is stable across renders.
  }, [dimensions, starSeed, size, animate, forming]);

  return (
    <canvas
      ref={canvasRef}
      onClick={onClick}
      style={{
        display: 'block',
        // The forming reveal starts from an empty canvas and brings itself up;
        // a 2.2s opacity fade on top of it only muddies the first dots.
        opacity: forming ? 1 : visible ? 1 : 0,
        transition: forming ? 'none' : 'opacity 2.2s ease',
        cursor: onClick ? 'pointer' : 'default',
        zIndex: 1,
        position: 'relative',
        ...style,
      }}
    />
  );
}
