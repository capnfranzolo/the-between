/**
 * Admin login. POST checks the password and mints a signed, expiring session
 * token (see `src/lib/adminSession.ts` — the cookie used to be a forgeable
 * literal `1`). Failed attempts are rate-limited per IP through the existing
 * `rate_limits` table, because an unthrottled password check is a dictionary
 * invitation. GET answers whether the current session is valid; DELETE ends it.
 */

import { NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { hashString } from '@/lib/btw';
import {
  isAdmin, unauthorized, mintSessionToken, sessionCookie, clearedSessionCookie, safeEqual,
} from '@/lib/adminSession';

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

function ipHashOf(req: NextRequest): string {
  const rawIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';
  return hashString(rawIp).toString(16);
}

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return unauthorized();
  return Response.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { password } = body;

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || typeof password !== 'string') {
    return Response.json({ error: 'Admin not configured' }, { status: 503 });
  }

  // Too many recent failures from this IP → cool off before checking anything.
  const ipHash = ipHashOf(req);
  const cutoff = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count } = await supabaseServer
    .from('rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .eq('action', 'admin_login_fail')
    .gte('created_at', cutoff);
  if ((count ?? 0) >= MAX_FAILURES) {
    return Response.json({ error: 'Too many attempts — try again later' }, { status: 429 });
  }

  if (!safeEqual(password, adminPassword)) {
    await supabaseServer
      .from('rate_limits')
      .insert({ ip_hash: ipHash, action: 'admin_login_fail' })
      .then(({ error }) => {
        if (error) console.error('[admin/auth] failure log failed:', error.message);
      });
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = mintSessionToken();
  if (!token) {
    // No signing key in the environment — fail closed rather than mint a
    // forgeable cookie. (ADMIN_SESSION_SECRET or the service-role key.)
    return Response.json({ error: 'Admin not configured' }, { status: 503 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': sessionCookie(token),
    },
  });
}

export async function DELETE() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearedSessionCookie(),
    },
  });
}
