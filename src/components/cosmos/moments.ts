// Phase 8 — the two moments the cosmos has to be able to perform.
//
// Both are *transient*: they add no permanent geometry, no permanent DOM, and
// nothing here survives its own animation. CosmosScene owns the camera and the
// star groups; this module owns only the envelopes and the inscription overlay,
// so the camera state machine never has to know either exists.
//
//   BloomChoreographer — a star arriving in the world (birth) or being bound
//     (the finale): held at nothing, then scale/opacity bloom with a glow flare
//     that overshoots and settles. Sampled per frame by the scene's scale pass.
//
//   OrbitInscription — the bond reason written once along the projected orbit
//     the two stars now share, then gone. Deliberately NOT the smoke/scatter
//     effect: that stays a hover garnish.

const smoothstep = (u: number) => u * u * (3 - 2 * u);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ── Bloom ────────────────────────────────────────────────────────────────────

export type BloomGate =
  /** Bloom now — the star is already framed (the bond finale). */
  | 'now'
  /** Hold the star at nothing until the camera is close (star birth: the
   *  camera is still gliding in from wherever the visitor was). */
  | 'arrival';

export const BLOOM_DURATION = 2.6;   // s
const HELD_SCALE = 0.12;             // the star before it exists
const OVERSHOOT = 1.30;
const ARRIVAL_DIST = 170;            // world units — close enough to read as "here"
const ARRIVAL_TIMEOUT = 5;           // s — bloom anyway rather than never
const ORPHAN_TIMEOUT = 6;            // s — the star never appeared; give up

interface BloomEntry {
  t: number;
  waited: number;
  started: boolean;
  done: boolean;
  gate: BloomGate;
  onStart?: () => void;
}

export interface BloomSample {
  /** Multiplies the star's own scale. */
  scale: number;
  /** Absolute sprite opacity for the whole group. */
  opacity: number;
  /** Multiplies the glow halo's base scale — the flare. */
  glow: number;
}

export class BloomChoreographer {
  private entries = new Map<string, BloomEntry>();

  /** `onStart` fires the frame the bloom actually begins — that is the beat
   *  the sound belongs on, not the moment the bloom was requested. */
  begin(id: string, gate: BloomGate, onStart?: () => void) {
    const started = gate === 'now';
    this.entries.set(id, { t: 0, waited: 0, started, done: false, gate, onStart });
    if (started) onStart?.();
  }

  clear() { this.entries.clear(); }

  get active(): boolean { return this.entries.size > 0; }

  /**
   * `distance` returns the camera→star distance, or null when that star does
   * not exist in the scene (yet, or any more).
   */
  update(dt: number, distance: (id: string) => number | null) {
    this.entries.forEach((e, id) => {
      const d = distance(id);
      if (d === null) {
        // Requested before the star's group existed: wait a little. Once a
        // bloom is running, a vanished star ends it.
        e.waited += dt;
        if (e.started || e.waited > ORPHAN_TIMEOUT) this.entries.delete(id);
        return;
      }
      if (!e.started) {
        e.waited += dt;
        if (d < ARRIVAL_DIST || e.waited >= ARRIVAL_TIMEOUT) {
          e.started = true;
          e.onStart?.();
        }
        return;
      }
      if (e.done) { this.entries.delete(id); return; }
      e.t += dt;
      // Land exactly on the neutral end of the envelope for one frame so the
      // star is handed back at scale 1 / opacity 1 / glow 1, then retire.
      if (e.t >= BLOOM_DURATION) { e.t = BLOOM_DURATION; e.done = true; }
    });
  }

  /** null when this star is not part of a moment — leave it alone. */
  sample(id: string): BloomSample | null {
    const e = this.entries.get(id);
    if (!e) return null;
    if (!e.started) return { scale: HELD_SCALE, opacity: 0, glow: 1 };
    const u = clamp(e.t / BLOOM_DURATION, 0, 1);
    const opacity = u < 0.14 ? smoothstep(u / 0.14) : 1;
    const scale = u < 0.45
      ? HELD_SCALE + (OVERSHOOT - HELD_SCALE) * smoothstep(u / 0.45)
      : OVERSHOOT - (OVERSHOOT - 1) * smoothstep((u - 0.45) / 0.55);
    const glow = 1 + 1.9 * Math.pow(Math.sin(Math.PI * u), 1.2);
    return { scale, opacity, glow };
  }
}

// ── Orbit inscription ────────────────────────────────────────────────────────

export interface ScreenPoint { x: number; y: number }

const WRITE_DUR = 1.7;   // s — the reason writes itself along the path
const HOLD_DUR  = 2.4;   // s — long enough to finish reading it
const FADE_DUR  = 1.3;   // s — and then it is gone
export const INSCRIPTION_TOTAL = WRITE_DUR + HOLD_DUR + FADE_DUR;

const SVG_NS = 'http://www.w3.org/2000/svg';
let guideSeq = 0;

/** The share of the ring that reads straight enough to carry the line. */
export const NEAR_SIDE = 0.5;
/** Rough advance width of one glyph, in ems, for the italic serif. */
export const GLYPH_EM = 0.46;
/** The size the reason wants to be set at, when the ring can afford it. */
export const PREFERRED_FONT = 15;

function pathD(points: ScreenPoint[]): string {
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}`;
  }
  return d;
}

function perimeterOf(points: ScreenPoint[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return len;
}

/**
 * The bond reason, written once along the orbit the bound stars now share.
 * The scene feeds it projected screen-space points every frame (the stars move,
 * the camera moves); everything else — sizing, the write, the fade, the
 * teardown — lives here.
 */
export class OrbitInscription {
  private root: SVGSVGElement;
  private group: SVGGElement;
  private ring: SVGPathElement;
  private guide: SVGPathElement;
  private textEl: SVGTextElement;
  private glyphs: SVGTSpanElement[] = [];
  private t = 0;
  private running = false;
  private fading = false;

  constructor(container: HTMLElement) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:3;';
    const defs = document.createElementNS(SVG_NS, 'defs');
    const guide = document.createElementNS(SVG_NS, 'path');
    const guideId = `btw-orbit-guide-${++guideSeq}`;
    guide.setAttribute('id', guideId);
    guide.setAttribute('fill', 'none');
    defs.appendChild(guide);
    svg.appendChild(defs);

    const group = document.createElementNS(SVG_NS, 'g');
    group.style.opacity = '1';

    // The orbit itself, as the faintest possible line — the same drawn-line
    // language the stars are made of, present only while the reason is.
    const ring = document.createElementNS(SVG_NS, 'path');
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', 'rgba(240,232,224,0.13)');
    ring.setAttribute('stroke-width', '1');
    ring.style.opacity = '0';
    ring.style.transition = 'opacity .9s ease';

    const textEl = document.createElementNS(SVG_NS, 'text');
    textEl.setAttribute('xml:space', 'preserve');
    textEl.setAttribute('dy', '-5');
    textEl.setAttribute('fill', '#F0E8E0');
    // paint-order + a dark stroke keeps the line legible over any sky without
    // a shadow filter (SVG text ignores text-shadow).
    textEl.style.cssText = [
      "font-family:'Cormorant Garamond','Playfair Display',Georgia,'Times New Roman',serif",
      'font-style:italic',
      'font-weight:400',
      'letter-spacing:0.02em',
      'paint-order:stroke',
      'stroke:rgba(10,6,24,0.72)',
      'stroke-width:3px',
      'stroke-linejoin:round',
    ].join(';');
    const textPath = document.createElementNS(SVG_NS, 'textPath');
    textPath.setAttribute('href', `#${guideId}`);
    textPath.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', `#${guideId}`);
    textPath.setAttribute('startOffset', '0');
    textEl.appendChild(textPath);

    group.appendChild(ring);
    group.appendChild(textEl);
    svg.appendChild(group);
    container.appendChild(svg);

    this.root = svg;
    this.group = group;
    this.ring = ring;
    this.guide = guide;
    this.textEl = textEl;
  }

  get active(): boolean { return this.running; }

  /**
   * Starts the pass. `points` is the projected ring, already ordered so the
   * reason reads left-to-right along the near side. Returns false (and does
   * nothing) if the geometry can't carry text.
   */
  begin(points: ScreenPoint[], text: string): boolean {
    const reason = text.trim();
    if (!reason || points.length < 8) return false;
    const perimeter = perimeterOf(points);
    if (perimeter < 120) return false;

    // Only the near half of the ring is comfortably readable; size the type so
    // the reason lands inside it.
    const usable = perimeter * NEAR_SIDE;
    const fontSize = clamp(usable / (reason.length * GLYPH_EM), 10, 19);
    this.textEl.style.fontSize = `${fontSize.toFixed(1)}px`;

    const holder = this.textEl.firstChild as SVGTextPathElement;
    holder.textContent = '';
    this.glyphs = [];
    const chars = Array.from(reason);
    chars.forEach((ch, i) => {
      const span = document.createElementNS(SVG_NS, 'tspan');
      span.textContent = ch;
      span.style.opacity = '0';
      span.style.transition = 'opacity .38s ease';
      span.style.transitionDelay = `${((i / chars.length) * WRITE_DUR).toFixed(2)}s`;
      holder.appendChild(span);
      this.glyphs.push(span);
    });

    this.setPath(points);
    // Centre the line on the near side, so its middle sits at the bottom of
    // the ring where the tangent is horizontal and the words read straight.
    let advance = 0;
    try { advance = holder.getComputedTextLength(); } catch { /* layout not ready */ }
    holder.setAttribute('startOffset',
      String(Math.round(Math.max(0, (perimeter * NEAR_SIDE - advance) / 2))));

    this.group.style.transition = '';
    this.group.style.opacity = '1';
    this.ring.style.opacity = '0';
    this.t = 0;
    this.running = true;
    this.fading = false;

    // One frame at opacity 0 so the transitions actually run.
    requestAnimationFrame(() => {
      if (!this.running) return;
      this.ring.style.opacity = '1';
      this.glyphs.forEach(g => { g.style.opacity = '1'; });
    });
    return true;
  }

  /** Re-aims the inscription at where the stars are now. */
  setPath(points: ScreenPoint[]) {
    if (points.length < 2) return;
    const d = pathD(points);
    this.guide.setAttribute('d', d);
    this.ring.setAttribute('d', d);
  }

  update(dt: number) {
    if (!this.running) return;
    this.t += dt;
    if (!this.fading && this.t >= WRITE_DUR + HOLD_DUR) {
      this.fading = true;
      this.group.style.transition = `opacity ${FADE_DUR}s ease`;
      this.group.style.opacity = '0';
    }
    if (this.t >= INSCRIPTION_TOTAL) this.clear();
  }

  clear() {
    this.running = false;
    this.fading = false;
    this.glyphs = [];
    const holder = this.textEl.firstChild as SVGTextPathElement | null;
    if (holder) holder.textContent = '';
    this.guide.removeAttribute('d');
    this.ring.removeAttribute('d');
    this.ring.style.opacity = '0';
    this.group.style.transition = '';
    this.group.style.opacity = '1';
  }

  dispose() {
    this.clear();
    this.root.remove();
  }
}

/**
 * Orders a sampled ring so the text starts at its leftmost point and travels
 * along the near (lower) side — the half a reader can actually read.
 */
export function orderRingForReading(points: ScreenPoint[]): ScreenPoint[] {
  const n = points.length;
  let start = 0;
  for (let i = 1; i < n; i++) if (points[i].x < points[start].x) start = i;
  const look = Math.max(4, Math.floor(n / 8));
  let fwd = 0;
  let back = 0;
  for (let i = 1; i <= look; i++) {
    fwd  += points[(start + i) % n].y;
    back += points[(start - i + n * 2) % n].y;
  }
  const forward = fwd >= back; // larger screen-y = nearer the bottom
  const out: ScreenPoint[] = [];
  for (let i = 0; i < n; i++) {
    out.push(points[((forward ? start + i : start - i) % n + n) % n]);
  }
  return out;
}
