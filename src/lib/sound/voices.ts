// Phase 7 — one-shot voices.
//
// Every sound in The Between is synthesised at runtime: no audio files ship
// with the page. Each voice below is a short graph of oscillators / filtered
// noise built on demand, enveloped, and left to be collected once its
// sources stop. Two rules hold everywhere:
//
//   1. Nothing steps a gain. Every start and stop is a ramp from (or to)
//      silence, so there is never a click or pop.
//   2. Nothing is loud. Peaks live around −26 dBFS — far under speech —
//      and the master bus carries a compressor as a final safety net.

/** The mixer surface a voice is allowed to touch. */
export interface Bus {
  ctx: AudioContext;
  /** Dry destination — feeds the master bus. */
  dry: GainNode;
  /** Reverb send — a cheap two-tap feedback delay, see engine.ts. */
  wet: GainNode;
  /** The current world's tonal root in Hz (see WorldSoundConfig.droneHz). */
  root: number;
  /** Shared stereo noise buffer (4 s, brown-ish), generated once. */
  noise: AudioBuffer;
  /** Ducks the ambient bed under a big moment. */
  duck: (amount: number, attack: number, hold: number, release: number) => void;
}

/** Pentatonic degrees (semitones) — the chime scale, indexed by emotionIndex. */
const PENTA = [0, 3, 5, 7, 10, 12, 15];

const semi = (n: number) => Math.pow(2, n / 12);

/** Envelope helper: silence → peak (linear attack) → silence (exponential
 *  decay). Exponential can never reach 0, so it lands on a floor and is then
 *  set flat to 0 — the last step is inaudible and leaves no residual DC. */
function env(g: AudioParam, t0: number, peak: number, attack: number, decay: number) {
  g.setValueAtTime(0.0001, t0);
  g.linearRampToValueAtTime(peak, t0 + attack);
  g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  g.setValueAtTime(0, t0 + attack + decay + 0.001);
}

/** A single enveloped oscillator partial. Returns its stop time. */
function partial(
  bus: Bus,
  opts: {
    type?: OscillatorType;
    freq: number;
    /** Optional glide target — the partial slides here over `glide` seconds. */
    glideTo?: number;
    glide?: number;
    detune?: number;
    peak: number;
    attack: number;
    decay: number;
    at: number;      // start time offset from now
    send?: number;   // reverb send, 0-1
    lowpass?: number;
  },
): number {
  const { ctx } = bus;
  const t0 = ctx.currentTime + opts.at;
  const osc = ctx.createOscillator();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(opts.freq, t0);
  if (opts.glideTo && opts.glide) {
    osc.frequency.exponentialRampToValueAtTime(opts.glideTo, t0 + opts.glide);
  }
  if (opts.detune) osc.detune.setValueAtTime(opts.detune, t0);

  const g = ctx.createGain();
  env(g.gain, t0, opts.peak, opts.attack, opts.decay);

  let tail: AudioNode = osc;
  if (opts.lowpass) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(opts.lowpass, t0);
    osc.connect(lp);
    tail = lp;
  }
  tail.connect(g);
  g.connect(bus.dry);
  if (opts.send) {
    const s = ctx.createGain();
    s.gain.setValueAtTime(opts.send, t0);
    g.connect(s);
    s.connect(bus.wet);
  }

  const stop = t0 + opts.attack + opts.decay + 0.05;
  osc.start(t0);
  osc.stop(stop);
  osc.onended = () => { try { osc.disconnect(); g.disconnect(); } catch { /* already gone */ } };
  return stop;
}

/** A band of the shared noise buffer, swept and enveloped — the "air" in
 *  blooms and swells. */
function noiseSwell(
  bus: Bus,
  opts: {
    from: number; to: number; q: number;
    peak: number; attack: number; decay: number;
    at: number; send?: number;
    type?: BiquadFilterType;
  },
) {
  const { ctx } = bus;
  const t0 = ctx.currentTime + opts.at;
  const src = ctx.createBufferSource();
  src.buffer = bus.noise;
  src.loop = true;
  src.playbackRate.setValueAtTime(0.8 + Math.random() * 0.4, t0);

  const bp = ctx.createBiquadFilter();
  bp.type = opts.type ?? 'bandpass';
  bp.Q.setValueAtTime(opts.q, t0);
  bp.frequency.setValueAtTime(opts.from, t0);
  bp.frequency.exponentialRampToValueAtTime(opts.to, t0 + opts.attack + opts.decay * 0.5);

  const g = ctx.createGain();
  env(g.gain, t0, opts.peak, opts.attack, opts.decay);

  src.connect(bp); bp.connect(g); g.connect(bus.dry);
  if (opts.send) {
    const s = ctx.createGain();
    s.gain.setValueAtTime(opts.send, t0);
    g.connect(s); s.connect(bus.wet);
  }

  const stop = t0 + opts.attack + opts.decay + 0.05;
  src.start(t0);
  src.stop(stop);
  src.onended = () => { try { src.disconnect(); bp.disconnect(); g.disconnect(); } catch { /* already gone */ } };
}

/**
 * Drift arrival — a soft bell as the camera settles on a star and its
 * thought becomes readable. Pitch is the star's emotionIndex read as a
 * degree of a pentatonic scale three octaves above the world's root, so the
 * tour is always in key with the sky it happens in.
 *
 * Three sine partials (1×, 2×, ~3×, the third slightly stretched so it rings
 * rather than hums), 12 ms attack, 2.4/1.3/0.7 s exponential decays.
 */
export function playChime(bus: Bus, emotionIndex: number) {
  const deg = PENTA[Math.max(0, Math.min(PENTA.length - 1, Math.round(emotionIndex)))];
  const f = bus.root * 8 * semi(deg);
  partial(bus, { freq: f,          peak: 0.048, attack: 0.012, decay: 2.4, at: 0,     send: 0.32, lowpass: 5200 });
  partial(bus, { freq: f * 2,      peak: 0.011, attack: 0.010, decay: 1.3, at: 0,     send: 0.26, detune: 4 });
  partial(bus, { freq: f * 3.012,  peak: 0.005, attack: 0.008, decay: 0.7, at: 0.004, send: 0.20 });
}

/**
 * Selection — a touch, not a click. A fifth-apart sine pair a little above
 * the chime register, 6 ms attack, half-second decay, mostly dry so it feels
 * like it happened at the fingertip rather than out in the world.
 */
export function playSelect(bus: Bus) {
  const f = bus.root * 12;
  partial(bus, { freq: f,       peak: 0.034, attack: 0.006, decay: 0.42, at: 0, send: 0.16, lowpass: 6000 });
  partial(bus, { freq: f * 1.5, peak: 0.014, attack: 0.006, decay: 0.28, at: 0.012, send: 0.12 });
}

/**
 * Star birth — a bloom. An ascending breath of filtered noise (260 → 1800 Hz,
 * 0.9 s attack) opens underneath a staggered root–fifth–octave triad whose
 * voices each glide up ~3 % as they speak, so the whole gesture leans upward.
 * A sub sine gives it a body to sit on. ~3.5 s, generously reverbed.
 */
export function playBirth(bus: Bus) {
  const r = bus.root;
  noiseSwell(bus, { from: 260, to: 1800, q: 0.9, peak: 0.026, attack: 0.9, decay: 1.9, at: 0, send: 0.5 });
  partial(bus, { freq: r * 2,           peak: 0.028, attack: 0.40, decay: 2.2, at: 0,    send: 0.35, lowpass: 900 });
  partial(bus, { freq: r * 4,  glideTo: r * 4 * 1.03,  glide: 0.6, peak: 0.030, attack: 0.25, decay: 2.6, at: 0.00, send: 0.5 });
  partial(bus, { freq: r * 6,  glideTo: r * 6 * 1.03,  glide: 0.6, peak: 0.026, attack: 0.25, decay: 2.4, at: 0.16, send: 0.5 });
  partial(bus, { freq: r * 8,  glideTo: r * 8 * 1.03,  glide: 0.6, peak: 0.020, attack: 0.25, decay: 2.2, at: 0.32, send: 0.5 });
}

/**
 * Bond formation — the finale, and the only sound in the product allowed to
 * take its time (~8 s).
 *
 * Two voices enter an octave apart — the two stars — and glide toward each
 * other over 3 s, meeting in unison on the fifth. The beating between them
 * quickens as they close and locks the instant they arrive; that convergence
 * is the whole idea of the moment made audible. Under them, a sub sine on the
 * world's root swells over 1.2 s and holds — the deepest tone in the product.
 * At the meeting a quiet triad blooms above (3 sine strikes, 4 s decays), and
 * a slow low noise swell breathes underneath the whole thing. The ambient bed
 * ducks 45 % so the pair has the room to itself, and returns over 3 s.
 */
export function playBond(bus: Bus) {
  const r = bus.root;
  const meet = r * 6;           // the unison they arrive at (a fifth above r*4)
  const CONVERGE = 3.0;

  bus.duck(0.45, 0.8, 3.2, 3.0);

  // The two stars, closing.
  partial(bus, { freq: r * 4, glideTo: meet, glide: CONVERGE, peak: 0.040, attack: 0.7, decay: 6.2, at: 0, send: 0.55, lowpass: 2400 });
  partial(bus, { freq: r * 8, glideTo: meet, glide: CONVERGE, peak: 0.034, attack: 0.9, decay: 6.0, at: 0, send: 0.55, lowpass: 3200, detune: -3 });

  // The ground they meet over.
  partial(bus, { freq: r,       peak: 0.052, attack: 1.2, decay: 5.4, at: 0,    send: 0.30, lowpass: 260 });
  partial(bus, { freq: r * 2,   peak: 0.020, attack: 1.4, decay: 4.8, at: 0.2,  send: 0.30, lowpass: 500 });

  // The lock — struck at the moment of unison.
  partial(bus, { freq: meet * 2,      peak: 0.024, attack: 0.02, decay: 4.0, at: CONVERGE,        send: 0.6 });
  partial(bus, { freq: meet * 3,      peak: 0.016, attack: 0.02, decay: 3.4, at: CONVERGE + 0.09, send: 0.6 });
  partial(bus, { freq: meet * 4.02,   peak: 0.010, attack: 0.02, decay: 2.8, at: CONVERGE + 0.18, send: 0.6 });

  // Breath under everything.
  noiseSwell(bus, { from: 180, to: 900, q: 0.7, peak: 0.018, attack: 1.6, decay: 5.0, at: 0, send: 0.55 });
}
