export async function verifyTurnstileToken(token: string | undefined | null): Promise<boolean> {
  if (process.env.NODE_ENV !== 'production') return true;

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Keys not configured — Turnstile not active yet, pass through
    return true;
  }

  if (!token) return false;

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
    });
    const data = await res.json() as { success: boolean };
    return data.success === true;
  } catch (err) {
    console.error('[turnstile] verification request failed:', err);
    return false;
  }
}
