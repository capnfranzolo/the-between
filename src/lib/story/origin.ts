/**
 * The Between — where a rendered artefact says it lives.
 *
 * A story MP4 and a keepsake PNG both carry a link *into the picture* (the QR
 * code and the short URL beside it). That link has to point at the deployment
 * the viewer actually came from: a QR rendered on staging must open staging, or
 * the whole point of scanning it is lost.
 *
 * So the origin is derived from the incoming request rather than from
 * `SITE_URL`. `SITE_URL` remains the canonical marketing host — it is what the
 * OG/meta absolute URLs use, and it is the fallback for renders with no request
 * behind them (a CLI script, a future prerender).
 *
 * NOTE: because the origin is baked into the pixels, it is part of every cache
 * key that guards those pixels (`originTag`). Two hosts must never share one
 * cached MP4.
 */

import crypto from 'node:crypto';
import { SITE_URL } from '../constants';

/** The origin used when there is no request to read — SSR scripts, CLI. */
export function defaultOrigin(): string {
  return `https://${SITE_URL}`;
}

/** A proxy header can carry a comma-separated chain; the client-facing value
 *  is the first one. */
function firstValue(header: string | null | undefined): string | null {
  if (!header) return null;
  const first = header.split(',')[0]?.trim();
  return first || null;
}

function isLocalHost(host: string): boolean {
  const name = host.replace(/:\d+$/, '').toLowerCase();
  return (
    name === 'localhost' ||
    name === '127.0.0.1' ||
    name === '0.0.0.0' ||
    name === '[::1]' ||
    name.endsWith('.local') ||
    name.endsWith('.localhost')
  );
}

/**
 * The origin this request arrived on — `https://host` unless a proxy said
 * otherwise, or the host is plainly a local dev machine (where an https link
 * would simply not resolve).
 */
export function originFromRequest(req: {
  headers: { get(name: string): string | null };
}): string {
  const host =
    firstValue(req.headers.get('x-forwarded-host')) ??
    firstValue(req.headers.get('host'));
  if (!host) return defaultOrigin();

  const proto = firstValue(req.headers.get('x-forwarded-proto'));
  const scheme = proto ?? (isLocalHost(host) ? 'http' : 'https');
  return `${scheme}://${host}`;
}

/** `https://stage.example.com` → `stage.example.com`. What a human reads. */
export function originHost(origin: string): string {
  return origin.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/\/+$/, '');
}

/** The public URL of one star, on a given origin. */
export function starUrlOn(origin: string, shortcode: string): string {
  return `${origin.replace(/\/+$/, '')}/s/${shortcode}`;
}

/**
 * A short, filename-safe stamp of the origin, for cache keys. The origin is
 * rendered *into* the bytes, so it belongs in the key next to STORY_VERSION.
 */
export function originTag(origin: string): string {
  return crypto.createHash('sha256').update(origin).digest('hex').slice(0, 8);
}
