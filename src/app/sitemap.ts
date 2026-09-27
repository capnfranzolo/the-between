/**
 * The Between — sitemap, with a video entry per star.
 *
 * Every approved star's /s/ page is listed, each carrying a <video:video>
 * block (Google's video sitemap extension — the strongest signal we can send
 * that these pages ARE their videos). thumbnail_loc is the 1200×630 OG card:
 * Google caps video thumbnails at 1920×1080, so the 9:16 poster (1080×1920)
 * is out of spec — the OG card is not.
 *
 * Served at /sitemap.xml and declared in robots.ts.
 */

import type { MetadataRoute } from 'next';
import { supabaseServer } from '@/lib/supabase/server';
import { SITE_URL } from '@/lib/constants';

export const revalidate = 3600; // rebuild at most hourly

const BASE = `https://${SITE_URL}`;

interface StarRow {
  shortcode: string;
  answer: string | null;
  question_id: string | null;
  created_at: string | null;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: BASE, changeFrequency: 'weekly', priority: 1 },
  ];

  const [{ data: questions }, { data: stars }] = await Promise.all([
    supabaseServer.from('questions').select('id, text').eq('active', true),
    supabaseServer
      .from('stars')
      .select('shortcode, answer, question_id, created_at')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(5000),
  ]);

  const questionText = new Map<string, string>(
    (questions ?? []).map((q: { id: string; text: string }) => [q.id, q.text]),
  );

  for (const q of questions ?? []) {
    entries.push({ url: `${BASE}/cosmos/${q.id}`, changeFrequency: 'daily', priority: 0.8 });
  }

  for (const s of (stars ?? []) as StarRow[]) {
    const question = (s.question_id && questionText.get(s.question_id)) ||
      'What do you know is true?';
    entries.push({
      url: `${BASE}/s/${s.shortcode}`,
      lastModified: s.created_at ?? undefined,
      changeFrequency: 'monthly',
      priority: 0.6,
      videos: [{
        title: `${question} — The Between`,
        description: `"${(s.answer ?? '').slice(0, 200)}"`,
        thumbnail_loc: `${BASE}/api/og/${s.shortcode}`,
        content_loc: `${BASE}/api/story/${s.shortcode}`,
        player_loc: `${BASE}/embed/${s.shortcode}`,
        duration: 21,
        publication_date: s.created_at ?? undefined,
        family_friendly: 'yes',
        live: 'no',
      }],
    });
  }

  return entries;
}
