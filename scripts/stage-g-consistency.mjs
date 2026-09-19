/**
 * Stage G — preview/birth consistency check (headless, no server needed).
 *
 * Walks the exact data path a star takes:
 *   /api/submit/validate  →  dimensions (+ minted shortcode as `seed`)
 *      → UniqueOverlay preview render
 *      → /api/submit  →  visualDimensions(...) stored in the DB
 *      → cosmos / StarDetail / OG  →  withSeed(stored, shortcode) render
 * and asserts the previewed star and the born star are the same star:
 * identical dimension fields, identical family/form/archetype, identical pixels.
 *
 * Run: node scripts/stage-g-consistency.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const jiti = require('jiti')(process.cwd() + '/scripts/_jiti.js', { interopDefault: true });

const { withSeed, createSpirograph, randomCurveType } = jiti(process.cwd() + '/src/lib/spirograph/renderer.ts');
const { resolveArchetype, archetypeLabel } = jiti(process.cwd() + '/src/lib/spirograph/archetypes.ts');
const { resolveFamily, familyLabel } = jiti(process.cwd() + '/src/lib/spirograph/families.ts');
const { visualDimensions } = jiti(process.cwd() + '/src/lib/dimensions/extract.ts');
const { generateShortcode, isValidShortcode } = jiti(process.cwd() + '/src/lib/shortcode.ts');
const { createCanvas } = require('@napi-rs/canvas');

// ── the three renderers of record, replicated minimally (computeGeometry's own
//    two calls — no renderer surgery) ──────────────────────────────────────────
function resolution(dims) {
  const arch = resolveArchetype(dims);
  const fam = resolveFamily(dims, arch.seed);
  return { seed: arch.seed, family: fam.family, form: fam.type, arch: archetypeLabel(arch), label: familyLabel(fam) };
}

function renderPng(dims, t = 3.0, size = 480) {
  const canvas = createCanvas(size, size);
  canvas.style = { width: `${size}px`, height: `${size}px` };
  const spiro = createSpirograph(canvas, dims, { size, dpr: 1 });
  spiro.renderStatic(t);
  return canvas.toBuffer('image/png');
}

// Four realistic extractions, chosen to land in different families.
const EXTRACTIONS = [
  { name: 'tangle+binary', certainty: 0.86, warmth: 0.44, tension: 0.78, vulnerability: 0.52, scope: 0.40,
    rootedness: 0.55, resolve: 0.72, charge: 0.41, connection: 0.50, temporality: 0.60, emotionIndex: 5,
    reasoning: 'a held conviction, wound tight' },
  { name: 'lattice',       certainty: 0.80, warmth: 0.60, tension: 0.30, vulnerability: 0.40, scope: 0.55,
    rootedness: 0.70, resolve: 0.88, charge: 0.30, connection: 0.44, temporality: 0.62, emotionIndex: 2,
    reasoning: 'a landed insight' },
  { name: 'field',         certainty: 0.60, warmth: 0.75, tension: 0.35, vulnerability: 0.50, scope: 0.66,
    rootedness: 0.48, resolve: 0.74, charge: 0.45, connection: 0.94, temporality: 0.55, emotionIndex: 6,
    reasoning: 'about the people' },
  { name: 'void',          certainty: 0.75, warmth: 0.30, tension: 0.22, vulnerability: 0.84, scope: 0.45,
    rootedness: 0.62, resolve: 0.70, charge: 0.22, connection: 0.40, temporality: 0.44, emotionIndex: 4,
    reasoning: 'grief, held alone' },
];

let failures = 0;
const ok = (c, msg) => { console.log(`  ${c ? 'OK  ' : 'FAIL'}  ${msg}`); if (!c) failures++; };

for (const ex of EXTRACTIONS) {
  const { name, ...dimResult } = ex;
  console.log(`\n── ${name} ──────────────────────────────────────────`);

  // 1. /api/submit/validate
  const shortcode = generateShortcode();
  const curveType = randomCurveType();
  const validateDims = { ...visualDimensions(dimResult), curveType, seed: shortcode };
  ok(isValidShortcode(shortcode), `validate minted a well-formed shortcode: ${shortcode}`);

  // 2. the preview (UniqueOverlay → Spirograph): the full dimension object,
  //    seeded with the minted shortcode.
  const previewDims = { ...validateDims, seed: shortcode };

  // 3. /api/submit stores visualDimensions(providedDimensions) + curveType
  const storedDims = { ...visualDimensions(validateDims), curveType };

  // 4. cosmos / StarDetail / OG draw withSeed(stored, shortcode)
  const bornDims = withSeed(storedDims, shortcode);

  // stored dims must be field-for-field the previewed dims, minus the seed
  const previewFields = Object.fromEntries(Object.entries(previewDims).filter(([k]) => k !== 'seed'));
  const storedFields = { ...storedDims };
  ok(JSON.stringify(previewFields) === JSON.stringify(storedFields),
    `stored dims === previewed dims (minus seed): ${JSON.stringify(storedFields)}`);
  ok(!('seed' in storedDims), 'the seed is NOT persisted into the stored dimensions');
  for (const axis of ['resolve', 'charge', 'connection', 'temporality']) {
    ok(typeof storedDims[axis] === 'number', `family axis "${axis}" survives into storage (${storedDims[axis]})`);
  }

  const rp = resolution(previewDims);
  const rb = resolution(bornDims);
  ok(rp.seed === rb.seed && rp.family === rb.family && rp.form === rb.form && rp.arch === rb.arch,
    `preview ${rp.label} [${rp.arch}] seed=${rp.seed}  ===  born ${rb.label} [${rb.arch}] seed=${rb.seed}`);

  const a = renderPng(previewDims), b = renderPng(bornDims);
  ok(a.equals(b), `pixel-identical render, preview vs born (${a.length} bytes)`);

  // What the bug looked like: the old Spirograph.tsx built its dims from the six
  // visual floats + emotionIndex + curveType only — no axes, no seed.
  const oldPreview = {
    certainty: previewDims.certainty, warmth: previewDims.warmth, tension: previewDims.tension,
    vulnerability: previewDims.vulnerability, scope: previewDims.scope, rootedness: previewDims.rootedness,
    emotionIndex: previewDims.emotionIndex, curveType: previewDims.curveType,
  };
  const ro = resolution(oldPreview);
  const sameForm = ro.family === rb.family && ro.form === rb.form && ro.arch === rb.arch;
  const oldPixelsMatch = renderPng(oldPreview).equals(b);
  console.log(`  (before) old preview path resolved: ${ro.label} [${ro.arch}] seed=${ro.seed}` +
    `  → form ${sameForm ? 'matched by luck' : 'MISMATCH'}, pixels ${oldPixelsMatch ? 'match' : 'DIFFER'} — the bug`);
}

console.log(`\n${failures === 0 ? 'ALL CONSISTENCY CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
