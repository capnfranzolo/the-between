/**
 * Stage G — forming reveal frames + "nothing else changed" proof (headless).
 *
 *  1. Renders the forming sequence (p = 0.05 … 1.0) for a plain tangle star, an
 *     archetype-dressed tangle star and a standalone-family star → review/forming-*.png
 *  2. Asserts p = 1 is pixel-identical to an ordinary renderStatic at the same t.
 *  3. Asserts the ordinary (forming-off) renderer is byte-identical to the
 *     pre-Stage-G renderer at HEAD, across every family/archetype and several
 *     times — including story/curve.ts's PathRecorder capture and a real
 *     1080×1920 story poster composed from both trees.
 *
 * Run: node scripts/stage-g-forming.mjs
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const BEFORE = process.env.STAGE_G_BEFORE; // a copy of src/lib with HEAD's renderer.ts
const jiti = require('jiti')(path.join(ROOT, 'scripts/_jiti.js'), { interopDefault: true });
const { createCanvas } = require('@napi-rs/canvas');

const after = jiti(path.join(ROOT, 'src/lib/spirograph/renderer.ts'));
const afterCurve = jiti(path.join(ROOT, 'src/lib/story/curve.ts'));
const afterComposer = jiti(path.join(ROOT, 'src/lib/story/composer.ts'));
const before = BEFORE ? jiti(path.join(BEFORE, 'lib/spirograph/renderer.ts')) : null;
const beforeCurve = BEFORE ? jiti(path.join(BEFORE, 'lib/story/curve.ts')) : null;
const beforeComposer = BEFORE ? jiti(path.join(BEFORE, 'lib/story/composer.ts')) : null;

const REVIEW = path.join(ROOT, 'review');
fs.mkdirSync(REVIEW, { recursive: true });

let failures = 0;
const ok = (c, msg) => { console.log(`  ${c ? 'OK  ' : 'FAIL'}  ${msg}`); if (!c) failures++; };

const SIZE = 480;
function draw(mod, dims, t, opts) {
  const canvas = createCanvas(SIZE, SIZE);
  canvas.style = { width: `${SIZE}px`, height: `${SIZE}px` };
  const spiro = mod.createSpirograph(canvas, dims, { size: SIZE, dpr: 1 });
  spiro.renderStatic(t, opts);
  return canvas;
}
const pixels = canvas => canvas.getContext('2d').getImageData(0, 0, SIZE, SIZE).data;

/** The renderer draws on transparency; the review PNGs get the twilight ground
 *  under them so they can actually be looked at. Diffs use the raw canvases. */
function onNight(canvas) {
  const out = createCanvas(SIZE, SIZE);
  const c = out.getContext('2d');
  c.fillStyle = '#0D0A20';
  c.fillRect(0, 0, SIZE, SIZE);
  c.drawImage(canvas, 0, 0);
  return out.toBuffer('image/png');
}

function diff(a, b) {
  let n = 0, max = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d) { if (i % 4 !== 3 || d) n++; if (d > max) max = d; }
  }
  return { differing: n, maxDelta: max };
}
/** Rough "is anything drawn, and how much" — lit subpixels above a floor. */
function ink(px) {
  let lit = 0, sum = 0;
  for (let i = 3; i < px.length; i += 4) { if (px[i] > 8) lit++; sum += px[i]; }
  return { lit, mean: (sum / (px.length / 4)).toFixed(2) };
}

// ── The three stars ──────────────────────────────────────────────────────────
// Families come from families.ts thresholds: lattice needs resolve > 0.78;
// tangle needs resolve in (0.68, 0.78], charge ≤ 0.55, connection ≤ 0.89,
// temporality ≥ 0.24. Archetypes: tension > 0.70 → binary, rootedness < 0.16 →
// satellites, certainty > 0.7 → the ghost trace is drawn.
const STARS = {
  'tangle-plain': {
    certainty: 0.88, warmth: 0.52, tension: 0.34, vulnerability: 0.46, scope: 0.50,
    rootedness: 0.42, resolve: 0.72, charge: 0.40, connection: 0.50, temporality: 0.60,
    emotionIndex: 2, curveType: 'hypotrochoid', seed: 'q7m2xk40ab',
  },
  'tangle-dressed': {
    certainty: 0.86, warmth: 0.44, tension: 0.79, vulnerability: 0.52, scope: 0.40,
    rootedness: 0.09, resolve: 0.72, charge: 0.41, connection: 0.50, temporality: 0.60,
    emotionIndex: 5, curveType: 'hypotrochoid', seed: 'zz18hq3cde',
  },
  'standalone-lattice': {
    certainty: 0.80, warmth: 0.60, tension: 0.30, vulnerability: 0.40, scope: 0.55,
    rootedness: 0.70, resolve: 0.88, charge: 0.30, connection: 0.44, temporality: 0.62,
    emotionIndex: 6, curveType: 'hypotrochoid', seed: 'kup4lg1yfy',
  },
};

const P_STEPS = [0.05, 0.15, 0.3, 0.5, 0.75, 0.95, 1.0];
const T_FIXED = 3.0;

console.log('\n══ 1. forming frames ═════════════════════════════════════');
const { resolveArchetype, archetypeLabel } = jiti(path.join(ROOT, 'src/lib/spirograph/archetypes.ts'));
const { resolveFamily, familyLabel } = jiti(path.join(ROOT, 'src/lib/spirograph/families.ts'));

for (const [name, dims] of Object.entries(STARS)) {
  const arch = resolveArchetype(dims);
  const fam = resolveFamily(dims, arch.seed);
  console.log(`\n── ${name}: ${familyLabel(fam)} [${archetypeLabel(arch)}] ──`);

  for (const p of P_STEPS) {
    const canvas = draw(after, dims, T_FIXED, { forming: p });
    const tag = String(p).replace('.', '');
    const file = path.join(REVIEW, `forming-${name}-p${tag}.png`);
    fs.writeFileSync(file, onNight(canvas));
    const i = ink(pixels(canvas));
    console.log(`  p=${String(p).padEnd(5)} lit=${String(i.lit).padStart(6)} meanAlpha=${i.mean}  → ${path.basename(file)}`);
  }

  const normal = draw(after, dims, T_FIXED);
  fs.writeFileSync(path.join(REVIEW, `forming-${name}-normal.png`), onNight(normal));
  const d = diff(pixels(draw(after, dims, T_FIXED, { forming: 1.0 })), pixels(normal));
  ok(d.differing === 0, `p=1.0 is pixel-identical to the ordinary frame at t=${T_FIXED} (differing=${d.differing}, maxΔ=${d.maxDelta})`);
  const d99 = diff(pixels(draw(after, dims, T_FIXED, { forming: 0.999 })), pixels(normal));
  console.log(`        (p=0.999 vs ordinary: differing=${d99.differing}, maxΔ=${d99.maxDelta} — the ramp lands smoothly)`);
}

// ── 2. the ordinary path is untouched ────────────────────────────────────────
if (!before) {
  console.log('\n(skipping before/after — set STAGE_G_BEFORE)');
} else {
  console.log('\n══ 2. forming OFF === pre-Stage-G renderer (HEAD) ════════');
  const MATRIX = {
    ...STARS,
    'no-axes-legacy': { certainty: 0.4, warmth: 0.3, tension: 0.8, vulnerability: 0.9, scope: 0.92,
      rootedness: 0.05, emotionIndex: 0, curveType: 'epitrochoid' },
    'comet-saturn': { certainty: 0.2, warmth: 0.7, tension: 0.3, vulnerability: 0.3, scope: 0.95,
      rootedness: 0.5, resolve: 0.70, charge: 0.30, connection: 0.5, temporality: 0.6,
      emotionIndex: 1, curveType: 'rose', seed: 'cometsatrn' },
    'void-eclipse': { certainty: 0.75, warmth: 0.30, tension: 0.22, vulnerability: 0.84, scope: 0.45,
      rootedness: 0.62, resolve: 0.70, charge: 0.22, connection: 0.40, temporality: 0.44,
      emotionIndex: 4, curveType: 'rhodonea', seed: '3m5vgf8al5' },
    'radiance-pulsar': { certainty: 0.5, warmth: 0.8, tension: 0.4, vulnerability: 0.3, scope: 0.4,
      rootedness: 0.5, resolve: 0.6, charge: 0.9, connection: 0.3, temporality: 0.7,
      emotionIndex: 0, curveType: 'lissajous', seed: 'radiance01' },
    'currents': { certainty: 0.9, warmth: 0.4, tension: 0.1, vulnerability: 0.6, scope: 0.3,
      rootedness: 0.8, resolve: 0.40, charge: 0.30, connection: 0.2, temporality: 0.9,
      emotionIndex: 3, curveType: 'rose', seed: 'currents01' },
    'field-phyllo': { certainty: 0.6, warmth: 0.75, tension: 0.35, vulnerability: 0.5, scope: 0.66,
      rootedness: 0.48, resolve: 0.74, charge: 0.45, connection: 0.94, temporality: 0.55,
      emotionIndex: 6, curveType: 'lissajous', seed: '4hd0ph88zt' },
  };
  let same = 0, checks = 0;
  for (const [name, dims] of Object.entries(MATRIX)) {
    for (const t of [0, 1.7, 3.0, 7.3, 42.5]) {
      checks++;
      const a = draw(before, dims, t).toBuffer('image/png');
      const b = draw(after, dims, t).toBuffer('image/png');
      if (a.equals(b)) same++;
      else console.log(`  FAIL  ${name} @ t=${t} differs`);
    }
    // default-arg parity too (renderStatic() with no arguments)
    const ca = createCanvas(SIZE, SIZE); ca.style = { width: `${SIZE}px`, height: `${SIZE}px` };
    const cb = createCanvas(SIZE, SIZE); cb.style = { width: `${SIZE}px`, height: `${SIZE}px` };
    before.createSpirograph(ca, dims, { size: SIZE, dpr: 1 }).renderStatic();
    after.createSpirograph(cb, dims, { size: SIZE, dpr: 1 }).renderStatic();
    checks++; if (ca.toBuffer('image/png').equals(cb.toBuffer('image/png'))) same++;
    else console.log(`  FAIL  ${name} @ renderStatic() default differs`);
  }
  ok(same === checks, `${same}/${checks} byte-identical PNGs across ${Object.keys(MATRIX).length} stars × 5 times + defaults`);

  console.log('\n══ 3. story/curve.ts PathRecorder capture ════════════════');
  let curveSame = 0, curveChecks = 0;
  for (const [name, dims] of Object.entries(MATRIX)) {
    curveChecks++;
    const a = beforeCurve.captureCurvePath(dims, 560, 3.0);
    const b = afterCurve.captureCurvePath(dims, 560, 3.0);
    if (JSON.stringify(a) === JSON.stringify(b)) curveSame++;
    else console.log(`  FAIL  ${name} curve capture differs`);
    if (name === 'tangle-plain') console.log(`  tangle-plain capture: ${a ? `${a.points.length} pts, extent ${a.extent.toFixed(2)}` : 'null'}`);
    if (name === 'standalone-lattice') console.log(`  standalone capture:  ${a ? `${a.points.length} pts` : 'null (expected — no ghost trace)'}`);
  }
  ok(curveSame === curveChecks, `${curveSame}/${curveChecks} identical curve captures (the recorder sees no new ctx calls)`);

  console.log('\n══ 4. story poster, composed before vs after ═════════════');
  const input = {
    star: {
      shortcode: 'q7m2xk40ab',
      answer: 'I keep the lamp on in the hallway because someone might still come home.',
      uniqueFact: 'I collect rainwater',
      dimensions: STARS['tangle-plain'],
    },
    questionText: 'What do you know that you cannot prove?',
    questionId: '00000000-0000-4000-8000-000000000001',
    neighbours: [
      { shortcode: 'zz18hq3cde', dimensions: STARS['tangle-dressed'] },
      { shortcode: 'kup4lg1yfy', dimensions: STARS['standalone-lattice'] },
    ],
  };
  const posterA = beforeComposer.renderSegmentFrame(beforeComposer.starSegment(input), beforeComposer.POSTER_T);
  const posterB = afterComposer.renderSegmentFrame(afterComposer.starSegment(input), afterComposer.POSTER_T);
  fs.writeFileSync(path.join(REVIEW, 'forming-poster-after.png'), posterB);
  ok(posterA.equals(posterB), `1080×1920 story poster byte-identical before/after (${posterB.length} bytes) → review/forming-poster-after.png`);
}

console.log(`\n${failures === 0 ? 'ALL FORMING CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
