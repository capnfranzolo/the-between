/**
 * The Between — frames → MP4, via the `ffmpeg-static` binary.
 *
 * The compositor draws into an @napi-rs/canvas; `canvas.data()` hands back that
 * canvas's raw RGBA bytes (measured ~2× faster than `getImageData`), which go
 * straight down ffmpeg's stdin as `rawvideo`. No intermediate PNG files, no
 * temp frame directory.
 *
 * Output is H.264 / yuv420p with `+faststart`, silent — the profile Instagram,
 * TikTok and iOS Safari all accept. `+faststart` needs a seekable output, which
 * is why this writes a file rather than piping to the HTTP response.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';
import ffmpegPath from 'ffmpeg-static';
import { STORY_W, STORY_H } from './layers';
import './fonts';

export const STORY_FPS = 30;

/**
 * Where the ffmpeg binary actually is.
 *
 * `ffmpeg-static` computes its export from `__dirname`, which a bundler
 * rewrites — under Turbopack the package resolves to a path that does not
 * exist, and the first symptom is a spawn that fails silently mid-pipe. So the
 * package's answer is treated as a hint and verified, with the layout on disk
 * as the fallback.
 */
let resolvedBinary: string | null | undefined;

export function ffmpegBinary(): string | null {
  if (resolvedBinary !== undefined) return resolvedBinary;
  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const candidates = [
    process.env.FFMPEG_BIN,
    process.env.FFMPEG_PATH,
    typeof ffmpegPath === 'string' ? ffmpegPath : null,
    path.join(process.cwd(), 'node_modules', 'ffmpeg-static', exe),
  ];
  resolvedBinary = null;
  for (const c of candidates) {
    if (!c) continue;
    try {
      fs.accessSync(c, fs.constants.X_OK);
      resolvedBinary = c;
      break;
    } catch {
      // keep looking
    }
  }
  if (!resolvedBinary) console.error('[story/encode] no usable ffmpeg binary found');
  return resolvedBinary;
}

export interface EncodeResult {
  frames: number;
  /** Wall time for the whole encode, in ms — what the UI's "composing…" copy
   *  has to be honest about. */
  ms: number;
}

export class FfmpegUnavailableError extends Error {
  constructor(cause?: unknown) {
    super(`ffmpeg-static binary is not available${cause ? `: ${String(cause)}` : ''}`);
    this.name = 'FfmpegUnavailableError';
  }
}

/** True when an MP4 can actually be produced in this environment. Callers use
 *  it to fall back to the static poster rather than 500ing a share. */
export function ffmpegAvailable(): boolean {
  return ffmpegBinary() !== null;
}

/**
 * Renders `frameCount` frames via `drawFrame` and encodes them to `outPath`.
 *
 * `drawFrame` receives a reused canvas context — draw the whole frame every
 * time; nothing is cleared between calls (the compositor's first act is an
 * opaque fill, so this is one less full-frame operation per frame).
 */
export async function encodeMp4(
  opts: {
    outPath: string;
    frameCount: number;
    fps?: number;
    width?: number;
    height?: number;
    /** libx264 preset; `veryfast` keeps encode off the critical path. */
    preset?: string;
    crf?: number;
    /** Hard ceiling on the whole encode. An 8 s story takes ~6 s; anything
     *  near this means something is wrong, and a request must never hang. */
    timeoutMs?: number;
  },
  drawFrame: (ctx: SKRSContext2D, frameIndex: number, t: number) => void,
): Promise<EncodeResult> {
  const binary = ffmpegBinary();
  if (!binary) throw new FfmpegUnavailableError();

  const fps = opts.fps ?? STORY_FPS;
  const width = opts.width ?? STORY_W;
  const height = opts.height ?? STORY_H;
  const started = Date.now();

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const args = [
    '-y',
    '-f', 'rawvideo',
    '-pix_fmt', 'rgba',
    '-s', `${width}x${height}`,
    // The input rate must match the rate we actually generate, or ffmpeg
    // resamples and the timeline drifts.
    '-r', String(fps),
    '-i', 'pipe:0',
    '-an',
    '-c:v', 'libx264',
    '-preset', opts.preset ?? 'veryfast',
    '-crf', String(opts.crf ?? 20),
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    // The container is stated rather than inferred: the cache writes to a
    // `.tmp` path and renames it into place, and ffmpeg cannot guess a muxer
    // from that extension.
    '-f', 'mp4',
    opts.outPath,
  ];

  console.log(`[story/encode] spawning ${binary} → ${opts.outPath} (${opts.frameCount} frames)`);
  const ff = spawn(binary, args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  ff.stderr.on('data', (d: Buffer) => {
    stderr += d.toString();
    if (stderr.length > 16_000) stderr = stderr.slice(-8_000);
  });

  const watchdog = setTimeout(() => {
    console.error('[story/encode] timed out — killing ffmpeg');
    ff.kill('SIGKILL');
  }, opts.timeoutMs ?? 120_000);

  const closed = new Promise<void>((resolve, reject) => {
    ff.on('error', reject);
    ff.on('close', code => {
      clearTimeout(watchdog);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}\n${stderr.slice(-2000)}`));
    });
  });

  // A broken pipe (ffmpeg died early, or was never spawned) must stop the write
  // loop rather than crash the process with an unhandled EPIPE.
  let pipeDead: Error | null = null;
  const die = (err: Error) => { pipeDead = pipeDead ?? err; };
  ff.stdin.on('error', die);
  ff.on('error', die);
  ff.on('close', code => die(new Error(`ffmpeg closed early (${code})`)));

  try {
    for (let i = 0; i < opts.frameCount; i++) {
      if (pipeDead) break;
      drawFrame(ctx, i, i / fps);
      // `data()` hands back the canvas's live pixel buffer; the next frame draws
      // over it, so it has to be copied before going into an async write queue.
      const buf = Buffer.from(canvas.data());
      if (!ff.stdin.write(buf)) {
        // Respect backpressure — without this the whole video (≈2 GB of raw
        // RGBA for an 8 s story) queues in memory. The drain wait MUST race
        // against the pipe dying, or a failed spawn hangs the request forever.
        await new Promise<void>(resolve => {
          const done = () => {
            ff.stdin.off('drain', done);
            ff.stdin.off('close', done);
            ff.stdin.off('error', done);
            ff.off('close', done);
            resolve();
          };
          ff.stdin.once('drain', done);
          ff.stdin.once('close', done);
          ff.stdin.once('error', done);
          ff.once('close', done);
        });
      }
    }
  } finally {
    ff.stdin.end();
  }

  try {
    await closed;
  } finally {
    clearTimeout(watchdog);
  }

  return { frames: opts.frameCount, ms: Date.now() - started };
}

/** Convenience: encode a `Segment`-shaped thing at the story's native rate. */
export async function encodeSegment(
  segment: { duration: number; draw(ctx: SKRSContext2D, t: number): void },
  outPath: string,
  opts: { fps?: number } = {},
): Promise<EncodeResult> {
  const fps = opts.fps ?? STORY_FPS;
  const frameCount = Math.max(1, Math.round(segment.duration * fps));
  return encodeMp4({ outPath, frameCount, fps }, (ctx, _i, t) => segment.draw(ctx, t));
}
