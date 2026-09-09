'use client';
import { useEffect, useMemo, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createSpirograph, CURVE_TYPES, type SpiroDimensions, type CurveType } from '@/lib/spirograph/renderer';
import { resolveArchetype } from '@/lib/spirograph/archetypes';
import { BTW, SANS, SERIF } from '@/lib/btw';

// ── /preview/stars — unlisted archetype gallery ───────────────────────────────
// A dev/art-direction tool: every structural archetype the renderer can grow,
// on demand, without hunting the sky for one. Not linked from the product.
//
//   /preview/stars                     → the full gallery
//   /preview/stars?arch=armillary      → one form, large and animated
//     &curve=hypotrochoid|epitrochoid|rose|lissajous|rhodonea
//     &emotion=0..6   &seed=anything   &size=560
//
// Archetypes resolve from dimensions + seed exactly as in the cosmos — the
// dims below sit past each trigger threshold, and rare seeds are searched
// through the real resolver so this page can never drift out of sync with it.

const MID = {
  certainty: 0.5, warmth: 0.55, tension: 0.35, vulnerability: 0.5,
  scope: 0.5, rootedness: 0.5,
};

interface FormDef {
  key: string;
  label: string;
  rule: string;
  dims: Partial<typeof MID>;
  wantRare?: boolean;
}

const FORMS: FormDef[] = [
  { key: 'plain',      label: 'plain',            rule: 'mid-range everything (~⅓ of the sky)', dims: {} },
  { key: 'satellites', label: 'satellites',       rule: 'rootedness < 0.16',                    dims: { rootedness: 0.06 } },
  { key: 'binary',     label: 'binary',           rule: 'tension > 0.70',                       dims: { tension: 0.86 } },
  { key: 'halo',       label: 'halo',             rule: 'scope > 0.88',                         dims: { scope: 0.95 } },
  { key: 'comet',      label: 'comet',            rule: 'certainty < 0.36',                     dims: { certainty: 0.2 } },
  { key: 'crystal',    label: 'crystalline knot', rule: 'certainty > 0.80',                     dims: { certainty: 0.92 } },
  { key: 'armillary',  label: 'armillary (rare)', rule: '1% of shortcodes',                     dims: {}, wantRare: true },
  { key: 'crystal-halo',     label: 'crystal + halo',     rule: 'composition', dims: { certainty: 0.92, scope: 0.95 } },
  { key: 'satellites-comet', label: 'satellites + comet', rule: 'composition', dims: { rootedness: 0.06, certainty: 0.2 } },
  { key: 'binary-halo',      label: 'binary + halo',      rule: 'composition', dims: { tension: 0.86, scope: 0.95 } },
];

function makeDims(def: FormDef, curveType: CurveType, emotionIndex: number, seedHint: string): SpiroDimensions {
  const base = { ...MID, ...def.dims, emotionIndex, curveType };
  // Search for a seed that resolves to exactly the wanted form through the
  // real resolver — rare needs a 1-in-100 hash hit; every other form needs a
  // seed that does NOT accidentally hit rare.
  for (let i = 0; i < 4000; i++) {
    const seed = `${seedHint}-${i}`;
    const spec = resolveArchetype({ ...base, seed });
    if (def.wantRare ? spec.rare : !spec.rare) return { ...base, seed };
  }
  return { ...base, seed: seedHint };
}

function StarCell({ dims, size, animate }: { dims: SpiroDimensions; size: number; animate: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const inst = createSpirograph(canvas, dims, { size: 600, dpr: 1 });
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    if (!animate) {
      inst.renderStatic(2.5);
      return () => inst.stop();
    }
    let t = 0; let raf: number;
    const tick = () => { t += 0.016; inst.renderStatic(t); raf = requestAnimationFrame(tick); };
    tick();
    return () => { cancelAnimationFrame(raf); inst.stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(dims), size, animate]);
  return <canvas ref={canvasRef} style={{ display: 'block' }} />;
}

function PreviewInner() {
  const params = useSearchParams();
  const arch = params.get('arch');
  const curve = (params.get('curve') as CurveType | null) ?? null;
  const emotion = params.get('emotion');
  const seed = params.get('seed');
  const size = Math.min(800, Math.max(120, Number(params.get('size')) || 560));

  const single = arch ? FORMS.find(f => f.key === arch) ?? null : null;

  const singleDims = useMemo(() => {
    if (!single) return null;
    const d = makeDims(
      single,
      curve ?? 'hypotrochoid',
      emotion != null ? Math.max(0, Math.min(6, Number(emotion))) : 2,
      seed ?? `preview-${single.key}`,
    );
    return seed && !single.wantRare ? { ...d, seed } : d;
  }, [single, curve, emotion, seed]);


  return (
    <div style={{
      minHeight: '100vh', background: BTW.sky?.[0] ?? '#0c0a1e',
      color: BTW.textPri, fontFamily: SANS, padding: '40px 32px 80px',
    }}>
      <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 28, opacity: 0.8 }}>
        the star family
      </div>
      <div style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: BTW.textDim, marginTop: 6, marginBottom: 36 }}>
        unlisted preview · ?arch=&lt;key&gt;&amp;curve=&amp;emotion=0-6&amp;seed=&amp;size= for one form, large
      </div>

      {single && singleDims ? (
        <div>
          <div style={{ fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: BTW.textDim, marginBottom: 12 }}>
            {single.label} — {single.rule} · curve {singleDims.curveType} · emotion {singleDims.emotionIndex}
          </div>
          <StarCell dims={singleDims} size={size} animate />
        </div>
      ) : (
        FORMS.map(def => (
          <div key={def.key} style={{ marginBottom: 44 }}>
            <div style={{ fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: BTW.textDim, marginBottom: 4 }}>
              {def.label}
              <span style={{ opacity: 0.55, textTransform: 'none', letterSpacing: '0.04em', marginLeft: 10 }}>{def.rule}</span>
              <a href={`?arch=${def.key}`} style={{ color: BTW.textDim, marginLeft: 10, opacity: 0.7 }}>enlarge →</a>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {([0, 2, 4] as const).map((emo, i) => {
                const curveType = CURVE_TYPES[(FORMS.indexOf(def) + i * 2) % CURVE_TYPES.length];
                const dims = makeDims(def, curveType, emo, `preview-${def.key}-${i}`);
                return (
                  <div key={i} style={{ textAlign: 'center' }}>
                    <StarCell dims={dims} size={190} animate={false} />
                    <div style={{ fontSize: 10, color: BTW.textDim, opacity: 0.7, marginTop: -8 }}>{curveType}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default function StarPreviewPage() {
  return <Suspense fallback={null}><PreviewInner /></Suspense>;
}
