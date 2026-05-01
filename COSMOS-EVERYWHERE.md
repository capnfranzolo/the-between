# Unified Cosmos — One World, Submit Overlay, Spam Protection

The 3D cosmos is the only world. It runs behind every screen. The landing page is a passive view. Submitting drops you into the active cosmos with your star in it. Shared links open a star in the cosmos. There is no separate reveal page.

## The two modes

### Passive mode (landing page `/`)
- The 3D cosmos runs behind the question form
- Camera drifts on autopilot (existing slow yaw rotation)
- Stars from the current question's cosmos are visible
- Spirograph textures on stars are BLURRED — use 64×64 baked textures or apply a blur filter so stars read as soft glowing forms, not sharp spirographs. They should feel like distant lights through frosted glass.
- NO interactions: no clicking stars, no side-rotate, no space bar, no hover, no raycasting, no cursor changes
- Question form floats on top at z-index 1 with frosted glass styling
- When the user cycles questions ("not this one"), crossfade star sprites (800ms fade out old, fade in new)

### Active mode (cosmos `/cosmos/[questionId]`)
- Full interactivity: click stars, rotate, boost, hover, info panels, connections
- Stars use normal sharp spirograph textures (baked frames, live on selection)
- The cosmos as it works today

## Submit flow with overlay

When the user types their answer and clicks "SEE YOUR THOUGHT →":

### Step 1: Spam checks (before showing overlay)

Run these checks server-side via POST `/api/submit/validate`:

1. **Cloudflare Turnstile** — validate the Turnstile token. The widget should be on the landing page (below the submit button, small/invisible mode). If validation fails → show error: "Something went wrong. Try again."

2. **IP rate limit** — hash the IP, check against a `rate_limits` table in Supabase. Limit: 3 stars per IP per 24 hours. If exceeded → show message: "You've shared enough thoughts for today. Come back tomorrow."

3. **Character validation** — answer must be 20-500 chars (already enforced client-side, double-check server-side).

4. **Cheap gibberish detection** (no LLM) — check for:
   - Entropy test: if the character distribution is too uniform or too random (keyboard mashing), reject. Calculate Shannon entropy of the text — real language falls in a predictable range (~3.5-4.5 bits/char for English). Pure random is ~5+, repeated chars is ~1.
   - Repetition test: if any 3+ character sequence repeats more than 3 times, reject. Catches "abcabcabcabc" and "hahahahahaha"
   - Dictionary hit test: split on spaces, check if at least 40% of tokens are in a basic English word list (top 10,000 words). This catches "asdfkj weiof qpwoei" while allowing creative/poetic language. For non-English submissions, this check should be lenient — skip it if fewer than 3 space-separated tokens exist (could be a valid non-English response).
   - Minimum word count: at least 4 space-separated tokens
   - If any check fails → show message: "We couldn't understand that. Try writing a real thought."

5. **Duplicate check** — hash the answer text, check against existing stars for this question. If duplicate → "Someone already shared that exact thought. Try your own words."

These checks are fast — no API calls except Turnstile (which is free). Total validation should take <200ms.

If all checks pass, return success and proceed to the overlay.

### Step 2: Unique fact overlay

On validation success, show a frosted-glass overlay on top of the landing page (cosmos still visible behind, still passive):

```
Layout:
- Dark frosted overlay covers the full screen (rgba(13, 10, 32, 0.85), backdrop-blur: 12px)
- Centered card (max-width: 480px), no border, just the content floating

Content:
- Eyebrow: "ONE MORE THING" (11px, uppercase, 0.32em letter-spacing, horizon[3] color)
- Question: "What's something unique about you?" (Cormorant Garamond, 26px, textPri)
- Subtitle: "A small detail. Strangers will see this beside your star." (Inter, 13px, textDim)
- Textarea: frosted glass, 2 rows, Cormorant 17px, 120 char max
- Character counter: same pattern as main form, "3 more" / "ready" / "n / 120"
- Buttons row:
  - "← back" link (returns to the question form, clears overlay, answer preserved in the textarea)
  - "SEE YOUR THOUGHT →" pill button (only appears when 3+ chars entered)
```

### Step 3: Star creation

When the user submits the unique fact:

1. POST `/api/submit` with: `{ answer, uniqueFact, questionId, turnstileToken, ipHash }`
2. Server creates the star:
   - Generate 4-char shortcode
   - Call Haiku for dimension extraction (already built)
   - Generate random curveType
   - Insert into stars table with status 'pending' (for admin review)
   - BUT: also auto-approve for now during development (set status 'approved' immediately — we'll switch to pending-only before launch)
3. Return: `{ shortcode, questionId, dimensions }`
4. Save shortcode to localStorage
5. Redirect to `/cosmos/[questionId]?star=[shortcode]`

### Step 4: Enter the cosmos with your star

On arriving at `/cosmos/[questionId]?star=[shortcode]`:

1. Cosmos switches to active mode
2. The user's star is added to the scene at its deterministic position
3. Camera flies to the new star
4. Info panel opens showing:
   - The answer text
   - The unique fact
   - Live animated spirograph (the star in the 3D scene, not a separate canvas in the panel)
   - Share URL: `thebetween.world/s/[shortcode]` with copy button
   - "CONNECT YOUR STAR TO ANOTHER →" button
   - "just drift" text link that closes the panel and lets them explore

## Shared links (`/s/[shortcode]`)

This route does one thing: look up the star's question_id, then redirect to:
`/cosmos/[questionId]?star=[shortcode]`

The cosmos loads, camera flies to the star, info panel opens. The visitor sees exactly what they'd see clicking that star in the cosmos:
- The spirograph (live animated in the scene)
- The answer text
- The unique fact
- Connection info if the star is bonded
- If the visitor doesn't have a star: "WHAT SHAPE ARE YOU? →" button linking to `/`
- If the visitor has a star: "CONNECT YOUR STAR TO THIS →" button (if eligible)

There is no special "shared link" view. A shared link is just a deep link into the cosmos.

## Database additions

### Rate limits table

```sql
-- Migration: supabase/migrations/004_rate_limits_and_spam.sql

CREATE TABLE rate_limits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_hash text NOT NULL,
  action text NOT NULL DEFAULT 'star_create',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_rate_limits_ip_action ON rate_limits(ip_hash, action, created_at);

-- RLS: server-side only (service role), no public access
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
-- No public policies — only service role can read/write

-- Add answer_hash to stars for duplicate detection
ALTER TABLE stars ADD COLUMN IF NOT EXISTS answer_hash text;
CREATE INDEX idx_stars_answer_hash ON stars(answer_hash, question_id);
```

## API routes

### POST `/api/submit/validate` (new)

Validates the answer before showing the unique fact overlay:

- Input: `{ answer, questionId, turnstileToken }`
- Validates Turnstile token with Cloudflare API
- Checks IP rate limit (3 per 24h)
- Runs gibberish detection
- Checks for duplicate answer hash
- Returns: `{ valid: true }` or `{ valid: false, reason: "..." }`

### POST `/api/submit` (updated)

Creates the star after unique fact is provided:

- Input: `{ answer, uniqueFact, questionId }`
- Re-validates (don't trust the client — run rate limit and duplicate checks again)
- Generates shortcode, extracts dimensions via Haiku, generates curveType
- Inserts star with answer_hash
- Inserts rate_limit record
- Returns: `{ shortcode, questionId, dimensions, curveType }`

## Environment variables needed

```
TURNSTILE_SECRET_KEY=...              # Cloudflare Turnstile server-side secret
NEXT_PUBLIC_TURNSTILE_SITE_KEY=...    # Cloudflare Turnstile client-side key
```

Get these from the Cloudflare dashboard → Turnstile → create a new site widget for thebetween.world. Use "managed" challenge type (invisible when possible, shows challenge only when suspicious).

## Pages to modify

### Landing page (`/`)
- Add Turnstile widget (invisible mode, loads on page load, token refreshes on question cycle)
- "SEE YOUR THOUGHT →" button now calls `/api/submit/validate` first
- On validation success: show the unique fact overlay
- On validation failure: show the error message inline below the submit button (same text styling as character counter, but in a warm red/coral color)

### Cosmos page (`/cosmos/[questionId]`)
- Handle `?star=[shortcode]` query param: fly to that star and open its panel on load
- No other changes — it already works

### Star page (`/s/[shortcode]`)
- Rewrite as a simple server-side redirect to `/cosmos/[questionId]?star=[shortcode]`
- Look up the star's question_id from Supabase
- If star not found: redirect to `/` instead
- Preserve OG meta tags on this route for social sharing (the og:image still needs to work when a crawler hits this URL)

### Remove or repurpose
- `/unique/[shortcode]` route — no longer needed as a standalone page. The unique fact is now an overlay on the landing page. Remove this route.
- The reveal page functionality is absorbed into the cosmos. The `/s/[shortcode]` route is just a redirect now.

## CosmosProvider changes

The CosmosProvider needs to support the two modes:

```typescript
interface CosmosContextValue {
  setQuestionId: (id: string) => void;
  setMode: (mode: 'passive' | 'active') => void;  // NEW
  flyToStar: (shortcode: string) => void;
  openStarPanel: (shortcode: string) => void;       // NEW — fly + open panel
  addStar: (star: StarData) => void;                // NEW — add a just-created star
  isReady: boolean;
}
```

**Passive mode:**
- Disables all raycasting, click handlers, keyboard controls
- Uses blurred 64×64 spirograph textures
- Camera on autopilot only

**Active mode:**
- Enables everything
- Swaps to sharp spirograph textures (if the same stars are present, swap their sprite textures — don't recreate the stars)
- Camera responds to user input

**Transition between modes:**
When navigating from `/` to `/cosmos/[questionId]`:
- The stars are already in the scene (same question)
- Swap textures from blurred to sharp over 400ms (fade between two sprite layers)
- Enable interaction handlers
- The cosmos was always there — it just wakes up

## What NOT to change

- The spirograph renderer — untouched
- The 3D sky dome, terrain, clouds — untouched
- Orbital mechanics — untouched
- Connection flow (the connect button, reason input, bond creation) — untouched
- Admin dashboard — untouched
- OG image generation — untouched (still needs to work for social sharing on /s/[shortcode])
- The hi-res star swap on selection — untouched
- Question cycling — untouched (but now triggers cosmos star swaps in passive mode)

## Testing

1. Load `/` — 3D cosmos visible behind question form, stars are soft/blurred, no click interaction
2. Cycle questions — background stars crossfade to the new question's cosmos
3. Type gibberish, hit submit — error message appears, no overlay
4. Type a real answer, hit submit — unique fact overlay appears over the passive cosmos
5. Fill in unique fact, submit — redirected to cosmos, it wakes up (sharp textures, interactive), camera flies to your new star, panel opens
6. Panel shows: your answer, unique fact, live spirograph in the scene, share URL, connect button
7. Copy the share URL, open in incognito — goes to the star in the cosmos, panel opens, shows answer + spirograph, "What shape are you?" CTA
8. Submit 3 stars from the same IP — 4th attempt shows rate limit message
9. Submit duplicate answer — shows duplicate message
10. On mobile: passive cosmos runs at acceptable framerate behind the form, overlay is scrollable if needed
