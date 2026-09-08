// Phase 7 — the public sound surface.
//
// Everything outside this folder talks to `sound` and nothing else. Callers
// never see an AudioContext, a node graph, or a synthesis parameter:
//
//   sound.play('bond')                     — a moment happened
//   sound.play('chime', { emotionIndex })  — …with a pitch, for star arrivals
//   sound.setWorld(questionId)             — the sky changed; take the bed with it
//   sound.setCameraSpeed(unitsPerSec)      — the camera is moving this fast
//
// Every call is a no-op when sound is off (the default), safe during SSR, and
// safe before the engine has ever been started.

import { SoundEngine, type SoundEventName, type PlayOptions, type SoundPreference } from './engine';

export type { SoundEventName, PlayOptions, SoundPreference };

// A page-lifetime singleton. Constructing it touches no browser API — the
// AudioContext is only ever created from a user gesture (see engine.attach).
const engine = new SoundEngine();

export const sound = {
  /** 'on' | 'off' | 'unset' — 'unset' means the visitor hasn't been asked yet. */
  getPreference: (): SoundPreference => engine.getPreference(),
  isOn: (): boolean => engine.isOn(),
  /** Opt in. Must be called from a user gesture. */
  enable: () => engine.enable(),
  /** Opt out, or decline the invitation. */
  disable: () => engine.disable(),
  toggle: () => (engine.isOn() ? engine.disable() : engine.enable()),
  /** Subscribe to preference/context changes (for UI state). Returns an unsubscribe. */
  subscribe: (fn: () => void) => engine.subscribe(fn),
  /** Mount/unmount hooks for the sound control component. */
  attach: () => engine.attach(),
  detach: () => engine.detach(),

  play: (name: SoundEventName, opts?: PlayOptions) => engine.play(name, opts),
  setWorld: (questionId: string | null | undefined) => engine.setWorld(questionId),
  setCameraSpeed: (unitsPerSec: number) => engine.setCameraSpeed(unitsPerSec),

  /** Diagnostics — also what window.__btwSound exposes outside production. */
  debugState: () => engine.debugState(),
  hasContext: () => engine.hasContext(),
};

export type Sound = typeof sound;

/** Exposes window.__btwSound outside production so the sound design can be
 *  driven and asserted from a browser console or an automated pass.
 *  __btwSoundEngine is the raw engine, for poking at the live node graph. */
export function installSoundDebugHandle() {
  if (typeof window === 'undefined') return;
  if (process.env.NODE_ENV === 'production') return;
  const w = window as unknown as { __btwSound?: Sound; __btwSoundEngine?: SoundEngine };
  w.__btwSound = sound;
  w.__btwSoundEngine = engine;
}
