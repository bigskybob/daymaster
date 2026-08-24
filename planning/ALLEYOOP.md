# Daymaster — session handoff

*The next session starts here. Newest first; keep the current session plus one
back, and let /historian carry the rest into the Chronicle.*

---

## 2026-08-24 (evening) — view-layer design review: START HERE

**Design only. No code changed this session.** The next cook starts with Phase 0/1 below.

- **Design doc:** https://claude.ai/code/artifact/9424ea7b-c571-4ef9-af2d-7c2a1b9fdf62
- **Full technical record:** `planning/view-layer-review-2026-08-24.md` — read the migration plan
  and the appendix brief before touching Phase 3.
- **Tickets:** #116–#131 filed in Notion.

### What happened

Rob called the interface unusable — "3 or 4 ways trying to do the same thing." A 34-agent
adversarial review (5 code readers → 4 opposed proposals → review → counter-review → 12
adversarial verdicts → 3 judges → synthesis) found **sixteen** mechanisms deciding what's on the
board, across **fifteen** configuration surfaces. The answer is **Page / When / Tidy**: 16 → 3.

### ⚠ TWO LIVE BUGS, both from this morning's #105, both proven not inferred

1. **#119** — `store.dayTypes` is a TOP-LEVEL key. `mergeStores` returns exactly
   `{version, activeLayout, layouts, days, __savedAt}`, so **every Drive sync destroys it**
   (proven by execution). Day-types silently switch themselves back off.
2. **#117** — the board renders `resolveLayoutKey` (manual > calendar > stored) but
   `mutateLayout` (App.jsx:345) and `deleteLayout` (App.jsx:470) still write `s.activeLayout`.
   When the calendar auto-selects, **every edit — and every content write, including project
   items and the Ideas log — lands on the board you are not looking at**, and 🗑 deletes a board
   you cannot see.

Fix them together: #119 alone un-masks #117.

### The lane, in order

| Phase | Tickets | Note |
|---|---|---|
| **0 · Trust** | #116, #100 | Ships first. #116 alone, then #100. Hard gate — do not migrate over a live auth bug. |
| **1 · Fix today's board** | #117, #118, #119 | **THE SAFE STALL POINT.** No model change, no migration. If the lane dies here Rob is still strictly better off. |
| **2 · Sync gate** | #120 | Hard gate on #124. A library of small page objects makes the wholesale clobber bite more often. |
| **3 · The model** | #121, #122, #131, #123, #124, #125, #126, #127, #128 | Gated on Phase 1 tasted + build stamp confirmed on every device. |
| **4 · Held for evidence** | #129, #130 | Do not fire on a hunch. #129 needs ~6 weeks of use; #130 needs Rob to ask. |

### Standing cautions for this lane

- **NEVER touch `store.days`.** It is keyed by unpadded `Y-M-D` and by **tile id**, and the tile id
  is the only join between the view layer and history. Never mint, re-key or namespace an id.
- **Never add a top-level store key.** `mergeStores` is a whitelist — that is bug #119's whole
  cause, and it is why the normalized-tile-store proposal was rejected despite being the better
  data model. New state goes nested inside a layout, or in localStorage.
- **Escrow before the migration** (#122): snapshot raw local **and** raw Drive payload separately,
  **before** `mergeStores` runs. Snapshotting `applyStore`'s argument preserves already-clobbered
  state.
- `docs/` is the build output and is gitignored; CI deploys on push to `main`.

### Reconciled backlog

#31 closes via #124 · #115 folds into #118 · #108 **Blocked** (its premise dies with tabs —
re-scope, don't resume) · #93 re-held until #123 · #103 partly delivered by #126 · #100 widened
to a Phase 0 gate.

### Waiting on Rob

1. Should picking a page on the phone change the laptop? (Recommendation: no — device-local.)
2. Turn on the 11-tile `am-focus` morning board? Wed 8am goes 19 tiles → 11, zero authoring.
3. How many devices, and can they all be opened online this week? **Gates Phase 3.**

Also still unresolved from this morning: **#112 is code-complete but NOT LIVE** — it needs Rob's
four Slack/Worker config steps. And seven dishes await taste (#82, #87, #92, #97, #99, #102-P1,
plus #105/#113 — though the review says taste #105 only after #117+#119 land).

---

## 2026-08-24 (morning) — /kitchen: day-type boards, done states, ClipJob capture

**Shipped (3 dishes, all AWAITING TASTE — nothing closed this run).**
Suite **201 → 243** green, build clean, `main` pushed.

| # | Dish | Commit |
|---|---|---|
| #105 | Day-type boards — Together / Solo / Family Weekend | `6371651` |
| #113 | Done states — per-tile shelf / hide + Done rail | `593c4eb` |
| #112 | Idea capture rerouted to ClipJob via Slack | `96aa5eb` |

### What Rob asked for, and what it became
A consultative session: three kinds of day (Mon/Tue home with Ali · Wed–Fri solo ·
weekend with family), less clutter on the board, finished things moving aside —
some staying visible, some disappearing until they matter again.

That became **#105** (three boards owning their weekdays) and **#113** (per-tile
done behavior). They were designed together and should be tasted together: the
boards decide *what's on stage*, the done states decide *what leaves the stage*.

### The two decisions worth re-reading before touching this code

1. **#105 auto-switching is OPT-IN** (`store.dayTypes`, `📅 Day-types` in edit
   mode). Seeding the boards with their `days` alone silently moved an existing
   user off the board they built the next time they opened the app — the
   integration test caught it. #87 set the precedent: ship the mechanism, leave
   the seeding to the user. Don't "helpfully" default this on.

2. **#113 evaluates `config.rules` inside `tileComplete`.** #92's
   `effectiveDayData` overlays *field-link* auto-checks only; the older
   `config.rules` path isn't overlaid, so reading `effectiveToday` alone made
   Mise-en-place report unfinished with every box visibly ticked. The general fix
   is filed as **#115** (holds until Rob has tasted #92).

### Next session — the rail, in order

1. **#93 Yesterday's Leftovers** *(Order Up!, fired this run)* — the highest-leverage
   item of the July review. **Gather leftovers from the day's DATA, not the current
   layout's tile list**: #105 means yesterday may have been a different board, and a
   Tuesday leftover would go missing when Wednesday opens on Solo.
2. **#98 Zero-tap capture** *(Order Up!)* — note its Plating still says "lands in
   Notion"; #112 moved the destination to `POST /capture` → Slack → ClipJob. The
   local-queue fallback matters more now, not less.
3. **#100 Sync + auth trust pack** *(Order Up!)* — raised in priority by #112: the
   ~60-min token expiry now breaks *capture* as well as Drive saves.

Then #114 (Friday close → weekend carry) unblocks once #94 lands, and #95's
Morning Brief becomes day-type-aware on top of #105.

### Blocked on Rob (not on code)

**#112 is code-complete but NOT LIVE.** Four config steps, all needing credentials
the kitchen doesn't hold — full instructions on the ticket:
create `#cj-inbox` → set ClipJob's `SLACK_INBOX_CHANNEL` → add a Slack **user**
token scope (`chat:write`) → `wrangler secret put SLACK_USER_TOKEN` + `wrangler deploy`.

It must be a *user* token: ClipJob's door ignores anything carrying a `bot_id`, so
a bot post is accepted by Slack and then silently dropped.

### Standing cautions (carried forward)

- Day keys are **unpadded** `Y-M-D` — never string-compare them, use `dayKeyVal()`.
- Per-day data is keyed by **tile id and shared across layouts**. That's what makes
  #105's boards work; it also means renaming a tile id orphans its history.
- Two Drive data-loss vectors remain open (layout clobber, offline overwrite) —
  see `planning/next-enhancement-insights.md`.
- `docs/` is the **build output** and is gitignored; CI deploys on push to `main`.
- Notion ticket stamps from this run read `2026-08-23`; the session actually ran
  Monday `2026-08-24`. One-day drift in the ticket record, not in the commits.
