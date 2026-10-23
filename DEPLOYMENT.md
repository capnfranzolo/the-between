# Where this thing actually lives

Written 2026-10-23 because "where are we hosting this?" took a DNS lookup to answer.
Everything below is verified against the live site, not remembered.

## Short version

| Thing | Where | Notes |
|---|---|---|
| **The application** | **Vercel** | Serverless (Node runtime). Not a VPS. Nothing to SSH into. |
| **Database** | **Supabase** project `ktwwxtihgixuwplcfszq` | `ktwwxtihgixuwplcfszq.supabase.co` |
| **Story MP4s / posters** | Supabase Storage, public bucket `story-artefacts` | See `STORY-HOSTING.md` |
| **DNS / registrar** | **Porkbun** | NS: `*.ns.porkbun.com` |
| **Repo** | `github.com/capnfranzolo/the-between` | `main` auto-deploys to Vercel |
| **Secrets** | Vercel project env vars | Not in the repo. `.env.local` is local-only. |

There is **no Laravel Forge, no DigitalOcean droplet, no container host, no PHP**
anywhere in this stack. A container migration was considered (see `STORY-HOSTING.md`)
and never carried out.

## How to confirm that yourself in 10 seconds

```sh
dig +short thebetween.world          # -> 76.76.21.21        (Vercel anycast)
dig +short www.thebetween.world      # -> cname.vercel-dns.com
curl -sI https://thebetween.world | grep -iE 'server|x-vercel'
#   server: Vercel
#   x-vercel-cache: HIT
```

## Deploying

Push to `main`. Vercel builds and deploys automatically. There is no deploy script,
no SSH step, and no server to restart.

Rollback: Vercel dashboard -> Deployments -> promote a previous deployment.

## Consequences of being on Vercel

Worth knowing, because they've each bitten us at least once:

- **No persistent disk.** Each serverless invocation gets its own `/tmp`. This is why
  story artefacts upload to Supabase Storage instead of living on disk.
- **No OS-level patching by us.** Vercel owns the runtime. Our security surface is
  npm dependencies + application code, *not* system packages.
- **Edge cache is in front of everything.** Vercel strips `s-maxage`/`swr` from
  forwarded responses, so you cannot verify cache settings from outside — use the OG
  route's browser `max-age` or `x-vercel-cache` as a deploy marker.
- **Function time limits.** MP4 render routes carry explicit `maxDuration`.

## Runtime / dependency versions

- Node: Vercel default for the project
- Next.js: pinned exactly in `package.json` (currently `16.4.3`)
- React: pinned exactly (`19.2.4`)

Because the runtime is managed, **dependency upgrades are our only patching lane.**
Run `npm audit` periodically; a Next.js patch release is a `package.json` bump,
a `npm install`, a `npm run build`, and a push.
