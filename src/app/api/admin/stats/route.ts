import { NextRequest } from 'next/server';
import { isAdmin } from '@/lib/adminSession';
import { supabaseServer } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const [starsRes, connectionsRes] = await Promise.all([
    supabaseServer.from('stars').select('status'),
    supabaseServer.from('connections').select('status'),
  ]);

  const stars = starsRes.data ?? [];
  const connections = connectionsRes.data ?? [];

  return Response.json({
    totalStars: stars.length,
    pendingStars: stars.filter(s => s.status === 'pending').length,
    approvedStars: stars.filter(s => s.status === 'approved').length,
    rejectedStars: stars.filter(s => s.status === 'rejected').length,
    totalConnections: connections.length,
    pendingConnections: connections.filter(c => c.status === 'pending').length,
    approvedConnections: connections.filter(c => c.status === 'approved').length,
  });
}
