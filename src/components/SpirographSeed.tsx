'use client';
import { useRef, useEffect, useMemo } from 'react';
import { mulberry32, hashString, warmthColor, withAlpha } from '@/lib/btw';

interface SpirographSeedProps {
  seed?: string;
  size?: number;
  warmth?: number;
  animate?: boolean;
  bloomMs?: number;
  blur?: number;
  layers?: number;
  speedMul?: number;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export default function SpirographSeed({
  seed = 'between',
  size = 140,
  warmth = 0.5,
  animate = true,
  bloomMs = 0,
  blur = 0,
  layers,
  speedMul = 1,
  style,
  onClick,
}: SpirographSeedProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);

  const params = useMemo(() => {
    const rng = mulberry32(hashString(seed));
    const lyr = layers ?? (3 + Math.floor(rng() * 3));
    const ellipses = [];
    for (let i = 0; i < lyr; i++) {
      const aspect = rng();
      const rx = aspect < 0.5 ? 0.85 + rng() * 0.25 : 0.55 + rng() * 0.25;
      const ry = aspect < 0.5 ? 0.55 + rng() * 0.25 : 0.85 + rng() * 0.25;
      ellipses.push({ rx, ry, rot: (i / lyr) * Math.PI + rng() * 0.4, spin: (rng() - 0.5) * 0.6 });
    }
    return { ellipses };
  }, [seed, layers]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    const W = size * 2, H = size * 2;
    el.width = W * dpr;
    el.height = H * dpr;
    el.style.width = W + 'px';
    el.style.height = H + 'px';
    const ctx = el.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const baseColor = warmthColor(warmth);

    const draw = (now: number) => {
      const t = (now - startRef.current) / 1000;
      const bloomFrac = bloomMs > 0 ? Math.max(0, Math.min(1, (now - startRef.current) / bloomMs)) : 1;
      const bf = 1 - Math.pow(1 - bloomFrac, 3);

      ctx.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2;

      const haloR = size * 0.95;
      const grad = ctx.createRadialGradient(cx, cy, size * 0.1, cx, cy, haloR);
      grad.addColorStop(0, withAlpha(baseColor, 0.22 * bf));
      grad.addColorStop(0.5, withAlpha(baseColor, 0.07 * bf));
      grad.addColorStop(1, withAlpha(baseColor, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
      ctx.fill();

      const masterRot = animate ? t * 0.18 * speedMul : 0;
      const alphas = [0.85, 0.55, 0.32, 0.18, 0.10];
      const strokes = [1.4, 0.9, 0.6, 0.45, 0.35];

      for (let i = 0; i < params.ellipses.length; i++) {
        const e = params.ellipses[i];
        const alpha = (alphas[i] ?? 0.1) * bf;
        const lw = (strokes[i] ?? 0.3) * (size / 60);
        const rot = e.rot + masterRot * (1 + e.spin * 0.4);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot);
        ctx.strokeStyle = withAlpha(baseColor, alpha);
        ctx.lineWidth = lw;
        ctx.shadowColor = withAlpha(baseColor, 0.5 * bf);
        ctx.shadowBlur = i === 0 ? 6 : 0;
        ctx.beginPath();
        ctx.ellipse(0, 0, size * 0.78 * e.rx, size * 0.78 * e.ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.shadowBlur = 0;
      const coreR = Math.max(1.2, size / 50) * bf;
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 5);
      coreGrad.addColorStop(0, `rgba(255,248,235,${0.9 * bf})`);
      coreGrad.addColorStop(0.4, withAlpha(baseColor, 0.4 * bf));
      coreGrad.addColorStop(1, withAlpha(baseColor, 0));
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,250,240,${bf})`;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fill();

      if (animate) {
        rafRef.current = requestAnimationFrame(draw);
      }
    };

    if (animate) {
      rafRef.current = requestAnimationFrame(draw);
    } else {
      draw(performance.now());
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [size, warmth, animate, bloomMs, params, speedMul]);

  useEffect(() => {
    startRef.current = performance.now();
  }, [seed, bloomMs]);

  return (
    <canvas
      ref={ref}
      onClick={onClick}
      style={{
        display: 'block',
        filter: blur ? `blur(${blur}px)` : undefined,
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    />
  );
}
