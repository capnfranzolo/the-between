import { supabaseServer } from '@/lib/supabase/server';

/** Public endpoint — returns all active questions ordered by creation date. */
export async function GET() {
  try {
    const { data } = await supabaseServer
      .from('questions')
      .select('id, slug, text')
      .order('created_at', { ascending: true });
    return Response.json({ questions: data ?? [] });
  } catch {
    return Response.json({ questions: [] });
  }
}
