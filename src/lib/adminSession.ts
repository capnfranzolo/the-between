/**
 * The Between — admin sessions that are actually sessions.
 *
 * The original gate was a literal `admin_session=1` cookie: anyone who had
 * ever seen a request (or guessed the name) could moderate, edit, or delete
 * stars in production. This replaces it with a stateless signed token —
 * `exp.nonce.signature`, HMAC-SHA256 over `exp.nonce` — so a cookie is only
 * valid if this server minted it, and only until it expires. Stateless on
 * purpose: serverless instances are many and ephemeral, so there is no shared
 * memory to keep a session table in, and a redeploy must not log the owner
 * out of anything but this cookie's own expiry.
 *
 * The signing key is `ADMIN_SESSION_SECRET`, falling back to the service-role
 * key (already server-only, already in every deployment env). Never the admin
 * password — the key that validates a login must not be the thing a login
 * attempt guesses. With neither present, admin auth fails closed.
 */

import crypto from 'node:crypto';
import type { NextRequest } from 'next/server';

export const ADMIN_COOKIE = 'admin_session';
const SESSION_TTL_S = 7 * 24 * 60 * 60; // one week, as before

function secret(): string | null {
  return process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

function sign(payload: string, key: string): string {
  return crypto.createHmac('sha256', key).update(payload).digest('base64url');
}

/** Constant-time equality that tolerates unequal lengths (digest both sides —
 *  `timingSafeEqual` throws on length mismatch, which is itself a signal). */
export function safeEqual(a: string, b: string): boolean {
  const da = crypto.createHash('sha256').update(a).digest();
  const db = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(da, db);
}

/** Mints a session token. Returns null when no signing key is configured. */
export function mintSessionToken(now = Date.now()): string | null {
  const key = secret();
  if (!key) return null;
  const exp = Math.floor(now / 1000) + SESSION_TTL_S;
  const nonce = crypto.randomBytes(12).toString('base64url');
  const payload = `${exp}.${nonce}`;
  return `${payload}.${sign(payload, key)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  const key = secret();
  if (!key || !token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [expStr, nonce, sig] = parts;
  if (!safeEqual(sig, sign(`${expStr}.${nonce}`, key))) return false;
  const exp = parseInt(expStr, 10);
  return Number.isFinite(exp) && exp * 1000 > now;
}

export function isAdmin(req: NextRequest): boolean {
  return verifySessionToken(req.cookies.get(ADMIN_COOKIE)?.value);
}

/** The one 401 every admin route returns. */
export function unauthorized(): Response {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

/** Set-Cookie value for a fresh session (caller checks mint for null). */
export function sessionCookie(token: string): string {
  return `${ADMIN_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_S}; Path=/`;
}

/** Set-Cookie value that clears the session — same flags, or browsers keep the old one. */
export function clearedSessionCookie(): string {
  return `${ADMIN_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/`;
}

/** True when the id is a well-formed UUID — admin routes interpolate ids into
 *  PostgREST `or=` filter strings, where a crafted value could smuggle extra
 *  filter clauses. Validate at the door instead. */
export function isUuid(id: unknown): id is string {
  return typeof id === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
