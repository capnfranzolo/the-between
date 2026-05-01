import { NextRequest } from 'next/server';
import { MIN_ANSWER_LENGTH, MAX_ANSWER_LENGTH } from '@/lib/constants';
import { supabaseServer } from '@/lib/supabase/server';
import { hashString } from '@/lib/btw';

function shannonEntropy(text: string): number {
  const freq: Record<string, number> = {};
  for (const ch of text) freq[ch] = (freq[ch] ?? 0) + 1;
  const len = text.length;
  let e = 0;
  for (const n of Object.values(freq)) { const p = n / len; e -= p * Math.log2(p); }
  return e;
}

function isGibberish(text: string): boolean {
  const tokens = text.trim().split(/\s+/);
  if (tokens.length < 4) return true;
  const entropy = shannonEntropy(text);
  if (entropy > 5.2 || entropy < 1.8) return true;
  if (/(.{3,})\1{3,}/i.test(text)) return true;
  return false;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { answer, questionId } = body as { answer?: string; questionId?: string };

  if (!answer || typeof answer !== 'string') {
    return Response.json({ valid: false, reason: 'Missing answer.' });
  }
  if (answer.length < MIN_ANSWER_LENGTH || answer.length > MAX_ANSWER_LENGTH) {
    return Response.json({ valid: false, reason: 'Answer length out of range.' });
  }

  // IP rate limit
  const rawIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const ipHash = hashString(rawIp).toString(16);
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabaseServer
      .from('rate_limits')
      .select('*', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .eq('action', 'star_create')
      .gte('created_at', cutoff);
    if ((count ?? 0) >= 3) {
      return Response.json({ valid: false, reason: "You've shared enough thoughts for today. Come back tomorrow." });
    }
  } catch { /* rate_limits table may not exist yet */ }

  // Gibberish
  if (isGibberish(answer)) {
    return Response.json({ valid: false, reason: "We couldn't understand that. Try writing a real thought." });
  }

  // Duplicate check
  if (questionId) {
    const answerHash = hashString(answer.trim().toLowerCase()).toString(16);
    try {
      const { data: existing } = await supabaseServer
        .from('stars')
        .select('id')
        .eq('answer_hash', answerHash)
        .eq('question_id', questionId)
        .limit(1);
      if (existing && existing.length > 0) {
        return Response.json({ valid: false, reason: 'Someone already shared that exact thought. Try your own words.' });
      }
    } catch { /* answer_hash column may not exist yet */ }
  }

  return Response.json({ valid: true });
}
