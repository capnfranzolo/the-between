/**
 * Server-side spirograph renderer using @napi-rs/canvas.
 * Wraps the existing browser renderer so it runs in Node.js (e.g. for OG images).
 */

import { createCanvas } from '@napi-rs/canvas';
import { createSpirograph } from './renderer';
import type { SpiroDimensions } from './renderer';

/**
 * Render a spirograph to a PNG buffer.
 * Uses the existing renderer's renderStatic() — fully synchronous, no RAF.
 *
 * @param dims   Spirograph dimensions
 * @param size   Canvas logical size in pixels (default 480)
 * @returns      PNG buffer
 */
export async function renderSpirographToPng(
  dims: SpiroDimensions,
  size = 480,
): Promise<Buffer> {
  const canvas = createCanvas(size, size);

  // @napi-rs/canvas Canvas doesn't have a `.style` property,
  // but the renderer assigns canvas.style.width/height — patch it safely.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (canvas as any).style = { width: `${size}px`, height: `${size}px` };

  // Cast to HTMLCanvasElement — the canvas API surface is compatible for renderStatic().
  const spiro = createSpirograph(canvas as unknown as HTMLCanvasElement, dims, {
    size,
    dpr: 1,
  });

  // t=3.0 gives enough ghost-trace buildup to show the shape clearly.
  spiro.renderStatic(3.0);

  return canvas.toBuffer('image/png');
}

/**
 * Render a spirograph and return a base64-encoded PNG data URI.
 */
export async function renderSpirographToBase64(
  dims: SpiroDimensions,
  size = 480,
): Promise<string> {
  const buf = await renderSpirographToPng(dims, size);
  return `data:image/png;base64,${buf.toString('base64')}`;
}
