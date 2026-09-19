# The Between — Save, Share & Question of the Week

Owner-approved plan (2026-09-19). Branch: `weekly-and-sharing`. Build everything, then one owner
review on staging. **Merges/deploys only on the owner's explicit instruction.**

## Owner decisions (locked, this round)

1. **The weekly cadence supersedes** EXPERIENCE-OVERHAUL.md's "no cadence / retention is not a
   goal" locked decision. Update that doc with a superseded note.
2. **Server-side MP4** via `ffmpeg-static` (verified working here: ffmpeg 7.0.2, libx264).
   Production is Vercel today but moves to a container host next week — make it work in coder
   staging; keep a graceful static-image fallback everywhere.
3. **Admin sets the featured question** ("this week's question") — a `featured_at` timestamp
   flipped from the admin Questions tab.
4. **New stars get 10-char shortcodes** (unguessable). Existing 4-char URLs keep working, no
   migration.
5. **Keep `my_star` localStorage** — it's a saved link, not an identity. One star per browser.
6. **No similarity/relatedness system.** Stars stay randomly placed. The investment goes into
   making *connecting your star to another* compelling: quest framing post-birth AND
   drawer/finale polish.
7. **Follow CTA**: Instagram, TikTok, X, Facebook. Accounts don't exist yet — handles live in
   the `settings` table; the CTA renders only the ones filled in.
8. **Star MP4 rendered on demand, cached** on first share-preview open.
9. **Weekly reel**: ~35–45s — question title card → 5 stars × ~6s → closing invitation.
10. Auto-download of the keepsake is rejected (intrusive/unreliable on iOS) — a very obvious
    Save control instead.

## Privacy rules (product requirements — every agent must respect)

No accounts, no email collection, no attaching multiple stars to an identity, no "welcome back"
personalization, no cross-visit creator identification. A star URL shows the identical
experience to its creator and to anyone else. `my_star` (one shortcode) is the only persistence
and stays as-is. Analytics: none added.

## Sacred (from EXPERIENCE-OVERHAUL.md — never touch)

BTW palette, Cormorant Garamond + Inter (`src/lib/btw.ts`), the twilight sunset world, the
spirograph line-drawn luminous aesthetic (extend, never replace), anonymity. When in doubt on
aesthetics: the quieter option. This must NOT look like a SaaS product or marketing funnel.

## Shared infrastructure

- `src/lib/story/` — the 9:16 storyboard compositor (server, @napi-rs/canvas): renders any
  frame at time t for a "star story" (used by: single-star MP4, static vertical fallback,
  keepsake frame, weekly reel).
- `src/lib/story/encode.ts` — frames → ffmpeg-static stdin (rawvideo rgba) → H.264 yuv420p
  +faststart MP4.
- `qrcode` npm package (installed) — QR both client-side (SaveStarPanel) and server-side
  (keepsake PNG).
- Existing: `renderStatic(t)` / `renderFrame` (deterministic, time-parameterized),
  `server-render.ts`, atmosphere per question, Web-Share-file trick in ShareButton.

## Stages & sequencing

Wave 1 (parallel): **0-Foundations** (sonnet) · **C-Story engine** (opus) · **B-Save panel** (sonnet)
Wave 2 (parallel): **D-Share panel** (sonnet, needs C) · **E-Question of the Week** (sonnet, needs 0)
Wave 3 (parallel): **A-Post-birth arc + bond UX** (opus, integrates B+D) · **F-Weekly reel** (sonnet, needs C)
Wave 4: **V-Verification sweep** (sonnet) → owner review.

Commits per wave by the orchestrator. `npx tsc --noEmit` + `npm run lint` stay clean.

---

## Stage 0 — Foundations (sonnet)

- `generateShortcode(4)` → new stars use length 10 (`src/lib/shortcode.ts` default +
  `/api/submit`). Existing lookups are length-agnostic — verify nothing assumes 4.
- Migration `007_weekly_featured.sql`: `ALTER TABLE questions ADD COLUMN featured_at
  timestamptz NULL;` + `ALTER TABLE stars ADD COLUMN reel_order integer NULL;` + settings
  seed keys `social_instagram`, `social_tiktok`, `social_x`, `social_facebook` (empty strings).
- `/api/questions`: add the missing `.eq('active', true)` filter (comment already claims it);
  include `featured_at` in the payload; order: featured first, then `featured_at` desc
  (previously-featured history), then `display_order` for never-featured.
- Mock supabase (`/home/coder/workspace/mock-supabase/server.js`): support the new columns,
  seed question 1 as featured (recent `featured_at`), stagger past `featured_at` values on the
  others so "previous week" paging is testable; seed the settings keys.
- EXPERIENCE-OVERHAUL.md: add a dated note that locked decision 2's "no cadence" clause is
  superseded by the Question-of-the-Week model (owner decision 2026-09-19).

## Stage B — Save panel (sonnet)

New `src/components/SaveStarPanel.tsx` (+ small client QR helper). A frosted overlay in the
established visual language showing: the star (mini render), the sentence **"We don't know who
you are, so keep this if you want to come back."**, the URL in plain text, Copy Link (with
copied feedback), a QR code (quiet, cream-on-transparent, BTW palette), and an obvious
**Save this image** control that downloads/web-shares the server keepsake PNG
(`/api/keepsake/[shortcode]` — Stage C provides it; build against the URL contract now).
Props: `{ shortcode, star, onClose }`. No page integration (Stage A wires it in) — but add a
temporary dev preview at `/preview/save` to verify visually.

## Stage C — Story engine + MP4 + keepsake (opus)

- **FIRST TASK — fonts, fail fast:** `@fontsource/cormorant-garamond` + `@fontsource/inter`
  are installed; @napi-rs/canvas `GlobalFonts.registerFromPath` accepts their woff2 files
  (verified: latin-400-italic registers and measures distinctly). Register the needed
  weights/styles once (module-level), render a test frame, confirm non-tofu text before
  building anything else.
- **SECOND TASK — benchmark:** measure per-frame render cost at 1080×1920 early. If a full
  ~8s video exceeds ~15s total, pre-render static layers (sky gradient, background star
  field) once and reuse per frame; 24fps is acceptable for this aesthetic. Report the real
  number — SharePanel's "composing…" copy must match reality.
- `src/lib/story/composer.ts`: draws frame t of a star story onto a 1080×1920 canvas 2D ctx.
  Timeline (~8s): darkness with faint background star field fading in (0–1s) → the
  star *draws itself* (progressive curve reveal, 1–3.5s) → the answer rises in Cormorant
  italic, word-grouped, stable and readable (2.5–6s) → a handful of real neighbor stars from
  the same question drift faintly into frame (4.5–6.5s) → quiet "thebetween.world" +
  the question as an invitation + "A new question opens every week." (6.5–8s). Sky: the
  question's atmosphere gradient, vertical. Reuse `renderer.ts` internals.
- `src/lib/story/encode.ts`: spawn `ffmpeg-static`, write rgba frames to stdin
  (`-f rawvideo -pix_fmt rgba -s 1080x1920 -r 30`), output
  `-c:v libx264 -pix_fmt yuv420p -movflags +faststart` MP4. No audio track needed (silent) —
  IG/TikTok accept silent video.
- `src/app/api/story/[shortcode]/route.ts`: GET → MP4. Approved stars only (same guard as the
  OG route). On-demand render, cached under `os.tmpdir()` by default (`STORY_CACHE_DIR` env
  overrides; never a cwd dir — production is Vercel *today*), keyed
  `{shortcode}-v{STORY_VERSION}`; bump `STORY_VERSION` on every composer change or dev serves
  stale MP4s. In-flight dedup so concurrent requests render once. `Content-Type: video/mp4`,
  long cache headers.
- `src/app/api/story/[shortcode]/poster/route.ts`: one composed frame (~t 6s) as PNG — the
  static vertical fallback + share preview poster.
- `src/app/api/keepsake/[shortcode]/route.ts`: 1080×1920 PNG — star + answer + QR
  (server-side `qrcode` → data URI) + URL text + "We don't know who you are…" line. Satori
  (`ImageResponse`, follow `api/og/[shortcode]` patterns) or the composer — whichever is
  cleaner.
- Export a reusable segment API from composer so Stage F can sequence: intro card(question) /
  star segment(star, duration) / outro(invitation + follow line).

## Stage D — Share panel (sonnet)

New `src/components/SharePanel.tsx`: an overlay that makes it obvious *what* is being shared —
a 9:16 preview (the poster immediately; the MP4 playing inline once `/api/story/...` responds,
with a quiet "composing…" shimmer while it renders). Actions: **Share** (Web Share with the
video file when `navigator.canShare({files})`, else the poster PNG, else the URL — reuse/extract
the file-share logic from ShareButton.tsx), **Save video**, Copy Link, and the existing platform
links (IG/FB/X/Snapchat) as a quiet secondary row. Props `{ shortcode, star, questionText,
onClose }`. Keep ShareButton for bond rows; the panel is the star-sharing path. Dev preview at
`/preview/share`.

## Stage E — Question of the Week (sonnet)

- Landing: the world is the **featured** question (not random). `?question=` still pins.
- The title area gains "this week's question" as a whisper-quiet eyebrow; the lozenge becomes
  backward travel: **"← previous question"** paging through featured history (loops sensibly;
  a "this week →" affordance returns). Travel stays the crossfade — never a page load, never
  an archive UI. All past questions remain answerable (they already are).
- `/cosmos/[questionId]` has the **identical lozenge** (~line 785 of its page.tsx) — convert
  it the same way, or the two surfaces will read as inconsistent in owner review.
- Subtle CTA (e.g. beneath the question when lingering, or in About): *"A new question opens
  every week. Follow The Between for the next one."* with only the social links whose settings
  values are non-empty. Quiet — art piece, not a funnel.
- Admin Questions tab: "Feature this week" action per question (sets `featured_at = now()`),
  current featured clearly marked. `/api/admin/questions/[id]` PATCH extended.
- Composer (QuestionCycler) initial question = the currently displayed world (already true).

## Stage F — Weekly reel (sonnet)

- Admin stars tab: per-question reel picker — toggle stars into the reel (sets `reel_order`
  1–5, cap 5, reorderable), plus a Reel section per question: "Generate reel" → calls
  `/api/admin/reel/[questionId]` → renders via Stage C segments (intro question card → picked
  stars ×~6s each → outro invitation + follow) → returns MP4 download. Cache like story MP4s;
  key on a hash of the picked stars' shortcodes + answers + dimensions (admin can edit or
  regen a picked star after picking it).
- Admin-authed (existing admin auth pattern). No public surface.

## Stage A — Post-birth arc + bond UX (opus)

The headline UX stage; integrates B and D. On `/cosmos` after birth (BIRTH_FLAG path):

1. Bloom (exists) → panel: "your star lives here."
2. New beat: after ~2s, the camera pulls gently back so the newborn sits *among* strangers'
   stars — the sky visually says "you joined something." (CosmosScene: a small dolly-out from
   the focused framing; no new nav modes.)
3. The born panel's footer becomes a first-class action trio — **Explore nearby stars** (starts
   the tour), **Save this star** (SaveStarPanel), **Share this star** (SharePanel) — full
   labeled buttons, not corner icons. One-line whisper above: "We don't know who you are —
   save this if you want to come back."
4. Own-star panel (any later visit) gets Save + Share as labeled actions too.
5. **Bond quest framing**: once the newborn's visitor dismisses/leaves their star, a quiet
   line rises once — *"Your star can orbit one other. Somewhere in here is a worthy
   stranger."* (reuse the GhostPrompt/intro-line presentation). The connect affordance on
   stranger panels stays as is but gains a touch more presence for visitors who haven't
   bonded yet.
6. **Drawer/finale polish**: ConnectionDrawer — make the two thoughts read as a *pair being
   joined* (side-by-side stars with both texts, the reason field as the thread between them).
   Bond finale — verify the mutual bloom + orbit inscription reads on both viewports; the
   confirmation panel gains the pair's two mini stars.
7. Stranger-star panels keep ShareButton (small) — the artifact share is for your own star.

Landing page gets the same own-star panel treatment (shared StarDetail changes cover it).

## Stage G — The forming star (owner request, 2026-09-19, opus)

The UniqueOverlay preview ("Leave a trace beside your star") must (a) actually FORM over
time — one firefly, then another, tails growing, the trace drawing itself in over ~5s before
settling into the normal live animation — and (b) be EXACTLY the star that is born.
Root causes of the current mismatch: Spirograph.tsx strips the four family axes
(resolve/charge/connection/temporality) and passes no seed, and no shortcode exists pre-birth
so the archetype reseeds at submit. Fix: /api/submit/validate mints the shortcode with the
dimensions; it flows QuestionCycler → UniqueOverlay (preview via withSeed) → /api/submit,
which validates and uses it (server regenerates only on the ~impossible collision). Renderer
gains an optional forming-progress input (extend, never replace).

## Stage V — Verification (sonnet)

Full walkthrough on 390×844 and 1280×720 with Playwright against the real dev stack (mock
supabase + dev server): cleared storage → landing shows this week's question → answer it (live
Haiku) → birth → pull-back beat → action trio → Save panel (URL/QR/keepsake downloads) → Share
panel (poster, then MP4 plays; MP4 downloadable, second request served from cache) → explore →
bond → finale → previous-question travel → answer a past question → admin: feature a question,
pick 5 reel stars, generate reel MP4. Screenshots into `review/` + a written check against each
stage's spec. `npx tsc --noEmit` + `npm run lint` clean. ffprobe the MP4s (h264, yuv420p,
1080×1920, faststart).

## Dev environment (for every agent)

- Read `AGENTS.md` first — Next.js 16 has breaking changes; consult `node_modules/next/dist/docs/`.
- Mock supabase (:54321) and the dev server (:3000) are ALREADY RUNNING — don't start second
  copies. Mock is in-memory; if it must be restarted, data re-seeds.
- Seeded shortcodes: `4xh8` (Q1, bonded), `g6b5`, `r9xf` (Q2). Question IDs
  `00000000-0000-4000-8000-00000000000{1..6}`. ANTHROPIC_API_KEY works (live Haiku on submit).
- Work on branch `weekly-and-sharing`. **Do not commit** — the orchestrator commits per wave.
- Verify before reporting done. Screenshots to `review/`. The Playwright browser is a shared
  singleton: only the agent assigned visual verification in a wave uses it; others verify
  headlessly (curl, ffprobe, node scripts).
- Headless browsers report `navigator.canShare` false — the Web-Share-file path to
  Instagram/TikTok cannot be machine-verified; verify the fallback chain and flag real-device
  testing as an owner-review item.
