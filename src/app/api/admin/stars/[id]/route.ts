import { NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { extractDimensions } from '@/lib/dimensions/extract';
import { randomCurveType } from '@/lib/spirograph/renderer';
import { hashString } from '@/lib/btw';
import { purgeStarArtefacts } from '@/lib/story/store';

function isAuthed(req: NextRequest) {
  return req.cookies.get('admin_session')?.value === '1';
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const { answer, uniqueFact, status } = body;

  const updates: Record<string, unknown> = {};
  if (status !== undefined) updates.status = status;
  if (uniqueFact !== undefined) updates.unique_fact = uniqueFact;

  // Weekly reel picker — `reel_order` 1-5, approved stars only. `null` removes
  // a star from the reel and is always allowed.
  if (body.reel_order !== undefined) {
    const reelOrder = body.reel_order;
    if (reelOrder !== null) {
      if (typeof reelOrder !== 'number' || reelOrder < 1 || reelOrder > 5) {
        return Response.json({ error: 'reel_order must be between 1 and 5' }, { status: 400 });
      }
      const effectiveStatus = status ?? (await supabaseServer
        .from('stars')
        .select('status')
        .eq('id', id)
        .single()).data?.status;
      if (effectiveStatus !== 'approved') {
        return Response.json({ error: 'Only approved stars can be added to the reel' }, { status: 400 });
      }
    }
    updates.reel_order = reelOrder;
  }

  if (answer !== undefined) {
    updates.answer = answer;
    updates.answer_hash = hashString(answer.trim().toLowerCase()).toString(16);
    const dimResult = await extractDimensions(answer);
    updates.dimensions = { ...dimResult, curveType: randomCurveType() };
  }

  // Direct dimension override — editor sliders bypass AI regen
  if (body.dimensions !== undefined) {
    updates.dimensions = body.dimensions;
  }

  const { data, error } = await supabaseServer
    .from('stars')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // The story/poster artefacts in durable storage are renders of this star's
  // content. Two changes make them wrong: an edit (the render is now stale)
  // and a de-approval (an unapproved star must not keep a live public URL).
  // Purge is best-effort — the moderation write above has already landed.
  const contentChanged =
    answer !== undefined || uniqueFact !== undefined || body.dimensions !== undefined;
  const unpublished = status !== undefined && status !== 'approved';
  if ((contentChanged || unpublished) && data?.shortcode) {
    await purgeStarArtefacts(data.shortcode);
  }

  return Response.json({ ok: true, star: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  // Delete associated connections first
  const { data: removedConns } = await supabaseServer
    .from('connections')
    .delete()
    .or(`from_star_id.eq.${id},to_star_id.eq.${id}`)
    .select('id');

  // Use .select() so we know if a row was actually deleted (no row = silent RLS block)
  const { data: deleted, error } = await supabaseServer
    .from('stars')
    .delete()
    .eq('id', id)
    .select('id, shortcode');

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!deleted || deleted.length === 0) {
    return Response.json({ error: 'Star not found or could not be deleted' }, { status: 404 });
  }

  // A deleted star's public video/poster must go with it.
  const shortcode = deleted[0]?.shortcode;
  if (shortcode) await purgeStarArtefacts(shortcode);

  return Response.json({ ok: true, connectionsRemoved: removedConns?.length ?? 0 });
}
