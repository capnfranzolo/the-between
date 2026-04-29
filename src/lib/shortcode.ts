const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function generateShortcode(length = 4): string {
  let result = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    result += CHARS[array[i] % CHARS.length];
  }
  return result;
}
