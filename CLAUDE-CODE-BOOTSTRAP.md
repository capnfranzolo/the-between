# The Between — Architecture Bootstrap

You are setting up the project architecture for **The Between** (thebetween.world), a web-based public art installation built in Next.js. There is already a working hello-world deployment on Vercel connected to Supabase. Your job is to scaffold the real application: every screen, every route, every component, with the actual visual design — not placeholders.

---

## What This Project Is

A visitor arrives at thebetween.world and sees a question: "What do you know is true but you can't prove?" They write an answer. Their answer is analyzed into six emotional/cognitive dimensions (0-1 floats) by Claude Haiku. Those dimensions generate a unique spirograph — their "star." The star gets a permanent short URL.

The visitor then chooses: keep it private, share it with someone they trust, or enter the cosmos. The cosmos is a shared space (one per question) where all approved stars are visible. Visitors can browse stars, find one that resonates, and propose a connection by writing one line explaining why the two belong together. Connections are manually approved by an admin.

The creative act isn't just expressing a thought — it's recognizing a connection between two thoughts. The connection reasons are the most valuable content in the system.

**Philosophy:** The participant gets something before the community does. The lesson is never stated — it emerges. Anonymity enables vulnerability. Curation over scale. When in doubt, cut it.

---

## Design Handoff

A complete design prototype lives in `/design/` (copy the contents of the uploaded `thebetween/project/` directory there). These are the source of truth for all visual decisions. **Match these designs faithfully.** The prototype is React/HTML/CSS — translate it to Next.js App Router with Tailwind where Tailwind is natural, and inline styles or CSS modules where the design demands precise values.

### Design System (from `between.jsx`)

**Fonts:**
- Display/serif: `'Cormorant Garamond', Georgia, serif` — used for questions, quotes, answer text
- UI/sans: `'Inter', system-ui, sans-serif` — used for labels, buttons, counters, navigation
- Import from Google Fonts: `Cormorant+Garamond:ital,wght@0,400;0,500;1,400;1,500` and `Inter:wght@300;400;500;600`

**Color Palette (`BTW` object — preserve this exactly):**
```
sky:      ['#1E1840', '#3D2D65', '#7B5088', '#9A6080']
horizon:  ['#B87878', '#D09070', '#E0A868', '#F0C080']
terrain:  ['#5A3860', '#3E2046', '#261432']
textPri:  '#F0E8E0'
textSec:  '#C8B0E0'
textDim:  'rgba(240, 232, 224, 0.55)'
warmth:   ['#7DB7D4', '#9AA8E0', '#B894D8', '#D49AC0', '#E8A890', '#F0B878', '#F5C868']
```

**Background:** Every screen uses `TwilightSky` — a 10-stop gradient from deep indigo (#1E1840) to warm gold (#F0C080), with a warm haze layer, a canvas star field, and layered terrain silhouettes at the bottom. This is not optional — it IS the visual identity.

**Spirograph renderer:** A canvas-based component that renders concentric tilted ellipses with slow rotation and a glowing core. Shape is deterministic from a seed string (the answer text). Warmth (0-1) drives hue through the warmth palette. Supports bloom animation, blur for distance, and speed multiplier. The full implementation is in `between.jsx` — port it directly.

**Ambient field:** Scattered distant spirographs in the background, blurred and slow. Used on landing, reveal, and cosmos screens for atmospheric depth.

### Screen Designs (from `screens.jsx`)

**Screen 1 — Landing (`/`):**
- TwilightSky background with ambient spirographs and terrain
- Centered layout: "THE BETWEEN" eyebrow (11px, 0.32em letter-spacing, uppercase, textDim)
- Question in Cormorant Garamond: "What do you know is true / but you can't prove?" (32px, forced line breaks)
- Textarea: frosted glass (rgba bg, backdrop-blur, rounded 14px), Cormorant 19px
- Character counter: "{n} more to bloom" when under 20, "ready" when over 20, "{n} / 500" on right
- Submit button: pill shape, horizon[3] border, uppercase "SEE YOUR SHAPE →", fades in only when ready
- Turnstile widget placeholder below submit

**Screen 1b — Unique Fact (gates cosmos entry):**
- Same TwilightSky background
- "ONE MORE THING" eyebrow in horizon[3]
- "What's something unique about you?" in Cormorant 30px
- Subtitle: "A small detail. Strangers will see this beside your star."
- Shorter textarea (2 rows, 120 char max)
- "← back" link + "ENTER THE COSMOS →" pill button
- This screen appears between Reveal and Cosmos

**Screen 2 — Reveal (`/s/[shortcode]`):**
- TwilightSky background
- Answer text echoed at top in Cormorant 19px (fades in after bloom)
- Spirograph blooms center-screen over 2.2 seconds (scale 0.92→1, opacity fade-in)
- "YOUR STAR LIVES HERE" label + monospace URL box (thebetween.world/s/7kx2) with copy behavior
- Two PathCards below:
  - "Share it" (warm tone, horizon[1] accent): "Send your URL to someone you trust."
  - "Enter the cosmos" (bright tone, horizon[3] accent): "Let strangers see your shape."
- PathCard component: frosted glass card, accent-colored label, dim subtitle, hover glow
- "Your star is kept" confirmation overlay when choosing private

**Screen 3 — Cosmos (`/cosmos/[questionId]`):**
- Full-bleed TwilightSky with more ambient spirographs and terrain
- Stars positioned as percentage coordinates, sized by depth (depth 0: 92px, depth 1: 60px+blur, depth 2: 30px+more blur)
- Each star is a live Spirograph canvas, warmth-colored, clickable
- Bond curves: SVG quadratic beziers between connected stars, dashed when idle, solid+glowing on hover
- Bond hover tooltip: frosted glass card showing the connection reason + both linked quotes
- Top chrome: "THE BETWEEN · COSMOS" left, "{n} stars · {n} bonds" right
- Bottom hint when nothing selected: "hover a star to read it · click to pin"
- Selection card (bottom center, frosted glass, 720px max): shows quote in Cormorant 24px, unique fact with horizon[3] left border, share button, "CONNECT YOUR STAR TO THIS →" button (only if visitor has a star and this isn't theirs)
- Connection drawer: "Why do these belong together?" in Cormorant 20px, input field, Cancel + "BIND THEM" buttons, 100 char max
- "yours" label above the visitor's own star

**Screen 4 — Share OG Image (1200×630):**
- TwilightSky background with ambient spirographs
- Two-column grid: left has "THE BETWEEN" eyebrow, question in Cormorant 60px, "YOUR THOUGHTS CONNECT US" pill with glowing dot, "thebetween.world" in monospace
- Right has centered spirograph (210px)
- This is rendered server-side as an image for og:image meta tags

### Shared UI Patterns
- **Frosted glass:** `background: rgba(240,232,224,0.06)` or `rgba(20,14,40,0.72)`, `backdrop-filter: blur(6px-16px)`, thin border `rgba(textPri, 0.15-0.18)`
- **Pill buttons:** `border-radius: 999`, uppercase, Inter, letter-spacing 0.08em, horizon[3] or textPri colored borders, transparent bg with hover fill
- **Transitions:** 0.3-0.8s ease, cubic-bezier(.2,.7,.3,1) for spring-like motion
- **Eyebrow labels:** 10-11px, 0.32em letter-spacing, uppercase, textDim or horizon[3]
- **Animation:** `@keyframes btwRise` for card entry, `@keyframes btwFade` for overlays

---

## Tech Stack

- **Next.js 16** (App Router, TypeScript, Tailwind) — already installed
- **Supabase** (Postgres + Row Level Security) — already connected
- **Canvas API** for spirograph rendering (port from prototype)
- **SVG** for bond curves in cosmos
- **Claude Haiku API** for dimension extraction (mock for now)
- **Cloudflare Turnstile** for spam prevention (placeholder for now)
- **Vercel** for deployment (already working)
- **Google Fonts** for Cormorant Garamond + Inter

---

## Application Flow

```
/ (Landing)
  → User writes answer (20-500 chars)
  → POST /api/submit → creates star, returns shortcode
  → Redirect to /s/[shortcode]

/s/[shortcode] (Reveal — owner view)
  → Spirograph blooms
  → Shows answer, short URL, share/cosmos options
  → "Enter the cosmos" → /unique/[shortcode]

/unique/[shortcode] (Unique fact gate)
  → "What's something unique about you?" (3-120 chars)
  → POST /api/stars/[shortcode]/unique → saves unique fact
  → Redirect to /cosmos/[questionId]

/s/[shortcode] (Reveal — visitor view, shared link)
  → Shows spirograph + question only (NEVER the answer)
  → CTA: "What shape are you?" → links to /

/cosmos/[questionId] (Cosmos)
  → Shows all approved stars + bonds
  → Click star → detail card
  → "Connect your star to this" → connection drawer
  → POST /api/connect → creates pending connection
  → Can enter directly via URL without having a star

/admin (Admin Dashboard)
  → Password gate (ADMIN_PASSWORD env var)
  → Pending stars queue (approve/edit/reject)
  → Pending connections queue (approve/reject)
  → All stars list with search
  → Stats
```

---

## Data Model

Create `supabase/migrations/001_initial_schema.sql`. Do NOT run it — just create the file.

```sql
-- Drop hello-world test table
DROP TABLE IF EXISTS stars;

-- Questions (one cosmos per question)
CREATE TABLE questions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  text text NOT NULL,
  active boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Stars (individual thoughts)
CREATE TABLE stars (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id uuid NOT NULL REFERENCES questions(id),
  shortcode text UNIQUE NOT NULL,
  answer text NOT NULL CHECK (char_length(answer) BETWEEN 20 AND 500),
  unique_fact text CHECK (unique_fact IS NULL OR char_length(unique_fact) BETWEEN 3 AND 120),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  dimensions jsonb,
  ip_hash text NOT NULL,
  created_at timestamptz DEFAULT now(),
  approved_at timestamptz
);

-- Connections (bonds between stars)
CREATE TABLE connections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id uuid NOT NULL REFERENCES questions(id),
  from_star_id uuid NOT NULL REFERENCES stars(id),
  to_star_id uuid NOT NULL REFERENCES stars(id),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 4 AND 100),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  ip_hash text NOT NULL,
  created_at timestamptz DEFAULT now(),
  approved_at timestamptz,
  UNIQUE(from_star_id, to_star_id)
);

-- Indexes
CREATE INDEX idx_stars_shortcode ON stars(shortcode);
CREATE INDEX idx_stars_question_status ON stars(question_id, status);
CREATE INDEX idx_connections_question_status ON connections(question_id, status);

-- Row Level Security
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stars ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active questions" ON questions FOR SELECT USING (active = true);
CREATE POLICY "Anyone can read approved stars or own star by shortcode" ON stars FOR SELECT USING (status = 'approved');
CREATE POLICY "Anyone can insert stars" ON stars FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update own star unique_fact" ON stars FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can read approved connections" ON connections FOR SELECT USING (status = 'approved');
CREATE POLICY "Anyone can insert connections" ON connections FOR INSERT WITH CHECK (true);

-- Seed the first question
INSERT INTO questions (slug, text, active) VALUES
  ('what-do-you-know-is-true', 'What do you know is true but you can''t prove?', true);
```

---

## Folder Structure

```
src/
  app/
    layout.tsx                      # Root layout: fonts, metadata, dark bg
    page.tsx                        # Landing / Question screen
    s/[shortcode]/page.tsx          # Star reveal (owner + visitor views)
    unique/[shortcode]/page.tsx     # Unique fact gate
    cosmos/[questionId]/page.tsx    # Cosmos view
    admin/page.tsx                  # Admin dashboard
    api/
      submit/route.ts              # POST: answer → create star
      connect/route.ts             # POST: propose connection
      stars/[shortcode]/route.ts   # GET: star data
      stars/[shortcode]/unique/route.ts  # POST: save unique fact
      cosmos/[questionId]/route.ts # GET: approved stars + connections
      admin/
        moderate/route.ts          # POST: approve/reject/edit
        auth/route.ts              # POST: admin password check
      og/[shortcode]/route.ts      # GET: OG image generation
  components/
    TwilightSky.tsx                # Background gradient + star field + haze
    Terrain.tsx                    # Layered terrain silhouette SVG
    Spirograph.tsx                 # Canvas spirograph renderer (port from prototype)
    AmbientField.tsx               # Scattered background spirographs
    StarRenderer.tsx               # Spirograph with bloom + interaction wrapper
    CosmosView.tsx                 # Full cosmos: stars + bonds + interaction
    BondCurves.tsx                 # SVG bond rendering + hover tooltips
    StarDetail.tsx                 # Bottom card: quote + unique fact + actions
    ConnectionDrawer.tsx           # "Why do these belong together?" input
    PathCard.tsx                   # Reveal screen choice cards
    QuestionForm.tsx               # Landing page textarea + counter + submit
    UniqueForm.tsx                 # Unique fact textarea + counter
    ShareButton.tsx                # Copy URL + share icon button
    AdminQueue.tsx                 # Moderation queue component
  lib/
    btw.ts                         # BTW palette object, withAlpha, warmthColor, hashString, mulberry32
    supabase/
      client.ts                    # Browser Supabase client (anon key)
      server.ts                    # Server Supabase client (service role key)
      types.ts                     # TypeScript types matching DB schema
    dimensions/
      extract.ts                   # Haiku API call (returns mock data for now)
      types.ts                     # Dimension type definitions
    spirograph/
      params.ts                    # Dimensions → spirograph visual params
      types.ts                     # Spirograph parameter types
    shortcode.ts                   # Generate unique 4-char alphanumeric codes
    constants.ts                   # App-wide constants (question text, limits, etc.)
  design/                          # Design prototype files (reference only, not served)
    between.jsx
    screens.jsx
    index.html
    uploads/
      between_sunset_gradient_only.svg
```

---

## Implementation Rules

1. **Port the visual design faithfully** from the prototype files. Every screen should look like the design, not like a placeholder. Use the exact colors, fonts, spacing, and component patterns from `between.jsx` and `screens.jsx`.

2. **The `BTW` palette and utility functions** (`withAlpha`, `warmthColor`, `hashString`, `mulberry32`) go in `src/lib/btw.ts` and are imported everywhere. These are the single source of truth for all colors.

3. **The Spirograph component** must be ported from the prototype's canvas implementation. It should work identically: deterministic shape from seed, warmth-driven color, bloom animation, blur support, speed multiplier.

4. **TwilightSky, Terrain, StarField, AmbientField** are all ported from the prototype. They are used on every screen.

5. **API routes return mock data** in the correct TypeScript-typed shape. They don't need to query Supabase yet. The submit endpoint should generate a random shortcode and return it. The cosmos endpoint should return the sample data from `COSMOS_THOUGHTS` and `COSMOS_BONDS` in the prototype.

6. **Navigation works between all screens.** The full flow is clickable: Landing → Reveal → Unique → Cosmos. Shared links work. Admin is accessible.

7. **No authentication system** beyond simple password check for admin (`ADMIN_PASSWORD` env var).

8. **Do not call Claude Haiku API yet.** The dimension extraction function should return mock dimensions `{ certainty: 0.6, warmth: 0.5, tension: 0.4, vulnerability: 0.7, scope: 0.3, rootedness: 0.5 }`.

9. **Do not integrate Cloudflare Turnstile yet.** Leave a div with `id="turnstile-widget"` where it will go.

10. **Use `'use client'` directives** on components that need browser APIs (canvas, mouse events, useState). Server components for pages that can be server-rendered.

11. **The cosmos mock data** should use the exact `COSMOS_THOUGHTS` and `COSMOS_BONDS` arrays from the prototype so the cosmos looks populated during development.

12. **Responsive:** The landing, reveal, and unique screens are content-centered and work at any width. The cosmos is full-bleed and adapts star sizes for mobile.

---

## Environment Variables Needed

```
NEXT_PUBLIC_SUPABASE_URL=...          # already set
NEXT_PUBLIC_SUPABASE_ANON_KEY=...     # already set
SUPABASE_SERVICE_ROLE_KEY=...         # for admin operations (get from Supabase dashboard)
ADMIN_PASSWORD=...                     # simple admin gate
ANTHROPIC_API_KEY=...                  # for Haiku (not used yet)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=...    # for Cloudflare (not used yet)
```

---

## What Success Looks Like

After this scaffold is complete:

1. Visit `/` and see the full twilight sky with the question, textarea, and character counter — matching the design prototype exactly.
2. Type an answer, hit submit, get redirected to `/s/[shortcode]` where the spirograph blooms and the three paths appear.
3. Choose "Enter the cosmos" → see the unique fact screen → submit → enter the cosmos with mock stars and bonds visible.
4. In the cosmos, hover stars to see quotes, hover bonds to see connection reasons, click to pin, see the detail card with connect button.
5. Visit a star URL directly and see the visitor view (spirograph + question, no answer).
6. Visit `/admin`, enter password, see the moderation queue.
7. Every screen has the twilight sky background, correct fonts, correct colors, correct component patterns.
8. The codebase is cleanly organized so each feature can be built out independently.
