import { supabaseServer } from '@/lib/supabase/server';

const SOCIAL_KEYS = ['social_instagram', 'social_tiktok', 'social_x', 'social_facebook'] as const;

/**
 * Public endpoint — the About modal's copy plus the (usually-empty) social
 * handles for the quiet "follow The Between" CTA. Only keys an admin has
 * filled in ever render anywhere; empty values are still returned so the
 * caller can filter them out itself.
 */
export async function GET() {
  try {
    const [{ data }, { data: socialRows }] = await Promise.all([
      supabaseServer
        .from('settings')
        .select('value')
        .eq('key', 'about')
        .single(),
      supabaseServer
        .from('settings')
        .select('key, value')
        .in('key', SOCIAL_KEYS as unknown as string[]),
    ]);

    const social: Record<string, string> = {
      instagram: '', tiktok: '', x: '', facebook: '',
    };
    (socialRows ?? []).forEach((row: { key: string; value: string }) => {
      const short = row.key.replace('social_', '');
      if (short in social) social[short] = row.value ?? '';
    });

    return Response.json({ content: data?.value ?? '', social });
  } catch {
    return Response.json({ content: '', social: { instagram: '', tiktok: '', x: '', facebook: '' } });
  }
}
