const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** New stars get 10 characters (owner decision 2026-09-19); older 4-char codes
 *  keep working — nothing that *reads* a shortcode assumes a length. */
export const SHORTCODE_LENGTH = 10;

export function generateShortcode(length = SHORTCODE_LENGTH): string {
  let result = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    result += CHARS[array[i] % CHARS.length];
  }
  return result;
}

/** Exactly what `generateShortcode()` can produce — the alphabet above, at the
 *  default length. Used to sanity-check a *client-suggested* code (Stage G: the
 *  code is minted at validate time so the preview and the born star share an
 *  archetype seed). A suggestion only: the server still owns the real code. */
const SHORTCODE_PATTERN = new RegExp(`^[${CHARS}]{${SHORTCODE_LENGTH}}$`);

export function isValidShortcode(value: unknown): value is string {
  return typeof value === 'string' && SHORTCODE_PATTERN.test(value);
}
