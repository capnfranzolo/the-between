/**
 * Round-6 backfill — re-extract every star's dimensions through the new Haiku
 * prompt so existing stars gain the four semantic axes (resolve, charge,
 * connection, temporality) and sort into families.
 *
 * Run from thebetween/:   npx tsx scripts/backfill-dimensions.mts [flags]
 *   --dry-run     extract + print the would-be family table, write nothing
 *   --force       re-extract stars that already have the new axes
 *   --limit N     stop after N extractions (for smoke tests)
 *   --production  use .env.local.bak (the real Supabase project) instead of
 *                 the mock pointed at by .env.local
 *   --check       connectivity/schema probe only: verifies the questions
 *                 table has display_order, counts stars, samples dimension
 *                 keys. No extraction, no writes, no secrets printed.
 *
 * Guarantees:
 *   - NEVER touches status or re-runs moderation verdicts: an approved star
 *     stays approved regardless of what the gate would say today. Only the
 *     dimensions JSON is written.
 *   - Preserves each star's stored curveType (seed-random at birth, not
 *     derivable from the answer).
 *   - Idempotent and resumable: stars that already carry `resolve` are
 *     skipped unless --force.
 *
 * Requires Node ≥22.6 (type stripping). Reads .env.local for keys.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const PROD = process.argv.includes('--production');
const CHECK = process.argv.includes('--check');

// Load env before importing anything that reads process.env. --production
// reads the real project's values (.env.local.bak); secrets are used
// in-process only and never printed.
const envFile = PROD ? '.env.local.bak' : '.env.local';
for (const line of readFileSync(join(root, envFile), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && (PROD || process.env[m[1]] === undefined)) process.env[m[1]] = m[2].trim();
}

const { extractDimensions, visualDimensions } = await import('../src/lib/dimensions/extract');
const { resolveFamily, familyLabel } = await import('../src/lib/spirograph/families');
const { hashString } = await import('../src/lib/btw');

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const FORCE = argv.includes('--force');
const limIdx = argv.indexOf('--limit');
const LIMIT = limIdx >= 0 ? Number(argv[limIdx + 1]) : Infinity;

interface StarRow {
  id: string;
  shortcode: string;
  answer: string | null;
  dimensions: Record<string, unknown> | null;
  status: string;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

console.log(`target: ${new URL(SUPA).host}${PROD ? ' (PRODUCTION)' : ' (mock)'}`);

if (CHECK) {
  const q = await fetch(`${SUPA}/rest/v1/questions?select=slug,display_order&order=display_order`, { headers: HEADERS });
  console.log('questions query (display_order):', q.status);
  if (q.ok) {
    const rows: { slug: string; display_order: number }[] = await q.json();
    console.log('questions:', rows.map(r => `${r.slug}:${r.display_order}`).join(', '));
  } else {
    console.log('body:', (await q.text()).slice(0, 200));
  }
  const c = await fetch(`${SUPA}/rest/v1/stars?select=id&limit=1`, { headers: { ...HEADERS, Prefer: 'count=exact' } });
  console.log('stars count:', c.headers.get('content-range'));
  const d = await fetch(`${SUPA}/rest/v1/stars?select=dimensions,status&limit=3`, { headers: HEADERS });
  if (d.ok) {
    const rows: { dimensions: Record<string, unknown> | null; status: string }[] = await d.json();
    for (const r of rows) console.log('sample star:', r.status, '| dim keys:', Object.keys(r.dimensions ?? {}).join(','));
  }
  process.exit(0);
}

const res = await fetch(`${SUPA}/rest/v1/stars?select=id,shortcode,answer,dimensions,status`, { headers: HEADERS });
if (!res.ok) throw new Error(`stars fetch failed: ${res.status}`);
const stars: StarRow[] = await res.json();
console.log(`${stars.length} stars total${DRY ? ' (DRY RUN — nothing will be written)' : ''}`);

const familyCounts = new Map<string, number>();
let done = 0, skipped = 0, failed = 0;

for (const star of stars) {
  if (done >= LIMIT) break;
  const dims = star.dimensions ?? {};
  if (!FORCE && typeof dims.resolve === 'number') { skipped++; continue; }
  if (!star.answer || !star.answer.trim()) { skipped++; continue; }

  try {
    const result = await extractDimensions(star.answer);
    // Dimensions only — the stored curveType survives, the status is never
    // touched, and the gate's verdict on an already-published star is ignored.
    const merged = {
      ...visualDimensions(result),
      curveType: dims.curveType ?? 'hypotrochoid',
    };
    const fam = resolveFamily(
      { ...merged, emotionIndex: merged.emotionIndex },
      hashString(star.shortcode),
    );
    familyCounts.set(fam.family, (familyCounts.get(fam.family) ?? 0) + 1);
    console.log(`${star.shortcode}  ${familyLabel(fam).padEnd(24)} r=${result.resolve.toFixed(2)} c=${result.charge.toFixed(2)} k=${result.connection.toFixed(2)} t=${result.temporality.toFixed(2)}  "${star.answer.slice(0, 48)}"`);

    if (!DRY) {
      const patch = await fetch(`${SUPA}/rest/v1/stars?id=eq.${star.id}`, {
        method: 'PATCH',
        headers: HEADERS,
        body: JSON.stringify({ dimensions: merged }),
      });
      if (!patch.ok) throw new Error(`PATCH ${patch.status}`);
    }
    done++;
    await sleep(250); // stay polite to the API
  } catch (err) {
    failed++;
    console.error(`FAILED ${star.shortcode}:`, err instanceof Error ? err.message : err);
    await sleep(1000);
  }
}

console.log(`\n${done} re-extracted, ${skipped} skipped, ${failed} failed`);
console.log('\nFamily distribution of re-extracted stars:');
const total = [...familyCounts.values()].reduce((a, b) => a + b, 0) || 1;
for (const [fam, n] of [...familyCounts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${fam.padEnd(10)} ${String(n).padStart(4)}  ${(100 * n / total).toFixed(0)}%`);
}
