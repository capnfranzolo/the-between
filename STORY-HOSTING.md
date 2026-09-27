# Story artefact hosting

*2026-09-27 — why the share MP4s get a durable store, what was chosen, what the
owner has to do.*

## The problem

The weekly-and-sharing round made the site a small video factory: every star
has a 9:16 story MP4 (8 s, 1080×1920, **~2.1 MB**, ~10 s of ffmpeg on an idle
box — minutes on a loaded one) plus a poster PNG (~0.5 MB), rendered on demand
and cached on disk under `os.tmpdir()`. That cache was designed as a stopgap
(`src/lib/story/cache.ts` says so) and it shows three ways:

1. **It evaporates.** Every deploy/restart empties the cache, so the first
   visitor after a deploy pays the render again — for every star that gets
   opened. On Vercel it's worse: each serverless instance has its own /tmp,
   so "cached" barely means anything.
2. **The app box serves the bytes.** Every share-panel open fetches the full
   MP4 (`SaveSharePanel` pulls it into a blob for `navigator.share`), and the
   route buffers the file through Node — 2.1 MB of RAM and bandwidth per view
   on the same 2-vCPU box that runs the encodes. One shared link doing modest
   numbers turns the origin into the bottleneck.
3. **No CDN.** `s-maxage=31536000` is in the response headers, but only helps
   if something (Vercel's edge) sits in front. On the container host the
   owner is moving to, nothing does.

## The decision: Supabase Storage as the durable layer

Render once → upload to a **public Supabase Storage bucket** → every later
request 302-redirects to the bucket's CDN URL. Chosen over the alternatives
because the project already runs Supabase — the service-role key is already in
the deployment env, so this adds **zero new vendors, credentials, or bills**
at current scale, and the bucket sits behind Supabase's CDN (which also
handles Range requests for iOS inline playback natively).

Costs (checked 2026-09-27 — [Supabase](https://uibakery.io/blog/supabase-pricing),
[R2](https://egresscost.com/cloudflare/)):

| | Storage incl. | Egress incl. | Overage |
|---|---|---|---|
| Supabase Free | 1 GB | 5 GB/mo | — (hard-ish limits) |
| Supabase Pro $25/mo | 100 GB | 250 GB/mo | $0.09/GB egress |
| Cloudflare R2 | 10 GB free, then $0.015/GB-mo | **unlimited, $0** | ops pennies |

Scale math: 1,000 stars ≈ 2.6 GB stored (MP4+poster). 5 GB egress ≈ ~2,000
video views/mo — fine for now on Free; a genuinely viral week (100k views ≈
210 GB) still fits Pro. If egress ever becomes the bill, the growth path is
R2: `store.ts` is ~150 lines with a four-function surface
(enabled/url/upload/purge) and swaps to any S3-compatible backend without the
routes noticing.

## How it works

- `src/lib/story/store.ts` — the whole storage layer. **Enabled only when
  `STORY_STORAGE_BUCKET` is set** (never inferred from Supabase env — dev
  points at mock-supabase, which has no storage API). Fail-open in every
  direction: storage down/missing ⇒ exactly the old disk-serving behaviour.
- Story + poster routes: check bucket → **302 to the CDN URL** (redirect
  cached only `max-age=300`; the object itself is immutable and cached a
  year, because the key carries `STORY_VERSION` and the origin tag — a
  version bump changes the key, so no purge is needed on deploys).
  On miss: render → stream from disk (first requester waits for no upload) →
  fire-and-forget upload; the *next* request redirects.
- `?proxy=1` on either route forces same-origin bytes — escape hatch if any
  client mishandles the cross-origin redirect.
- **Moderation:** only approved stars render, so nothing unapproved is ever
  uploaded. The reverse is handled too — reject/delete/edit (answer,
  dimensions, unique fact) in the admin star routes purges that star's
  objects across all versions and origins, **and its local disk cache** (the
  disk key doesn't change on an edit, so without the disk purge the stale
  file would be served and re-uploaded). This also fixes a pre-existing
  staleness bug: an admin edit now invalidates the cached video instead of
  serving the old render forever. Disk purge is per-instance — complete on
  the single-box container host; a multi-instance future would need
  content-keyed cache names instead.
- The **reel** stays disk-only on purpose: admin-auth-gated download, no
  public traffic, no CDN benefit.

## Owner setup (production + staging)

1. Supabase dashboard → Storage → **New bucket** `story-artefacts`, **Public
   bucket: ON**. No RLS policies needed for reads (public) — writes use the
   service-role key the deployment already has.
2. Set env on the app host: `STORY_STORAGE_BUCKET=story-artefacts`
   (alongside the existing `NEXT_PUBLIC_SUPABASE_URL` /
   `SUPABASE_SERVICE_ROLE_KEY`). Unset = feature off, disk-serving as before.
3. Optional: `STORY_CACHE_DIR=/some/volume` still works and is still useful —
   it's the L1 that saves a re-render when storage is cold after a
   `STORY_VERSION` bump.

**Verified in production 2026-09-27:** share panel loads and plays the video
in a real browser against thebetween.world — the cross-origin redirect works
(the bucket sends `access-control-allow-origin: *`, honours Range, serves
`max-age=31536000`). `?proxy=1` remains as a same-origin escape hatch.

**Vercel note:** Vercel's edge caches the streamed responses (`s-maxage`), so
many requests are edge hits that never reach the function. `s-maxage` is
deliberately **one hour** on every artefact route (story, poster, keepsake,
OG): the edge never re-consults the function while an entry lives, so a
year-long entry would keep serving a rejected star's video/image long after a
moderation purge emptied the bucket and disk. With the bucket as the durable
layer, an edge miss costs a 302 hop, not a re-render — worst case a purged
star's media lingers at the edge for ~1 h.

## Housekeeping notes

- A `STORY_VERSION` bump strands the previous version's objects in the bucket
  (keys are versioned; nothing deletes v4 when v5 ships). At ~2.6 MB/star per
  version this grows slowly; when it matters, sweep old `-vN.` keys in the
  dashboard or add a startup sweep. Not built now — stored gigabytes cost
  pennies a month.
- Origin-tagged keys mean staging renders live in the same bucket as
  production ones under different names. Harmless, same sweep applies.
