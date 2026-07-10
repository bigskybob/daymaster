# Daymaster — Next Major Enhancement Plan

_Review + planning only. No code changed. Authored 2026-06-21._

> **Update 2026-06-26 — sync data-loss fix shipped (commit `e749f60`, `fix(#53)`).**
> The cross-device "today went blank" bug is fixed: `mergeStores` now reconciles a
> contested day at **tile granularity** via `mergeDay` (was whole-day last-write-wins,
> which let a fresh device's near-empty day — quote-only, newer `__mtime` — clobber the
> rich copy on Drive), and `App.jsx` gates the first Drive save until the first
> post-auth load completes. Two **related data-loss vectors remain OPEN** (good
> candidates to fold into Alt A below):
> 1. **Layout clobber** — `mergeStores` takes the whole `layouts` section from the newer
>    top-level `__savedAt`, but `__savedAt` bumps on every save, so a device editing only
>    a *day* can wipe another device's concurrent *layout/tab/field-link* edit.
> 2. **Offline overwrite** — if the startup `loadFromDrive` fails, `_remoteRevision`
>    stays null and the next save skips the concurrent-write merge → plain overwrite.

## 1. What Daymaster is

A modular, tile-based **daily planner PWA** (`package.json` v2.0.0). React + Vite
SPA served from GitHub Pages, with a thin Cloudflare Worker proxy for Notion and
client-side MSAL for Microsoft To Do. Each user's data lives in their own Google
Drive file (`drive.file` scope). Live at https://bigskybob.github.io/daymaster/.

Core architecture (per `DEPLOY.md` and the source):

- **Self-describing tile registry** (`src/tiles/registry.js`) — one entry per tile
  type declares family, label, icon, component, `defaultConfig`, and an addressable
  **field schema** (`FIELD_SCHEMAS` / `tileFields`). Families are swim-lanes:
  `capture | track | connect | derive`. Adding a tile is a one-entry edit.
- **Tile renderers** (`src/tiles.jsx`, 1332 lines) dispatched by `RenderTile`, which
  stamps `_type` onto each tile's per-day data so cross-tile readers can identify it.
- **Auto-rule / field-link engine** (`src/lib/rules.js`, `src/lib/fieldlinks.js`) —
  a checkbox can auto-complete from another tile's state; `TILE_EVENTS` enumerates
  the completion predicates per tile type.
- **Conflict-safe Drive sync** (`src/lib/sync.js` `mergeStores`/`mergeDay`,
  `src/lib/drive.js`) — **per-tile union within each day** (the day's `__mtime` only
  breaks ties on a tile edited on both sides), revision-checked writes, duplicate-file
  consolidation. A `syncedDownRef` gate holds the first Drive write until the initial
  post-auth load has merged the remote in. The merge core is pure and unit-tested.
- **App shell** (`src/App.jsx`, 1178 lines) — header, grid, edit mode, Today/History
  views, themes/fonts/background, focus mode, header tabs (#84), onboarding, PWA
  install hint (#82), opt-in check-in reminders via browser `Notification` (#14).
- Persistence shape: `store = { version, activeLayout, layouts, days, __savedAt }`,
  where `days[dateKey][tileId] = { ...perDayData, _type }` and date keys are unpadded
  `Y-M-D` (`src/lib/helpers.js` `dayKeyVal`/`fmtDate`).

## 2. Current state

Mature and feature-dense. 20 Vitest specs cover store/rules/sync/fieldlinks/tabs/
themes/pwa/onboarding/worker plus an App mount smoke test. Recent trajectory (git
log): PWA installable (#82), header tabs (#84), project persist mode (#83), check-in
completion gating (#81), Windows-3.1 + throwback themes (#76/#74), layout preview
(#73), the multi-phase field-links system (#A/#B/#C), and the registry/App split
refactor (`bad3574`). The backlog lives in GitHub issues (referenced as `#NN` in
commits; highest seen is #84) — the repo is private, so issues weren't directly
readable for this review; the recommendation below is inferred from the code and
history. No `CLAUDE.md` or roadmap doc exists in-repo.

Two files are notably large and monolithic: `src/App.jsx` (1178) and `src/tiles.jsx`
(1332). The registry refactor already split App once; tiles.jsx is the next obvious
candidate but is maintenance, not a feature.

## 3. The gap → recommended next enhancement

**Recommendation: a longitudinal Insights / Trends layer over accumulated daily data.**

The app captures rich, typed, per-day data every day but does essentially **nothing
with it across time.** Concrete evidence in the code:

- `TileNumbers` — the entire `derive` family's flagship "Daily Numbers" tile
  (`src/tiles.jsx:699`) computes stats for **today only**: it reads `allDayData` (the
  current day) and never touches `store.days`. No streaks, no trends, no week/month
  rollups.
- `HistoryView` (`src/ui/HistoryView.jsx`) is a **browse-one-day-at-a-time** reader.
  It already unions tiles across all layouts and defensively normalizes legacy data
  shapes, but it aggregates nothing — no totals, no streaks, no "how was this week."
- The whole `track` family (planks, pushups, dangles, counter) plus habit checkboxes
  exist precisely to be **repeated and measured over time** — the textbook case for
  streaks and trend lines — yet there is zero longitudinal surface.
- There is **no data export** (no CSV/JSON download anywhere in `src/`), so the data
  has no analytical escape hatch either.

This is the highest-value next step because it (a) unlocks value from data already
being captured at no extra user effort, (b) is the natural trajectory of a habit/
daily tracker, (c) is strongly supported by the existing data model — per-day store,
`_type`-stamped tile data, and `FIELD_SCHEMAS` that already enumerate every
addressable metric and completion predicate — and (d) has no existing equivalent.
It is a coherent _major_ feature, not a tweak, and it slices cleanly.

### Alternatives considered

- **Alt A — Offline-first sync queue.** The PWA shell shipped (#82) and `syncStatus`
  already has an `offline` state, but writes still go straight to Drive and require
  network; there's no durable write queue or background sync. Real value for a
  phone-first PWA, but `mergeStores` already solves the bulk of the correctness
  problem (now tile-level after `fix(#53)`), so the remaining work is mostly plumbing
  with a smaller, less visible payoff. Good _second_ — and the natural home for the
  two open data-loss vectors noted at the top (the **offline-overwrite** one in
  particular: a durable queue + a non-null `_remoteRevision` baseline would close it).
- **Alt B — Split `src/tiles.jsx` (1332 lines) into per-tile modules**, mirroring the
  registry/App split (`bad3574`). Genuinely enabling and reduces future friction, but
  it's a refactor, not a user-facing enhancement. Better folded into Insights work as
  touched, or done as its own housekeeping pass — not the headline.

Insights is primary; offline-queue is the strongest runner-up if a user-invisible
infrastructure win is preferred over a visible feature.

## 4. Scope & key files

**New files**

- `src/lib/insights.js` — pure aggregation core. Reduces `store.days` into per-metric
  **time series** and **streaks** (current + longest). No React, no I/O, deterministic
  given inputs — same shape as `sync.js`/`rules.js`/`fieldlinks.js`. The single place
  that knows "what counts as done" per metric, reusing `rules.js` `TILE_EVENTS`
  predicates rather than re-deriving completion.
- `test/insights.test.js` — Vitest spec with hand-built multi-day stores, including
  legacy/mixed data shapes and gap days.
- `src/ui/InsightsView.jsx` — a third top-level view beside Today/History: streak
  cards + hand-rolled SVG sparkline/bar trends (no chart dependency — matches the
  in-house SVG bars already in `TileNumbers` and the zero-runtime-dep ethos).
- (Phase 3) `src/lib/export.js` — CSV/JSON serialization of the day history.

**Modified files**

- `src/App.jsx` — register the new view + a header-tab button next to
  `headerBtn("Today"…)` / `headerBtn("History"…)` (around `:811`) and the view switch
  (around `:891`); thread `store` into `InsightsView`. An export button lives in the
  header or Insights view.
- `src/tiles/registry.js` — (Phase 4) register an optional `trends` tile in the
  `derive` family (one entry), so a streak/trend summary can be placed on the board.
- `src/tiles.jsx` — (Phase 4) `TileTrends` renderer reusing `insights.js`.
- `src/lib/helpers.js` — small date-range helpers if needed (already has `dayKeyVal`,
  `fmtDate`, `todayKey`).

**Leveraged as-is:** `store.days`, the `_type` stamp from `RenderTile`,
`tileFields`/`FIELD_SCHEMAS` (metric enumeration), `TILE_EVENTS` (completion
predicates), `dayKeyVal` (real-calendar ordering, the #78 fix).

## 5. Risks

- **Heterogeneous historical data shapes** (main risk). Tile data formats have
  migrated over time — project items `string → {text,done}` (#52), `guidedam` evolved
  from `twoprompt` (#3), pushups moved to a cumulative model (#55). The reducer must
  tolerate every legacy shape. Mitigation: reuse the exact defensive normalization
  `HistoryView` already performs, and centralize it so both share one normalizer.
- **`_type` not present on old days.** The `_type` stamp post-dates the registry
  refactor; older `days[date][tileId]` entries may lack it. Mitigation: fall back to
  the layout→tile-type map the way `HistoryView` unions tiles across layouts.
- **Streak/"done" definition ambiguity.** What makes a day count for a metric must be
  consistent with the rest of the app. Mitigation: define completion via the existing
  `TILE_EVENTS` evaluators, not new ad-hoc logic; document the rule per metric.
- **Gap days.** Missing calendar days between entries must not silently break or
  inflate streaks — define "consecutive" explicitly (calendar days vs. logged days)
  and test it.
- **Performance / churn.** Histories are small, but memoize the reduction (`useMemo`
  keyed on `store.days` + `store.__savedAt`) so it doesn't recompute on every render.

## 6. Phased / sliced implementation plan

Each phase is independently shippable and testable; later phases are optional.

- **Phase 0 — shared normalizer (small).** Extract the per-tile data normalization
  currently inline in `HistoryView` into one helper (e.g. `src/lib/tileData.js` or an
  addition to `helpers.js`). Refactor `HistoryView` to use it. Pure, unit-tested,
  zero behavior change — de-risks every later phase. (Touches `HistoryView.jsx`, new
  helper, new test.)
- **Phase 1 — pure insights core (the heart).** `src/lib/insights.js`:
  `buildSeries(store)` → `{ metricId, label, points: [{dateKey, value, done}], current
  streak, longest streak, total }[]`, driven by `FIELD_SCHEMAS` + `TILE_EVENTS`. Full
  `test/insights.test.js` covering legacy shapes, missing `_type`, and gap days. No UI.
- **Phase 2 — Insights view.** `src/ui/InsightsView.jsx` + a third header tab and view
  branch in `App.jsx`. Streak cards + hand-rolled SVG trend bars (reuse the
  `TileNumbers` bar pattern). Read-only; no data writes, so no sync risk.
- **Phase 3 — data export.** `src/lib/export.js` (CSV + JSON of day history) + a header
  / Insights button. Small, high-utility, complements insights, gives the data an
  escape hatch.
- **Phase 4 — placeable Trends tile (optional).** Register a `trends` tile in the
  `derive` family (`registry.js` one entry) + `TileTrends` renderer reusing
  `insights.js`, so a streak/mini-trend summary can live on the board itself.

Suggested first cut to ship: **Phases 0 → 1 → 2.** That delivers a visible, tested
Insights view with no write-path risk, and leaves export + the tile as clean
follow-ons.
