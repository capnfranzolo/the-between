/**
 * The Between — the one place a story surface asks the database anything.
 *
 * The approval guard here is the same one `api/og/[shortcode]` uses, and for
 * the same reason: a star still in the human queue must never become a shareable
 * artefact. The LLM gate never tells a submitter they were flagged, so their own
 * share controls stay live — this is the guard that keeps a third party from
 * seeing unreviewed content through a link.
 */

import { supabaseServer } from '../supabase/server';
import type { SpiroDimensions } from '../spirograph/renderer';
import type { StoryInput, StoryNeighbour } from './composer';

const DIM_DEFAULTS: SpiroDimensions = {
  certainty: 0.5,
  warmth: 0.5,
  tension: 0.5,
  vulnerability: 0.5,
  scope: 0.5,
  rootedness: 0.5,
  emotionIndex: 3,
  curveType: 'hypotrochoid',
};

interface StarRow {
  shortcode: string;
  answer: string | null;
  unique_fact: string | null;
  dimensions: Partial<SpiroDimensions> | null;
  question_id: string | null;
  status?: string;
}

function toDims(raw: Partial<SpiroDimensions> | null, shortcode: string): SpiroDimensions {
  return { ...DIM_DEFAULTS, ...(raw ?? {}), seed: shortcode };
}

/**
 * Everything the compositor needs for one star's story. Returns `null` for an
 * unknown, unapproved or dimension-less shortcode — the routes turn that into a
 * 404 rather than a placeholder video.
 */
export async function loadStoryInput(shortcode: string): Promise<StoryInput | null> {
  const { data: star } = await supabaseServer
    .from('stars')
    .select('shortcode, answer, unique_fact, dimensions, question_id')
    .eq('shortcode', shortcode)
    .eq('status', 'approved')
    .single<StarRow>();

  if (!star || !star.dimensions) return null;

  const { data: questionRow } = await supabaseServer
    .from('questions')
    .select('text')
    .eq('id', star.question_id)
    .single<{ text: string }>();

  const neighbours = await loadNeighbours(star.question_id, shortcode);

  return {
    star: {
      shortcode,
      answer: star.answer ?? '',
      uniqueFact: star.unique_fact,
      dimensions: toDims(star.dimensions, shortcode),
    },
    questionText: questionRow?.text ?? '',
    questionId: star.question_id,
    neighbours,
  };
}

/** Real stars from the same question — the sky this one joined. */
export async function loadNeighbours(
  questionId: string | null,
  excludeShortcode: string,
  limit = 5,
): Promise<StoryNeighbour[]> {
  if (!questionId) return [];
  const { data } = await supabaseServer
    .from('stars')
    .select('shortcode, dimensions')
    .eq('question_id', questionId)
    .eq('status', 'approved')
    .limit(limit + 4);

  const rows = (data ?? []) as StarRow[];
  return rows
    .filter(r => r.shortcode !== excludeShortcode && r.dimensions)
    .slice(0, limit)
    .map(r => ({ shortcode: r.shortcode, dimensions: toDims(r.dimensions, r.shortcode) }));
}
