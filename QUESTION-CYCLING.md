# Add Question Cycling to the Homepage

The homepage currently shows a single hardcoded question. Replace it with a cycling system where users see one question at a time and can advance to the next.

## Behavior

- One question visible at a time, centered in the existing layout
- A single subtle "not this one →" text button below the submit area (same style as the "← back" link on the unique fact screen — Inter, 12px, uppercase, letter-spacing 0.18em, textDim color, no border, no background)
- Tapping it crossfades to the next question. The transition is a slow opacity crossfade (800ms ease) — the current question fades out while the next fades in. No slide, no snap, no vertical movement.
- After the last question, it loops back to the first
- The textarea clears when the question changes
- The submit button stays hidden until the new question has 20+ chars typed
- No progress dots, no counter, no carousel indicators, no "1 of 6" — the user should not feel like they're browsing a list. It should feel like the installation is offering them a different prompt.

## Questions (in order)

Seed these into the `questions` table. Each one is a separate world with its own cosmos.

```sql
-- Run this in Supabase SQL Editor (or add as a new migration file)
-- Don't delete the existing question — update it to have display_order

ALTER TABLE questions ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0;

UPDATE questions SET display_order = 1 WHERE slug = 'what-do-you-know-is-true';

INSERT INTO questions (slug, text, active, display_order) VALUES
  ('what-feels-like-home', 'What feels like home to you?', true, 2),
  ('something-ordinary-sacred', 'What''s something ordinary that feels sacred to you?', true, 3),
  ('kindest-thing-strangers', 'What''s the kindest thing you''ve witnessed between strangers?', true, 4),
  ('after-youre-gone', 'What would you want someone to know about you after you''re gone?', true, 5),
  ('younger-self-surprised', 'What''s something you believe now that your younger self would be surprised by?', true, 6)
ON CONFLICT (slug) DO NOTHING;
```

Also create the migration file at `supabase/migrations/002_add_questions.sql` with this SQL so it's tracked in the repo.

## Data flow

### Fetching questions

- The landing page should fetch all active questions ordered by `display_order` from Supabase on load
- Use the anon client (these are publicly readable via RLS)
- Cache them in component state — no need to refetch on every cycle

### Submitting answers

- The submit API (`/api/submit`) already accepts a `question_id` — make sure the landing page sends the ID of the currently displayed question
- The star is associated with that question's cosmos
- After submit, redirect to `/s/[shortcode]` as before

### Cosmos routing

- Each question already has its own cosmos at `/cosmos/[questionId]`
- The "Enter the cosmos" button on the reveal page should route to the correct cosmos for that star's question
- No changes needed to the cosmos page itself

## Component changes

### Landing page (`src/app/page.tsx` or wherever QuestionForm lives)

1. Fetch questions on mount: `SELECT id, slug, text FROM questions WHERE active = true ORDER BY display_order`
2. Store in state: `questions[]` and `currentIndex`
3. Display `questions[currentIndex].text` with the existing Cormorant Garamond styling
4. The question text needs special handling for line breaks — the original question had forced `<span>` line breaks. For the cycling version, let text wrap naturally with `text-wrap: pretty` and `max-width: 360px`. Don't try to manually break every question.
5. "not this one →" button advances `currentIndex`, wraps with modulo
6. Pass `questions[currentIndex].id` to the submit handler

### Crossfade implementation

Use two overlapping divs for the question text:

```tsx
// Concept — adapt to your actual component structure
const [currentIndex, setCurrentIndex] = useState(0);
const [fadingOut, setFadingOut] = useState(false);
const [displayIndex, setDisplayIndex] = useState(0); // what's currently visible

function nextQuestion() {
  setFadingOut(true); // start fade out
  setText(''); // clear textarea
  setTimeout(() => {
    const next = (currentIndex + 1) % questions.length;
    setCurrentIndex(next);
    setDisplayIndex(next);
    setFadingOut(false); // start fade in
  }, 400); // halfway through the 800ms transition
}
```

The question text container should have:
```css
transition: opacity 400ms ease;
opacity: fadingOut ? 0 : 1;
```

This gives a clean crossfade — 400ms out, 400ms in, 800ms total. The "not this one" button should also fade slightly during transition to prevent double-taps.

### "Not this one" button

Position it below the character counter / submit button area. Style:

```tsx
<button
  onClick={nextQuestion}
  style={{
    marginTop: 20,
    background: 'transparent',
    border: 'none',
    color: BTW.textDim, // rgba(240, 232, 224, 0.55)
    fontFamily: SANS, // Inter
    fontSize: 12,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    padding: '14px 8px',
    transition: 'opacity 400ms ease',
    opacity: fadingOut ? 0.3 : 1,
    pointerEvents: fadingOut ? 'none' : 'auto',
  }}
>
  not this one →
</button>
```

On hover, brighten to textPri. Don't make it look like a primary action — it's an escape hatch, not a navigation element.

## What NOT to change

- The textarea, character counter, submit button, Turnstile placeholder — all stay exactly as they are
- TwilightSky background, ambient spirographs, terrain — untouched
- The reveal page, unique fact page, cosmos, admin — untouched
- The "THE BETWEEN" eyebrow above the question — stays

## Edge cases

- If the questions fetch fails, fall back to the hardcoded first question ("What do you know is true but you can't prove?") so the page isn't broken
- If there's only one active question in the database, hide the "not this one" button entirely
- The textarea should animate its clearing too — don't just snap to empty. A quick fade out/in (200ms) of the textarea content is enough, or just clear it instantly during the question crossfade since the whole area is fading anyway

## Testing

1. Load the homepage — first question appears
2. Type something, then hit "not this one" — textarea clears, question crossfades to the next
3. Keep cycling — after question 6, it returns to question 1
4. Submit an answer on question 3 — check the database, the star should have question 3's ID as its question_id
5. On the reveal page, "Enter the cosmos" should link to question 3's cosmos
6. Add a 7th question via Supabase SQL — reload the homepage, it should appear in the cycle without any code changes
