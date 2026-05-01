import { NextRequest } from 'next/server';

const COOKIE = 'admin_session';
const COOKIE_OPTS = 'HttpOnly; Secure; SameSite=Strict; Max-Age=604800; Path=/';

function isAuthed(req: NextRequest) {
  return req.cookies.get(COOKIE)?.value === '1';
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return Response.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { password } = body;

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return Response.json({ error: 'Admin not configured' }, { status: 503 });
  }

  if (password !== adminPassword) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `${COOKIE}=1; ${COOKIE_OPTS}`,
    },
  });
}

export async function DELETE(req: NextRequest) {
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `${COOKIE}=; Max-Age=0; Path=/`,
    },
  });
}
