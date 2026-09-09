'use client';
import { useEffect, useMemo, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createSpirograph, CURVE_TYPES, type SpiroDimensions, type CurveType } from '@/lib/spirograph/renderer';
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
// dims below sit past each trigger threshold.

const MID = {
  certainty: 0.5, warmth: 0.55, tension: 0.35, vulnerability: 0.5,
  scope: 0.5, rootedness: 0.5,
};

interface FormDef {
  key: string;
  label: string;
  rule: string;
  dims: Partial<typeof MID>;
}

const FORMS: FormDef[] = [
  { key: 'plain',      label: 'plain',            rule: 'mid-range everything (~⅓ of the sky)', dims: {} },
  { key: 'satellites', label: 'satellites',       rule: 'rootedness < 0.16',                    dims: { rootedness: 0.06 } },
  { key: 'binary',     label: 'binary',           rule: 'tension > 0.70',                       dims: { tension: 0.86 } },
  { key: 'saturn',     label: 'saturn',           rule: 'scope > 0.88',                         dims: { scope: 0.95 } },
  { key: 'comet',      label: 'comet',            rule: 'certainty < 0.36',                     dims: { certainty: 0.2 } },
  { key: 'saturn-comet', label: 'saturn + comet', rule: 'composition', dims: { scope: 0.95, certainty: 0.2 } },
];

// ── Proposal forms — dramatic candidates, drawn by src/lib/spirograph/
// proposals.ts over a plain base form. Not in the product; the ones the owner
// picks graduate into archetypes.ts with real dimension triggers. ?exp=<key>
// renders one large. ──────────────────────────────────────────────────────────
interface ProposalDef {
  key: string;
  label: string;
  pitch: string;
  /** Standalone geometries replace the spirograph entirely (round 2). */
  standalone?: boolean;
}

const PROPOSALS: ProposalDef[] = [
  // Overlays on the spirograph.
  { key: 'pulsar',  label: 'pulsar',  pitch: 'a lighthouse — hot core and opposed beams, now with a real heartbeat' },
  { key: 'eclipse', label: 'eclipse', pitch: 'a black hole — fully dark disk, burning rim, and the diamond-ring flare of totality' },
  // Standalone geometries — these replace the spirograph entirely.
  { key: 'geode',        label: 'geode',          pitch: 'the crystal rock — irregular luminous polyhedron, facets lit by depth (owner-approved)', standalone: true },
  { key: 'shard',        label: 'shard',          pitch: 'blades implied by whisper strokes, drawn by light racing outward with dissolving tails', standalone: true },
  { key: 'shatter',      label: 'shatter',        pitch: 'the folding cage — quiet strokes, energy running the ring, vertices easing between rests', standalone: true },
  { key: 'constellation', label: 'constellation', pitch: 'nodes in 3D, whisper links, pulses with dissolving tails walking the survey chain', standalone: true },
  { key: 'vortex',       label: 'vortex',         pitch: 'five arms in five planes, each twisting out of its plane — a storm, light flowing outward', standalone: true },
  { key: 'corona',       label: 'corona',         pitch: 'three breathing crowns with light circulating each ring as the spikes pulse', standalone: true },
  { key: 'harmonograph', label: 'harmonograph',   pitch: 'three damped pendulum traces, each in its own plane — a 3D object now', standalone: true },
  { key: 'maurer',       label: 'maurer rose',    pitch: 'the angular web given depth — samples lifted by a third harmonic, smooth tracers', standalone: true },
  { key: 'superformula', label: 'superformula',   pitch: 'four Gielis star shells in four planes, drawn by long-tailed light', standalone: true },
  { key: 'mystery',      label: 'mystery curve',  pitch: 'the Farris ribbon in 3D, whisper path, long-tailed tracers building it', standalone: true },
  { key: 'phyllotaxis',  label: 'phyllotaxis',    pitch: 'two seed heads cupped away from each other — a balanced object, seeds emanating and dissolving', standalone: true },
  { key: 'clothoid',     label: 'clothoid',       pitch: 'arms fired in fresh planes, longer tails now — the whole form is the drawing', standalone: true },
  { key: 'attractor',    label: 'attractor',      pitch: 'two dust wings folded on a slowly breathing hinge, wind rushing through them', standalone: true },
  { key: 'stringart',    label: 'string art',     pitch: 'two rims crossed in space, strings spanning between them, beads sketching the web with long trails', standalone: true },
  { key: 'spirolateral', label: 'spirolateral',   pitch: 'one turtle walk repeated as a three-blade rotor around a shared heart', standalone: true },
  { key: 'knot',         label: 'lissajous knot', pitch: 'the 3D knot, now built by long-tailed light over a whisper path', standalone: true },
];

function makeDims(def: FormDef, curveType: CurveType, emotionIndex: number, seedHint: string): SpiroDimensions {
  return { ...MID, ...def.dims, emotionIndex, curveType, seed: seedHint };
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

  const exp = params.get('exp');
  const single = arch ? FORMS.find(f => f.key === arch) ?? null : null;
  const singleProposal = exp ? PROPOSALS.find(p => p.key === exp) ?? null : null;

  const singleDims = useMemo(() => {
    if (!single) return null;
    return makeDims(
      single,
      curve ?? 'hypotrochoid',
      emotion != null ? Math.max(0, Math.min(6, Number(emotion))) : 2,
      seed ?? `preview-${single.key}`,
    );
  }, [single, curve, emotion, seed]);

  const proposalDims = useMemo(() => {
    if (!singleProposal) return null;
    const base = makeDims(
      { key: singleProposal.key, label: singleProposal.label, rule: '', dims: {} },
      curve ?? 'hypotrochoid',
      emotion != null ? Math.max(0, Math.min(6, Number(emotion))) : 2,
      seed ?? `exp-${singleProposal.key}`,
    );
    return { ...base, experiment: singleProposal.key };
  }, [singleProposal, curve, emotion, seed]);


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

      {singleProposal && proposalDims ? (
        <div>
          <div style={{ fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: BTW.textDim, marginBottom: 12 }}>
            proposal: {singleProposal.label} — {singleProposal.pitch}
          </div>
          <StarCell dims={proposalDims} size={size} animate />
        </div>
      ) : single && singleDims ? (
        <div>
          <div style={{ fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: BTW.textDim, marginBottom: 12 }}>
            {single.label} — {single.rule} · curve {singleDims.curveType} · emotion {singleDims.emotionIndex}
          </div>
          <StarCell dims={singleDims} size={size} animate />
        </div>
      ) : (
        <>
          {FORMS.map(def => (
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
          ))}

          {([
            ['proposals · overlays', 'dressings on the familiar form — ?exp=<key> for one form, large', PROPOSALS.filter(p => !p.standalone)],
            ['proposals · new geometries', 'whole different curve families — these replace the spirograph entirely', PROPOSALS.filter(p => p.standalone)],
          ] as const).map(([heading, sub, list]) => (
            <div key={heading}>
              <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 24, opacity: 0.8, marginTop: 64, marginBottom: 4 }}>
                {heading}
              </div>
              <div style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: BTW.textDim, marginBottom: 32 }}>
                {sub}
              </div>
              {list.map(prop => (
                <div key={prop.key} style={{ marginBottom: 44 }}>
                  <div style={{ fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: BTW.textDim, marginBottom: 4 }}>
                    {prop.label}
                    <span style={{ opacity: 0.55, textTransform: 'none', letterSpacing: '0.04em', marginLeft: 10 }}>{prop.pitch}</span>
                    <a href={`?exp=${prop.key}`} style={{ color: BTW.textDim, marginLeft: 10, opacity: 0.7 }}>enlarge →</a>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {([1, 3, 5] as const).map((emo, i) => {
                      const curveType = CURVE_TYPES[(PROPOSALS.indexOf(prop) + i * 2) % CURVE_TYPES.length];
                      const dims = {
                        ...makeDims({ key: prop.key, label: prop.label, rule: '', dims: {} }, curveType, emo, `exp-${prop.key}-${i}`),
                        experiment: prop.key,
                      };
                      return (
                        <div key={i} style={{ textAlign: 'center' }}>
                          <StarCell dims={dims} size={190} animate={false} />
                          <div style={{ fontSize: 10, color: BTW.textDim, opacity: 0.7, marginTop: -8 }}>
                            {prop.standalone ? `variant ${i + 1}` : curveType}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export default function StarPreviewPage() {
  return <Suspense fallback={null}><PreviewInner /></Suspense>;
}
