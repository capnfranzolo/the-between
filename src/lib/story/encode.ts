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
 * How long the encode may make *no progress at all* before it is killed.
 *
 * This used to be a ceiling on the whole encode, and that was wrong (owner hit
 * it, 2026-09-19): on a 2-vCPU box with a second render already running, a
 * perfectly healthy 708-frame reel crawls along at ~1.3 fps and blew past a
 * two-minute total budget — the watchdog killed a job that was working. Slow is
 * not the same as stuck. What actually distinguishes a wedged encode is that
 * *nothing happens*: no frame goes down the pipe and ffmpeg stops reporting.
 * So the watchdog now measures the gap between signs of life, and this window
 * is generous enough that a single frame on a loaded box can never exhaust it.
 */
const STALL_MS = 90_000;

/**
 * A backstop under the stall watchdog, in case something contrives to look busy
 * forever. It scales with the work — 2 s per frame is roughly 25× slower than
 * this box manages when idle — with a ten-minute floor so short jobs still get
 * a sane allowance.
 */
function ceilingMs(frameCount: number): number {
  return Math.max(600_000, frameCount * 2_000);
}

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
    /** How long the encode may show no sign of life before it is killed
     *  (default `STALL_MS`). A request must never hang — but a slow encode is
     *  not a hung one. */
    stallMs?: number;
    /** Absolute ceiling (default: scaled with `frameCount`). */
    maxMs?: number;
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

  // ── The watchdog ──
  // Two clocks, not one. `lastProgress` moves whenever there is a sign of life:
  // a frame accepted by the pipe, or one of ffmpeg's own `frame=` stat lines.
  // Only a *silent* process gets killed; a slow one is left to finish.
  let lastProgress = Date.now();
  let killedBecause: string | null = null;
  const noteProgress = () => { lastProgress = Date.now(); };

  ff.stderr.on('data', (d: Buffer) => {
    const text = d.toString();
    stderr += text;
    if (stderr.length > 16_000) stderr = stderr.slice(-8_000);
    // ffmpeg prints `frame=  123 fps=1.3 …` to stderr a couple of times a
    // second while it is encoding — the encoder's own pulse.
    if (/frame=\s*\d+/.test(text)) noteProgress();
  });

  const stallMs = opts.stallMs ?? STALL_MS;
  const maxMs = opts.maxMs ?? ceilingMs(opts.frameCount);
  const watchdog = setInterval(() => {
    const now = Date.now();
    const quiet = now - lastProgress;
    if (quiet > stallMs) {
      killedBecause = `no sign of life for ${(quiet / 1000).toFixed(1)}s`;
    } else if (now - started > maxMs) {
      killedBecause = `past the ${(maxMs / 1000).toFixed(0)}s ceiling`;
    }
    if (!killedBecause) return;
    clearInterval(watchdog);
    console.error(`[story/encode] ${killedBecause} — killing ffmpeg`);
    ff.kill('SIGKILL');
  }, Math.max(250, Math.min(5_000, Math.round(stallMs / 4))));
  // Never hold the process open just to police an encode.
  watchdog.unref?.();

  const closed = new Promise<void>((resolve, reject) => {
    ff.on('error', reject);
    ff.on('close', code => {
      clearInterval(watchdog);
      if (code === 0) resolve();
      // The watchdog's own kill lands here as `code === null`; say so, rather
      // than reporting an inscrutable "exited null". Either way this rejects,
      // and `getOrProduce` drops the in-flight entry and the half-written temp
      // file — a killed encode must never poison the cache key.
      else if (killedBecause) reject(new Error(`ffmpeg killed: ${killedBecause}`));
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
      // A frame handed to the pipe is the clearest sign of life there is.
      noteProgress();
      if (!ff.stdin.write(buf)) {
        // Respect backpressure — without this the whole video (≈2 GB of raw
        // RGBA for an 8 s story) queues in memory. The drain wait MUST race
        // against the pipe dying, or a failed spawn hangs the request forever.
        await new Promise<void>(resolve => {
          const done = () => {
            noteProgress();
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
    clearInterval(watchdog);
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
