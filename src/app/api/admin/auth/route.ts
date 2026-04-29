import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { password } = body;

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return Response.json({ error: 'Admin not configured' }, { status: 503 });
  }

  if (password === adminPassword) {
    return Response.json({ ok: true });
  }

  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}
