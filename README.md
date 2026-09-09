This is [The Between](https://thebetween.world), a [Next.js](https://nextjs.org) app — a web-based
public art installation where strangers answer a question and become a star in a shared cosmos.

## Getting Started

Local development runs against a mock Supabase (PostgREST-compatible) emulator instead of a live
database — the production Supabase project is currently unreachable (NXDOMAIN).

1. Start the mock Supabase emulator, on port 54321:

   ```bash
   node /home/coder/workspace/mock-supabase/server.js
   ```

   This seeds 6 questions, 100 stars, 10 bonds, and the About-page copy. Seeding is deterministic
   (a fixed RNG seed), so restarting the emulator re-seeds the exact same data — any stars or
   bonds you create against it while it's running are lost, and the shortcodes below come back
   unchanged.

2. In a separate terminal, start the app, on port 3000:

   ```bash
   npm run dev -- --port 3000
   ```

3. Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the app by modifying `src/app/page.tsx`. The page auto-updates as you edit
the file.

This project uses the BTW palette and Cormorant Garamond + Inter typography (`src/lib/btw.ts`)
rather than the default create-next-app fonts.

### Environment

Env files are gitignored; `thebetween/.env.local` already exists locally with:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` —
  point at the mock emulator (`http://127.0.0.1:54321`) for local dev.
- `ANTHROPIC_API_KEY` — powers live dimension extraction (answer → emotional dimensions →
  spirograph shape) and the LLM publish gate. Already set and working.
- `ADMIN_PASSWORD` — gates `/admin`.

`.env.local.bak` holds the real staging Supabase project's credentials, set aside because that
project is currently unreachable. Once a working Supabase project exists, restore it by copying
`.env.local.bak` over `.env.local` (and run the real migrations in `supabase/`).

### Seeded test data

Question IDs are `00000000-0000-4000-8000-00000000000{1..6}`. A few shortcodes are handy for
manually exercising the app:

- `4xh8` — question 1, already has an outgoing bond
- `g6b5`, `r9xf` — question 2

Visit a star directly at `/s/<shortcode>`, a bond at `/b/<connectionId>`, or a cosmos at
`/cosmos/<questionId>`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

A real deploy needs a working (non-mock) Supabase project with the schema under `supabase/`
applied, and the environment variables above set on the platform — the mock emulator is
local-dev-only.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
