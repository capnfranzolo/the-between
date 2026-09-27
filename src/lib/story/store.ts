/**
 * The Between — durable artefact store (Supabase Storage).
 *
 * The disk cache (`cache.ts`) makes a render happen once per *process*; this
 * layer makes it once per deployment history, and takes the video bytes off
 * the app server. A rendered artefact is uploaded to a public Supabase
 * Storage bucket, and on later requests the API route answers with a 302 to
 * the bucket's CDN URL — Range requests, ETags, and edge caching become the
 * CDN's job instead of a 2-vCPU box's.
 *
 * Opt-in and fail-open, in both directions:
 *   · Enabled only when `STORY_STORAGE_BUCKET` names a bucket. Never inferred
 *     from Supabase env alone — dev points NEXT_PUBLIC_SUPABASE_URL at
 *     mock-supabase, which has no storage API.
 *   · Every storage failure degrades to the disk path the routes already
 *     have. An upload that fails is logged and retried on a later request; a
 *     failed existence check just means this request streams from disk.
 *
 * Keys reuse `cacheKey` verbatim, so the bucket mirrors the disk cache:
 * `{story|poster}-{shortcode}-{originTag}-v{STORY_VERSION}.{ext}`. The
 * version and origin are in the name, which makes objects immutable — they
 * get a year-long cache header — and makes purging by shortcode a substring
 * match across every version and origin at once.
 *
 * Only approved stars ever reach the routes that upload, so the public
 * bucket never holds an unapproved star. The other direction — a star
 * edited, rejected, or deleted *after* its artefacts went public — is handled
 * by `purgeStarArtefacts`, called from the admin star routes.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { supabaseServer } from '@/lib/supabase/server';
import { storyCacheDir } from '@/lib/story/cache';

export function storeBucket(): string | null {
  return process.env.STORY_STORAGE_BUCKET || null;
}

export function storeEnabled(): boolean {
  return storeBucket() !== null;
}

/**
 * Keys this process has confirmed are in the bucket — skips a network
 * round-trip on every request after the first. Bounded by the number of
 * distinct artefacts a process serves; entries are dropped on purge.
 */
const known = new Set<string>();

/**
 * Public CDN URL for an artefact, or null when it isn't in the bucket (or
 * storage is disabled / unreachable — the caller falls back to disk either
 * way).
 */
export async function storedArtefactUrl(key: string): Promise<string | null> {
  const bucket = storeBucket();
  if (!bucket) return null;

  const api = supabaseServer.storage.from(bucket);
  if (!known.has(key)) {
    try {
      const { data: present } = await api.exists(key);
      if (!present) return null;
      known.add(key);
    } catch (err) {
      console.error(`[story/store] exists(${key}) failed:`, err);
      return null;
    }
  }
  return api.getPublicUrl(key).data.publicUrl;
}

/**
 * Uploads a finished artefact from disk. Never throws — the disk copy keeps
 * serving if storage is down, and the next request that misses the existence
 * check will try again.
 */
export async function uploadArtefact(
  key: string,
  filePath: string,
  contentType: string,
): Promise<void> {
  const bucket = storeBucket();
  if (!bucket || known.has(key)) return;

  try {
    const body = await fs.readFile(filePath);
    const { error } = await supabaseServer.storage.from(bucket).upload(key, body, {
      contentType,
      // The key carries STORY_VERSION and the origin tag, so the bytes at
      // this URL never change — let the CDN keep them for a year.
      cacheControl: '31536000',
      upsert: true,
    });
    if (error) throw error;
    known.add(key);
    console.log(`[story/store] uploaded ${key} (${body.byteLength} bytes)`);
  } catch (err) {
    console.error(`[story/store] upload of ${key} failed (disk keeps serving):`, err);
  }
}

/** True for cache/bucket names that belong to this star's story or poster. */
function isStarArtefact(name: string, safe: string): boolean {
  return name.startsWith(`story-${safe}-`) || name.startsWith(`poster-${safe}-`);
}

/**
 * Removes every stored artefact for one star — all versions, all origins,
 * and the local disk cache too. The disk purge is what makes an *edit* take
 * effect: without it, `getOrProduce` finds the old file (its key doesn't
 * change on an edit), serves the stale render, and re-uploads it — undoing
 * the storage purge on the next request. Disk purge is per-instance, which
 * is complete on the single-box container host; a multi-instance future
 * would need STORY_VERSION-style keying on content instead.
 *
 * Called when a star is rejected, edited, or deleted. Returns how many
 * storage objects went; every error is logged, not thrown, because the
 * moderation write itself must not fail on cleanup.
 */
export async function purgeStarArtefacts(shortcode: string): Promise<number> {
  // Shortcodes are [a-z0-9]; anything else can't have been rendered.
  const safe = shortcode.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safe) return 0;

  // Disk first — runs whether or not durable storage is configured.
  try {
    const dir = storyCacheDir();
    const files = await fs.readdir(dir).catch(() => [] as string[]);
    await Promise.all(
      files
        .filter(name => isStarArtefact(name, safe))
        .map(name => fs.rm(path.join(dir, name), { force: true })),
    );
  } catch (err) {
    console.error(`[story/store] disk purge for ${safe} failed:`, err);
  }

  const bucket = storeBucket();
  if (!bucket) return 0;

  try {
    const api = supabaseServer.storage.from(bucket);
    // `search` is a substring match — over-fetches (a shortcode could appear
    // inside an origin tag), so filter to keys that name *this* star.
    const { data: objects, error } = await api.list('', { search: safe, limit: 1000 });
    if (error) throw error;
    const mine = (objects ?? [])
      .map(o => o.name)
      .filter(name => isStarArtefact(name, safe));
    if (mine.length === 0) return 0;

    const { error: rmError } = await api.remove(mine);
    if (rmError) throw rmError;
    for (const name of mine) known.delete(name);
    console.log(`[story/store] purged ${mine.length} artefact(s) for ${safe}`);
    return mine.length;
  } catch (err) {
    console.error(`[story/store] purge for ${safe} failed:`, err);
    return 0;
  }
}
