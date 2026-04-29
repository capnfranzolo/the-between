// Shared visual building blocks for The Between
// - Spirograph canvas (deterministic per-seed, gentle rotation)
// - Twilight sky background
// - Layered terrain silhouette
// - Distant ambient spirographs

// ─── Palette (locked from brief) ────────────────────────────
const BTW = {
  sky: ['#1E1840', '#3D2D65', '#7B5088', '#9A6080'],
  horizon: ['#B87878', '#D09070', '#E0A868', '#F0C080'],
  terrain: ['#5A3860', '#3E2046', '#261432'], // far → near
  textPri: '#F0E8E0',
  textSec: '#C8B0E0',
  textDim: 'rgba(240, 232, 224, 0.55)',
  // Warmth-driven spirograph hues. Index 0 = coolest, 6 = warmest.
  warmth: [
    '#7DB7D4', // cool teal
    '#9AA8E0', // periwinkle
    '#B894D8', // soft violet
    '#D49AC0', // dusty pink
    '#E8A890', // peach
    '#F0B878', // amber
    '#F5C868', // warm gold
  ],
};

// Deterministic mulberry32 PRNG so a given seed always renders the same shape.
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Pick a warmth color from a 0..1 value
function warmthColor(w) {
  const i = Math.max(0, Math.min(BTW.warmth.length - 1, Math.round(w * (BTW.warmth.length - 1))));
  return BTW.warmth[i];
}

// Convert hex + alpha (0..1) → rgba string
function withAlpha(hex, a) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// ─── Twilight sky background (CSS gradient component) ──────
// Matches the established art direction: 10-stop continuous fade from
// deep indigo at top to warm gold at the horizon, with a soft warm
// haze layer rising from the bottom.
function TwilightSky({ children, style, showHorizon = true }) {
  const skyGrad = [
    `linear-gradient(180deg,`,
    `${BTW.sky[0]} 0%,`,    // #1E1840
    `#2A2050 20%,`,
    `${BTW.sky[1]} 40%,`,   // #3D2D65
    `#5A3D78 56%,`,
    `${BTW.sky[2]} 68%,`,   // #7B5088
    `${BTW.sky[3]} 78%,`,   // #9A6080
    `${BTW.horizon[0]} 86%,`,// #B87878
    `${BTW.horizon[1]} 92%,`,// #D09070
    `${BTW.horizon[2]} 96%,`,// #E0A868
    `${BTW.horizon[3]} 100%)`,// #F0C080
  ].join(' ');
  // Warm haze rising from the horizon
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

function StarField() {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    const dpr = window.devicePixelRatio || 1;
    el.width = w * dpr; el.height = h * dpr;
    el.style.width = w + 'px'; el.style.height = h + 'px';
    const ctx = el.getContext('2d');
    ctx.scale(dpr, dpr);
    const rng = mulberry32(11);
    const count = Math.floor((w * h) / 4500);
    for (let i = 0; i < count; i++) {
      const x = rng() * w;
      const y = rng() * h * 0.75; // stars only in upper sky
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
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.7 }}
    />
  );
}

// ─── Terrain silhouette ─────────────────────────────────────
// Five overlapping low-amplitude bands, progressively darker and more
// saturated as they come forward. Matches the established mockup.
function Terrain({ height = 180 }) {
  // Layers, expressed as paths within a 680×200 viewBox (mockup units),
  // scaled vertically to the requested height.
  const layers = [
    { d: "M0 68 Q70 50 150 60 Q240 74 320 55 Q390 40 460 52 Q540 65 620 48 Q660 42 680 50 L680 200 L0 200Z", fill: '#5A3860', op: 0.75 },
    { d: "M0 85 Q110 74 220 84 Q340 96 450 78 Q550 64 640 76 Q670 80 680 74 L680 200 L0 200Z", fill: '#4A2D52', op: 0.85 },
    { d: "M0 105 Q160 96 320 106 Q480 116 640 102 Q670 98 680 102 L680 200 L0 200Z", fill: '#3C2245', op: 1.0 },
    { d: "M0 128 Q190 120 380 130 Q570 138 680 124 L680 200 L0 200Z", fill: '#30193A', op: 1.0 },
    { d: "M0 150 Q230 144 460 152 Q620 158 680 148 L680 200 L0 200Z", fill: '#261432', op: 1.0 },
  ];
  return (
    <svg
      viewBox="0 0 680 200"
      preserveAspectRatio="none"
      style={{
        position: 'absolute',
        left: 0, right: 0, bottom: 0,
        width: '100%',
        height,
        pointerEvents: 'none',
        display: 'block',
      }}
    >
      {layers.map((l, i) => (
        <path key={i} d={l.d} fill={l.fill} opacity={l.op} />
      ))}
    </svg>
  );
}

// ─── Spirograph canvas ─────────────────────────────────────
// Renders concentric tilted ellipses, slow rotation, glowing core.
// Props:
//   seed: string (the answer text, or any string)  — drives shape
//   size: pixel radius of the visual
//   warmth: 0..1                                    — drives hue
//   animate: bool                                   — rotate over time
//   bloomMs: ms to take fading-in (0 = no bloom)
//   blur: px CSS blur for distance falloff
//   layers: number of ellipses (default derived)
//   speedMul: rotation speed multiplier (default 1)
function Spirograph({
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
}) {
  const ref = React.useRef(null);
  const rafRef = React.useRef(null);
  const startRef = React.useRef(performance.now());

  // Shape params derived deterministically from seed.
  // Following the mockup: 3-5 ellipses, varied aspect ratios (some tall,
  // some wide, some round), distributed rotation angles.
  const params = React.useMemo(() => {
    const rng = mulberry32(hashString(seed));
    const lyr = layers ?? (3 + Math.floor(rng() * 3)); // 3..5
    const ellipses = [];
    for (let i = 0; i < lyr; i++) {
      // Alternate between wide-ish and tall-ish so layers cross visually
      const aspect = rng();
      const rx = aspect < 0.5
        ? 0.85 + rng() * 0.25  // wide
        : 0.55 + rng() * 0.25; // narrow
      const ry = aspect < 0.5
        ? 0.55 + rng() * 0.25
        : 0.85 + rng() * 0.25;
      ellipses.push({
        rx,
        ry,
        rot: (i / lyr) * Math.PI + rng() * 0.4, // distributed angles
        spin: (rng() - 0.5) * 0.6,
      });
    }
    return { ellipses };
  }, [seed, layers]);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    const W = size * 2, H = size * 2;
    el.width = W * dpr; el.height = H * dpr;
    el.style.width = W + 'px'; el.style.height = H + 'px';
    const ctx = el.getContext('2d');
    ctx.scale(dpr, dpr);

    const baseColor = warmthColor(warmth);

    const draw = (now) => {
      const t = (now - startRef.current) / 1000;
      const bloomFrac = bloomMs > 0
        ? Math.max(0, Math.min(1, (now - startRef.current) / bloomMs))
        : 1;
      // Easing for bloom (ease-out-cubic)
      const bf = 1 - Math.pow(1 - bloomFrac, 3);

      ctx.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2;

      // Soft outer halo (very faint)
      const haloR = size * 0.95;
      const grad = ctx.createRadialGradient(cx, cy, size * 0.1, cx, cy, haloR);
      grad.addColorStop(0, withAlpha(baseColor, 0.22 * bf));
      grad.addColorStop(0.5, withAlpha(baseColor, 0.07 * bf));
      grad.addColorStop(1, withAlpha(baseColor, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
      ctx.fill();

      // Ellipse stack — thin colored strokes at varied rotations.
      // Following the established mockup: ~3-4 ellipses, decreasing opacity
      // and stroke-width per layer, with the boldest one fully visible.
      const layersArr = params.ellipses;
      const masterRot = animate ? t * 0.18 * speedMul : 0;
      // Per-layer alpha & stroke per the mockup feel
      const alphas = [0.85, 0.55, 0.32, 0.18, 0.10];
      const strokes = [1.4, 0.9, 0.6, 0.45, 0.35];

      for (let i = 0; i < layersArr.length; i++) {
        const e = layersArr[i];
        const alpha = (alphas[i] ?? 0.1) * bf;
        const lw = (strokes[i] ?? 0.3) * (size / 60);
        const rx = size * 0.78 * e.rx;
        const ry = size * 0.78 * e.ry;
        const rot = e.rot + masterRot * (1 + e.spin * 0.4);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot);
        ctx.strokeStyle = withAlpha(baseColor, alpha);
        ctx.lineWidth = lw;
        ctx.shadowColor = withAlpha(baseColor, 0.5 * bf);
        ctx.shadowBlur = i === 0 ? 6 : 0;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Bright center dot (per mockup — pale, glowing)
      ctx.shadowBlur = 0;
      const coreR = Math.max(1.2, size / 50) * bf;
      // soft halo around dot
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 5);
      coreGrad.addColorStop(0, `rgba(255,248,235,${0.9 * bf})`);
      coreGrad.addColorStop(0.4, withAlpha(baseColor, 0.4 * bf));
      coreGrad.addColorStop(1, withAlpha(baseColor, 0));
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 5, 0, Math.PI * 2);
      ctx.fill();
      // crisp dot
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

  // bloom restart trigger
  React.useEffect(() => { startRef.current = performance.now(); }, [seed, bloomMs]);

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

// Distant ambient spirographs scattered behind UI (for landing/cosmos backgrounds)
function AmbientField({ count = 5, seedBase = 'amb', maxSize = 100, area }) {
  // area: {w, h} of parent
  const items = React.useMemo(() => {
    const rng = mulberry32(hashString(seedBase));
    const arr = [];
    for (let i = 0; i < count; i++) {
      arr.push({
        seed: seedBase + ':' + i,
        x: rng(),
        y: rng() * 0.7,
        s: 0.35 + rng() * 0.65,
        warmth: rng(),
        blur: 4 + rng() * 8,
        speed: 0.4 + rng() * 0.6,
      });
    }
    return arr;
  }, [count, seedBase]);
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.55 }}>
      {items.map((it, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${it.x * 100}%`,
            top: `${it.y * 100}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <Spirograph
            seed={it.seed}
            size={maxSize * it.s}
            warmth={it.warmth}
            blur={it.blur}
            speedMul={it.speed}
          />
        </div>
      ))}
    </div>
  );
}

// Export to window for cross-script access
Object.assign(window, {
  BTW, mulberry32, hashString, warmthColor, withAlpha,
  TwilightSky, StarField, Terrain, Spirograph, AmbientField,
});
