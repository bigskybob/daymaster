# Daymaster — session handoff

*The next session starts here. Newest first; keep the current session plus one
back, and let /historian carry the rest into the Chronicle.*

---

## 2026-08-23 — /kitchen: day-type boards, done states, ClipJob capture

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
