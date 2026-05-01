# OG Image Generation for Social Sharing

Generate a unique 1200×630 PNG image for each star, served at `/api/og/[shortcode]`. This image appears when someone shares a star URL on Facebook, Twitter/X, LinkedIn, iMessage, Discord, Slack, etc.

## What the image shows

A single card with the twilight gradient background, the star's spirograph, its answer text, byline, the question, and a call to action.

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│                    THE BETWEEN                           │
│                                                          │
│              ╭─────────────────╮                         │
│              │                 │                         │
│              │   [spirograph]  │                         │
│              │     240×240     │                         │
│              │                 │                         │
│              ╰─────────────────╯                         │
│                                                          │
│   "What do you know is true but you can't prove?"        │
│                                                          │
│   "The answer text goes here, wrapped across             │
│    multiple lines if needed, in Cormorant Garamond       │
│    italic, warm white."                                  │
│                                                          │
│                    — the byline                          │
│                                                          │
│         ● see your thoughts in the cosmos                │
│                                                          │
│                  thebetween.world                        │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

Layout is centered, vertically stacked. Not two-column — the focus is the spirograph and the words.

### Visual details

**Background:**
- Simplified twilight gradient (vertical linear, not the radial sun shader — this is a static image)
- Top: #1E1840 (deep indigo)
- Middle: #3D2D65 → #5A3D78 → #7B5088
- Bottom: #9A6080 with a hint of #B87878
- Don't go all the way to gold — keep it in the purple-mauve range so text is readable
- Subtle noise texture or grain overlay (2-3% opacity) to avoid banding

**Spirograph:**
- 240×240 pixels, centered horizontally
- Rendered from the star's real dimensions using the existing spirograph renderer
- Bake at t=3.0 — this gives enough ghost trace buildup to show the shape clearly
- Slight glow/bloom around it: draw the spirograph, then composite a blurred copy at 30% opacity behind it

**"THE BETWEEN" eyebrow:**
- Top of image, centered
- 11px equivalent (scale up for 1200px width — use ~16px), uppercase, letter-spacing 0.32em
- Color: rgba(240, 232, 224, 0.45) — textDim

**Question text:**
- Below the spirograph
- Cormorant Garamond, ~22px equivalent (scale to ~28px), regular weight
- Color: BTW.textSec (#C8B0E0)
- Centered, max-width ~800px with word wrap

**Answer text:**
- Below the question
- Cormorant Garamond, ~26px equivalent (scale to ~34px), italic
- Color: BTW.textPri (#F0E8E0)
- Centered, max-width ~900px with word wrap
- Wrapped in smart quotes: "..."
- If the answer is longer than ~200 chars, truncate with "..." to keep the image balanced

**Byline:**
- Below the answer
- Inter, ~14px equivalent (scale to ~18px), regular weight
- Color: BTW.textDim
- Prefixed with em dash: "— the byline text"
- If no byline/unique_fact exists, omit this line

**Call to action:**
- Below the byline, with some spacing
- A pill-shaped element (rounded rect, no fill, 1px border in horizon[3] #F0C080)
- Inside: a small filled circle (4px, horizon[3]) + "see your thoughts in the cosmos" in Inter 13px (scale to ~17px), uppercase, letter-spacing 0.1em, color horizon[3]
- This is decorative — it's an image, not a button. But it tells the viewer what they'll find if they click.

**URL:**
- Bottom of image, centered
- "thebetween.world" in monospace (or Inter 300), ~14px (scale to ~18px)
- Color: rgba(240, 232, 224, 0.35)

## Technical implementation

### Server-side canvas rendering

Install `@napi-rs/canvas` for Node-native canvas support on Vercel:

```bash
npm install @napi-rs/canvas
```

This gives you a Canvas API compatible with your existing spirograph renderer but running in Node.js instead of the browser.

### Font loading

`@napi-rs/canvas` needs fonts registered explicitly. Download the font files and include them in the project:

```bash
mkdir -p src/assets/fonts
```

Download and save:
- Cormorant Garamond Regular (for question text)
- Cormorant Garamond Italic (for answer text)
- Inter Regular (for UI text)
- Inter Light (for URL)

Register them in the OG route before rendering:

```typescript
import { GlobalFonts } from '@napi-rs/canvas';
import path from 'path';

GlobalFonts.registerFromPath(
  path.join(process.cwd(), 'src/assets/fonts/CormorantGaramond-Regular.ttf'),
  'Cormorant Garamond'
);
// ... etc for each weight/style
```

### The route: `/api/og/[shortcode]/route.ts`

```typescript
export async function GET(
  request: Request,
  { params }: { params: { shortcode: string } }
) {
  // 1. Fetch star from Supabase (service role — bypasses RLS)
  // 2. If not found, return a default "The Between" branded image
  // 3. Fetch the question text for this star's question_id
  // 4. Create a 1200×630 canvas
  // 5. Draw the background gradient
  // 6. Port/adapt the spirograph renderer to work with @napi-rs/canvas
  //    - The renderer expects a canvas element — @napi-rs/canvas provides one
  //    - Create a 480×480 offscreen canvas (2x for quality), render the spirograph
  //    - Draw it scaled to 240×240 onto the main canvas
  // 7. Draw all text elements with proper fonts
  // 8. Draw the CTA pill
  // 9. Export as PNG buffer
  // 10. Return with proper headers

  return new Response(pngBuffer, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400', // cache 24h
    },
  });
}
```

### Spirograph renderer adaptation

The existing renderer in `src/lib/spirograph/renderer.ts` was written for browser canvas. To work with `@napi-rs/canvas`:

- The canvas API is nearly identical — getContext('2d'), fillRect, arc, stroke, etc. all work
- BUT: `@napi-rs/canvas` doesn't support `filter` (CSS blur). If the renderer uses `ctx.filter = 'blur(...)'` for the glow/bloom effect, replace with a manual approach: render the spirograph twice — once at full opacity for the sharp version, once into a separate canvas that you manually blur by drawing it scaled down then back up (poor man's blur), then composite the blurred version behind at 30% opacity.
- `requestAnimationFrame` doesn't exist in Node — but you don't need it. You're calling `renderStatic(3.0)` which runs the simulation to t=3.0 and draws a single frame. No animation loop needed.
- If the renderer uses any DOM APIs beyond canvas (checking window, adding event listeners), guard those with `typeof window !== 'undefined'` checks.

The safest approach: create a thin wrapper function `renderSpirographToBuffer(dimensions, size)` in a new file `src/lib/spirograph/server-render.ts` that:
1. Creates a `@napi-rs/canvas` Canvas
2. Calls the existing renderer's `renderStatic`
3. Handles any API differences
4. Returns the canvas

### Bloom/glow effect without CSS filter

Since `ctx.filter` isn't available in @napi-rs/canvas:

1. Render the spirograph onto a 480×480 canvas (the "sharp" layer)
2. Create a second 480×480 canvas (the "glow" layer)
3. Draw the sharp canvas onto the glow canvas scaled down to 120×120, then scale it back up to 480×480 — this creates a blocky blur
4. Do this twice (480→60→480) for a softer blur
5. On the final compositing canvas: draw the glow layer at 25% opacity first, then the sharp layer on top
6. This gives a soft halo around the spirograph

## Meta tags

Update the `/s/[shortcode]` route (the redirect page) to include OG meta tags BEFORE the redirect. The page should server-render the meta tags so crawlers see them, then client-side redirect to the cosmos.

```tsx
// src/app/s/[shortcode]/page.tsx
export async function generateMetadata({ params }) {
  const star = await fetchStar(params.shortcode);
  if (!star) return {};

  const question = await fetchQuestion(star.question_id);

  return {
    title: `The Between — ${question.text}`,
    description: star.answer.slice(0, 155),
    openGraph: {
      title: 'The Between',
      description: star.answer.slice(0, 155),
      images: [{
        url: `https://thebetween.world/api/og/${params.shortcode}`,
        width: 1200,
        height: 630,
        alt: 'A spirograph star in The Between',
      }],
      type: 'website',
      siteName: 'The Between',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'The Between',
      description: star.answer.slice(0, 155),
      images: [`https://thebetween.world/api/og/${params.shortcode}`],
    },
  };
}
```

The page itself still redirects to `/cosmos/[questionId]?star=[shortcode]` via a client-side redirect (useEffect + router.push, or a meta refresh). Crawlers don't execute JS — they just see the meta tags and the OG image URL.

## Default/fallback image

If the shortcode isn't found, or if the star has no dimensions yet, return a generic branded image:

- Same twilight gradient background
- "THE BETWEEN" centered, larger (40px)
- "What shape are your thoughts?" in Cormorant, centered
- The CTA pill
- thebetween.world at the bottom
- No spirograph, no answer text

Cache this aggressively — it's the same for every miss.

Also generate this as a static file at `/api/og/default` for use as the site-wide og:image on the landing page.

## Caching

- Each star's OG image is deterministic (same dimensions = same image every time)
- Cache headers: `Cache-Control: public, max-age=86400, s-maxage=86400` (24 hours)
- If a star's dimensions are regenerated via the admin dashboard, the image will naturally update after the cache expires
- For immediate updates after admin edits, you could add a cache-busting query param, but it's not worth the complexity — 24h staleness is fine for OG images

## What NOT to change

- The spirograph renderer source — don't modify it, create a server-side wrapper
- The cosmos, landing page, connection flow — untouched
- The admin dashboard — untouched (though regen will eventually produce a new OG image)

## Testing

1. Visit `/api/og/[shortcode]` directly in a browser — should see the PNG image
2. The spirograph should match what you see in the cosmos for that star (same shape, same color)
3. Text should be readable — question in purple, answer in white, byline dimmed
4. The CTA pill should look clean with the warm gold border
5. Share the `/s/[shortcode]` URL on Twitter/X — the preview card should show the image with the spirograph
6. Share on iMessage/Messages — should show the large image preview
7. Test with Facebook's sharing debugger (developers.facebook.com/tools/debug) — paste the URL, confirm it picks up the og:image
8. Test a star with a very long answer — should truncate cleanly
9. Test a star with no byline — the byline line should be omitted, not show a blank gap
10. Test a nonexistent shortcode — should get the default branded image
