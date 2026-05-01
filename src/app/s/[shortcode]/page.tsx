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

  const description = star?.answer
    ? star.answer.slice(0, 155)
    : "Something true that can't be proved.";

  const ogImageUrl = `https://${SITE_URL}/api/og/${shortcode}`;

  return {
    title: `The Between — ${questionText}`,
    description,
    openGraph: {
      title: 'The Between',
      description,
      siteName: 'The Between',
      type: 'website',
      images: [{
        url: ogImageUrl,
        width: 1200,
        height: 630,
        alt: 'A spirograph star in The Between',
      }],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'The Between',
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function StarPage({ params }: Props) {
  const { shortcode } = await params;
  const { data: star } = await supabaseServer
    .from('stars')
    .select('question_id')
    .eq('shortcode', shortcode)
    .eq('status', 'approved')
    .single();

  const to = star
    ? `/cosmos/${star.question_id}?star=${shortcode}`
    : '/';

  return <StarRedirectClient to={to} />;
}
