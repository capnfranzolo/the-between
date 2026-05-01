# Integrate Spirograph Renderer + Dimension Extraction

Two new files need to be integrated into the codebase. They replace the existing placeholder spirograph and mock dimension system.

## Files to integrate

1. `spirograph-renderer.js` → port to `src/lib/spirograph/renderer.ts`
2. `dimension-prompt.js` → port to `src/lib/dimensions/prompt.ts`

Both files are in the repo root (or provided alongside this prompt). Read them fully before starting.

## What the renderer does

It's a Canvas 2D spirograph renderer that takes six dimension floats (0-1), an emotion index (0-6), and a curve type. It renders animated firefly tracers on a 3D-projected parametric curve. This REPLACES the existing Spirograph component from the design prototype (the simple rotating ellipses). The new renderer is significantly more sophisticated — 3D projection, multiple curve types, fading tails, ghost traces, head glow.

## What the dimension prompt does

It's the system prompt for Claude Haiku that analyzes user statements into six dimensions + an emotion. It includes calibration examples. The extraction function should call the Anthropic API with this prompt.

## Integration tasks

### 1. Port renderer to TypeScript (`src/lib/spirograph/renderer.ts`)

- Convert to TypeScript with proper types for all config, geometry, and dimension objects
- Keep the exact same rendering logic — don't simplify or "improve" the math
- Export: `createSpirograph`, `randomCurveType`, `EMOTIONS`, `CURVE_TYPES`, `CONFIG`
- The `createSpirograph` function takes a canvas element and returns `{ start, stop, update, renderStatic }`

### 2. Port dimension prompt to TypeScript (`src/lib/dimensions/prompt.ts`)

- Export `DIMENSION_PROMPT` as a const string
- Export `DimensionResult` type: `{ certainty, warmth, tension, vulnerability, scope, rootedness, emotionIndex, reasoning }`

### 3. Wire up dimension extraction (`src/lib/dimensions/extract.ts`)

- Replace the mock function with a real Anthropic API call
- Use `claude-haiku-4-5-20251001` model, max_tokens 300
- System prompt = DIMENSION_PROMPT, user message = the answer text
- Parse the JSON response, validate all six floats are 0-1, emotionIndex is 0-6
- If parsing fails, return sensible defaults (all 0.5, emotionIndex 3)
- Use ANTHROPIC_API_KEY from env (server-side only)
- Install `@anthropic-ai/sdk` if not already installed

### 4. Update the submit flow (`src/app/api/submit/route.ts`)

- After creating the star, call the dimension extraction function
- Generate a random curveType using `randomCurveType()`
- Save dimensions as jsonb: `{ certainty, warmth, tension, vulnerability, scope, rootedness, emotionIndex, curveType, reasoning }`
- This happens synchronously before returning the response (Haiku is fast)

### 5. Replace the Spirograph React component (`src/components/Spirograph.tsx`)

- Rewrite as a `'use client'` component that wraps the renderer
- Props: `dimensions: DimensionResult & { curveType: string }`, `size?: number`, `animate?: boolean`
- On mount: create canvas, call `createSpirograph`, call `start()`
- On unmount: call `stop()`
- If `animate` is false, call `renderStatic(2.5)` instead of `start()`
- For the bloom effect on the reveal page: start with canvas opacity 0, fade to 1 over 2.2s via CSS transition

### 6. Update the Reveal page (`src/app/s/[shortcode]/page.tsx`)

- Fetch the star's dimensions from the database
- Pass real dimensions to the new Spirograph component
- The spirograph should animate by default

### 7. Update the Cosmos view (`src/components/CosmosView.tsx` or cosmos page)

- Each star in the cosmos should use the new renderer with its real dimensions
- Stars at depth 2 (background) can use `animate: false` with `renderStatic` for performance
- Stars at depth 0 and 1 should animate
- The emotion color from `EMOTIONS[emotionIndex].rgb` should drive the star's visual color in the cosmos

### 8. Update mock cosmos data

- Add plausible dimensions + emotionIndex + curveType to each entry in COSMOS_THOUGHTS so the mock cosmos renders with varied spirographs
- Example: `{ id: '7kx2', text: "...", x: 0.50, y: 0.50, depth: 0, dimensions: { certainty: 0.6, warmth: 0.7, tension: 0.3, vulnerability: 0.8, scope: 0.4, rootedness: 0.2, emotionIndex: 6, curveType: 'hypotrochoid' } }`

### 9. Data model update

- The `dimensions` jsonb column in the `stars` table now stores: `{ certainty, warmth, tension, vulnerability, scope, rootedness, emotionIndex, curveType, reasoning }`
- No migration change needed — it's already a jsonb column. Just document the expected shape in `src/lib/supabase/types.ts`

## What NOT to change

- Don't change the TwilightSky, Terrain, or AmbientField components — those background elements stay as-is
- Don't change the cosmos bond/connection rendering — the SVG curves stay the same
- Don't change the admin dashboard
- Don't change any API routes except submit (and stars/[shortcode] if needed to return dimensions)

## Testing

After integration:
1. Visit `/`, type an answer, submit. Check the server logs — you should see the Haiku API call and the returned dimensions.
2. The reveal page should show an animated spirograph that looks different from others (unique shape based on the answer).
3. The cosmos should show varied spirograph styles across the mock stars.
4. Check that `ANTHROPIC_API_KEY` is read from env and the extraction fails gracefully if it's missing.
