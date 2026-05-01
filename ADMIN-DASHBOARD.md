# Admin Dashboard

Build a fast, functional admin interface at `/admin` for managing stars, connections, and questions. Password-protected with an environment variable. No design polish needed — this is a tool for one person, not a public page. Prioritize speed and usability over aesthetics.

## Authentication

Simple password gate:
- On first visit, show a single password input field + submit button
- POST to `/api/admin/auth` — compare against `ADMIN_PASSWORD` env var
- On success, set a session cookie (httpOnly, secure, 24h expiry) or use a simple token in localStorage
- All `/api/admin/*` routes check for this auth before processing
- No user accounts, no roles, just one password

## Layout

Dark background (#0a0a0a), light text (#e0e0e0), monospace for data, system-ui for labels. No frosted glass, no Cormorant, no design system — this is a workhorse UI.

Top bar:
- "THE BETWEEN — ADMIN" left-aligned
- Stats: total stars · pending stars · approved · rejected · total connections · pending connections
- Question filter dropdown (all questions, or pick one)
- Logout button

Two main tabs: **Stars** and **Connections**

## Stars tab

### List view

A dense table/list. Each row shows:

| Status | Shortcode | Answer (truncated 80ch) | Byline (truncated 40ch) | Question (slug) | IP count | Created | Actions |
|--------|-----------|-------------------------|-------------------------|-----------------|----------|---------|---------|

- **Status** — colored badge: yellow=pending, green=approved, red=rejected
- **Shortcode** — monospace, clickable link to `/cosmos/[questionId]?star=[shortcode]` (opens new tab)
- **Answer** — truncated, full text on hover or expand
- **Byline** — the unique_fact field, truncated
- **Question** — the question slug, compact
- **IP count** — how many stars this IP hash has created (total, not just this question). Highlight red if >5. Helps spot spam.
- **Created** — relative time ("2h ago", "3d ago")
- **Actions** — icon buttons: ✓ approve, ✗ reject, ✎ edit, 🔄 regen, 🗑 delete, 👁 preview

### Sorting and filtering

- Filter by status: All / Pending / Approved / Rejected (tabs above the list, Pending is default)
- Filter by question: dropdown in the top bar
- Sort by: created (newest first default), status, shortcode
- Search: text search across answer and byline fields

### Bulk actions

- Checkbox on each row
- "Select all visible" checkbox in header
- Bulk action buttons appear when any rows selected: "Approve selected" / "Reject selected" / "Delete selected"
- Bulk delete shows a confirmation: "Delete N stars? Stars connected to these will be disconnected."

### Star detail / edit panel

Clicking the edit icon (or clicking the row) opens an inline expandable panel below the row (not a modal, not a new page — keep context):

**Read-only info:**
- Full answer text
- Full byline
- Shortcode + full URL
- Question text
- Dimensions JSON (formatted): certainty, warmth, tension, vulnerability, scope, rootedness, emotionIndex, curveType
- IP hash
- Created at (full timestamp)
- Approved at (if applicable)
- Status

**The star itself:**
- Render the spirograph using the existing canvas Spirograph component from the main app
- Pass the star's real dimensions — it should look exactly like it does in the cosmos
- Size: 200×200px, animated

**Editable fields:**
- Answer text — textarea, 20-500 chars, with char counter
- Byline (unique_fact) — text input, 3-120 chars
- Status — dropdown: pending / approved / rejected

**Action buttons:**
- "Save changes" — saves edits to answer and/or byline. If the ANSWER was edited, automatically regen dimensions (call Haiku API) and update the star. Show a spinner during regen.
- "Regen star" — re-extract dimensions via Haiku for the current answer text. Useful for stars created when the API was down and got default dimensions. Show before/after dimension values so you can see the change.
- "Delete" — deletes the star. If this star has connections (incoming or outgoing), handle gracefully:
  - Outgoing connection (this star orbits another): delete the connection
  - Incoming connections (other stars orbit this one): delete those connections too. The orbiting stars become unconnected — they stay in the cosmos but are no longer orbiting anything.
  - Show a warning: "This star has N connections that will be removed."
- "Preview in cosmos" — opens `/cosmos/[questionId]?star=[shortcode]` in a new tab

**Connection info (within the star detail panel):**
- "Orbits:" — which star this one orbits (shortcode + answer preview), or "none"
- "Orbited by:" — list of stars that orbit this one (shortcode + answer preview each), or "none"
- Each connection shows its reason text and status
- Quick action on each connection: approve / reject / delete

## Connections tab

### List view

A table of all connections:

| Status | From star | To star | Reason | Question | Created | Actions |
|--------|-----------|---------|--------|----------|---------|---------|

- **From star** — shortcode + answer truncated (the orbiter)
- **To star** — shortcode + answer truncated (the anchor)
- **Reason** — the connection reason text, full (it's short, 100ch max)
- **Question** — slug
- **Created** — relative time
- **Actions** — ✓ approve, ✗ reject, 🗑 delete

### Sorting and filtering

- Filter by status: All / Pending / Approved / Rejected (Pending default)
- Filter by question: dropdown
- Sort by: created (newest first)

### Bulk actions

- Same pattern: checkboxes, select all, bulk approve/reject/delete

### Connection detail

Clicking a row expands to show:
- Both stars' full answer text and bylines, side by side
- Both stars' spirographs (200×200, animated)
- The connection reason
- Status dropdown (editable)
- Delete button

## API routes

All admin API routes require the auth cookie/token.

### GET `/api/admin/stars`
- Query params: `status`, `questionId`, `search`, `sortBy`, `sortDir`, `page`, `limit`
- Returns: stars with connection counts + IP submission count
- Uses service role client (bypasses RLS)

### PATCH `/api/admin/stars/[id]`
- Body: `{ answer?, uniqueFact?, status? }`
- If answer changed: re-extract dimensions via Haiku, update dimensions + answer_hash
- Returns updated star

### POST `/api/admin/stars/[id]/regen`
- Re-extracts dimensions via Haiku for the current answer text
- Generates new curveType
- Returns updated dimensions

### DELETE `/api/admin/stars/[id]`
- Deletes the star
- Deletes all connections where this star is from_star_id or to_star_id
- Returns count of deleted connections

### GET `/api/admin/connections`
- Query params: `status`, `questionId`, `sortBy`, `sortDir`, `page`, `limit`
- Returns connections with both stars' data included

### PATCH `/api/admin/connections/[id]`
- Body: `{ status }`
- Returns updated connection

### DELETE `/api/admin/connections/[id]`
- Deletes the connection
- Returns success

### POST `/api/admin/bulk`
- Body: `{ action: 'approve' | 'reject' | 'delete', type: 'star' | 'connection', ids: string[] }`
- Performs the action on all specified IDs
- For bulk star delete: also cleans up connections
- Returns count of affected rows

### GET `/api/admin/stats`
- Returns: `{ totalStars, pendingStars, approvedStars, rejectedStars, totalConnections, pendingConnections, approvedConnections }`

## Implementation notes

1. **Use `'use client'` for the admin page** — it's a heavy interactive SPA. Fetch data client-side.
2. **Pagination** — 50 rows per page. Don't load everything at once.
3. **Optimistic UI** — when approving/rejecting, update the row immediately and revert on error.
4. **The spirograph in the detail panel** uses the same Spirograph component from the main app. Import it. Pass `animate={true}` and `size={200}`.
5. **Regen shows a diff** — after regen, show the old dimensions vs new dimensions side by side for 5 seconds so the admin can see what changed.
6. **Keyboard shortcuts** — `a` to approve selected, `r` to reject selected, `d` to delete selected (with confirmation). Speeds up batch moderation.
7. **Auto-refresh** — the pending count in the top bar polls every 30 seconds. A subtle pulse animation on the count when new pending items arrive.

## What NOT to change

- The cosmos, spirograph renderer, sky dome — untouched
- The public-facing pages — untouched
- The submit flow and spam checks — untouched
- The connection/orbital mechanics — untouched

## Testing

1. Visit `/admin` — see password prompt
2. Enter wrong password — rejected
3. Enter correct password — see the dashboard with stats and star list
4. Default view shows pending stars sorted newest first
5. Click a star row — detail panel expands with spirograph, full text, dimensions, connection info
6. Edit the answer text, save — dimensions regen automatically, spirograph updates
7. Click "Regen star" — dimensions re-extract, before/after shown
8. Delete a star that has orbiters — orbiters become disconnected, connections removed, warning was shown
9. Bulk select 5 pending stars, hit approve — all turn green immediately
10. Switch to Connections tab — see pending connections with both stars' info
11. Approve a connection — status updates
12. Filter by question — list updates to show only that question's stars
13. Search "love" — shows only stars whose answer or byline contains "love"
14. Close browser, reopen `/admin` — still logged in (session cookie)
15. Stats bar shows accurate counts, polls for updates
