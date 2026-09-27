/**
 * The Between — on-demand artefact cache.
 *
 * Rendering a story MP4 costs several seconds of CPU; it must happen once per
 * star, not once per share-sheet open. Files live under `os.tmpdir()` by
 * default — production is Vercel *today* (read-only filesystem apart from
 * /tmp) and moves to a container host later, where `STORY_CACHE_DIR` can point
 * at a real volume. Never a directory inside the deployment.
 *
 * Two guards matter:
 *   · **Version key.** Every cached file is keyed `{id}-v{STORY_VERSION}`. Bump
 *     STORY_VERSION whenever the compositor changes or dev serves yesterday's
 *     video forever. The caller's `id` carries anything *else* that changes the
 *     bytes — notably the request origin, which is rendered into the QR code
 *     (see `origin.ts`), so two hosts never share one file.
 *   · **In-flight dedup.** A share panel opens, the poster and the MP4 are both
 *     requested, the user reloads — without dedup that is three concurrent
 *     encodes of the same frames.
 *
 * Writes go to a unique temp name and are `rename`d into place, so a concurrent
 * reader never opens a half-written MP4.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

/**
 * Bump on every change to the compositor, the timeline, or the encode profile.
 * Without it, a dev server happily serves a video rendered by older code.
 */
export const STORY_VERSION = 5;

export function storyCacheDir(): string {
  return process.env.STORY_CACHE_DIR || path.join(os.tmpdir(), 'thebetween-story');
}

export function cacheKey(id: string, ext: string): string {
  // Shortcodes are [a-z0-9]; belt-and-braces against path traversal anyway.
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, '');
  return `${safe}-v${STORY_VERSION}.${ext}`;
}

const inFlight = new Map<string, Promise<string>>();

/**
 * Longest a second request will wait to join a render already under way.
 *
 * Ninety seconds was a performance budget pretending to be a deadlock guard: a
 * five-star reel on a loaded two-vCPU box is *minutes* of honest work, and a
 * joiner was being failed for it — the same mistake the encode watchdog used to
 * make (see `encode.ts`). Twelve minutes covers every render this project
 * actually produces, including a reel on a busy box.
 *
 * It does not cover the encoder's own absolute ceiling, which scales with frame
 * count and can reach half an hour for a long reel; a second requester of a
 * pathologically slow reel would still give up here while the first one
 * eventually gets its file. That is the right trade — this is a backstop
 * against a `produce` that never settles, and the only caller who can hit the
 * gap is an admin regenerating a reel in two tabs.
 */
const JOIN_TIMEOUT_MS = 720_000;

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out ${what}`)), ms);
    // Don't hold the process open just to police a join.
    timer.unref?.();
    p.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
}

export interface CachedArtefact {
  path: string;
  size: number;
  /** False when the file was already on disk. */
  rendered: boolean;
  /** Wall time spent rendering, in ms; 0 for a cache hit. */
  ms: number;
}

/**
 * Returns the path to a cached artefact, producing it if absent.
 *
 * `produce` is handed a temp path to write; the file is moved into place only
 * after it resolves.
 */
export async function getOrProduce(
  id: string,
  ext: string,
  produce: (tmpPath: string) => Promise<void>,
): Promise<CachedArtefact> {
  const dir = storyCacheDir();
  const key = cacheKey(id, ext);
  const finalPath = path.join(dir, key);

  try {
    const st = await fs.stat(finalPath);
    if (st.size > 0) return { path: finalPath, size: st.size, rendered: false, ms: 0 };
  } catch {
    // not cached yet
  }

  const existing = inFlight.get(key);
  if (existing) {
    // Join the render already in progress instead of starting a second one.
    // A join is bounded: a `produce` that never settles would otherwise poison
    // this key for the life of the process (which is exactly what an early
    // deadlock in the encoder did during development).
    await withTimeout(existing, JOIN_TIMEOUT_MS, `joining in-flight render of ${key}`);
    const st = await fs.stat(finalPath);
    return { path: finalPath, size: st.size, rendered: false, ms: 0 };
  }

  const started = Date.now();
  const job = (async () => {
    await fs.mkdir(dir, { recursive: true });
    const tmpPath = path.join(dir, `.${key}.${crypto.randomBytes(6).toString('hex')}.tmp`);
    try {
      await produce(tmpPath);
      await fs.rename(tmpPath, finalPath);
    } catch (err) {
      await fs.rm(tmpPath, { force: true }).catch(() => {});
      throw err;
    }
    return finalPath;
  })();

  inFlight.set(key, job);
  try {
    await job;
  } finally {
    inFlight.delete(key);
  }

  const st = await fs.stat(finalPath);
  return { path: finalPath, size: st.size, rendered: true, ms: Date.now() - started };
}

/** How many renders are running right now — handy in logs and tests. */
export function inFlightCount(): number {
  return inFlight.size;
}
