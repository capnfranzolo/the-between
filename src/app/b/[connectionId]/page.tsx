import { Metadata } from 'next';
import { supabaseServer } from '@/lib/supabase/server';
import { SITE_URL } from '@/lib/constants';
import BondRedirectClient from './BondRedirectClient';

interface Props { params: Promise<{ connectionId: string }> }

interface ConnectionRow {
  id: string;
  from_star_id: string;
  to_star_id: string;
  reason: string;
  question_id: string;
}

interface StarRow {
  shortcode: string;
  answer: string;
}

async function loadBond(connectionId: string) {
  const { data: conn } = await supabaseServer
    .from('connections')
    .select('id, from_star_id, to_star_id, reason, question_id')
    .eq('id', connectionId)
    .eq('status', 'approved')
    .maybeSingle();

  if (!conn) return null;
  const connection = conn as ConnectionRow;

  const [fromRes, toRes] = await Promise.all([
    supabaseServer.from('stars').select('shortcode, answer').eq('id', connection.from_star_id).maybeSingle(),
    supabaseServer.from('stars').select('shortcode, answer').eq('id', connection.to_star_id).maybeSingle(),
  ]);

  return {
    connection,
    from: fromRes.data as StarRow | null,
    to: toRes.data as StarRow | null,
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { connectionId } = await params;
  const bond = await loadBond(connectionId);

  const reason = bond?.connection.reason ?? 'Two strangers, bound.';
  const title = `“${reason}” — a bond on The Between`;
  const description = 'Two strangers answered the same question. Their stars found each other.';
  const ogImageUrl = `https://${SITE_URL}/api/og/bond/${connectionId}`;
  const pageUrl = `https://${SITE_URL}/b/${connectionId}`;

  return {
    title,
    description,
    openGraph: {
      title: reason,
      description,
      siteName: 'The Between',
      type: 'website',
      url: pageUrl,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: reason }],
    },
    twitter: {
      card: 'summary_large_image',
      title: reason,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function BondPage({ params }: Props) {
  const { connectionId } = await params;
  const bond = await loadBond(connectionId);

  const to = bond
    ? `/cosmos/${bond.connection.question_id}?star=${bond.from?.shortcode ?? ''}`
    : '/';

  return (
    <BondRedirectClient
      to={to}
      fromAnswer={bond?.from?.answer ?? null}
      toAnswer={bond?.to?.answer ?? null}
      reason={bond?.connection.reason ?? null}
    />
  );
}
