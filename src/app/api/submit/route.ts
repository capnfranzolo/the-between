import { NextRequest } from 'next/server';
import { generateShortcode, isValidShortcode } from '@/lib/shortcode';
import { extractDimensions, visualDimensions } from '@/lib/dimensions/extract';
import { randomCurveType } from '@/lib/spirograph/renderer';
import { MIN_ANSWER_LENGTH, MAX_ANSWER_LENGTH } from '@/lib/constants';
import { supabaseServer } from '@/lib/supabase/server';
import { hashString } from '@/lib/btw';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    answer, question_id, unique_fact,
    dimensions: providedDimensions,
    shortcode: suggestedShortcode,
  } = body;

  if (!answer || typeof answer !== 'string') {
    return Response.json({ error: 'Missing answer' }, { status: 400 });
  }
  if (answer.length < MIN_ANSWER_LENGTH || answer.length > MAX_ANSWER_LENGTH) {
    return Response.json({ error: 'Answer length out of range' }, { status: 400 });
  }

  let questionId: string;
  if (question_id && typeof question_id === 'string') {
    questionId = question_id;
  } else {
    const { data: fallbackQuestion } = await supabaseServer
      .from('questions')
      .select('id')
      .eq('active', true)
      .order('display_order')
      .limit(1)
      .single();
    if (!fallbackQuestion) {
      return Response.json({ error: 'No active question' }, { status: 503 });
    }
    questionId = fallbackQuestion.id;
  }

  const rawIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';
  const ipHash = hashString(rawIp).toString(16);

  // Enforce the rate limit this route has always *recorded* but never read: a
  // direct POST here skips the Turnstile that fronts /api/submit/validate, so
  // without this check a bot can mint auto-approved stars (and spend an LLM
  // call each) as fast as it can loop. Five stars an hour is generous for a
  // human with feelings and useless for a botnet of one.
  try {
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabaseServer
      .from('rate_limits')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .eq('action', 'star_create')
      .gte('created_at', cutoff);
    if ((count ?? 0) >= 5) {
      return Response.json(
        { error: 'The sky needs a moment — try again in a little while.' },
        { status: 429 },
      );
    }
  } catch (err) {
    // Fail open: a rate-limit outage must not block a real submission.
    console.error('[submit] rate_limit check failed:', err);
  }

  // Stage G — the shortcode is minted at /api/submit/validate so the pre-birth
  // preview can seed its archetype with it and show the star that is actually
  // born. The client's copy is a SUGGESTION: it is accepted only if it matches
  // exactly what generateShortcode() produces (alphabet + length), and a
  // collision at insert is retried once with a fresh server-generated code.
  let shortcode = isValidShortcode(suggestedShortcode) ? suggestedShortcode : generateShortcode();
  // The publish gate always runs server-side — client-provided dimensions are
  // trusted for visuals only (so the star matches its pre-submit preview), never
  // for the publishability verdict.
  const gateResult = await extractDimensions(answer);
  const dimensionResult = providedDimensions ?? gateResult;
  const curveType = providedDimensions?.curveType ?? randomCurveType();

  // The gate verdict is not persisted: `dimensions` is served verbatim by
  // /api/cosmos, and a pending star approved later must not carry its flag.
  const dimensions = {
    ...visualDimensions(dimensionResult),
    curveType,
  };

  // LLM publish gate: flagged stars go to the admin queue instead of auto-approving.
  // Default (missing/malformed field) is "publishable" — never block a submission on
  // an LLM hiccup. The flag is never surfaced to the client — the star still shows
  // locally regardless of status.
  const status = gateResult.publishable === false ? 'pending' : 'approved';

  const baseInsert = (code: string) => ({
    shortcode: code,
    answer,
    question_id: questionId,
    status,
    approved_at: status === 'approved' ? new Date().toISOString() : null,
    ip_hash: ipHash,
    dimensions,
    unique_fact: unique_fact ?? null,
  });
  const answerHash = hashString(answer.trim().toLowerCase()).toString(16);

  async function insertStar(code: string) {
    let { error } = await supabaseServer
      .from('stars')
      .insert({ ...baseInsert(code), answer_hash: answerHash });

    // Retry without answer_hash if the column doesn't exist yet (migration pending)
    if (error && (error.message?.includes('answer_hash') || error.code === '42703')) {
      ({ error } = await supabaseServer.from('stars').insert(baseInsert(code)));
    }
    return error;
  }

  const isShortcodeCollision = (err: { code?: string; message?: string } | null) =>
    !!err && (err.code === '23505' || /duplicate key|unique constraint|already exists/i.test(err.message ?? ''));

  let error = await insertStar(shortcode);
  // Vanishingly rare at 10 characters — and only reachable via a client-supplied
  // code. The star is worth more than its preview's archetype, so it gets born.
  if (isShortcodeCollision(error)) {
    shortcode = generateShortcode();
    error = await insertStar(shortcode);
  }

  if (!error) {
    try {
      await supabaseServer.from('rate_limits').insert({
        ip_hash: ipHash,
        action: 'star_create',
      });
    } catch (err) {
      console.error('[submit] rate_limit insert failed:', err);
    }
  }

  if (error) {
    console.error('Insert star error:', error);
    return Response.json({ error: 'Failed to save' }, { status: 500 });
  }

  // Never reveal the publish gate to the client — the response shape is identical
  // whether the star was flagged to the pending queue or auto-approved.
  // (`dimensions` was already stripped of the gate verdict above.)
  return Response.json({ shortcode, questionId, dimensions });
}
