import { NextRequest } from 'next/server';
import { supabaseAnon } from '@/lib/supabase/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ shortcode: string }> }
) {
  const { shortcode } = await params;

  const { data, error } = await supabaseAnon
    .from('stars')
    .select('shortcode, answer, question_id')
    .eq('shortcode', shortcode)
    .single();

  if (error || !data) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  return Response.json(data);
}
