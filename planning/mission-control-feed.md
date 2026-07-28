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

### Risk 1 — `Progress` is stored on two different scales 🔴

Verified live against the Projects database today:

| Project | Stored `Progress` |
|---|---|
| Vocal Inbox | `94` |
| Mission Control | `0.95` |
| PRISM | `0.9` |
| RoadFit | `0.85` |

Notion's *percent* number format displays `0.95` as 95%, so both look correct in the
Notion UI — but the raw API returns the stored number. A naive `width: ${progress}%`
renders **Mission Control as a 1% bar next to Vocal Inbox at 94%**.

This is a live data-integrity bug in the Projects database, not a Daymaster bug, and
it will silently mislead any consumer.

**Mitigation (do both):**
1. Normalize defensively in the Worker: `p <= 1 ? p * 100 : p`. Ambiguous only at a
   true 1%, which never occurs in this dataset — safe, and it makes the feed correct
   immediately regardless of what Notion holds.
2. Report it upward so the source gets fixed — this belongs to Mission Control, not
   Daymaster. The `/km` pass is the natural owner.

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

- **Phase 0 — grant + verify (blocking, minutes).** Share the Projects database with
  the Worker's Notion integration. Confirm with a direct query before writing code.
  Everything else is dead in the water without this.
- **Phase 1 — Worker route.** `GET /projects` modelled on `/links`: query, map rows
  (incl. `page.icon.emoji`), **normalize `Progress`**, strip Priority emoji, truncate
  `Next Step`, cache ~5 min. Extend `test/worker.test.js` — it already covers the
  Worker, including the normalization and truncation, which are the parts that will
  actually break.
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
