import { Metadata } from 'next';
import { supabaseServer } from '@/lib/supabase/server';
import { SITE_URL } from '@/lib/constants';
import StarRedirectClient from './StarRedirectClient';

interface Props { params: Promise<{ shortcode: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shortcode } = await params;

  // Fetch star + question for richer meta
  const { data: star } = await supabaseServer
    .from('stars')
    .select('answer, unique_fact, question_id')
    .eq('shortcode', shortcode)
    .eq('status', 'approved')
    .single();

  let questionText = "What do you know is true but you can't prove?";
  if (star?.question_id) {
    const { data: q } = await supabaseServer
      .from('questions')
      .select('text')
      .eq('id', star.question_id)
      .single();
    if (q?.text) questionText = q.text;
  }

  // "Question?: Answer." — keep description under 155 chars
  const answerSnippet = star?.answer
    ? `"${star.answer.slice(0, 120)}${star.answer.length > 120 ? '…' : ''}"`
    : '"Something true that can\'t be proved."';

  // Short question for the browser tab (drop trailing punctuation, cap length)
  const shortQ = questionText.replace(/[?.!]+$/, '').slice(0, 60);
  const pageTitle = `${shortQ}: ${answerSnippet}`;

  const ogImageUrl = `https://${SITE_URL}/api/og/${shortcode}`;
  const ogVideoUrl = `https://${SITE_URL}/api/story/${shortcode}`;
  const pageUrl    = `https://${SITE_URL}/s/${shortcode}`;

  return {
    title: pageTitle,
    description: `${questionText} — ${answerSnippet}`,
    openGraph: {
      title: questionText,
      description: answerSnippet,
      siteName: 'The Between',
      type: 'website',
      url: pageUrl,
      images: [{
        url: ogImageUrl,
        width: 1200,
        height: 630,
        alt: answerSnippet,
      }],
      // The story MP4. Facebook and X ignore third-party og:video and show the
      // image; Telegram, Discord, WhatsApp and often iMessage unfurl it as a
      // playable inline video — the channels a personal link actually travels.
      // The image above stays as the universal fallback.
      videos: [{
        url: ogVideoUrl,
        secureUrl: ogVideoUrl,
        type: 'video/mp4',
        width: 1080,
        height: 1920,
      }],
    },
    twitter: {
      card: 'summary_large_image',
      title: questionText,
      description: answerSnippet,
      images: [ogImageUrl],
    },
  };
}

export default async function StarPage({ params }: Props) {
  const { shortcode } = await params;
  const { data: star } = await supabaseServer
    .from('stars')
    .select('answer, unique_fact, question_id')
    .eq('shortcode', shortcode)
    .eq('status', 'approved')
    .single();

  let questionText: string | null = null;
  if (star?.question_id) {
    const { data: q } = await supabaseServer
      .from('questions')
      .select('text')
      .eq('id', star.question_id)
      .single();
    if (q?.text) questionText = q.text;
  }

  const to = star
    ? `/cosmos/${star.question_id}?star=${shortcode}`
    : '/';

  return (
    <StarRedirectClient
      to={to}
      answer={star?.answer ?? null}
      byline={star?.unique_fact ?? null}
      question={questionText}
    />
  );
}
