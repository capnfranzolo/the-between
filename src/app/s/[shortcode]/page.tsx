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
    alternates: {
      canonical: pageUrl,
      // oEmbed discovery: Discord, Notion, WordPress etc. find /api/oembed
      // through this link and get an iframe of /embed/{code} — a playing
      // video in surfaces that ignore og:video.
      types: {
        'application/json+oembed': [{
          url: `https://${SITE_URL}/api/oembed?url=${encodeURIComponent(pageUrl)}`,
          title: pageTitle,
        }],
      },
    },
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
    .select('answer, unique_fact, question_id, created_at')
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

  // VideoObject structured data — what lets the star's video (and its
  // thumbnail) surface as a rich result in search. `<` is escaped so user
  // content can never break out of the script element.
  const jsonLd = star
    ? JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        name: `${questionText} — The Between`,
        description: `"${(star.answer ?? '').slice(0, 160)}"`,
        thumbnailUrl: [
          `https://${SITE_URL}/api/og/${shortcode}`,
          `https://${SITE_URL}/api/story/${shortcode}/poster`,
        ],
        contentUrl: `https://${SITE_URL}/api/story/${shortcode}`,
        embedUrl: `https://${SITE_URL}/embed/${shortcode}`,
        uploadDate: star.created_at ?? undefined,
        duration: 'PT21S',
        width: 1080,
        height: 1920,
        publisher: {
          '@type': 'Organization',
          name: 'The Between',
          url: `https://${SITE_URL}`,
        },
      }).replace(/</g, '\\u003c')
    : null;

  return (
    <>
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      )}
      <StarRedirectClient
        to={to}
        answer={star?.answer ?? null}
        byline={star?.unique_fact ?? null}
        question={questionText}
      />
    </>
  );
}
