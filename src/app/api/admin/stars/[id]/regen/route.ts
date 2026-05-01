import { NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { extractDimensions } from '@/lib/dimensions/extract';
import { randomCurveType } from '@/lib/spirograph/renderer';

function isAuthed(req: NextRequest) {
  return req.cookies.get('admin_session')?.value === '1';
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const { data: star, error: fetchErr } = await supabaseServer
    .from('stars')
    .select('answer, dimensions')
    .eq('id', id)
    .single();

  if (fetchErr || !star) return Response.json({ error: 'Star not found' }, { status: 404 });

  const before = star.dimensions;
  const dimResult = await extractDimensions(star.answer);
  const after = { ...dimResult, curveType: randomCurveType() };

  const { error } = await supabaseServer
    .from('stars')
    .update({ dimensions: after })
    .eq('id', id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, before, after });
}
