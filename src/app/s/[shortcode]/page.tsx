import { Metadata } from 'next';
import { supabaseServer } from '@/lib/supabase/server';
import { SITE_URL } from '@/lib/constants';
import StarRedirectClient from './StarRedirectClient';

interface Props { params: Promise<{ shortcode: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shortcode } = await params;
  return {
    title: 'A thought on The Between',
    description: "Something true that can't be proved.",
    openGraph: {
      title: 'A thought on The Between',
      images: [`https://${SITE_URL}/api/og/${shortcode}`],
    },
    twitter: { card: 'summary_large_image', images: [`https://${SITE_URL}/api/og/${shortcode}`] },
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
