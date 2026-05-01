import { supabaseServer } from '@/lib/supabase/server';

export async function GET() {
  try {
    const { data } = await supabaseServer
      .from('settings')
      .select('value')
      .eq('key', 'about')
      .single();
    return Response.json({ content: data?.value ?? '' });
  } catch {
    return Response.json({ content: '' });
  }
}
