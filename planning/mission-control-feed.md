# Daymaster — Mission Control feed (#88)

_Feasibility review + implementation plan. Authored 2026-07-28. No code changed._

**Verdict: feasible, and cheaper than it looks.** The hard parts — an authenticated
server-side Notion proxy scoped to one owner — already exist and are in production.
The new work is one Worker route, one tile, and one Notion permission grant.

The genuine risks are not architectural. They are **data quality** (the `Progress`
column is stored on two different scales) and **content length** (`Next Step` runs to
1,400+ characters and cannot be rendered raw on a dashboard).

---

## 1. What Rob asked for

> There's a quick dictation I'm gonna test exactly where this goes. I'd like this to
> end up as an enhancement to my Daymaster thing — pulling in a couple of my projects
> and their statuses, as if it was like a small feed from Mission Control.

> The stuff I'd like to add to my Daymaster would be more of my most recent projects,
> stuff I've been working on. I feel like I haven't really added a lot to Daymaster
> since I started working on Project Awani. I'd like to get back into the Daymaster
> a little bit.

Read together: a compact, glanceable feed of the projects he's actually touching —
not a second Mission Control dashboard inside Daymaster.

---

## 2. What already exists (why this is cheap)

### The Worker is already a Notion proxy

`worker/src/index.js` is deployed as `daymaster-api` and already provides every piece
the feed needs:

| Piece | Where | Status |
|---|---|---|
| Google access-token verification | `verifyCaller()` | Done — checks audience against `GOOGLE_CLIENT_ID` |
| Single-owner gate | `verifyCaller()` | Done — rejects any email but `OWNER_EMAIL` |
| CORS lock to the app origin | `corsHeaders()` | Done — `ALLOWED_ORIGIN` = the Pages origin |
| Generic Notion caller | `notion(env, path, method, body)` | Done — injects `NOTION_TOKEN`, sets API version |
| **A database-query route that maps rows to JSON** | `GET /links` (#50) | **Done — this is the template** |

`GET /links` already does exactly the shape of work `GET /projects` needs: query a
Notion database, map the rows, return JSON, fail soft. The new route is a near-copy.

Client side, `src/lib/notion.js` already has the matching call pattern
(`fetchFavorites()` — bearer token, graceful `[]` on any failure).

### The data is rich and already modelled

Notion **Projects** database — `collection://cca86053-a739-4852-9dd0-740105bf458b`
(page `394d876ed61e811f8ca1e6aa8bd282ee`). 13 projects. Schema:

> **Corrected 2026-07-28 during Phase 1.** Neither id above works with the REST API.
> `394d876e…` is the *Mission Control — Dev Command Center page* that contains the
> database (`"is a page, not a database"`), and the `collection://` id is an MCP-layer
> handle that returns 404. The id the Worker needs is the inline database's own block
> id: **`626e8335-b6bd-480a-b025-8d425f08f08a`**, found via
> `GET /v1/blocks/394d876e…/children` → `child_database`. Verified: HTTP 200, 13 rows.

| Property | Type | Use in the feed |
|---|---|---|
| `Project` | title | Row label |
| `Status` | select — Building / In Testing / Next Build / Blocked / Backburner / Shipped / Shelved | Status chip |
| `Progress` | number (percent) | Progress bar — **see §4, mixed scales** |
| `Priority` | select — 🔴 Urgent / 🟠 High / 🟡 Medium / 🟢 Low | Sort key; emoji is part of the value |
| `Last Worked` | date | Sort key + "3d ago" |
| `Next Step` | text | The valuable field — **see §4, length** |
| `Owner of Next` | select — Me / Claude Code / Codex / Waiting | "ball is in your court" flag |
| `One-Liner` | text | Tooltip / expanded row |
| `Repo / Spec` | url | Row link-out |
| `Tooling` | multi-select | Probably skip — noise at tile size |

Note the page icon (📷, 🕰️, ⚾ …) is **not** a property — it's the Notion page icon,
returned separately in the API response as `page.icon.emoji`. Worth mapping; it makes
the feed instantly scannable and costs nothing.

---

## 3. Two sourcing options — recommendation: live Notion

### Option A — Worker → Notion (recommended)

Add `GET /projects` alongside `/links`. Always live, no publish step, no new
infrastructure.

**Cost:** ~40 lines in the Worker, one `wrangler.toml` var (`PROJECTS_DB_ID`), one
`wrangler deploy`, plus the Notion grant in §5.

### Option B — publish the local mirror (rejected)

`~/projects/mission-control/projects.json` already holds a mapped, flattened copy of
exactly these fields, plus `signals.json` (git commits, Claude session counts). But:

- **It isn't fetchable.** It's a local file in a repo Daymaster can't read from the
  browser. Publishing it means a new hosting + refresh pipeline.
- **It's stale by construction.** It only regenerates when `/mc-refresh` runs. Live
  proof from today: the mirror says Vocal Inbox is `92%`, last worked `2026-07-25`;
  Notion says `94%`, `2026-07-27`. Two days behind after one quiet weekend.

Rejected as the primary source. See §7 for where the mirror still earns its place.

---

## 4. The two real risks (both data, not architecture)

### Risk 1 — ~~`Progress` is stored on two different scales~~ 🟢 WITHDRAWN

**Retracted 2026-07-28 during Phase 1 — this risk was a measurement artifact, and the
"fix it upstream" recommendation below was wrong. Do not action it.**

The original claim was that Vocal Inbox stored `94` while Mission Control stored
`0.95`. Re-measured against the REST API the Worker actually uses
(`POST /v1/databases/626e8335…/query`), **all 13 rows are on the 0–1 scale**:

```
Digital Daymaster 0.6   Bullpen 0.1    Job Hunt Lab 0.5   Vocal Inbox 0.94
RoadFit 0.85            Chronocheck 0.72   Mission Control 0.95   Vantage 0.8
iOS Device Audit 0.4    Showdown 0.75  PRISM 0.9          PIS 0.6   DKB 0.7
values > 1: NONE
```

The `94` reading came from the **Notion MCP's SQL layer**, which renders
percent-formatted numbers ×100. The database itself is internally consistent. There is
no data-integrity bug and nothing for `/km` or Mission Control to fix.

**What shipped anyway:** `normalizeProgress()` still maps `p > 0 && p <= 1 → p * 100`.
It is now belt-and-braces rather than a fix for a live defect — it costs nothing, and
it means the tile stays correct if a row is ever hand-typed as `85`. The one real
consequence is documented in the code: a stored `1` is read as 100%, not 1%.

**Lesson worth keeping:** verify data claims through the *same client the code will
use*. The MCP and the REST API do not agree on number formatting.

### Risk 2 — `Next Step` is a paragraph, not a line 🟠

The column's own description says *"Keep it short."* Reality:

| Project | `Next Step` length |
|---|---|
| Chronocheck | 1,430 chars |
| Vantage | 785 chars |
| RoadFit | 527 chars |
| Bullpen | 104 chars |

The Vantage entry is a full paragraph of device-test forensics. Dropped raw into a
dashboard tile it will swamp the board — the exact opposite of the condensed,
time-relevant direction #87 just set.

**Mitigation:** truncate to roughly the first sentence or ~90 chars with an ellipsis,
full text on tap/hover via `title`. Never render raw. Non-negotiable for tile sanity.

### Smaller sharp edges

- **Priority values carry emoji** (`"🟠 High"`, not `"High"`). Strip for logic, keep
  for display.
- **13 projects is too many for a tile.** Filter and cap — see §6.
- **Rate limiting / cost.** Every app load would hit Notion. Cache the response in the
  Worker (Cache API, ~5 min TTL) so a phone reload doesn't cost a Notion call. The
  data changes a few times a day at most.
- **Offline.** The tile must degrade to empty/last-known rather than erroring, matching
  `fetchFavorites()`'s fail-soft `[]` behavior.

---

## 5. The one true prerequisite: a Notion permission grant

The Worker's `NOTION_TOKEN` integration is currently shared with the Incoming Ideas
page and the Favorites database. **It has no access to the Projects database.** Until
that's granted in Notion, `GET /projects` returns 404s regardless of correct code.

This is a one-click share in Notion, but flag it plainly: it **widens what a
Cloudflare-hosted token can read** to include every project's status, next step, and
one-liner. That's Rob's own data behind his own Google-verified, owner-gated endpoint,
so the risk is modest — but it is a real scope increase and should be a conscious
decision, not a side effect of shipping a tile.

Read-only is sufficient. No write scope is needed for this feature.

---

## 6. Design: what actually goes on the board

A `connect`-family tile, `mcfeed`. One registry entry (per the #84-era registry
contract — adding a tile is a one-entry edit).

Default view — **top 4 rows, sorted by `Last Worked` descending**, which directly
answers "my most recent projects, stuff I've been working on":

```
🎛 MISSION CONTROL                      ⟳ 2m ago
─────────────────────────────────────────────────
⚾ Bullpen            Building    ▓▓░░░░░░░░  10%
   → Wire the rotation picker to the store       ·you
📷 Vantage            In Testing  ▓▓▓▓▓▓▓▓░░  80%
   → Device leg 39 = L3 on build 77 (uploaded…   ·you
🕰 Chronocheck        In Testing  ▓▓▓▓▓▓▓░░░  72%
   → Re-run the drift bench after the clock fi…  ·claude
📏 RoadFit            In Testing  ▓▓▓▓▓▓▓▓▓░  85%
   → Confirm leg 12 grade math on the 8% ramp    ·you
```

Config: `count` (default 4), `sortBy` (`last_worked` | `priority` | `progress`),
`statusFilter` (default: exclude `Shipped` / `Shelved` / `Backburner`), `showNextStep`.

Pairs naturally with #87 — put it in **Morning** (what am I picking up today) and
**Evening** (what did I move), skip Midday. That's exactly the multi-tab case #91
just unblocked.

---

## 7. Phasing

- **Phase 0 — grant + verify. ✅ DONE 2026-07-28.** The integration reaches the
  Projects database: `HTTP 200`, 13 rows, icons and the `Last Worked` sort both
  working. (The grant already existed via the parent page; the blocker turned out to
  be the wrong database id, not a missing permission — see §2.)
- **Phase 1 — Worker route. ✅ DONE 2026-07-28** (`235fa67`, `PROJECTS_DB_ID` fix
  follows). `GET /projects` modelled on `/links`: query, map rows (incl.
  `page.icon.emoji`), normalize `Progress`, strip Priority emoji, truncate
  `Next Step`, cache ~5 min. `test/worker.test.js` extended by 22 tests (30 total in
  that file, 186 across the suite), plus a one-off run of the real Notion payload
  through the mapper — all 13 rows mapped, no truncation over the cap, every
  truncation a real prefix of the source text.
  **Not deployed.** `wrangler deploy` needs interactive Cloudflare auth; the route
  does not exist in production until Rob runs it.
- **Phase 2 — client + tile.** `fetchProjects()` in `src/lib/notion.js` (fail-soft,
  mirroring `fetchFavorites`). Register `mcfeed` in `src/tiles/registry.js` under
  `connect`; renderer in `src/tiles.jsx`. Ship with sensible defaults.
- **Phase 3 — config surface.** Count / sort / status-filter through `ConfigModal`.
- **Phase 4 (optional) — signals.** `signals.json` (git commits, Claude sessions,
  streaks) is the genuinely novel data Notion does not hold — "PRISM: 10 commits this
  week." It's local-only today, so this needs Mission Control to publish it somewhere
  fetchable first. Real value, but it's a Mission Control project, not a Daymaster
  one. Keep it out of the first cut.

**Suggested first cut: Phases 0 → 2.** That's a live, glanceable feed on the board.
Config and signals are clean follow-ons.

---

## 8. Related backlog

- **#89** project links (Mission Control + Clip job) — overlapping "my projects in
  Daymaster" theme; check #50 Favorites first, it may already cover it.
- **#50** dynamic links / Favorites DB — the existing `/links` route this plan copies.
- **#87 / #91** time-relevant + multi-tab tabs — where this tile wants to live.
