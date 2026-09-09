# The Between — Experience Overhaul

You are planning and executing a UX overhaul of **The Between** (thebetween.world), a web-based
public art installation. The 3D world, visual identity, data model, and core loop all exist and
work. What's broken is the *experience arc*: the app taxes visitors heavily before letting them
feel anything. This document is the product of a full design review (hands-on Playwright
playthrough + code audit + comparative research). The strategic decisions in it are **final** —
they were made by the owner. Do not re-litigate them; your job is sequencing, architecture, and
execution quality.

**North star:** a stranger lands, *gets it in under 10 seconds without reading instructions*,
feels something within a minute, and leaves with a link they want to send someone. This is an
art piece optimized for a wave of shares/press — depth of one visit over frequency of many.

**The one-sentence diagnosis behind everything here:** the product's payoff is *reading
strangers' answers*, and reading is currently the hardest thing to do in the app. Every change
below exists to make consuming thoughts nearly free, and contributing feel like joining
something already alive.

---

## Locked decisions (do not re-open)

1. **First visit lands in drift mode** — the cosmos, already alive, showing real thoughts
   unprompted. No welcome modal. The question form is an overlay state, not the front door.
2. **This is an art piece, not an engagement machine.** Explicitly NOT building: accounts,
   emails, notifications, daily-question cadence, streaks, collections, algorithmic feeds,
   infinite-scroll mechanics. Retention is not a goal; the single visit and the share are.
3. **Drift = continuous glide.** The camera physically sails star to star. Never cuts, never
   teleports. Meditative planetarium pace.
4. **Full sound design** — muted by default, one elegant opt-in, ambient bed + interaction
   sounds (see Phase 7).
5. **Manual navigation gets rebuilt with free rein** (see Phase 1). The bullseye click zones,
   edge chevrons, and one-shot ControlsHint tutorial all retire.
6. **Star visuals: extend the family, don't replace it.** New structural archetypes on top of
   the existing spirograph language. Recognizably the same universe.
7. **Moderation: auto-approve with an LLM gate.** Haiku already reads every answer; extend it
   to score publishability. Instant public on pass; human queue only for flags.
8. **Unique fact stays required.** It's "the who" — consistently the best content in the
   panels. Reframe the copy, don't remove the step.
9. **One outgoing bond per star stays — made explicit.** Scarcity is the point: "You orbit one
   star. Choose with care." Never silently hide the affordance (current behavior).
10. **The manifesto gets buried** in the About modal, replaced by a short scripted intro
    (Phase 3). One line survives in-world: *"Somewhere in here is a worthy stranger."*
11. **Phone and desktop must both be excellent.** Every phase's acceptance criteria run on both
    a ~390×844 viewport and a ~1280×720+ viewport.

## Sacred — never touch

The creative direction is locked:
- The **BTW palette**, Cormorant Garamond + Inter, and all existing typography rules
  (`src/lib/btw.ts`).
- The **twilight sunset world**: sky dome gradient, terrain silhhouettes, background star
  field, clouds (`CosmosScene.tsx`). Per-world *variations* of it are in scope (Phase 4);
  replacing it is not.
- The **spirograph line-drawn luminous aesthetic** (`src/lib/spirograph/renderer.ts`). Extend,
  never replace.
- The **smoke/word-scatter effect** stays in the product as a garnish (hover flourish), but it
  is no longer the primary reading mechanism (it disperses text before a person can finish
  reading it).
- Anonymity. No names, no profiles, ever.

---

## Environment & tooling

- **Stack:** Next.js 16 App Router + TypeScript + three.js 0.128 + Supabase (Postgres) +
  Anthropic SDK (Haiku for dimension extraction). Read `AGENTS.md` — this Next.js version has
  breaking changes vs your training data; consult `node_modules/next/dist/docs/` before
  writing framework-touching code.
- **Local dev data:** the production Supabase URL no longer resolves. A local PostgREST
  emulator lives at `/home/coder/workspace/mock-supabase/` with 100 seeded stars across all 6
  questions, 10 bonds, and the about-page content. Start it with
  `node /home/coder/workspace/mock-supabase/server.js` (port 54321). `thebetween/.env.local`
  already points at it (production backup: `.env.local.bak`). Seeded test shortcodes: `4xh8`
  (Q1, has a bond), `g6b5`, `r9xf` (Q2). Question IDs are
  `00000000-0000-4000-8000-00000000000{1..6}`.
- **Run:** `npm run dev -- --port 3000` from `thebetween/`.
- **Verify visually.** Every phase must be verified by driving the real app in a browser
  (Playwright MCP or equivalent) at both reference viewports, with screenshots. The 3D scene
  can't be unit-tested into correctness — look at it.
- **Perf budget:** the scene currently runs ~23 draw calls / ~14k triangles (check with
  `?perf=1`). Stay in that neighborhood; target 60fps on a mid-range phone (`pixelRatio` is
  already capped for mobile).
- **ANTHROPIC_API_KEY** is set in `.env.local` and works — dimension extraction runs live.

## Known defects found in review (fix in the phases noted)

| # | Defect | Where | Phase |
|---|--------|-------|-------|
| 1 | Star click targets are ~9% of the visual star: `clickSphere` radius 5 vs visual glow radius ~17 (sprite scale 16 × glow 2.2), while stars bob and camera drifts. Four consecutive misses in testing. | `CosmosScene.tsx` ~line 526 | 1 |
| 2 | Missed clicks *punish*: bullseye zones fling the camera (heading + pitch lurch) on any imprecise star click. | `CosmosScene.tsx` `onClickCanvas` ~line 792 | 1 |
| 3 | Empty-sky death: camera drifts forward forever; auto-rotate rescue is imperceptible (0.07 rad/s) and ignores stars >90° away (`AUTO_ROTATE_MAX_COS = 0.0`), so it can face a void indefinitely. Reproduced twice. | `CosmosScene.tsx` ~lines 735-738, 1316-1367 | 2 |
| 4 | Hydration error on cosmos pages: `showPerf` reads `window.location` during render. | `CosmosScene.tsx` ~line 1584 | 1 |
| 5 | Shared-link visitor (`/s/xxxx`) with no star of their own gets **no CTA to answer** — the viral loop dead-ends. (Spec'd in COSMOS-EVERYWHERE.md but never built.) | `StarDetail.tsx` footer ~line 351 | 6 |
| 6 | Smoke hover disperses the answer text after ~2.6s — often before it can be read. | `CosmosScene.tsx` ~line 846, `cosmos/[questionId]/page.tsx` | 2 |
| 7 | "ENTER THE COSMOS →" button on the unique-fact overlay looks enabled at 0 chars. | `UniqueOverlay.tsx` | 8 |
| 8 | Connect drawer shows your thought but hides the target's — you explain "why these belong together" while seeing only one of the two. | `ConnectionDrawer.tsx` | 8 |
| 9 | After one outgoing bond, the connect button silently disappears with no explanation. | `StarDetail.tsx` `showConnect` ~line 236 | 8 |
| 10 | Mobile users get zero navigation guidance (ControlsHint is desktop-only, once-ever, 6.5s). Moot once drift mode ships, but confirm nothing else depends on it. | `ControlsHint.tsx` | 1-2 |

---

# The Phases

Each phase ends in a shippable, visually-verified state. Do them in order — 1 and 2 are the
foundation everything else stands on. Within a phase, parallelize with subagents where files
don't overlap.

## Phase 1 — Navigation rebuilt (the feel foundation)

**Goal:** clicking, looking, and moving are honest and forgiving on desktop and phone.

- Replace sphere raycasting with **generous screen-space picking**: project star positions to
  screen space each frame (or on pointer events); pointer within ~48px CSS of a star center
  selects the nearest such star. No bobbing/drift penalty.
- **Missed clicks do nothing** except dismiss an open panel (subtle ripple optional). Delete
  the bullseye navigation zones and the edge chevron indicators.
- Pointer scheme: **drag to look** (yaw/pitch with existing momentum feel), **scroll wheel /
  pinch to move forward-back**, **click/tap to select**, click/tap-away to dismiss.
  Double-tap boost can stay. WASD/arrows stay as a silent power-user layer; remove the Q/E
  strafe if it complicates, keep if free.
- Cursor feedback on desktop: pointer cursor when over a pickable star.
- Retire `ControlsHint` (component + trigger wiring). A single quiet one-time whisper
  ("drag to look around") on first manual drag is permitted if testing shows it's needed.
- Fix defect #4 (hydration).
- Keep `flyToThought` (used by selection + deep links) but re-tune arrival framing so the
  selected star + panel never overlap awkwardly at either viewport (currently the star can sit
  behind the panel).

**Accept:** on both viewports: 10/10 casual clicks on visibly distinct stars select them;
missed clicks never move the camera; no hydration warnings; drag-look and pinch/scroll-move
feel continuous at 60fps.

## Phase 2 — Drift mode (the spine of the product)

**Goal:** a lean-back tour that makes reading thoughts free. This is the default state of the
cosmos and the entire mobile experience.

- **Drift controller:** pick next star (bias: nearby + not yet shown this session + gentle
  emotion variety), glide there continuously (ease-in/out, ~4-8s legs), decelerate, **dwell
  8-12s**, continue. Never faces empty sky (the controller aims, so defect #3's rescue logic
  becomes obsolete — remove it).
- **Reading presentation during dwell:** the star's answer + unique fact render as *stable,
  readable* typography (Cormorant, existing panel type rules) — positioned near but never
  covering the star; fade in word-groups if you like, but the full text must persist for the
  whole dwell. The smoke effect remains as a hover garnish only.
- **Interruptibility:** any pointer/键 input pauses drift instantly and hands over to Phase 1
  manual controls mid-flight without a jump. After ~10s idle, drift resumes from wherever the
  camera is. A subtle bottom toggle (e.g. "drift ⏸ / ▶") reflects and controls state.
- Selecting a star (click/tap) during drift opens the existing StarDetail panel and pauses
  drift; dismissing resumes the idle timer.
- Drift state is per-cosmos; entering via deep link (`?star=`) shows that star first (panel
  open), then drift begins on dismiss.
- Expect to refactor: camera state machine in `CosmosScene.tsx` currently interleaves
  heading/pitch targets, fly targets, auto-rotate, and touch momentum. Untangle into an
  explicit mode enum (`drift | manual | focused`) before layering drift on top. This is the
  riskiest engineering in the project — do it with your strongest model and review it.

**Accept:** on both viewports: land on a cosmos URL, touch nothing for 3 minutes — the camera
visits ≥8 distinct stars, every thought readable start-to-finish, never a starless frame, no
motion sickness (peak angular velocity gentle); any input interrupts cleanly; idle resumes.

## Phase 3 — Arrival (landing = cosmos + scripted intro)

**Goal:** the product demonstrates itself in the first 10 seconds.

- `/` becomes the cosmos in drift mode (question 1's sky, or a rotating featured question —
  your choice, keep it simple). Delete `WelcomeOverlay` from `src/app/page.tsx`; the passive
  blurred-dots mode of `CosmosScene` retires with it.
- **Scripted intro, first visit only** (localStorage flag), skippable by any input, ~15s:
  1. Sky fades in, already gliding toward a first star.
  2. Its thought rises (drift dwell presentation).
  3. One line fades over: *"Strangers were asked: '{current question}'"*
  4. Second star, second thought.
  5. Final line: *"Somewhere in here is a worthy stranger."* — fades, drift continues,
     invitation appears.
  Returning visitors: straight into drift, no lines.
- **"Add yours →"** invitation: appears after the visitor has seen ~3 thoughts (or on demand
  via the existing `+`); opens the question form (`QuestionCycler`) as a frosted overlay over
  the still-visible sky. "next question →" cycling behavior is preserved inside the overlay.
  Submitting flows into the existing validate → unique-fact → star-birth pipeline (Phase 8
  polishes that).
- Move the manifesto copy into the About modal content (`settings` table, key `about` — it's
  already the About source; also update the mock seed if wording changes).
- Kill the now-dead `mode="passive"` branches in `CosmosScene` once nothing uses them.

**Accept:** cold first visit (cleared storage) on both viewports: a real stranger-thought is
readable within ~5s; the intro never blocks input; after intro, "Add yours →" is present;
answering works end-to-end; About shows the manifesto; second visit skips the intro.

## Phase 4 — Six skies you can feel

**Goal:** the multiverse is legible; switching worlds is one gesture.

- **Sky rail:** a quiet persistent strip (bottom desktop / collapsible sheet or horizontal
  scroll mobile) listing all active questions: tiny glyph + short question + star count.
  Current world highlighted. Click/tap → crossfade the star field to that question's cosmos
  (stars swap, sky mood shifts; camera stays). Replaces the 11px "Next question ›" link.
- **Per-world atmosphere:** each question gets a subtle variant of the sacred sunset — shifted
  gradient stops, star density, terrain glow, cloud tint. Same world, different hour of
  twilight. Keep a per-question config map, not six shaders.
- Drift honors the switch: new world, drift continues.
- URL: `/cosmos/[questionId]` remains canonical; the rail updates the route (shallow).

**Accept:** a first-time visitor discovers unprompted that other questions exist (rail is
visible without interaction on both viewports); switching feels like travel, not a page load;
each world is distinguishable in a blind screenshot test.

## Phase 5 — The star family grows

**Goal:** stars stop looking like variations of one tangled ball; distance shows form.

- **Structural archetypes** layered on existing dimensions (deterministic from stored
  `dimensions` + shortcode seed — no schema change, existing stars upgrade automatically):
  - low rootedness → 1-3 tiny **satellite** motes orbiting the form
  - high tension → **binary** double-core
  - high scope → faint **halo ring**
  - low certainty → **comet tail** drift
  - high certainty → tight **crystalline knot** (denser, slower)
  - ~1% of shortcodes → a **rare form** (your design — the "whoa" star)
- Archetypes compose with the five curve types; tune so combinations stay in the line-drawn
  luminous language.
- **Distance silhouettes:** the pre-baked sprite for each star reflects its archetype (shape +
  extent), so far stars differ in form, not just emotion color. Dot-fallbacks beyond the bake
  cap can stay dots.
- Update the OG renderer (`/api/og/[shortcode]`, `server-render.ts`) so shared images show the
  same star the cosmos does.

**Accept:** a screenshot of any 10-star view shows ≥4 visibly different structures; same
shortcode renders identical form in cosmos, panel mini, and OG image; perf budget holds.

## Phase 6 — The share wave

**Goal:** every emotional peak hands you something sendable; every received link has a door in.

- **`/s/` visitor CTA (defect #5):** when the viewer has no star in this cosmos, StarDetail's
  footer gains **"What shape are you? →"** → the question form overlay pre-set to this star's
  question. This is the single highest-leverage fix in the project — do it first in the phase.
- **Bond as artifact:** after binding (and on any bonded star's panel), a "share this pair"
  action → new OG image at `/api/og/bond/[connectionId]`: both stars + the reason line. The
  bond reason is the most press-worthy content the system produces.
- **Liveness:** quiet corner counter — "214 thoughts · 31 bonds" (cosmos-wide totals via the
  existing cosmos API; add totals to its payload).
- Verify existing share paths (copy link, Web Share, IG story image) still work from the new
  flows on both viewports.

**Accept:** incognito visit to a shared star link → answer the question → own star born, ≤3
interactions between arrival and typing; bond OG image renders both stars + reason and
unfurls correctly (test with a crawler UA fetch).

## Phase 7 — Sound

**Goal:** the world gets a voice; silence remains the default.

- Web Audio, initialized only after a user gesture (autoplay policy). One elegant pill on
  first arrival: "sound?" — choice persisted in localStorage.
- **Ambient bed** per world: soft night-air/wind/drone, near-silent, looping, with slight
  per-question variation (tie into Phase 4's config). Procedural synthesis or tiny (<100KB)
  loops — keep total audio weight small.
- **Interaction sounds:** star arrival in drift (soft chime, pitch mapped to emotionIndex),
  star selection, star birth (bloom), **bond formation** (the deepest, most resonant moment —
  design it like the finale it is), gentle whoosh tied to camera velocity if it reads well.
- Mix discipline: everything sits far under speech level; nothing startles.

**Accept:** sound off by default; opting in mid-session works; every Phase 2/3/8 key moment
has a voice; no clicks/pops; page weight increase <300KB.

## Phase 8 — Contribution & the bond finale

**Goal:** giving your thought feels like joining; binding feels like the climax it is.

- **Unique fact reframe** (keeps the step): eyebrow "YOUR STAR IS FORMING" stays; heading →
  *"Leave a trace beside your star."* subtitle → *"Something only you would say. Strangers
  will see it beside your words."* Button visually disabled until valid (defect #7).
- **LLM publish gate:** extend the dimension-extraction prompt
  (`src/lib/dimensions/prompt.ts`) to also return `publishable: boolean` + `flagReason`
  (sincere-thought vs spam/hate/gibberish/PII). In `/api/submit`, pass stars with
  `publishable: false` → `status: 'pending'` for the existing admin queue; passes stay
  auto-approved. Never tell the flagged user they're flagged — their star simply "will rise
  into the shared sky once it's seen" (show their star locally regardless).
- **Star birth in the sky:** after submit, no detour — the camera glides to where the new star
  lives, it blooms in place (scale/opacity bloom + Phase 7 sound), panel opens with link +
  "your star lives here."
- **Bond finale:** amplify "Your stars are bound." — mutual bloom, the reason text written
  along the orbit path once, bond sound. Panel offers Phase 6's "share this pair."
- **Scarcity made explicit (defects #8, #9):** connect drawer shows *both* thoughts side by
  side; drawer copy: *"You orbit one star. Choose with care."* After bonding, the connect
  affordance on other stars becomes a quiet disabled state: *"your star already orbits
  another"* — never silently missing.

**Accept:** full loop on both viewports — answer → trace → birth → read → bind → share —
with every beat audible/visible; gibberish and hostile test answers get flagged to pending
while sincere odd ones (poetry, non-English) pass; the one-bond rule is explained on-screen.

## Phase 9 — Sweep

- Kill dead code: WelcomeOverlay, ControlsHint, passive mode, bullseye handlers, edge
  chevrons, unused routes/components (`/unique` page if still present, CosmosView/BondCurves
  if orphaned).
- Full QA walkthrough (script below) on both viewports + a throttled-CPU pass.
- `npx tsc --noEmit` and `npm run lint` clean (repo was at zero — keep it there).
- Update README with the mock-supabase dev setup.

**Final acceptance walkthrough:** cleared storage → land on `/` → intro plays → drift shows 3
thoughts → add yours (real Haiku call) → star born in sky → drift → select a stranger → bind
with reason → share the pair → open your star's link in incognito → "What shape are you?" →
second star born. Every step screenshot-verified at 390×844 and 1280×720.

---

## Subagent & model guidance

Plan the work as an orchestrated set of subagents. Allocation:

- **Opus subagents** — the hard-feel engineering and anything inside `CosmosScene.tsx`:
  Phase 1 (picking + camera input rework), Phase 2 (drift controller + camera state machine
  refactor), Phase 5 archetype rendering, Phase 7 sound synthesis/mixing.
- **Sonnet subagents** — well-scoped app work: Phase 3 arrival/intro wiring, Phase 4 sky rail
  + atmosphere configs, Phase 6 CTAs/OG image/liveness, Phase 8 copy/gate/drawer changes,
  Phase 9 cleanup.
- **Haiku subagents** — read-only reconnaissance and verification fan-outs only (find usages,
  audit dead code, check references). Never code changes.
- The `CosmosScene.tsx` camera/interaction refactor (Phases 1-2) is the critical path — do not
  parallelize other CosmosScene work against it. Phases 4/5/6 have limited file overlap and
  can partially overlap once 1-2 land.
- Every code-writing subagent gets told: read `AGENTS.md`, respect the Sacred list, verify
  visually before reporting done.

## Process rules

- Work on a branch (`experience-overhaul`), commit per phase with working tree verified.
- Start the mock supabase + dev server before any visual work; screenshots into a `review/`
  dir (gitignored).
- After each phase: a short written check against that phase's Accept list, with screenshots,
  before starting the next.
- When in doubt on any aesthetic call, the answer is the quieter option. When in doubt on any
  scope call, the answer is the Locked Decisions list.
