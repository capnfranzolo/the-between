// Phase 7 — the sound engine.
//
// Silence is the default. Nothing here touches the Web Audio API until the
// visitor has both opted in AND produced a user gesture: no AudioContext is
// constructed on load, so a first-time visitor's browser never sees an
// autoplay attempt (and never logs the warning for one).
//
// Everything is synthesised at runtime — the whole sound design adds zero
// bytes of media to the page. The engine owns:
//
//   • the ambient bed  — brown-noise night air + a two-voice drone, per world
//   • the wind         — a near-silent band tied to camera speed
//   • the reverb       — a two-tap feedback delay (cheaper than a convolver
//                        on a phone that is already running three.js)
//   • the master bus   — trim → compressor → destination
//
// The public surface is in ./index.ts; Phase 8 only ever needs
// `sound.play('bond')` and friends.

import { getWorldSound, DEFAULT_WORLD_SOUND, type WorldSoundConfig } from '@/lib/atmosphere';
import { playChime, playSelect, playBirth, playBond, type Bus } from './voices';

export type SoundPreference = 'on' | 'off' | 'unset';
export type SoundEventName = 'chime' | 'select' | 'birth' | 'bond';
export interface PlayOptions { emotionIndex?: number }

const STORAGE_KEY = 'btw_sound';

// ── Mix discipline ───────────────────────────────────────────────────────────
// Peaks land around −26 dBFS; the bed sits near −35 dBFS. Speech in a typical
// web video peaks around −12 dBFS, so everything here is comfortably beneath it.
const MASTER_TRIM = 0.55;
const BED_LEVEL   = 0.055;  // the whole ambient bed, at full
const WIND_MAX    = 0.020;  // camera-velocity air, at full tilt
const FADE        = 0.45;   // s — master gate ramp (mute/unmute, tab hide)
const BED_FADE_IN = 3.0;    // s — the bed never arrives, it appears
const WORLD_XFADE = 1.35;   // s — matches the sky rail's visual crossfade

// Camera speed (world units/s) mapped to wind. Drift cruises at ~26 and peaks
// near 39 mid-glide; a dwelling camera is at 0 and therefore silent.
const WIND_FLOOR = 8;
const WIND_CEIL  = 40;

/** Queued one-shot: an event asked for before the context existed (e.g. star
 *  birth, which arrives on a freshly-loaded document). It fires as soon as the
 *  first gesture opens the context, and expires quietly if that never comes. */
interface Queued { name: SoundEventName; opts?: PlayOptions; expires: number }
// How long a big moment waits for its gesture. Star birth lands on a
// freshly-navigated document, where no browser grants an AudioContext until
// the visitor touches something — and they are usually reading their own star
// for a few seconds first. Long enough to catch that; short enough that the
// bloom never arrives detached from the moment it belongs to.
const QUEUE_TTL_MS = 15000;

export interface SoundDebugState {
  preference: SoundPreference;
  contextState: AudioContextState | 'none';
  bedPlaying: boolean;
  worldId: string | null;
  world: WorldSoundConfig;
  cameraSpeed: number;
  requested: Record<SoundEventName, number>;
  played: Record<SoundEventName, number>;
  queued: number;
  lastEvent: string | null;
}

const zeroCounts = (): Record<SoundEventName, number> =>
  ({ chime: 0, select: 0, birth: 0, bond: 0 });

export class SoundEngine {
  private pref: SoundPreference = 'unset';
  private ctx: AudioContext | null = null;
  private hidden = false;
  private starting = false;

  // Graph (built once, with the context)
  private master: GainNode | null = null;
  private bedGain: GainNode | null = null;
  private airFilter: BiquadFilterNode | null = null;
  private airGain: GainNode | null = null;
  private breathLfo: OscillatorNode | null = null;
  private breathDepth: GainNode | null = null;
  private droneA: OscillatorNode | null = null;
  private droneB: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private wet: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  private worldId: string | null = null;
  private world: WorldSoundConfig = DEFAULT_WORLD_SOUND;
  private cameraSpeed = 0;
  private windTarget = 0;
  private windBand = 300;
  private windAt = 0;

  private queue: Queued[] = [];
  private listeners = new Set<() => void>();
  private gestureCleanup: (() => void) | null = null;

  // Debug counters (exposed through window.__btwSound outside production)
  private requested = zeroCounts();
  private played = zeroCounts();
  private lastEvent: string | null = null;

  // ── Preference ─────────────────────────────────────────────────────────────

  /** Reads the persisted choice. Safe to call during SSR (returns 'unset'). */
  getPreference(): SoundPreference {
    if (this.pref !== 'unset') return this.pref;
    if (typeof window === 'undefined') return 'unset';
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'on' || v === 'off') this.pref = v;
    return this.pref;
  }

  isOn(): boolean {
    return this.getPreference() === 'on';
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private emit() { this.listeners.forEach(fn => fn()); }

  /**
   * Opt in. MUST be called from a user gesture — that is the only moment a
   * browser lets an AudioContext start.
   */
  enable() {
    this.pref = 'on';
    try { window.localStorage.setItem(STORAGE_KEY, 'on'); } catch { /* private mode */ }
    this.detachGesture();
    this.ensureContext();
    this.gate();
    this.emit();
  }

  /** Opt out (or decline the invitation). Ramps down, then suspends. */
  disable() {
    this.pref = 'off';
    try { window.localStorage.setItem(STORAGE_KEY, 'off'); } catch { /* private mode */ }
    this.detachGesture();
    this.queue.length = 0;
    this.gate();
    this.emit();
  }

  /**
   * Called on mount by the sound control. If the visitor already opted in on a
   * previous visit, arm one-time gesture listeners that open the context on
   * their first touch — we still never construct one unprompted.
   */
  attach() {
    if (typeof window === 'undefined') return;
    document.addEventListener('visibilitychange', this.onVisibility);
    if (this.getPreference() !== 'on' || this.ctx) return;
    this.attachGesture();
  }

  detach() {
    if (typeof window === 'undefined') return;
    document.removeEventListener('visibilitychange', this.onVisibility);
    // The gesture listeners and the audio graph deliberately outlive a single
    // component mount — the engine is a page-lifetime singleton.
  }

  private onVisibility = () => {
    this.hidden = document.visibilityState === 'hidden';
    if (this.ctx) this.gate();
  };

  private attachGesture() {
    if (this.gestureCleanup) return; // idempotent — dev double-effects call twice
    const fire = () => {
      this.detachGesture();
      if (this.getPreference() !== 'on') return;
      this.ensureContext();
      this.gate();
      this.emit();
    };
    const opts = { capture: true, passive: true } as const;
    window.addEventListener('pointerdown', fire, opts);
    window.addEventListener('keydown', fire, opts);
    window.addEventListener('touchstart', fire, opts);
    window.addEventListener('wheel', fire, opts);
    this.gestureCleanup = () => {
      window.removeEventListener('pointerdown', fire, true);
      window.removeEventListener('keydown', fire, true);
      window.removeEventListener('touchstart', fire, true);
      window.removeEventListener('wheel', fire, true);
      this.gestureCleanup = null;
    };
  }

  private detachGesture() { this.gestureCleanup?.(); }

  // ── Graph ──────────────────────────────────────────────────────────────────

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === 'undefined') return null;
    const Ctor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    let ctx: AudioContext;
    try {
      ctx = new Ctor();
    } catch {
      return null; // no audio on this device — the rest of the app never notices
    }
    this.ctx = ctx;
    this.build(ctx);
    return ctx;
  }

  private build(ctx: AudioContext) {
    const now = ctx.currentTime;

    // Master: trim → compressor → out. The compressor is the safety net for
    // "nothing startles" if a bond, a chime and the bed ever sum at once.
    const master = ctx.createGain();
    master.gain.setValueAtTime(0, now);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.setValueAtTime(-24, now);
    comp.knee.setValueAtTime(24, now);
    comp.ratio.setValueAtTime(3, now);
    comp.attack.setValueAtTime(0.01, now);
    comp.release.setValueAtTime(0.35, now);
    master.connect(comp);
    comp.connect(ctx.destination);
    this.master = master;

    // Reverb — two prime-ish delay taps with lowpassed feedback. A few nodes,
    // no impulse response to download or convolve.
    const wet = ctx.createGain();
    wet.gain.setValueAtTime(1, now);
    const fbLp = ctx.createBiquadFilter();
    fbLp.type = 'lowpass';
    fbLp.frequency.setValueAtTime(2200, now);
    const fb = ctx.createGain();
    fb.gain.setValueAtTime(0.55, now);
    const d1 = ctx.createDelay(1.0);
    d1.delayTime.setValueAtTime(0.191, now);
    const d2 = ctx.createDelay(1.0);
    d2.delayTime.setValueAtTime(0.271, now);
    const revOut = ctx.createGain();
    revOut.gain.setValueAtTime(0.5, now);
    wet.connect(d1); wet.connect(d2);
    d1.connect(fbLp); d2.connect(fbLp);
    fbLp.connect(fb);
    fb.connect(d1); fb.connect(d2);
    d1.connect(revOut); d2.connect(revOut);
    revOut.connect(master);
    this.wet = wet;

    // Shared noise: 4 s of brown-ish noise (leaky-integrated white), stereo,
    // generated once and looped by the bed, the wind and every swell.
    this.noise = makeNoise(ctx, 4);

    // ── Ambient bed ──
    const bed = ctx.createGain();
    bed.gain.setValueAtTime(0, now);
    bed.connect(master);
    this.bedGain = bed;

    const w = this.world;

    // Night air: looped noise through a lowpass, with a very slow breathing
    // swell on its gain so it is never a flat hiss.
    const airSrc = ctx.createBufferSource();
    airSrc.buffer = this.noise;
    airSrc.loop = true;
    const airFilter = ctx.createBiquadFilter();
    airFilter.type = 'lowpass';
    airFilter.frequency.setValueAtTime(w.airCutoff, now);
    airFilter.Q.setValueAtTime(0.7, now);
    const airGain = ctx.createGain();
    airGain.gain.setValueAtTime(w.airLevel * 0.62, now);
    const breathLfo = ctx.createOscillator();
    breathLfo.frequency.setValueAtTime(w.breathHz, now);
    const breathDepth = ctx.createGain();
    breathDepth.gain.setValueAtTime(w.airLevel * 0.30, now);
    breathLfo.connect(breathDepth);
    breathDepth.connect(airGain.gain);
    airSrc.connect(airFilter);
    airFilter.connect(airGain);
    airGain.connect(bed);
    airSrc.start(now);
    breathLfo.start(now);
    this.airFilter = airFilter;
    this.airGain = airGain;
    this.breathLfo = breathLfo;
    this.breathDepth = breathDepth;

    // Drone: two sines a world-defined interval apart, one detuned a hair so
    // they beat slowly against each other; lowpassed so no harmonic edge.
    const droneLp = ctx.createBiquadFilter();
    droneLp.type = 'lowpass';
    droneLp.frequency.setValueAtTime(700, now);
    const droneGain = ctx.createGain();
    droneGain.gain.setValueAtTime(w.droneLevel * 0.5, now);
    const a = ctx.createOscillator();
    a.type = 'sine';
    a.frequency.setValueAtTime(w.droneHz, now);
    const b = ctx.createOscillator();
    b.type = 'sine';
    b.frequency.setValueAtTime(w.droneHz * Math.pow(2, w.droneInterval / 12), now);
    b.detune.setValueAtTime(5, now); // ~0.2 Hz beat — the drone is alive
    a.connect(droneLp); b.connect(droneLp);
    droneLp.connect(droneGain);
    droneGain.connect(bed);
    a.start(now); b.start(now);
    this.droneA = a; this.droneB = b; this.droneGain = droneGain;

    // ── Wind (camera velocity) ──
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = this.noise;
    windSrc.loop = true;
    windSrc.playbackRate.setValueAtTime(1.31, now); // decorrelate from the air
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.setValueAtTime(320, now);
    windFilter.Q.setValueAtTime(0.6, now);
    const windGain = ctx.createGain();
    windGain.gain.setValueAtTime(0, now);
    windSrc.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    windSrc.start(now);
    this.windGain = windGain;
    this.windFilter = windFilter;

    // The bed appears rather than arrives.
    bed.gain.linearRampToValueAtTime(BED_LEVEL, now + BED_FADE_IN);
  }

  /** Opens or closes the master gate (opt-in state + tab visibility). */
  private gate() {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const open = this.pref === 'on' && !this.hidden;
    const now = ctx.currentTime;
    const g = this.master.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(open ? MASTER_TRIM : 0, now + FADE);
    if (open) {
      if (ctx.state !== 'running' && !this.starting) {
        this.starting = true;
        ctx.resume().then(() => { this.starting = false; this.flush(); this.emit(); })
          .catch(() => { this.starting = false; });
      } else {
        this.flush();
      }
    } else {
      // Let the ramp finish before parking the context.
      window.setTimeout(() => {
        if (this.ctx && (this.pref !== 'on' || this.hidden) && this.ctx.state === 'running') {
          this.ctx.suspend().catch(() => {});
        }
      }, (FADE + 0.15) * 1000);
    }
  }

  // ── World ──────────────────────────────────────────────────────────────────

  /**
   * Point the ambient bed at a question's world. Safe before the context
   * exists (the choice is remembered and applied when sound starts) and safe
   * to call on every mount. Called by the sky rail's switch, so the bed
   * travels with the sky.
   */
  setWorld(questionId: string | null | undefined) {
    const next = getWorldSound(questionId);
    const changed = questionId !== this.worldId;
    this.worldId = questionId ?? null;
    this.world = next;
    if (!changed) return;
    const ctx = this.ctx;
    if (!ctx || !this.airFilter || !this.airGain || !this.droneA || !this.droneB) return;
    const t = ctx.currentTime;
    const end = t + WORLD_XFADE;
    // The drone glides between worlds rather than cutting — the switch reads
    // as travel, exactly like the sky's crossfade.
    glide(this.airFilter.frequency, next.airCutoff, t, end);
    glide(this.airGain.gain, next.airLevel * 0.62, t, end);
    if (this.breathDepth) glide(this.breathDepth.gain, next.airLevel * 0.30, t, end);
    if (this.breathLfo) glide(this.breathLfo.frequency, next.breathHz, t, end);
    // (the drone lives inside bedGain, so ducking is already applied upstream)
    if (this.droneGain) glide(this.droneGain.gain, next.droneLevel * 0.5, t, end);
    glide(this.droneA.frequency, next.droneHz, t, end);
    glide(this.droneB.frequency, next.droneHz * Math.pow(2, next.droneInterval / 12), t, end);
  }

  // ── Camera wind ────────────────────────────────────────────────────────────

  /**
   * Feed the camera's current speed in world units/second (called from the
   * scene's animation loop). Cheap: the value is smoothed by the audio thread
   * via setTargetAtTime and only re-scheduled when it moves meaningfully.
   */
  setCameraSpeed(unitsPerSec: number) {
    if (!Number.isFinite(unitsPerSec)) return;
    this.cameraSpeed = unitsPerSec;
    const ctx = this.ctx;
    if (!ctx || !this.windGain || !this.windFilter) return;
    const now = ctx.currentTime;
    // This is called every animation frame. Scheduling automation at 60 Hz
    // destabilises a biquad (Chrome warns about it outright: "state is bad,
    // probably due to unstable filter caused by fast parameter automation").
    // 8 Hz alone wasn't a low enough rate to keep the bandpass's coefficient
    // recompute stable during a drift glide's accel/decel — throttle harder
    // (~3 Hz) and widen the frequency deadband so the filter's target only
    // moves in coarser, rarer steps.
    if (now - this.windAt < 0.3) return;
    const u = Math.max(0, Math.min(1, (unitsPerSec - WIND_FLOOR) / (WIND_CEIL - WIND_FLOOR)));
    const target = Math.pow(u, 1.5) * WIND_MAX;
    const targetMoved = Math.abs(target - this.windTarget) >= 0.0008;
    // The band only creeps, and only when it has somewhere to go — a wider
    // deadband (60 Hz) means far fewer, larger re-targets of a resonant node.
    const band = 300 + u * 280;
    const bandMoved = Math.abs(band - this.windBand) > 60;
    if (!targetMoved && !bandMoved) return;
    this.windAt = now;
    if (targetMoved) {
      this.windTarget = target;
      this.windGain.gain.setTargetAtTime(target, now, 0.4);
    }
    if (bandMoved) {
      this.windBand = band;
      // A slower time constant (was 0.5s) means each re-target creeps rather
      // than lurches, which is what actually keeps the biquad's coefficients
      // numerically stable frame to frame.
      this.windFilter.frequency.setTargetAtTime(band, now, 1.1);
    }
  }

  // ── One-shots ──────────────────────────────────────────────────────────────

  /**
   * The whole public vocabulary: play('chime' | 'select' | 'birth' | 'bond').
   * Never throws, never blocks, and does nothing at all when sound is off. If
   * the visitor has opted in but has not yet touched this document (the case
   * right after the star-birth navigation), the event waits for their first
   * gesture instead of being lost.
   */
  play(name: SoundEventName, opts?: PlayOptions) {
    this.requested[name]++;
    this.lastEvent = name;
    if (this.getPreference() !== 'on' || this.hidden) return;
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') {
      // Only the once-in-a-visit moments wait for the context. An incidental
      // chime or select that missed its moment is simply gone — replaying it
      // late would land on the wrong beat.
      if (name === 'birth' || name === 'bond') {
        this.queue.push({ name, opts, expires: Date.now() + QUEUE_TTL_MS });
        if (this.queue.length > 2) this.queue.shift();
      }
      return;
    }
    this.fire(name, opts);
  }

  private flush() {
    if (!this.queue.length) return;
    const now = Date.now();
    const due = this.queue.filter(q => q.expires > now);
    this.queue.length = 0;
    due.forEach((q, i) => {
      // Stagger, so a backlog blooms rather than stacking into a transient.
      window.setTimeout(() => this.fire(q.name, q.opts), i * 220);
    });
  }

  private fire(name: SoundEventName, opts?: PlayOptions) {
    const bus = this.bus();
    if (!bus) return;
    try {
      if (name === 'chime') playChime(bus, opts?.emotionIndex ?? 3);
      else if (name === 'select') playSelect(bus);
      else if (name === 'birth') playBirth(bus);
      else if (name === 'bond') playBond(bus);
      this.played[name]++;
    } catch {
      // A voice failing must never take the scene down with it.
    }
  }

  private bus(): Bus | null {
    if (!this.ctx || !this.master || !this.wet || !this.noise) return null;
    return {
      ctx: this.ctx,
      dry: this.master,
      wet: this.wet,
      root: this.world.droneHz,
      noise: this.noise,
      duck: (amount, attack, hold, release) => this.duck(amount, attack, hold, release),
    };
  }

  /** Pulls the ambient bed down under a big moment and lets it back up. */
  private duck(amount: number, attack: number, hold: number, release: number) {
    const ctx = this.ctx;
    if (!ctx || !this.bedGain) return;
    const now = ctx.currentTime;
    const g = this.bedGain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(BED_LEVEL * amount, now + attack);
    g.setValueAtTime(BED_LEVEL * amount, now + attack + hold);
    g.linearRampToValueAtTime(BED_LEVEL, now + attack + hold + release);
  }

  // ── Debug ──────────────────────────────────────────────────────────────────

  debugState(): SoundDebugState {
    return {
      preference: this.getPreference(),
      contextState: this.ctx ? this.ctx.state : 'none',
      bedPlaying: !!this.ctx && this.ctx.state === 'running'
        && !!this.bedGain && this.bedGain.gain.value > 0.0001
        && !!this.master && this.master.gain.value > 0.0001,
      worldId: this.worldId,
      world: this.world,
      cameraSpeed: Math.round(this.cameraSpeed * 10) / 10,
      requested: { ...this.requested },
      played: { ...this.played },
      queued: this.queue.length,
      lastEvent: this.lastEvent,
    };
  }

  /** True once an AudioContext exists — used by the tests that assert one is
   *  never created before a gesture. */
  hasContext(): boolean { return !!this.ctx; }
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Brown-ish noise (leaky-integrated white), stereo, normalised. Costs a few
 *  ms once and saves every byte a wind loop would have weighed. */
function makeNoise(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let last = 0;
    let peak = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last;
      const a = Math.abs(last);
      if (a > peak) peak = a;
    }
    // Normalise, then crossfade the last 40 ms into the first so the loop
    // point is seamless — a discontinuity there would be an audible tick.
    const norm = peak > 0 ? 0.9 / peak : 1;
    for (let i = 0; i < len; i++) data[i] *= norm;
    const xf = Math.min(Math.floor(ctx.sampleRate * 0.04), Math.floor(len / 4));
    for (let i = 0; i < xf; i++) {
      const t = i / xf;
      data[i] = data[i] * t + data[len - xf + i] * (1 - t);
    }
  }
  return buf;
}

/** Ramps a param without ever stepping it. */
function glide(p: AudioParam, to: number, from: number, until: number) {
  p.cancelScheduledValues(from);
  p.setValueAtTime(p.value, from);
  p.linearRampToValueAtTime(to, until);
}
