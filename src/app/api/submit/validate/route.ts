import { NextRequest } from 'next/server';
import { MIN_ANSWER_LENGTH, MAX_ANSWER_LENGTH } from '@/lib/constants';
import { supabaseServer } from '@/lib/supabase/server';
import { hashString } from '@/lib/btw';
import { extractDimensions } from '@/lib/dimensions/extract';
import { randomCurveType } from '@/lib/spirograph/renderer';
import { verifyTurnstileToken } from '@/lib/turnstile';

function shannonEntropy(text: string): number {
  const freq: Record<string, number> = {};
  for (const ch of text) freq[ch] = (freq[ch] ?? 0) + 1;
  const len = text.length;
  let e = 0;
  for (const n of Object.values(freq)) { const p = n / len; e -= p * Math.log2(p); }
  return e;
}

// Top-500 common English words (subset — sufficient for a 15% hit threshold).
// Not a spell-checker — just a sanity gate against pure gibberish.
const COMMON_WORDS = new Set([
  'i','me','my','myself','we','our','ours','ourselves','you','your','yours',
  'yourself','yourselves','he','him','his','himself','she','her','hers',
  'herself','it','its','itself','they','them','their','theirs','themselves',
  'what','which','who','whom','this','that','these','those','am','is','are',
  'was','were','be','been','being','have','has','had','having','do','does',
  'did','doing','a','an','the','and','but','if','or','because','as','until',
  'while','of','at','by','for','with','about','against','between','into',
  'through','during','before','after','above','below','to','from','up','down',
  'in','out','on','off','over','under','again','further','then','once','here',
  'there','when','where','why','how','all','both','each','few','more','most',
  'other','some','such','no','nor','not','only','own','same','so','than',
  'too','very','can','will','just','should','now','know','think','feel',
  'believe','thought','felt','love','life','time','people','world','way',
  'day','man','woman','child','work','right','left','seem','get','go','come',
  'want','would','like','look','one','could','take','make','good','see','two',
  'long','little','find','say','says','said','also','back','first','even',
  'new','old','many','any','may','still','around','part','place','help',
  'never','might','well','point','real','often','keep','last','thing','things',
  'kind','true','always','every','really','year','years','something','someone',
  'anything','nothing','everything','everyone','somewhere','already','different',
  'though','whether','another','much','sure','tell','hard','mind','end','side',
  'without','hand','large','dont','wont','cant','thats','its','ive','im',
  'theyre','were','theyd','shouldnt','wouldnt','couldnt','isnt','arent',
  'wasnt','werent','hasnt','havent','hadnt','doesnt','didnt',
]);

function hasDictionaryHits(text: string): boolean {
  const words = text.toLowerCase().replace(/[^a-z\s'-]/g, '').trim().split(/\s+/);
  if (words.length === 0) return false;
  const hits = words.filter(w => COMMON_WORDS.has(w)).length;
  // 15% threshold — permissive enough for poetic/abstract answers
  return hits / words.length >= 0.15;
}

function isGibberish(text: string): boolean {
  const tokens = text.trim().split(/\s+/);
  if (tokens.length < 4) return true;
  const entropy = shannonEntropy(text);
  if (entropy > 5.2 || entropy < 1.8) return true;
  if (/(.{3,})\1{3,}/i.test(text)) return true;
  if (!hasDictionaryHits(text)) return true;
  return false;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { answer, questionId, turnstileToken } = body as {
    answer?: string;
    questionId?: string;
    turnstileToken?: string;
  };

  // Verify Turnstile before any expensive operations
  const tokenOk = await verifyTurnstileToken(turnstileToken);
  if (!tokenOk) {
    return Response.json({ valid: false, reason: 'Bot check failed. Please try again.' });
  }

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
  } catch (err) {
    console.error('[validate] rate_limit check failed:', err);
    // Allow through — don't block legitimate users on transient DB errors
  }

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
    } catch (err) {
      console.error('[validate] answer_hash check failed:', err);
    }
  }

  const dimResult = await extractDimensions(answer);
  const dimensions = { ...dimResult, curveType: randomCurveType() };
  return Response.json({ valid: true, dimensions });
}
