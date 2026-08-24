# Daymaster — view-layer design review

**24 August 2026 · design only, no code changed.** Full record of the 34-agent adversarial
review that produced the Page / When / Tidy model.

- **Design doc (published):** https://claude.ai/code/artifact/9424ea7b-c571-4ef9-af2d-7c2a1b9fdf62
- **Tickets:** #116–#131 in the Notion Enhancement Backlog
- **Handoff:** `planning/ALLEYOOP.md`

Method: 5 parallel code readers → 1 consolidated brief → 4 independent proposals from opposed
lenses → hostile review of each → counter-review empowered to rebut the reviewer → 12 adversarial
verdicts across 3 lenses → 3-judge panel → synthesis. 34 agents, 4.3M tokens, 0 errors.

Judge panel: minimal → minimal(7.5) > progressive(6) > rules(4) > pages(3) · minimal → minimal(7.5) > progressive(6.5) > rules(4.5) > pages(3.5) · progressive → progressive(6.5) > minimal(6) > pages(4) > rules(3.5)

---

## Executive summary

Build PAGES: one container (a Page is your existing layout, at the same address, with two nested
fields — when it shows, and whether it's on), one activation rule (the first live page in list
order whose When matches now — the list IS the precedence, drag it), and one finished-work rule
(Tidy: a single device-local header switch, Show all / Tidy / Hide done, with the invariant that
an unfinished tile is never hidden). That retires fourteen of the sixteen mechanisms currently
deciding what's on your board, takes the places you configure it from fifteen to four, and
deletes three modules — while nothing is rebuilt: store.layouts keeps its address, every tile
id, and every column, and per-day data is never opened. #105 is absorbed, not reverted (its
three boards are your actual week and are the most correct thing in the view layer; only its
packaging was wrong, and its opt-in flag is deleted because every sync destroys it anyway). #113
is half-reverted: its per-tile config surface goes, its completion partition becomes Tidy's
engine — so neither commit you shipped today is thrown away. Two calls went against the panel's
winner and I'd defend both: Tidy is app-wide rather than per-page (a per-page rule is #113's own
defect at a coarser grain, and localStorage makes it immune to the merge whitelist that's been
eating store.dayTypes since #105 shipped), and the morning-clutter complaint is fixed by the
MIGRATION, not a feature — you already own an 11-tile morning board (am-focus) built from the
same tile ids as everything else, switched off; scheduling it for weekday mornings takes
Wednesday 8am from 19 tiles to 11 with zero authoring, and every proposal in the review missed
it. It ships in four phases with a real stall point: Phase 0 is trust (service-worker stamp,
then #100's auth/duplicate-file fix), Phase 1 fixes TODAY's board with no model change and no
migration — edits stop landing on the board you're not looking at, 🗑 stops deleting the wrong
one, and your day-types work for the first time — Phase 2 lands the per-page merge before the
library multiplies small objects, and only then does Phase 3 build the model. If the lane dies
after Phase 1 you're still meaningfully better off than tonight, which no other sequencing in
this review could say. The honest caveats: flat pages copy where tabs filtered (named as #129,
held for evidence rather than guessed at), Tidy reaches 14 of 24 tile types and I've stated
which ones rather than inventing an invisible taxonomy, the offline old-bundle window is bounded
but not closed, and the test suite cannot catch a regression here — this has to be tasted by
hand.

**Concepts a user must learn: 15 → 13.**

---

## The model

### Tile

A card that holds one kind of content. Unchanged, including its id. The id is GLOBAL: the same
id on five pages is one dataset per day at store.days[date][tileId]. Never re-keyed, never
namespaced, never minted for an existing tile — this is the only join between the view layer and
your history, so preserving it bit-for-bit is what keeps History rendering and keeps every
_done/_dismissed/_delayMin/_open/mode key meaningful.

*Replaces:* module · section · block (three names retired to one)

### Page

A named arrangement of tiles in three columns, that is ON or OFF. Persisted at
store.layouts[key]; the key stays the immutable identity it already is. OFF means kept forever,
editable, never comes up, never appears in the day-to-day picker. There is no delete, no
separate draft store, no second lifecycle: staging an alternate is building a page while it is
OFF, and publishing is switching it ON. That is capabilities 2, 3 and 4 on one boolean.

*Replaces:* layout · preset · board · day-type board · tab · the unbuilt #31 widget page (six names, one object)

### When

One optional rule per page: some weekdays, and/or a start–end time (half-open, may wrap
midnight). Empty = it only comes up when you pick it. Resolution in one sentence: the first page
in the list that is ON and whose When matches right now wins. The list is drag-orderable, so the
order IS the precedence — no computed specificity, no cascade. A manual pick is device-local and
expires at the day roll.

*Replaces:* layout.days (#105) · tab membership (#84/#91) · tab time windows (#87) · the ALL pseudo-tab · the manual/auto override machinery (two copies of one state machine, two tickers, two release effects, two tiebreaks)

### Tidy

ONE header control with three values — Show all / Tidy (default) / Hide done — stored per device
in localStorage, never synced. Tidy collapses every finished tile to a one-line header and sinks
it to the foot of its column; Hide pulls them behind one 'Set aside (n)' rail that prints a
reason per line ('finished 9:12' / 'dismissed' / 'delayed'). NO per-tile setting, NO per-page
setting, NO clock. Invariant stated to the user: an unfinished tile is never hidden.

*Replaces:* Focus mode (#2/#54) · done states stay/shelf/hide (#113) · the check-in completion sink (#35/#81) · the stale check-in hide (#6/#35) · the Done rail · the 'hidden check-ins' reveal

---

## Capability map

**1. A page library — named views you can see and manage in one place**

Manage Pages (⚙ from the header picker): one drag-orderable list of every page with name, tile
count, its When rule in plain English ('Wed Thu Fri · any time'), an on/off toggle, an 'ON NOW'
marker on the resolver's current answer, and a collapsed OFF section. The drag writes page
order, which IS the activation tiebreak — one gesture, one meaning, visible. Replaces the
7-option flat header <select> that is the only list today. This also closes #31 (Large, Queued,
ZERO code) as delivered — it was never a ninth mechanism, it is this same object with a library
on top. Ticket #124.

**2. Enable/disable a page without deleting it**

page.live = false, via 'Turn off' on the row. The page keeps its key, its tiles, its columns,
its When and its history join forever; it just drops out of the resolver and the day-to-day
picker. This is ALSO the mechanism that permanently kills the re-seeding landmine: the seed-if-
missing loop is guarded by `if (!store.layouts[seed.key])`, so a key that never disappears can
never be resurrected factory-fresh — no tombstone list, no version gate (store.version is read
by nothing and ratchets DOWN to a constant). Ticket #124.

**3. Stage/draft an alternate page without it going live**

Same field. Create it OFF — '+ New page' and 'Fork' both land OFF and do NOT switch to it. Off
IS staged; there is no third status value, because Off and Draft are mechanically identical
(both: kept, never activates, never in the picker, openable in Preview) and shipping both would
be a concept bought for a label. An off page is fully editable and viewable on demand: clicking
it in the library shows it NOW as a device-local pick that expires at the day roll and never
persists. Tickets #124 + #125.

**4. Publish a staged page**

Flip the toggle ON. It enters the resolver at its list position. If its When collides with a
page above it, the library says so in words BEFORE you flip ('Together and AM Focus both claim
Mon 5–11am — AM Focus wins, it is higher up'). A second outcome, 'Publish, replacing <page>',
switches the fork on, copies the parent's When onto it, and switches the parent OFF in one
action — the safe swap, since nothing is deleted. Publishing and enabling are deliberately the
same gesture: two words for one act would be a fifth concept. Ticket #124.

**5. Create a page as a variation of another (fork)**

Fork = deep clone of columns WITH TILE IDS PRESERVED (deliberate — shared ids mean shared per-
day data, which is why the same 'dinner' on Together and Family Weekend must be one dataset),
plus links, plus name + ' copy', landing OFF. DECISION ON THE PARENT LINK: it persists as
PROVENANCE ONLY and is one-shot. `forkedFrom` is stored, shown in the library ('forked from
Solo'), powers 'Publish, replacing Solo', and is cleared the moment you publish. It NEVER
propagates edits in either direction. Live inheritance is rejected outright: it means one edit
silently changes a page you are not looking at, which is the exact failure class this review
exists to kill, and the release that would ship first is the one WITHOUT it — so you would pay
its maintenance cost and get none of its benefit. The ergonomic gap it would have filled is
filled instead by a 'shared with Together, Family Weekend' chip on any tile id present on more
than one page, computed by scanning pages — strictly more truthful than an inheritance chip, and
it covers `dinner` correctly (verified: dinner is NOT in `default`, so an inheritance model
would have got its own flagship example wrong). NOTE: no surface anywhere mints a new tile id
for an existing tile — the 'start fresh copies, new empty history' option that appeared in one
proposal is cut, because it voids the invariant every data-safety guarantee rests on. Ticket
#124.

**6. Activation: manual pick AND automatic (weekday, time of day) — ONE idea**

page.when = { days:[0-6]|null, from:'HH:MM'|null, to:'HH:MM'|null } or null. resolvePage(): (a)
a device-local pick for today's day key, if the page still exists and is live; (b) otherwise the
first LIVE page in list order whose every declared clause matches; (c) otherwise the pinned
always-matching fallback page, which is undeletable and always last, so the resolver can never
return null — retiring the whole null-layout crash class. ONE 60s ticker replaces the 30s tabNow
tick and the 60s clock. ONE ref-diff effect releases the pick when the auto answer changes or
the day rolls. The fallback chain is STATUS-FILTERED so it can never land on an off page
(including one an old bundle switched to). O1 realized: #87's tab machinery and #105's board
machinery are the same state machine typed twice twenty lines apart — daytypes.js says so in its
own comments — and now they are typed once. AND an automatic change NEVER preempts: when the
clock crosses a window edge the board does not swap, a chip appears ('Solo is ready ↻') and one
tap takes it. Tickets #121 + #125.

**7. Within-page visibility of finished tiles — ONE idea**

Tidy: one device-local app-wide control, three values, no per-tile config, no per-page config,
no clock. `finished` has ONE definition app-wide via one predicate at one call site (#118),
which includes an explicit _done and a dismissed check-in. The render pipeline's steps 2–6
collapse to a single partition. Everything lands in ONE 'Set aside (n)' rail — deliberately NOT
called 'Done', because a missed check-in is not done and today's reveal label says it is. Every
line prints its reason. The grid template is frozen to the page's declared columns so the board
never reflows, and an emptied column shows the same hint however it emptied. REACH, STATED
HONESTLY: after wiring the two already-written-but-unused predicates (planks and dangles, both
'@allchecked over four slots' — correct), 14 of 24 tile types can report finished. Pushups and
Counter are deliberately NOT wired: their only predicates are '@any' and '@positive', which
would collapse a running tally on the first set of the day. On Solo that leaves Calendar,
Pushups and Daily Numbers permanently expanded — stated plainly rather than papered over with an
invisible type taxonomy. Tickets #118 + #123.

**8. Rob's three real day-types must still be expressible**

Together = when:{days:[1,2]}. Solo = when:{days:[3,4,5]}. Family Weekend = when:{days:[0,6]}.
Migrated mechanically from layout.days, tile content identical to what #105 shipped — and for
the FIRST TIME editable: today the only writer of layout.days in the entire codebase is a hard-
coded migration constant (store.js:438), so you cannot move a day, add one, or clear a collision
except by hand-editing an exported JSON. Now: seven weekday chips plus two time fields, with an
overlap warning in words. The four tiles that exist only on those boards (household, dinner,
familyplans, carried) keep their ids and therefore their history, and because pages are never
deleted they stay reachable by History forever. The store.dayTypes flag is retired outright — no
global 'is scheduling on?' switch is needed once a page with no days is simply always eligible,
and that flag is a top-level key every mergeStores destroys, so it turns itself off for any
Drive user on first sign-in. Tickets #119 (interim) + #121/#122.

---

## The fate of all sixteen mechanisms

### M1/M2/M3 — Layout presets + the activeLayout pointer + the manualLayout session override (#33, #105)

**ABSORBED — this IS the Page**

Presets and day-type boards were already the same data structure, with the same seeding loop,
the same buildDefaultLayout source, the same map and the same <select>; the only difference was
the presence of layout.days. They become one list with one rule field. The three-level resolver
survives as resolvePage's three clauses, but the manual level becomes device-local and day-
scoped instead of a synced write — so one click stops having two lifetimes (O14/U4). I am
closing that open product question in favour of the code's own comment at App.jsx:56-59 rather
than its behavior: a page pick is a device-local convenience like theme and font, which the
codebase already has a precedent for. Your phone stops moving your laptop.

*Data:* store.layouts KEPT AT THE SAME TOP-LEVEL ADDRESS, forever — never renamed, never moved, never rebuilt. Keys, names, columns, tile ids and every tile.config key except three are untouched. New fields (when/live/order/forkedFrom/_m/__legacy) are added NESTED, which is why they survive the mergeStores top-level whitelist with zero sync.js changes and why an old bundle still renders. store.activeLayout is written ONCE at migration, pointed at the complete fallback page, and then frozen — the new bundle never writes it again (no day-roll churn, no __savedAt pressure, no cross-device pick leakage) and never reads it, but an old bundle keeps a valid pointer so it cannot dereference null.

### M4 — Day-type boards (#105, shipped today, untasted)

**ABSORBED — do NOT revert the boards. The store.dayTypes FLAG is reverted outright.**

The three boards and their tile sets are the single most correct thing in the current view layer
— they are your actual life, and they are the only expression of your three day-types that
exists. What was wrong was the packaging: an opt-in top-level flag that mergeStores eats on
every sync (L16), a weekday claim with NO editor anywhere in the codebase (L17), and a second
copy of #87's state machine twenty lines away (O1). Day-type activation is not a feature you
turn on; it is what when:{days} means, and a page with no days is simply unaffected. DO NOT
TASTE #105 AS SHIPPED — L15 (edits land on activeLayout while the calendar renders a different
board) and L16 (the flag is destroyed by every merge) make it untasteable, and they mask each
other so it is genuinely unclear whether you have ever seen it work. Phase 1 makes it work;
phase 3 folds it in.

*Data:* layout.days → page.when.days, mechanically, via the existing layoutDays() normalizer so malformed entries are dropped rather than silently claiming Sunday. Then the key is deleted. store.dayTypes is deleted (nothing is lost — it never survived a sync anyway, so this is a no-op in practice, but now it is a no-op on purpose). The 📅 Day-types toggle and daytypes.js are deleted. Zero tile content is touched. The three seeded boards keep their keys `together`/`solo`/`weekend`.

### M5 — Preset & day-type board auto-seeding (#33 + #105), migrateLayout's seed-if-missing loop

**RETIRED OUTRIGHT — deleted in the same release as the migration**

Seed-if-missing cannot express a deletion (L8): delete am-focus, solo or weekend and reload, and
all three return FACTORY-FRESH (customization gone) and re-appended at the END of key order,
which silently changes both the activation tiebreak and deleteLayout's fallback. It runs on
mount, on every syncDown AND on every ⬆ Restore, so a backup cannot restore a state where they
are absent (L9). Without deleting this, capability 2 is impossible and every disabled page comes
back. It is also why #111 lands a brand-new user who picked 4 tiles on SEVEN layouts including a
19-tile Solo board they never chose.

*Data:* None — it only ever added. Its removal is made safe BY THE MODEL: because a Page is never deleted, every seeded key still exists after migration, so even a stray old bundle still running the loop finds every key present and does nothing. No tombstone list is needed, which is precisely why 'off, never delete' is worth more here than a delete button. PRESET_SEEDS is kept for exactly one release as a read-only comparison table, then deleted with the loop.

### M6 — The onboarding `setup` layout (#61)

**ABSORBED — becomes an ordinary Page**

Setup should produce a page, not a special layout that writes activeLayout and goes live
instantly. Under the new model it is the last ambient writer of activeLayout, it mints NEW
check-in tile ids on every re-run (orphaning history), and it overwrites itself. All three die.
Its hard-coded name:'Daily' is why 'Daily' appears twice in the picker.

*Data:* store.layouts.setup keeps its key and content and becomes a normal page. On a store with content, re-running Setup creates a page named 'Setup <date>' that lands OFF and drops you in the library with it selected — staging, exactly like every other new page — instead of overwriting and going live. Re-running becomes non-destructive by construction. #126 giving check-in tiles their missing onConfig removes the main reason to re-run Setup at all. Closes the worst half of #111.

### M7 / M9 — Header tabs + the ALL pseudo-tab (#84, #91)

**RETIRED OUTRIGHT as a mechanism; any existing tab data converted to Pages**

A tab was a page that could not be named in a library, could not be disabled, drafted, forked or
previewed, and evaporated the moment you switched boards (O10 — tabs and links are per-layout,
so turning on day-types erases your entire tab configuration and every field-link from view). It
stored membership in tile.config where the generic ConfigModal leaked raw tab ids as a free-text
box with replace semantics that break the tabs/tab mirror invariant (O11/L14). And because
defaultConfig never sets `tabs`, every newly added tile is All-only and vanishes the moment you
press Done with a time tab active. Deleting the axis deletes all of that at once. The ALL
pseudo-tab becomes the real, visible, orderable, undeletable fallback page.

*Data:* For each layout with tabs: one page per tab, keyed DETERMINISTICALLY as `<parentKey>__<tabId>` so a re-run collides and no-ops instead of accumulating duplicates on every revert-and-remigrate cycle. A tab WITH a time window becomes live with when={days: parent's days, from, to}; a tab WITHOUT a window contributes NOTHING (its tiles already live on the parent, which keeps all of them) — no junk draft pages from a migration whose thesis is subtraction. Then layout.tabs, tile.config.tabs and the legacy tile.config.tab mirror are deleted, after being archived verbatim at page.__legacy on the same page. VERIFIED NO-OP ON YOUR STORE: none of your 7 layouts carries a tab or a link. This path exists for correctness and for #111's beta users. Harvest SUGGESTED_BUCKET (tabs.js:107 — a complete tile-type→time-of-day partition table) into the migration BEFORE deleting tabs.js; it is the seeder for any future morning/evening split.

### M8 — Time windows on tabs (#87)

**ABSORBED into when.from / when.to**

This is the other half of O1 and the cheapest, highest-value merge in the whole review: #87 and
#105 are the same state machine typed out twice — derive an auto answer from a ticker, keep a
manual React override, release it in a ref-diff effect when the auto answer changes, resolve
manual > auto > stored, break ties first-match-wins in declaration order. parseTime and the
half-open, midnight-wrapping window test are GOOD code and are kept verbatim; what is deleted is
the second copy of everything around them.

*Data:* tabs[i].start/.end → the converted page's when.from/.to, archived alongside. Deleted: the 30s tabNow ticker, hasTimeWindows' ticker gate (the direct cause of a stale-clock bug), the unreachable effectiveTab guard, activeTimeTab, visibleColumnsForTab, the empty-column drop that made the board reflow, and suggestTimeTabs (unreachable once one tab exists, and it leaves 22:00–05:00 uncovered — the new window math wraps midnight correctly).

### M10 — Focus mode (#2 + #54)

**RETIRED OUTRIGHT — replaced by Tidy, on by default**

It was already strictly superseded before this review started: #113's partition removes
shelf/hide tiles BEFORE Focus is evaluated, so Focus is a silent no-op on any board configured
to shelf, and both write the SAME expansion key with a setter that can never write false — so
once a tile is expanded it stays expanded all session and toggling Focus off and on does not
restore the collapse (O4). It is a global session button with no memory, no test coverage, and
no reason to be a mode: collapsing finished work is not a mode you enter, it is how a planner
should behave. Tidy is Focus, always on, remembered, with an off switch, and it needs zero
clicks to be useful.

*Data:* NONE — Focus was React state only (App.jsx:77-78); it survived neither reload nor sync, so deleting it destroys nothing. focusMode, focusExpanded, showStale and showDone collapse into one `tidyMode` value in localStorage plus a per-tile expand set. The ◎/◉ button is replaced in the same header slot by the ◐ Show/Tidy/Hide cycle. Deleting it kills the shared-state bug outright.

### M11 — Done states stay/shelf/hide (#113, shipped today, untasted)

**HALF-REVERT — the per-tile config SURFACE is reverted outright; the completion ENGINE is kept and promoted. Do NOT revert the commit.**

#113 asked exactly the right question ('this is finished, now what') and answered it in the
wrong place with one value too many. It is buried three levels deep (edit mode → a 20px ⚙ →
scroll to bottom), offered on 10 of 24 types, and structurally UNREACHABLE on check-ins because
TileCheckIn is the only one of 24 renderers whose signature omits onConfig (L19). It stores one
copy per layout, so configuring it once is configuring it never. It silently supersedes Focus
(O4), makes the check-in sink dead work (O6), is itself superseded and mislabelled by the stale
hide (O5), and combined with auto-completion it can put a tile off the board with no recourse
(L18). Its partition code in tileStatus.js, though, is good engineering and becomes Tidy's
engine verbatim. So this is a cheap half-revert: delete a config surface, keep the code. 'shelf'
and 'hide' differed by one row of pixels; dropping 'hide' as a per-tile outcome disarms L18 —
automation can no longer remove something you cannot get back.

*Data:* tile.config.doneBehavior is DELETED from every tile on every page, archived verbatim at page.__legacy.doneBehavior[tileId] first. The ConfigModal 'WHEN FINISHED' block, doneBehavior()'s config read and the per-column Done rail are deleted. VERIFIED: doneBehavior exists on exactly ONE seeded tile in the entire repo — `dinner` (store.js:253, 'hide'), present only on together and weekend. That intent survives without the setting, because a filled Dinner Plan is complete and Tidy sinks it. COMPLETABLE_TYPES stays as-is until #103 lands, extended only by wiring planks and dangles.

### M12 — Check-in completion sink (#35 + #81)

**RETIRED OUTRIGHT — absorbed into Tidy**

It is Tidy, restricted to one tile type, with no control anywhere, no name, no off switch — and
#113 already discards its ordering for any check-in set to shelf or hide, so it is dead work
computed on every render (O6). 'Finished things move to the bottom' is a rule the whole board
should obey, not a special case that reorders check-ins at step 4 so step 5 can throw the result
away. Reordering the board under the user is the least predictable of the eight mechanisms and
the only one with no representation at all. Generalising it deletes ~25 lines of the most
fragile stretch of App.jsx's render.

*Data:* Nothing persisted — the ordering was fully derived, so nothing is lost. Its manual override `_done` stays in store.days, untouched and still read, and #118 makes it authoritative across every predicate — which closes the shipped bug where {_done:true} makes a check-in fullyDone and tileComplete but NOT checkinIsDone, so the #14 reminder still fires for a check-in you explicitly marked done (O9).

### M13 — Stale / dismissed check-in hide (#6 + #35)

**RETIRED OUTRIGHT — nothing replaces it. `_delayMin` is KEPT (it is the reminder snooze, not view state).**

This is the purest subtraction in the design. A hardcoded 60-minute literal, no control
anywhere, applied to one tile type, that HIDES A TILE YOU HAVE NOT DONE, runs BEFORE the #113
partition so it supersedes it for check-ins, and labels finished blocks as 'hidden check-ins' in
its own reveal (O5). Lateness is not finishedness. It hides the one thing a daily planner exists
to show you. The replacement is a rule, not a feature: an unfinished tile is never hidden. A
missed 8am check-in sits there, unfinished, until you finish it or dismiss it. CORRECTION TO
EVERY PROPOSAL IN THE REVIEW: `_delayMin` is NOT dead view state — it is read at App.jsx:130
inside the #14 notification scan (`const eff = sched + (data[t.id]?._delayMin || 0)`), i.e. it
IS the reminder snooze. Deleting its ⏲ writer while leaving the reader running would cost you
the ability to push a reminder back an hour AND leave stale values shifting reminders with no UI
that can explain them.

*Data:* NOTHING IS WRITTEN TO store.days. `_dismissed` is RE-READ as finished, so ✕ now means 'done for today' and tidies away with everything else instead of vanishing into a separate reveal — one rail, not two; the meaning is carried in the rail's per-line reason ('dismissed'), so a future rollup can still tell 'I bailed' from 'I did it'. `_delayMin` is untouched on disk, still read by the reminder scheduler, and the ⏲ glyph STAYS on the tile header; only App.jsx:1182 (the stale-hide reader) is deleted. Every historical day keeps its bytes and its meaning. The 60-minute literal and the '▸ Show N hidden check-ins' reveal with its miscounting label are deleted.

### M14 — Project ▶ collapse (no ticket, store.days._open)

**KEPT — declared explicitly out of scope**

This is tile-internal disclosure — a <details> element, not a view rule. It answers to the tile,
it does not compete for 'which tiles do I see', and folding it in would cost a concept to buy
nothing. Declaring it out of scope BY NAME rather than leaving it uncounted is the point:
anything undeclared comes back as a surprise. PRECEDENCE, STATED (the one thing every proposal
left open): under Tidy, a finished tile shows its one-line header REGARDLESS of _open; expanding
it restores the tile's own _open value. Tidy's expand-set is presentation and lives in
localStorage; _open is per-day and is never written by the view layer.

*Data:* _open stays in store.days, untouched and still read. config.defaultOpen (a boolean, currently invisible in ConfigModal) gets a real control under #103.

### M15 — Guided-AM step-through (#3)

**KEPT, out of scope — but its two disagreeing controls become one**

Same reasoning as M14: tile-internal. But it currently ships TWO controls that disagree — a →/≡
glyph in the tile header and a `mode` dropdown in ConfigModal — with the per-day value
overriding the layout value.

*Data:* data.mode and data.step stay in store.days, untouched. The duplicate ConfigModal dropdown is deleted; the in-tile glyph stays as the single control. The config.mode consolidation is handed to #103 (registry-driven config editors), named rather than silently skipped.

### M16 — Edit mode (✎ Layout / ✓ Done)

**KEPT and renamed 'Arrange', forced onto the rendered page, given a preview. Killing it outright is filed separately and HELD.**

Two proposals wanted it deleted and I am not taking that bet in v1: it is a real destructive-
action gate on a touch device, and replacing it means drag handles on a live board where
finished tiles may have tidied away — sound in theory, untested in your hands, and twitchy-on-
mobile is a real failure mode. What I AM fixing is its actual sin: it short-circuits five of the
six render steps, so every done behavior, every tab assignment and every time window is
invisible at the exact moment you configure it, and every newly added tile is invisible the
moment you press ✓ Done. Renaming matters too — 'Layout' was a noun colliding with the
container.

*Data:* None — React state. Renamed Arrange. Every mutation carries the RENDERED page key (#117), so the wrong-board write class becomes inexpressible rather than fixed. Gains a READ-ONLY preview that invokes the existing view-mode render path with editMode false, behind one 'back to arranging' control — render-path reuse, not new interaction design, so there is no question about what dragging a collapsed tile means. Ticket #130 (kill it entirely) is filed and held: it can be dropped without unpicking the model.

### M17 — Mise-en-place position enforcement (#39)

**RETIRED OUTRIGHT (verified at store.js:270-282, resolving the brief's U6 first single-source claim)**

A one-time correction wearing a permanent hook: it rewrites layout.columns order IN PLACE on
every load, every syncDown and every Restore, silently undoing a deliberate drag, and it also
force-renames 'AM Routine'. A migration that runs forever is not a migration — it is an unnamed
rule with no UI and no off switch that overrules your own hands, and it is why a Restore cannot
restore a state where `morning` sits elsewhere. L9 warns explicitly against shipping another
one; this design ships zero permanent enforcers.

*Data:* None — it only reordered. It runs ONE LAST TIME inside migratePages, then the enforcer is deleted. Whatever order each page has at that moment is frozen as truth and thereafter only you change it. Its sibling one-shot data fixes (#38's freelist→gcal type conversion) are KEPT — those change a tile's type once and are genuinely idempotent repairs, not layout opinions.

### M18 — Auto-check engines (field-links C + legacy config.rules)

**KEPT — hoisted app-wide and made honest. Unifying the two engines is named as OPEN, not silently skipped.**

Not itself a visibility control, but it DEFINES 'finished', which is now the single trigger for
Tidy — so a link you add can take a tile off the board and nothing in the Links modal says so.
It is also per-layout, so switching pages makes every auto-check silently vanish (O10), and your
3 day-types would cost every link rebuilt per board. HONEST GAP: two engines survive —
config.rules (per checklist item, in ConfigModal) and layout.links (in the Links modal) — and
'tick this box when that tile is done' is expressible in both. That is genuinely 'two ways to do
the same thing' left standing in the one domain that now drives whether a tile leaves the board.
I am not merging them in this lane because the merge belongs with #103's registry-driven config
consolidation, but it is named here rather than hidden.

*Data:* layout.links → hoisted to an app-wide set, deduped across layouts by target+sources+mode, and mirrored back into each page's nested `links` field for old-bundle safety (the on-disk home stays nested, so nothing new is exposed to the top-level whitelist). The migration seeds the union from every existing layout, so no link you ever built is lost and links stop being invisible on 6 of your 7 boards. tile.config.rules untouched. The Links editor gains one line stating the consequence inline. #118 (folding #115) is a hard prerequisite so the tile and the predicate stop evaluating the same rules against different days (O8), which also lets the scoped tileStatus.js:63-77 workaround and its false comment be deleted.

---

## The interface

```
THREE CONTROLS IN THE HEADER. ONE SCREEN BEHIND THEM. Today's header carries a 7-option <select>, ◎ Focus, ⊞ Tabs, 📅 Day-types, ✎ Layout, ✨ Setup, and five more glyphs once you enter edit mode — fifteen touchpoints across the app. This is four places total: the board, the library, a tile's settings sheet, and the Links editor.

─── THE BOARD ────────────────────────────────────────────────────
  Digital Daymaster      [ Solo ▾ ]  auto · Wed–Fri     ◐ Tidy   ✎ Arrange
                              │
                              └─ THE WHY-BADGE. States in English why this
                                 page is up. No surface answers that today.

  ┌── left ─────────┬── center ──────────┬── right ────────┐
  │ Priorities      │ Mise-en-place      │ Calendar        │
  │ Ideas           │ Dinner Plan        │ Daily Numbers   │
  │ ─────────────── │ ────────────────── │ ─────────────── │
  │ ▸ AM Check-in ✓ │ ▸ Planks ✓         │ ▸ Music Log ✓   │
  └─────────────────┴────────────────────┴─────────────────┘
    finished: one line, sunk to the foot of its own column, click to expand.
    THE GRID TEMPLATE IS FROZEN to the page's declared columns — the board
    never reflows under you, and an emptied column shows the same hint
    however it emptied (fixes L20, where a tab-emptied column explains
    itself and a finished-emptied column renders a bare stub).

  ──────────────────────────────────────────────────────────────
  ▸  Set aside (6)        4 finished · 1 dismissed · 1 delayed
  ──────────────────────────────────────────────────────────────
    ONE rail at the foot of the board. Every line prints its reason
    ("finished 8:41" / "dismissed" / "delayed +1h"). Deliberately NOT
    called "Done" — a missed or dismissed check-in is not done, and
    today's reveal counts finished blocks as "hidden check-ins".
    Today's FOUR reveal surfaces become this one.

  ◐ cycles: Show all → Tidy (default) → Hide done.  Device-local,
  localStorage, never synced — so it is structurally immune to the
  merge whitelist that has been eating store.dayTypes since #105.

  AN UNFINISHED TILE IS NEVER HIDDEN. No 60-minute clock, no per-tile
  setting, no mode to remember to turn on.

─── THE PICKER (tap "Solo ▾") ─────────────────────────────────────
  ┌─ Pages ────────────────────────────┐
  │ ● AM Focus        Mon–Fri 5–11am   │
  │ ● Solo            Wed–Fri     ← now│
  │ ● Together        Mon, Tue         │
  │ ● Family Weekend  Sat, Sun         │
  │ ● Daily           always           │
  │ ────────────────────────────────── │
  │ ○ Solo v2         off              │  off pages greyed, still clickable
  │ ────────────────────────────────── │
  │ ⚙ Manage pages…                    │
  └────────────────────────────────────┘
  Clicking any row shows it NOW — including an off page. That pick is
  DEVICE-LOCAL, expires at the day roll, and never syncs.

─── MANAGE PAGES — the one power surface ──────────────────────────
  ┌─ PAGES ──────────────────────────────── + New page ─┐
  │ ⠿ AM Focus       Mon–Fri 5:00–11:00   11 tiles  ●  ⋯│
  │ ⠿ Solo           Wed Thu Fri          19 tiles  ●  ⋯│
  │ ⠿ Together       Mon Tue              12 tiles  ●  ⋯│
  │ ⠿ Family Weekend Sat Sun              11 tiles  ●  ⋯│
  │ ⠿ Daily          always · catch-all   23 tiles  ●  ⋯│
  │ ─────────────────────────────────────────────────── │
  │ OFF (3) — kept, editable, never comes up            │
  │   PM Wind-down · Fitness · Solo v2   [Publish ▾]  ○ │
  │ ─────────────────────────────────────────────────── │
  │ ⚠ Together and AM Focus both claim Mon 5–11am.      │
  │   AM Focus wins — it is higher in the list. [Fix]   │
  │ ─────────────────────────────────────────────────── │
  │ ↩ Restore pre-redesign pages (saved 2026-08-24)     │
  └─────────────────────────────────────────────────────┘
  ⠿ DRAG ORDER IS THE PRECEDENCE. One gesture, one meaning, visible.
  "Why am I on this page" answers to "it is #2, and #1 didn't match."
  No computed specificity, no cascade, no formula to hold.
  ⋯ = Show now · Fork · Rename · Turn off · (Delete, rare path)
  Publish ▾ = "Publish" | "Publish, replacing Solo" (switches the
  parent off in the same action — the safe swap, nothing deleted).

─── THE WHEN EDITOR (expand a row) ────────────────────────────────
  Show this page:   ( ) Always
                    (•) On these days      ( ) Days + hours
     [S] [M] [T] (W) (T) (F) [S]      from [05:00] to [11:00]
     → Shows Wed, Thu, Fri from 5:00 to 11:00am.
     → Beats "Solo" on those mornings — it is above it in the list.
  THE FIRST EDITOR layout.days HAS EVER HAD. Today the only writer in
  the entire codebase is a hardcoded migration constant (store.js:438).

─── PREVIEW AS ────────────────────────────────────────────────────
  👁 [ Tue ▾ ] [ 07:30 ▾ ] [ nothing done ▾ ]
  The real board, drawn by the SAME resolver the live app calls, so it
  cannot drift. This single control replaces the eight surfaces it
  takes today to answer "what will I see Tuesday morning?" — five of
  them behind edit mode, one that does not exist in the UI at any price.

─── THE READY-CHIP (no preemption) ────────────────────────────────
  When the clock crosses a window edge the board does NOT swap.
  A chip appears:  [ Solo is ready ↻ ]   One tap takes it.
  This also houses #94 Day Close and #95 Morning Brief: they become
  off-schedule pages surfaced by that chip at their hour, with a
  "done — back to my board" exit. They never seize the board, and the
  When grammar never needs a completion term. (#108's end-of-window
  nudge is absorbed here and re-filed; tabs do not survive.)

─── ARRANGE (renamed from edit mode) ──────────────────────────────
  ◀ Pages   Arranging: Solo — the page you're looking at.  [👁] [Done]
  Same page, same tiles, drag / ← → / ✕ / ⚙ / + Add tile / 🔗 Links.
  Every mutation carries the RENDERED page key, so an edit cannot land
  on another board and 🗑 cannot delete the board you are not looking
  at. [👁] is a READ-ONLY preview reusing the existing view render path
  — so a done-state is never invisible where you configure it.
  A tile whose id sits on more than one page shows a chip:
  "shared with Together, Family Weekend" — computed by scanning pages,
  which is more truthful than a fork-parent chip and covers `dinner`
  correctly (verified: dinner is NOT in `default`).
```

---

## Migration plan

### Phase step 1

PHASE 0 · TRUST — ships alone, before anything else, and is confirmed on every device before
Phase 3 leaves the kitchen. (a) #116: bump public/sw.js VERSION 'dm-v1' → 'dm-v2', add
registration.update() on visibilitychange plus a 'new version — reload' toast, and surface a
build stamp in the ☰ menu (vite define). CORRECTION TO THE BRIEF, VERIFIED THIS SESSION: L7 is
FALSE. public/sw.js is network-first for navigations with a cached-shell fallback and
skipWaiting on install, and only /assets/* is cache-first, with an explicit source comment
saying it is 'deliberately conservative so it can never strand the live single-user app on a
stale build.' So the bump flushes stale hashed assets but CANNOT reach a device nobody opens.
The gate is therefore Rob confirming the build stamp by eye on each device — NOT a version field
(store.version is read by no code path and ratchets DOWN to the constant 6) and NOT a device
registry (a registry parked in store.layouts.__meta is clobbered wholesale by the layouts
assignment, is denominator-blind to devices that never ran the pre-flight, has no retirement
path, and renders as a junk option in the live header select). (b) #100: refresh the token
before expiry; move `syncedDownRef.current = true` OUT of the finally so a thrown load stops
opening the save gate; make saveToDrive refuse the create-branch whenever a load failed this
session, so a second daymaster-data.json can never be minted behind an auth failure. This closes
L4 and it is a hard gate — an expired token is exactly what makes loadFromDrive throw, which is
what mints the duplicate file whose empty layouts then win the wholesale merge while #63
consolidation trashes the good copy. Running a one-shot rebuild of store.layouts over that is a
sequencing error.

### Phase step 2

PHASE 1 · FIX TODAY'S BOARD — the SAFE STALL POINT. Three tickets, zero model change, zero
migration, zero new concepts, independently tasteable. If the lane dies here Rob is still
strictly better off than tonight; no other sequencing in the review has this property and it is
the single most important structural choice in this plan. (a) #117: mutateLayout takes the
RENDERED page key as an argument; delete the hardcoded `s.activeLayout||'default'`
(App.jsx:345). This fixes L15 across addTile, removeTile, saveTileConfig, onConfigPatch,
moveTile, moveTileAcross, addLink, removeLink and every tab mutator, plus deleteLayout ('🗑
deletes the board you are not looking at'), renameLayout and the #14 reminder scan. Note it is
worse than filed: saveTileConfig and onConfigPatch route through the same path, so CONTENT
writes — project items, the Ideas log — land on the wrong board too. Ships with a regression
test that mounts the app on a Saturday with day-types on and asserts the tile lands on the
rendered board. (b) #118: one completion answer — effectiveDayData overlays legacy config.rules
as well as field-links (folds and closes #115); tiles RENDER against the overlay so a checkbox
on screen and the predicate can never disagree (O8); one tileComplete signature at one call site
(O7); delete the scoped tileStatus.js:63-77 workaround and its false comment. PLUS a one-line
fix: `if (data._done === true) return true;` at the top of checkinIsDone, so the #14 reminder
stops nagging about a check-in you explicitly marked done. DO NOT repoint the reminder scan onto
checkinFullyDone — rules.js:196-198 states the OR predicate's intent in words ('once you've
engaged at all, stop nagging'), and the strict predicate is an AND over planks && food &&
priorities, so repointing would make the nag fire at a check-in that is already two-thirds
filled. (c) #119: nest the day-types flag (e.g. store.layouts.default.__dayTypes) so the top-
level whitelist stops eating it. With #117 landed, Rob's three day-types resolve correctly for
the first time — the biggest day-one win available, for one line. Phase 3 deletes the flag
entirely.

### Phase step 3

PHASE 2 · MAKE SMALL PAGE OBJECTS SURVIVABLE — a hard gate on the library, not an optional
follow-up. #120: stamp `_m` IN MEMORY at edit time (today __savedAt is stamped on the Drive
payload only, so the local stamp always lags — L3) in ALL FIVE layout writers: mutateLayout PLUS
switchLayout, duplicateLayout, renameLayout and deleteLayout, which bypass mutateLayout entirely
and write s.layouts directly (App.jsx:441-484). Missing those means Rename silently reverts and
Delete never sticks. mergeStores unions `layouts` by key with newer `_m` winning; ON A TIE OR
WHEN EITHER SIDE IS UNSTAMPED it falls through to today's rule (newer top-level __savedAt takes
that page), so per-page merge is a strict refinement and an old bundle's edits are never
silently discarded. The top-level whitelist is otherwise untouched — nothing new is added to it,
by design. AND `importBackup` re-stamps `_m` on every imported layout: it deliberately sets
`imported.__savedAt = Date.now()` today with an in-code comment explaining why, and a per-key
merge silently voids that — every backup taken to date would restore ZERO layouts against a
stamped remote. Restore is the last recovery net that works (Drive version-history restore is
documented as not working here), so this is not optional. Ships with tests for every
stamped/unstamped combination and a two-store round-trip. Bonus the review noticed and no
proposal claimed: a key-union merge largely defuses L4's layout loss too, since an empty side
contributes no keys. This ships BEFORE the library because a library of more, smaller, more
frequently-edited objects makes the wholesale clobber bite more often — shipping the library
first inverts the risk on a design whose headline promise is 'no page can be lost.'

### Phase step 4

PHASE 3 · THE MODEL — eight tickets. #121 pages.js: resolvePage + one 60s ticker (replacing the
30s tabNow and the 60s clock) + one ref-diff release effect + a STATUS-FILTERED fallback chain
that can never land on an off page + a pinned, undeletable, always-matching fallback page so the
resolver can never return null. Deletes daytypes.js entirely, tabs.js's resolver,
visibleColumnsForTab, ALL_TAB, hasTimeWindows' ticker gate and the empty-column drop; keeps
parseTime and the window math verbatim. #122 migratePages: shape-guarded PER PAGE on `page.live
=== undefined` (never version-gated), deterministic, fixpoint-tested including on a MIXED store
and on the Restore path. Order: (1) ESCROW — snapshot the raw localStore AND the raw Drive
payload SEPARATELY, BEFORE mergeStores runs, to a per-device localStorage key keeping the last
three, plus a one-click download; (2) every layout becomes a Page at its original key with
columns untouched, gaining live/when/order/forkedFrom/_m; (3) `default` is FORCED live and is
the pinned catch-all — do NOT retire it (App.jsx:548-552 argues the case in a comment: 'without
this gate, migrateLayout seeding the boards would silently move an existing user off the board
they built the moment they next opened the app — a change that should be theirs to make, not a
migration's'; and together∪solo∪weekend covers all 7 weekdays, so retiring it leaves the
fallback clause dead and creates uncovered-hour holes); (4) `live` derives from KEY IDENTITY
ONLY — live iff the key is store.activeLayout, OR carries days, OR is not a known PRESET_SEEDS
key, OR is `default`. Never from comparing tile-config contents, which drifts across releases
and reads TRUE for every preset on the Restore path; (5) layout.days → when.days via the
existing normalizer; (6) tabs → deterministically-keyed pages, bare tabs contribute nothing (no-
op on Rob's store); (7) links hoisted to the app-wide union, mirrored back nested; (8)
doneBehavior deleted, archived at page.__legacy; (9) the #39 hoist and the AM-Routine rename run
ONE LAST TIME then the enforcers are deleted; (10) activeLayout written once at the complete
fallback page and frozen; (11) delete store.dayTypes; (12) THE ONE QUESTION (see below). Ships
with #122b, a round-trip-tested 'undo the page migration' command — 'reversible in principle
from __legacy' is not a rollback plan. #123 the board: one Tidy partition, the Set-aside rail
with a reason per line, frozen grid template, empty-state hint computed AFTER the partition,
_dismissed re-read as finished INSIDE the shared predicate, _delayMin and its ⏲ glyph KEPT,
planks and dangles wired to their already-written-but-unused '@allchecked' predicates (Pushups
and Counter deliberately NOT wired — their only predicates are '@any' and '@positive', which
would collapse a running tally on the first set of the day). Ships with the interaction tests
that have never existed for Focus, the sink, the stale hide or any interaction between them.
#124 the library. #125 Preview-as + why-badge + ready-chip. #126 tile settings hygiene: allow-
list the ConfigModal generic renderer (ends the raw-tab-id leak), pass onConfig to TileCheckIn
(the only one of 24 renderers whose signature omits it), move the check-in schedule out of its
regex-parsed TITLE into config.time. #127 onboarding seeds one live page. #128 dead-code sweep +
vocabulary. ALSO DELETE THE PRESET SEEDER, PRESET_SEEDS and the #39 hoist in this phase — but
harvest SUGGESTED_BUCKET (tabs.js:107, a complete tile-type→time-of-day partition table) into
the migration before deleting tabs.js.

### Phase step 5

THE ONE MIGRATION QUESTION — and the answer to the actual complaint. At the end of migratePages,
ONE screen, ONE question: 'AM Focus is an 11-tile morning board you already have. Turn it on for
weekday mornings, 5–11am?' [Yes] [No]. VERIFIED BY EXECUTION against a fresh store: am-focus =
11 tiles, pm-wind = 8, default = 23, solo = 19 — and am-focus/pm-wind are built from THE SAME
TILE IDS as default. Same ids means same per-day data, so scheduling them forks nothing,
duplicates nothing, and costs zero authoring. Yes → am-focus gets when:{days:[1,2,3,4,5],
from:'05:00', to:'11:00'} and sits above Solo/Together in the order; Wednesday 8am goes 19 tiles
→ 11. This is the single highest-value item in the whole synthesis and NO proposal in the review
found it — all four switched am-focus and pm-wind OFF as '#33-era artifacts'. They are artifacts
of an earlier correct instinct; the model just never had a way to schedule them. It is opt-in
rather than silent because the codebase's own comment (App.jsx:548-552) argues correctly that
moving Rob off the board he built should be his change to make, not a migration's.

### Phase step 6

PHASE 4 · HELD, fire only on evidence. #129 per-tile time windows (`slot.when`): attach the same
When grammar to a tile inside one page, so a board slices itself instead of forking. This is the
named answer if flat pages prove to duplicate too much — it is the right architecture and the
wrong ergonomics until it has a seeder (anonymous per-slot clauses cost ~2 inputs per tile, ~38
to slice Solo, versus suggestTimeTabs' one click today; SUGGESTED_BUCKET harvested in Phase 3 is
that seeder). Fire only after six weeks of use says it is needed. #130 kill Arrange entirely:
defensible, unpiloted, and the one ticket droppable without unpicking the model.

### Data safety

SIX GUARANTEES, strongest first. Three are STRUCTURAL — the code cannot reach the thing, rather
than carefully avoiding it. (1) PER-DAY DATA IS NEVER OPENED. migratePages imports nothing from
the days module; its only writes are to store.layouts. Enforced by a test that recursively
Object.freeze's store.days and runs the migration three times on a fixture with real per-day
content, plus a JSON.stringify deep-equal before/after. L10 (applyStore writing today's empty
day row on every load) is therefore irrelevant to this migration. (2) NO TILE ID IS MINTED, RE-
KEYED OR NAMESPACED. Tile id is the ONLY join between the view layer and per-day data
(store.days[date][tileId] carries no layout/page/tab reference), so re-keying would be an
irreversible history amputation. Ids pass through untouched — History keeps rendering every past
day, and every _done/_dismissed/_delayMin/_open/mode key stays meaningful. Tab-derived pages
deep-clone tiles WITH their ids exactly as ⎘ Duplicate does today; sharing per-day data is the
intended behavior (it is why Together and Family Weekend show the same dinner). EXPLICITLY CUT:
any 'start fresh copies, new empty history' option that would mint a new id for an existing tile
— a modal cannot be the escape hatch for the invariant every other guarantee rests on. (3) NO
COLUMN IS EVER REBUILT. The migration only ADDS keys to layout objects and deletes five NAMED
keys (layout.days, layout.tabs, config.tab, config.tabs, config.doneBehavior). Therefore the
real user content living INSIDE store.layouts — a persisted Project's config.items and
config.title (tiles.jsx:137,140), TileIdeas' config.ideas (the entire running AI-Ideas log,
tiles.jsx:1103), TileMsTodo's config.listId (tiles.jsx:1262) — is structurally unreachable by
this code. This is the trap in 'store.days is off limits': the off-limits region is not where
all the user's content lives, and a clean-slate rebuild of store.layouts would destroy these. It
is also why I refuse the clean slate the brief permits. RELATED: because duplicateLayout deep-
clones ids and saveTileConfig only writes into the active layout, divergent copies of one id's
content may already exist — the migration reconciles them explicitly (longest-list-wins or
union) and SURFACES the reconciliation, rather than letting the first mirrored write decide
silently. (4) NO PAGE IS EVER DELETED. Off is not deletion. A hand-built layout cannot be lost
because nothing removes layouts, and the re-seeder that used to resurrect factory-fresh copies
is deleted in the same release — and is harmless even if a stray copy survives, because it can
only resurrect an ABSENT key and no key is ever absent. This also protects History from the
failure where retiring the last page holding an id makes that history invisible though the bytes
are intact. (5) TWO INDEPENDENT UNDOS, TAKEN AT THE RIGHT MOMENT. The raw localStore and the raw
Drive payload are snapshotted SEPARATELY and BEFORE mergeStores runs — not after, which would
faithfully preserve already-clobbered state — to a PER-DEVICE localStorage key keeping the last
three, plus a one-click download offered before the first write. Every device that migrates
writes one, not just the first. Chosen deliberately because Drive version-history restore is
known not to work on this app (it loses the merge to the cached local copy). Plus page.__legacy,
nested inside each page so it rides mergeStores untouched, and a round-trip-tested un-migrate
command. (6) A TRUE FIXPOINT, GUARDED BY SHAPE, PER PAGE. `page.live === undefined` — never
store.version, which is read by no code path and actually ratchets DOWN (store.js:454 assigns
the constant 6, so a store at version 9 comes back as 6). Per-page rather than per-store, so an
old bundle's ➕ New layout is upgraded without re-deriving decisions on pages already migrated.
Tested for idempotence on a MIXED store and on the Restore path, so importing a pre-migration
export re-migrates deterministically. RESIDUAL RISK, NOT WAVED AWAY: L2's wholesale layout
clobber is only mitigated, not closed — see oldBundleBehavior.

### An old bundle on a second device

VERIFIED AGAINST SOURCE, STEP BY STEP. (1) IT RENDERS — NO CRASH. store.layouts is still present
at the same top-level address with name/columns/tiles intact, so App.jsx:571 resolves a real
layout and App.jsx:634 never dereferences null. This is the single reason I refused to rename or
move the top-level key, and it is why any competing design that reaches for store.pages /
store.drafts / store.activation is dead on arrival (L6). Tombstones, if #124's rare-path Delete
is ever used, MUST carry three empty columns — a layout object with no `columns` is present-and-
truthy, so the App.jsx:571 fallback does not fire and the old bundle TypeErrors at
visibleColumnsForTab. (2) THE NEW FIELDS SURVIVE THE ROUND TRIP. mergeStores whitelists TOP-
LEVEL keys only and takes `layouts` WHOLESALE (re-read this session: `layouts:
layoutWinner.layouts`), so nested keys are opaque to it — when, live, order, forkedFrom, _m and
__legacy all ride an old bundle's JSON round-trip untouched. This is the load-bearing property
of the entire design and it is why the model needs ZERO sync.js changes to be durable. (3) DAY-
TYPE ROUTING GOES DEAD, WITH NO REGRESSION. layout.days is gone, so the old bundle's
layoutForDay finds no claimant and falls back to store.activeLayout — which the migration wrote
once, at the complete fallback page, and froze. Since store.dayTypes was ALREADY being destroyed
by every mergeStores, a Drive user's old bundle was never day-typing anyway. Net change: none,
and it lands every day on a stable 23-tile board where everything is visible. (4) TABS GO AWAY,
DEGRADED-BUT-SAFE. layout.tabs is gone, so activeTab falls to the ALL pseudo-tab and every tile
renders. IT SHOWS MORE, NEVER LESS. (5) DONE STATES GO AWAY, SAME DIRECTION. config.doneBehavior
is gone, so doneBehavior() returns 'stay' for everything and nothing is shelved or hidden.
Again: more, never less. One visible consequence — the seeded `dinner` tile stops auto-hiding
there. (6) THE RE-SEEDER FINDS NOTHING TO DO. This is the whole reason retirement tombstones
rather than deletes. The old migrateLayout re-adds any ABSENT PRESET_SEEDS key factory-fresh and
appends it at the END of key order, scrambling both the activation tiebreak and deleteLayout's
fallback (L8). After migration all seven keys still EXIST — some merely live:false — so `if
(!store.layouts[seed.key])` is false for every one. Verified this session: the loop writes back
to store.layouts[seed.key], the SAME key, so it replaces rather than duplicates; it cannot mint
a second weekday claimant. (7) IT WILL REORDER ONE TILE. It re-runs the #39 hoist and the 'AM
Routine' rename on every load. Cosmetic, one drag to fix, self-limiting — and the reason the new
bundle deletes the enforcer rather than fighting it. (8) PER-DAY CAPTURE STILL MERGES CORRECTLY
IN BOTH DIRECTIONS. mergeDay's tile-granular union is the same function on both bundles, so
nothing you record on the old device is lost. (9) THE ONE REAL DANGER, STATED PLAINLY: L2.
VERIFIED at App.jsx:160-172 that the ORDINARY returning-user path is mergeStores(localStore,
driveData), and after the new device migrates and saves, the Drive copy is the newer one — so an
ordinary old-bundle session ADOPTS the migrated layouts and round-trips the nested fields
intact. The dangerous case is narrower: the old device edits OFFLINE or within 2s of a save and
never syncs down first, so its local __savedAt is newer; it then takes the layouts section
wholesale and can drop a page created elsewhere. That is pre-existing (L2/L3), it is NOT created
by this design, and Phase 2 makes new↔new merges strictly better than today — but nothing makes
new↔unstamped safe. There is one further transient path I will not pretend away: sw.js falls
back to the cached shell when a navigation fetch throws, and /assets/* stay cache-first until a
new SW activates (which needs network), so a launch on a captive portal or flaky connection can
run old code that later regains connectivity. MITIGATIONS, in order and honestly ranked: Phase 0
shipping alone and confirmed by build stamp on every device; the pre-migration escrow on every
device; Phase 2's per-key merge; and a one-time 'open Daymaster on your other devices' prompt
after migration. The honest summary is that the MODEL degrades safely on an old bundle and the
SYNC does not, and that was already true before I touched anything.

### Rollback

FOUR LAYERS, in the order you would reach for them. (1) THE ESCROW SNAPSHOT — the raw localStore
and the raw Drive payload, captured SEPARATELY and BEFORE mergeStores runs, to a per-device
localStorage key holding the last three, with a one-click 'Download pre-redesign backup' offered
on the migration screen before the first write and permanently in Manage Pages. Device-local and
never synced, so a clobber on one device cannot take out the other's snapshot — this is the fix
for the write-once, first-device-only escrow that every proposal shipped. Chosen because Drive
version-history restore is known not to work here. (2) THE UN-MIGRATE COMMAND (#122b) — a Manage
Pages action that reconstructs layout.tabs, config.tabs/.tab and config.doneBehavior from
page.__legacy and strips the page fields, verified by a round-trip test. __legacy is NESTED
inside each page, so it survives mergeStores and cannot be separated from the thing it
describes. It ships in the SAME release as the migration, behind a confirm, with an undo-ring
entry — 'reversible in principle' is not a rollback plan, and a one-tap lossy rewrite with no
net is worse than having no rollback at all. It is honest about its limit: pages created AFTER
the migration have no pre-migration representation, so the command warns and lists them before
proceeding. (3) OFF IS NOT DELETION — for anything short of a full revert, the fix is one
toggle. No page is ever removed, so 'I broke my board' is recoverable by switching a page back
on, and every page-level destructive action (Turn off, Publish-replacing, Delete) pushes onto
#99's undo ring with a named label. (4) THE PHASE BOUNDARY ITSELF IS THE REAL ROLLBACK. Phases
0–2 change no model and can simply be kept. Phase 3 is the only phase with a migration, and it
does not begin until the build stamp is confirmed on every device. If Phase 3 goes wrong,
reverting to a Phase-2 bundle leaves a store whose only difference is nested fields that a
Phase-2 bundle ignores — which is the same property that makes the old-bundle story work.

---

## Rejected alternatives

### Live inheritance — a Page that is another Page minus X (the `pages` proposal)

**Rejected:** Two reasons, one conceptual and one fatal to the schedule. Conceptually it means
one edit silently changes a page you are not looking at — the exact failure class this entire
review exists to kill — and it imports the Figma-components support burden ('did I just edit
this page or its parent?') into a single-user planner. Fatally: its own author deferred
inheritance to a second release that 'may never be justified,' so the release that actually
SHIPS is the snapshot one — 65 tile entries across 4 pages for 27 distinct ids, 21 of 27
duplicated, every per-tile setting copied per page. That is verbatim the #113 defect the same
document condemns, at higher multiplicity, in the only committed release. Two of its twelve
first-release tickets were also specified in second-release vocabulary and were literally
unbuildable — and one of them was the only decluttering action in the document. Its migration
additionally did precisely what App.jsx:548-552 warns against in a comment, silently moving the
user off the board they built.

**Grafted:** Preview-as [Tue][7:30] wired to the SAME resolver the board calls (the single
highest-value affordance anyone proposed — all three judges said build it whatever wins). The
why-badge in the header. The __legacy archive nested inside the page plus an explicit round-
trip-tested un-migrate. 'Refuse to reshape a hand-built board' as the default when a migration
meets data it does not understand. Status-filtering the resolver fallback. And the correction
that 'shared with…' is a property of the TILE ID, not of inheritance — computed by scanning
pages, which is more truthful and covers `dinner` correctly (verified: dinner is NOT in
`default`, so the inheritance model got its own flagship example wrong).

### A normalized global tile store (store.tiles keyed by id, pages hold references)

**Rejected:** This is the better data model and I lost the argument on the merits — it fixes
config divergence at the root, makes forks free, makes history survive page retirement, and
turns HistoryView's union hack into the actual model. It requires a new TOP-LEVEL key, and
mergeStores is a whitelist returning exactly five keys (verified this session at sync.js:72-78)
that destroys everything else — which is precisely why #105's dayTypes flag has been evaporating
on every sync since it shipped. An old bundle also cannot read it without hard-crashing. Nesting
every new field inside store.layouts[key] is what turns 'a second device destroys your store'
into 'a second device shows a stale board and reorders one tile.' I traded the better model for
a survivable rollout and that is the single most attackable decision in this document.

**Grafted:** The insight behind it, applied where it is free: links are hoisted to an app-wide
set (mirrored back nested for old-bundle safety) so they stop evaporating when you switch pages;
content-bearing tile config is reconciled by tile id at migration rather than letting the first
write decide; and the 'shared with…' chip makes 'tiles are global, pages are views' visible for
the first time. If the airlock is ever confirmed on every device with no offline stragglers,
this is the design to revisit.

### A second Drive file for the view model (the `rules` proposal)

**Rejected:** It buys provable isolation from old bundles — findDataFiles filters on the
filename, so old code can never see the view model. But it doubles every failure mode on a sync
layer that already carries a wholesale layout clobber, an offline stamp lag, a duplicate-file
path and a live ~60-minute auth bug, and a data-file save that succeeds while a view-file save
fails leaves per-day data referencing tiles the view model has not heard of. Decisively, its
stated premise was L7 — that the PWA can pin a device to an old bundle indefinitely — and I
verified that is false: sw.js is network-first for navigations with skipWaiting on install. The
most expensive and riskiest part of that design was chosen to insure against a risk that does
not exist in the form claimed. Its own adversarial pass then found the rollback snapshot stored
in a NEW TOP-LEVEL KEY, reproducing verbatim the self-deleting-flag bug the design cited as its
own motivation.

**Grafted:** Order-is-the-precedence rendered as a drag-orderable list. The pinned, undeletable,
always-matching fallback page. One reveal rail that prints its reason per line, renamed away
from 'Done'. `keep` / Show-all as an explicit off switch. The ready-chip (an automatic change
never preempts) and, with it, the correct home for #94 Day Close and #95 Morning Brief as off-
schedule pages surfaced at their hour with a 'done, back to my board' exit — so the When grammar
never needs a completion term. And `slot.when` itself, kept as the documented, held escape hatch
(#129) rather than shipped, because its own fitness pass proved it deletes the one-click
suggestTimeTabs seeder and costs ~38 inputs to slice a single board.

### 'Trim by evidence' — auto-suggest tiles to remove based on 30 days of per-day activity (the `progressive` amendment)

**Rejected:** Right instinct, verified backwards, and it is a new irreversible deletion surface
reaching exactly the content the rest of the design is proud of being unable to touch. Five tile
types write NO per-day data ever: TileNumbers takes no onChange prop at all (tiles.jsx:699, it
derives from effectiveDay), and TileGcal, TileNotionLinks, TileMsTodo and TileEmbed contain no
onChange calls. TileIdeas writes solely via onConfigPatch into config.ideas. So Trim would hand
Rob 'Today's Calendar', 'Daily Numbers' and the entire running AI-Ideas log as his top removal
candidates on every page forever, while never once flagging `quote`, which auto-writes a fetched
quote daily and is pure decoration — backed only by an 8-second session-only undo ring, and
computed over unpadded Y-M-D day keys that break at every month boundary.

**Grafted:** Its GOAL — automate the decluttering instead of building a settings screen for it —
delivered from data that is actually true: scheduling the 11-tile am-focus board that already
exists and already shares every tile id. Also grafted from the same proposal: the P0–P3 interim
gate (all three judges called this the best sequencing artifact in the review), 'an unfinished
tile is never hidden' verbatim, the one-line checkinIsDone._done fix instead of repointing the
reminder scan, the correction that _delayMin is the reminder snooze and not view state, the
read-only Arrange preview reusing the existing render path, the frozen grid template, and
deterministic tab-page keys with no bare-tab drafts.

### Classifying all 24 tile types into behavior tiers (completable / reference rail / journals)

**Rejected:** Proposed as the fix for Tidy only reaching 10 of 24 types, and killed by its own
concepts adversary. It keys runtime visibility to `family`, a field that until now was pure
picker decoration — so 'Text Prompt' and 'Notes' sit side by side in the same swim lane, both
free-text, both family:'capture', and one tidies away while the other never does, with nothing
on screen to explain why. That is the owner's original complaint reproduced one level down, at
the tile. The 'reference rail' is additionally unconditional, uncontrollable and type-keyed,
which is structurally identical to the check-in sink the same document retires as a sin.

**Grafted:** The half that is real: wire the completion predicates that are ALREADY WRITTEN AND
UNUSED — planks and dangles, both '@allchecked over four slots', listed in the brief's §7 as
dead schema fields with no tileComplete case. That takes Tidy from 10 to 14 of 24 types for
about twelve lines. Pushups and Counter are deliberately left alone (their only predicates are
'@any' and '@positive', which would collapse a running tally on the first set of the day). Then
STATE PLAINLY which tiles never tidy. Honest omission beats an invisible taxonomy.

### Per-page Keep/Tuck — the winning proposal's own answer to capability 7

**Rejected:** This is the one place I overruled the panel's winner. A rule per page is the same
shape as the #113 defect that proposal itself convicts ('per-tile-per-layout, so the same module
needs configuring N times') — it just answers the question once per page instead of once per
tile. And its migration derives the default from tile.config.doneBehavior, which I verified
exists on exactly ONE seeded tile in the entire repo (`dinner`, present only on together and
weekend). That derivation yields Together=Tuck, Weekend=Tuck, Solo=Keep, Daily=Keep while the
same release deletes Focus mode — so Wed/Thu/Fri, the three heaviest days, would ship with 19
tiles, nothing tidying, and one FEWER clutter control than today. A day-one regression on the
founding complaint, caused by reading intent from noise on a tile that is not even on the board.

**Grafted:** Everything else from it — it is the spine of this recommendation. Tidy instead
becomes ONE device-local, app-wide control in localStorage: strictly fewer decisions (one, ever,
versus one per page), it removes a field from the Page object entirely, and localStorage makes
it structurally immune to the merge whitelist. Judge 1 explicitly recommended testing this
substitution before the ticket was written; the doneBehavior grep settles it.

---

## Honest risks

- FLAT PAGES COPY; TABS FILTERED. This is the one structural gap and I am not going to hide it.
A fork is a snapshot — adding a tile to Solo does not add it to a Solo Evening page, and each
page carries its own copy of every tile's title, count, accent and auto-tick rules. Section 04's
am-focus finding dodges this for YOUR case because the morning boards already exist and share
ids, but it does not dodge it in general. If you ever want morning and evening slices of all
three day-types, that is six pages to hand-maintain in parallel. This is the most likely thing
to need revisiting after six weeks, and #129 is the named answer rather than a re-invention.

- TIDY ONLY REACHES 14 OF 24 TILE TYPES even after wiring the two unused predicates. On Solo
that leaves Calendar, Pushups and Daily Numbers permanently expanded. No proposal in the review
solved this without inventing an invisible type taxonomy that would make two identical-looking
tiles behave oppositely with nothing on screen to explain why. So it is stated rather than
papered over. If it grates in use, the fix is a single 'never tidy / always tidy' pin — ONE
boolean, not a three-way enum, and only after you have lived with it. Pre-emptive escape hatches
are how this app got sixteen mechanisms.

- RETIRING THE 60-MINUTE STALE HIDE MEANS MISSED CHECK-INS ACCUMULATE VISIBLY. I claim that is
honesty — lateness is not finishedness, and hiding the thing you did not do is the opposite of
what a planner is for. You may experience it as a guilt wall by Thursday. It is cheap to reverse
(it is a read-time predicate) but I want you to taste the honest version first.

- THE OFFLINE OLD-BUNDLE WINDOW IS BOUNDED, NOT CLOSED. A second device that edits offline, or
within 2s of a save, and never syncs down first can still take the layouts section wholesale and
drop a page you built elsewhere. That is pre-existing (L2/L3) and not created by this design;
Phase 2 makes new↔new merges strictly better than today, but nothing makes new↔unstamped safe.
There is also a transient path I cannot close: sw.js falls back to the cached shell when a
navigation fetch throws, so a launch on a captive portal can run old code that later regains
connectivity. The real mitigation is Phase 0 shipping alone and you confirming the build stamp
on every device — an instruction to you, not code.

- THE TEST SUITE PROVES ALMOST NOTHING HERE. There is NO test today for Focus mode, for the
check-in sink ordering, for the stale/dismiss hide, or for ANY interaction between the
completion mechanisms. #113's twenty tests are all #113-only. test/daytypes.app.test.jsx never
authenticates, so it cannot see the flag-deletion bug. Every contradiction this design retires
was found by mounting the app, not by the suite. Green tests through Phase 3 are not evidence —
the interaction tests ship WITH #123, and the rest has to be tasted by hand, per page, per
moment. That is what Preview-as is partly for, and it is partly an admission.

- YOU HAVE NEVER USED A VIEW-CONFIGURATION SURFACE THIS APP GAVE YOU. Verified: none of your 7
layouts carries a tab after two full ticket cycles of tab work (#84, #87, #91); the only writer
of layout.days in the entire codebase is a hardcoded migration constant; #113 shipped a per-tile
control three levels deep and is untasted. That is the honest reason the library, staging and
forking are ranked BEHIND the migration and the bug fixes in this plan. The value here is
overwhelmingly in what the migration does for you without asking. If Phases 0–2 land and Phase 3
never does, that is a defensible outcome and not a failure — and you should feel free to stop
there.

- THIS IS SIXTEEN TICKETS AGAINST A COMPLAINT ABOUT ACCUMULATED DEBT, WHICH IS AN UNCOMFORTABLE
ANSWER. Phases 0–2 are six of them and are net bug fixes with no model change. Phase 3 is a net
DELETION — three modules and four mechanisms go away, and it retires more code than it adds. But
it is still weeks of work, and the honest floor is: stop after Phase 1 and you have already
recovered most of the felt improvement, because #117 + #118 + #119 make your three day-types
work correctly for the first time and stop edits landing on the wrong board.

- THE TWO AUTO-CHECK ENGINES SURVIVE. config.rules (per checklist item, in ConfigModal) and
layout.links (in the Links modal) both express 'tick this box when that tile is done', with two
editors and two data shapes. That is literally 'two ways to do the same thing' left standing —
in the one domain that now decides whether a tile leaves the board. I am not merging them in
this lane because the merge belongs with #103's registry-driven config consolidation, but your
original complaint applies to it and I would rather name it than let you find it.

- THE MORNING FIX IS OPT-IN AND THEREFORE SKIPPABLE. The am-focus scheduling is the single
highest-value item here and it lives behind one question at the end of the migration. If you
click No out of caution, you get the whole redesign with a 19-tile Wednesday morning — i.e. the
founding complaint, intact. That is a deliberate trade (App.jsx:548-552 argues correctly that a
migration should not move you off the board you built), but it means the best thing in this plan
depends on you saying yes to one dialog.

---

## Open questions for Rob

- Should picking a page on your phone change your laptop? Today one click writes BOTH a session
override and a synced field, which contradicts the code's own comment at App.jsx:56-59. I have
decided it should NOT — a pick is device-local and expires at the day roll, matching the
precedent that theme, font, background and reminders are already per-device keys that never
sync. Say so if you disagree, because it is far cheaper to settle before the resolver ships than
after.

- Turn on the 11-tile morning board? am-focus already exists, is built from the same tile ids as
your other boards (so it shares all per-day data and forks nothing), and giving it Mon–Fri
05:00–11:00 takes Wednesday 8am from 19 tiles to 11 with zero authoring from you. I need to know
two things: whether the migration ASKS the question or just does it, and whether 05:00–11:00 is
the right window. Same question applies to pm-wind (8 tiles) as an evening board.

- How many devices, and can you open all of them online this week? Phase 3 is gated on you
confirming a build stamp on each one — that gate is the only real protection against a second
device on an old bundle taking the layouts section wholesale. If there is an iPad in a drawer or
an iOS PWA from #82 you have not opened, say so now: the schedule changes, not the design.

---

## Ticket set

### #116 — Build stamp + service-worker version bump

`Small` · Phase 0 — trust · **FIRE**

**Order:** Bump public/sw.js VERSION 'dm-v1' → 'dm-v2', add registration.update() on
visibilitychange plus a 'New version — reload' toast, and surface a build stamp (vite define
__BUILD__) in the ☰ menu so each device can be confirmed by eye.

**Sides:** public/sw.js · src/App.jsx (menu) · vite.config.js

**Allergies:** L7 IS FALSE — verified this session: sw.js is already network-first for
navigations with skipWaiting on install and cache-versioned activation; only /assets/* is cache-
first. The bump flushes stale hashed assets; it CANNOT reach a device nobody opens. Do not build
a version gate (store.version is read by nothing and ratchets DOWN) and do not build a device
registry (it gets clobbered wholesale by the layouts assignment and renders as a junk option in
the header select). The gate is Rob confirming the stamp by eye.

**Plating:** Reload toast appears when a new SW is waiting. Build stamp visible in the menu and
changes between deploys. Existing 243 tests still green.

**Sequence:** Ships ALONE and first. Nothing else in this lane starts until the stamp is
confirmed on every device Rob uses.

### #100 — Sync + auth trust pack (#100), widened to close the duplicate-file path

`Medium` · Phase 0 — trust · **FIRE**

**Order:** Refresh the Drive token before expiry; move `syncedDownRef.current = true` OUT of the
finally block so a thrown load no longer opens the save gate; make saveToDrive refuse the
create-branch whenever a load failed this session, so a second daymaster-data.json can never be
minted behind an auth failure.

**Sides:** src/lib/drive.js · src/App.jsx (~lines 160-180, 284-306)

**Allergies:** This is the chain that erases store.layouts: expired token → driveRequest throws
on the 401 → _fileId never assigned → next save takes the create-branch → duplicate file with
the newest __savedAt wins the wholesale merge → #63 consolidation trashes the copy that held
everything. Do not run any migration over this. Surface a visible error when the create-branch
is refused — silent refusal is its own bug.

**Plating:** A forced 401 mid-session produces a visible error and NO write. _fileId null + a
failed load never creates a second data file. Token refreshes without a re-auth prompt across a
2-hour session.

**Sequence:** Hard gate. Already filed as Order Up!. Must land before #122's migration.

### #117 — Every mutation takes the rendered page key

`Medium` · Phase 1 — fix today's board · **FIRE**

**Order:** Change mutateLayout to accept the RENDERED layout key as an argument and delete the
hardcoded `s.activeLayout||"default"` at App.jsx:345. Thread the resolved key through every
caller.

**Sides:** src/App.jsx — addTile, removeTile, saveTileConfig, onConfigPatch, moveTile,
moveTileAcross, addLink, removeLink, every tab mutator, deleteLayout, renameLayout, and the #14
reminder scan

**Allergies:** Worse than filed: saveTileConfig and onConfigPatch route through the same path,
so CONTENT writes (project items, the Ideas log) land on the wrong board too — and
saveTileConfig is a silent NO-OP when the tile id is absent from the active layout. TabsModal is
fed the rendered layout's tiles while onAssign writes to activeLayout, and because presets are
deep clones the ids collide, so the write lands on the other board's same-id tile with no error.
Highest-value single ticket in the review and completely model-independent.

**Plating:** New test: mount the app on a Saturday with day-types on and activeLayout:'default';
the weekend board renders; adding a tile grows layouts.weekend, not layouts.default, and the
screen updates. 🗑 Delete deletes the board on screen. Existing tests green.

**Sequence:** First ticket of the interim gate. No model change, no migration — ship and taste
it on its own.

### #118 — One completion answer (folds and closes #115)

`Medium` · Phase 1 — fix today's board · **FIRE**

**Order:** Make effectiveDayData overlay legacy config.rules as well as field-links. Render
tiles against the overlay rather than raw todayData. Collapse tileComplete to ONE signature at
ONE call site. Delete the scoped tileStatus.js:63-77 workaround and its false comment. Add `if
(data._done === true) return true;` at the top of checkinIsDone.

**Sides:** src/lib/fieldlinks.js · src/lib/rules.js · src/lib/tileStatus.js · src/tiles.jsx
(render props) · src/App.jsx:1211,1242 · src/ui/HistoryView.jsx

**Allergies:** DO NOT repoint the #14 reminder scan onto checkinFullyDone. rules.js:196-198
states the OR predicate's intent in words — 'once you've engaged at all, stop nagging' — and
checkinFullyDone is an AND over planks && food && priorities, so repointing makes the nag fire
at a check-in that is already two-thirds filled. The bug is one line, not a repoint. Also:
tileComplete currently has two call sites with DIFFERENT signatures (App.jsx:1211 passes
tilesById, 1242 does not).

**Plating:** Probe test: a checkbox rendered visibly UNCHECKED can never read as finished.
{_done:true} reads finished everywhere INCLUDING the reminder scan, so the phantom reminder
stops. A check-in with two of three boxes filled still suppresses the nag. History renders auto-
ticked days correctly. #115 closes on merge.

**Sequence:** Depends on nothing. Unblocks the whole model — 'finished' must mean one thing
before it becomes the sole trigger for Tidy.

### #119 — Nest the day-types flag so #105 works

`Small` · Phase 1 — fix today's board · **FIRE**

**Order:** Move store.dayTypes from a top-level key to a nested one
(store.layouts.default.__dayTypes) so the mergeStores whitelist stops destroying it on every
sync. Read it from the new location; write a one-time migration of the old value if present.

**Sides:** src/lib/daytypes.js · src/App.jsx (the hasDayTypes read and the 📅 toggle) ·
src/lib/store.js

**Allergies:** mergeStores returns exactly {version, activeLayout, layouts, days, __savedAt} —
every other top-level key evaporates, which is why this flag has turned itself off for every
Drive user since #105 shipped. Do NOT put it in store.layouts.__meta: a non-layout key inside
the layouts map renders as a bogus <option> in the live header select and counts toward the
delete-guard. Phase 3 deletes this flag entirely; this is deliberately temporary.

**Plating:** Turn day-types on, sign out, sign back in — it is still on. With #117 landed,
Wednesday resolves Solo and Saturday resolves Family Weekend, and edits land on the rendered
board. This is the interim payoff: taste it.

**Sequence:** Depends on #117 to be worth tasting (without it, every edit lands on the wrong
board). Ship them together as the interim gate.

### #120 — Per-page layout merge with in-memory stamps

`Medium` · Phase 2 — sync gate · **FIRE**

**Order:** Stamp `_m` in memory at edit time in ALL FIVE layout writers. Rewrite mergeStores to
union `layouts` by key with newer _m winning, falling through to today's __savedAt rule on a tie
or when either side is unstamped. Re-stamp _m on every layout in importBackup.

**Sides:** src/lib/sync.js:50-78 · src/App.jsx:343-348 (mutateLayout) and 441-484 (switchLayout,
duplicateLayout, renameLayout, deleteLayout) · src/App.jsx:517-531 (importBackup)

**Allergies:** THREE THINGS EVERY PROPOSAL GOT WRONG. (1)
switchLayout/duplicateLayout/renameLayout/deleteLayout write s.layouts DIRECTLY and never touch
mutateLayout — miss them and Rename silently reverts and Delete never sticks. (2) importBackup
deliberately sets `imported.__savedAt = Date.now()` with an in-code comment explaining why; a
per-key merge silently voids it, so EVERY backup taken to date would restore ZERO layouts
against a stamped remote. Restore is the last recovery net that works (Drive version-history
restore does not). (3) The unstamped fallthrough is not optional — an old bundle never stamps
_m, so 'tie → local' would silently discard its edits. Do NOT add any top-level key.

**Plating:** Two devices editing DIFFERENT pages converge with both edits. Same page → newer _m
wins. An unstamped (old-bundle) page falls through to today's behavior exactly. A restored pre-
_m backup wins its layouts. Property test: for every stamped/unstamped combination the result is
never worse than today's rule.

**Sequence:** HARD GATE on the library (#124). A library of more, smaller, more frequently-
edited page objects makes the wholesale clobber bite more often — this ships first or the
headline promise is false.

### #121 — pages.js — one resolver, one ticker

`Medium` · Phase 3 — the model · **HOLD — fire when Phase 1 is tasted and the build stamp is confirmed on every device**

**Order:** New src/lib/pages.js: resolvePage(pages, order, {pick, now}) returning the first LIVE
page in order whose every declared when-clause matches; a device-local day-scoped pick in
localStorage; ONE 60s ticker; ONE ref-diff release effect; a status-filtered fallback chain
ending at a pinned always-matching page. Pure, no React.

**Sides:** NEW src/lib/pages.js · DELETE src/lib/daytypes.js · gut src/lib/tabs.js (keep
parseTime and the window math verbatim) · src/App.jsx (the resolver, both tickers, both release
effects)

**Allergies:** The fallback MUST be status-filtered — store.activeLayout can point at a page
that is now off, including one an old bundle switched to, and no path may resolve to an off
page. Keep the half-open, midnight-wrapping window test verbatim (22:00–05:00 must be legal;
today's suggestTimeTabs leaves it uncovered). Delete: the 30s tabNow ticker, hasTimeWindows'
ticker gate, the unreachable effectiveTab guard at App.jsx:647, ALL_TAB, visibleColumnsForTab,
and the empty-column drop that makes the board reflow. Order is the ONLY tiebreak — no computed
specificity.

**Plating:** ~40 unit tests: day matching, window matching, midnight wrap, order tiebreak, off
pages skipped, pick expiry at day roll, pick released when the auto answer changes, never
returns null. Wednesday 09:00 → Solo. Saturday → Family Weekend. 03:00 with no page claiming it
→ the pinned fallback, not a crash.

**Sequence:** Depends on #118 (one predicate) and #120 (merge). First ticket of the model phase.

### #122 — migratePages + escrow + the morning question

`Large` · Phase 3 — the model · **HOLD**

**Order:** New migratePages(store): shape-guarded PER PAGE on `page.live === undefined`,
idempotent, mutating only store.layouts. Escrow first, then field additions, then the one
morning question. Delete the PRESET_SEEDS loop, the #39 hoist and the AM-Routine rename after
running them one last time.

**Sides:** src/lib/store.js (migrateLayout, PRESET_SEEDS, the seeder, the #39 hoist) · NEW
migratePages in src/lib/pages.js · src/App.jsx:191 applyStore · a new migration screen

**Allergies:** ESCROW BEFORE ANYTHING: snapshot the raw localStore AND the raw Drive payload
SEPARATELY and BEFORE mergeStores runs — snapshotting applyStore's argument preserves already-
clobbered state. Per-device key, last three kept, plus a download button; every device that
migrates writes one, not just the first. `default` is FORCED live and pinned as the catch-all
(App.jsx:548-552 argues this in a comment; together∪solo∪weekend covers all 7 days, so retiring
it kills the fallback clause and opens uncovered-hour holes). Derive `live` from KEY IDENTITY
ONLY, never by comparing tile-config contents (that drifts across releases and reads TRUE for
every preset on the Restore path). Tab-derived pages key DETERMINISTICALLY as
<parentKey>__<tabId>; bare tabs contribute NOTHING. HARVEST SUGGESTED_BUCKET (tabs.js:107)
before deleting tabs.js. NEVER touch store.days. NEVER mint or re-key a tile id. Archive every
removed key at page.__legacy first. Reconcile divergent same-id tile content explicitly
(longest-list-wins or union) and surface it — do not let the first write decide.

**Plating:** Tests: store.days deep-frozen and unchanged across three runs;
JSON.stringify(before.days) === after; every pre-migration tile id present after; fixpoint on a
MIXED store (some migrated, some not); deterministic on the Restore path; a hand-built layout
with a nonsense key survives live with columns byte-identical. The morning question appears
once, is answerable No, and never appears again. Answering Yes gives am-focus when:{days:[1..5],
05:00–11:00} above Solo, and Wednesday 8am renders 11 tiles.

**Sequence:** Depends on #121. Gated on #100 and on the build stamp being confirmed everywhere.

### #131 — Un-migrate command

`Medium` · Phase 3 — the model · **HOLD**

**Order:** A Manage Pages action that reconstructs layout.tabs, config.tabs/.tab and
config.doneBehavior from page.__legacy and strips the page fields, behind a confirm, with an
undo-ring entry.

**Sides:** src/lib/pages.js · src/ui/PageLibrary.jsx

**Allergies:** Be honest about the limit: pages created AFTER the migration have no pre-
migration representation. The command must WARN and LIST them before proceeding rather than
silently destroying them — a one-tap lossy rewrite with no net is worse than having no rollback
at all, because it will be reached for at the moment Rob is already panicking. Round-trip test
is the acceptance gate, not a nice-to-have.

**Plating:** Round-trip test: migrate → un-migrate → the store deep-equals the pre-migration
shape for every field __legacy covers. Post-migration pages are named in the warning. Confirm
required. Undo-ring entry present.

**Sequence:** Ships in the SAME release as #122. Not a follow-up.

### #123 — The board — Tidy and the Set-aside rail

`Medium` · Phase 3 — the model · **HOLD**

**Order:** Replace the six-step render pipeline with one partition. Add the ◐ Show all / Tidy /
Hide done header control (localStorage, default Tidy). Build one 'Set aside (n)' rail at the
foot of the board with a printed reason per line. Freeze the grid template to the page's
declared columns.

**Sides:** src/App.jsx:1106-1300 (the whole render pipeline) · src/lib/tileStatus.js ·
src/tiles.jsx (check-in header) · src/ui/ConfigModal.jsx (delete WHEN FINISHED)

**Allergies:** KEEP _delayMin AND ITS ⏲ GLYPH — it is the reminder snooze, read at App.jsx:130
inside the #14 scan, NOT view state. Delete only App.jsx:1182 (the stale-hide reader). Re-read
_dismissed as finished INSIDE the shared predicate, and carry the reason ('dismissed') on the
rail line so a future rollup can still tell 'I bailed' from 'I did it'. Do NOT call the rail
'Done' — a missed check-in is not done. Compute the empty-state hint AFTER the partition (L20).
Wire planks and dangles to their already-written '@allchecked' predicates; do NOT wire pushups
or counter (their only predicates are '@any'/'@positive' and would collapse a running tally on
the first set of the day). State plainly which tiles never tidy. Delete: Focus mode and its four
state variables, the check-in sink, the 60-minute literal, the three-way partition, the per-
column Done rail, the 'hidden check-ins' reveal.

**Plating:** An unfinished tile is NEVER hidden in any mode — asserted as a test. The board does
not reflow when tiles tidy. A fully-finished column explains itself. Tidy survives reload, never
syncs. NEW interaction tests that have never existed: Focus↔done-state, sink↔done-state,
stale↔done-state, and the combined partition.

**Sequence:** Depends on #118 and #121. This is where the untasted #113 engine gets reused and
its surface deleted.

### #124 — The page library

`Large` · Phase 3 — the model · **HOLD**

**Order:** New src/ui/PageLibrary.jsx: drag-orderable list (order = precedence), on/off toggle,
When summary in plain English, tile count, fork provenance, ON NOW marker, collapsed OFF
section, overlap warnings in words, ⋯ menu (Show now / Fork / Rename / Turn off / Delete),
Publish ▾ with 'Publish, replacing <page>', and the escrow restore button.

**Sides:** NEW src/ui/PageLibrary.jsx · DELETE src/ui/TabsModal.jsx · src/App.jsx (delete the
header <select>, the 📅 toggle, the ◎ Focus button and the edit-mode glyph row)

**Allergies:** Fork preserves tile ids and lands OFF — and there is NO 'start fresh copies / new
empty history' option anywhere; minting a new id for an existing tile voids the invariant every
data-safety guarantee rests on. Delete is the rare path behind a confirm and writes a tombstone
that MUST carry three empty columns, or an old bundle whose activeLayout points at it TypeErrors
(a tombstone with no `columns` is present-and-truthy, so the null fallback never fires). Every
destructive action pushes onto #99's undo ring with a label. Closes #31 as delivered.

**Plating:** Drag reorder changes which page activates, visibly. Turn off → it stops activating
and leaves the picker, keeps everything. Fork → lands off, shares data with its parent, records
provenance. Publish-replacing → fork on, parent off, one action, undoable. Overlap warning names
the winner and why.

**Sequence:** Depends on #120 (merge) and #121. Do not ship before #120.

### #125 — Preview-as, the why-badge, and the ready-chip

`Medium` · Phase 3 — the model · **HOLD**

**Order:** Preview-as [day][time][completion] rendering the real board through the SAME
resolver. A why-badge in the header stating in English why this page is up. A ready-chip that
appears when the auto answer changes instead of swapping the board, with one tap to take it.

**Sides:** src/App.jsx (header) · src/ui/PageLibrary.jsx · src/lib/pages.js

**Allergies:** Preview MUST call the same resolvePage the live board calls, or it will drift and
become a lie. The ready-chip never auto-swaps on a timer — 'auto-swap after 60s idle' is a null
promise for a dashboard left open, where idle is the resting state. This absorbs #108's end-of-
window nudge; re-file #108 rather than claiming it unblocked, since tabs do not survive.

**Plating:** Preview as [Tue][07:30] shows exactly what Tuesday 07:30 will show. The why-badge
reads 'auto · Wed–Fri' and changes with the resolver. Crossing a window edge raises a chip and
does NOT move the board; one tap takes it. Answering 'what will I see Tuesday morning' takes one
control.

**Sequence:** Depends on #121 and #124. The highest-value affordance in the whole review — all
three judges said build it whatever model won.

### #126 — Tile settings hygiene

`Medium` · Phase 3 — the model · **HOLD**

**Order:** Make ConfigModal render from a FIELD_SCHEMAS allow-list instead of the generic
unknown-key loop. Pass onConfig to TileCheckIn. Move the check-in schedule out of its regex-
parsed title into config.time, parsed once at migration, title kept as the display label.

**Sides:** src/ui/ConfigModal.jsx · src/tiles.jsx:361 (TileCheckIn signature) ·
src/lib/rules.js:165-176 (checkinScheduleMin) · src/App.jsx (the props it already passes and
TileCheckIn discards)

**Allergies:** TileCheckIn is the ONLY one of 24 renderers whose signature omits onConfig — App
already passes it and it is discarded, which is why doneBehavior, capture, notify, planksSlot
and the scheduled time are unreachable, why the entire planksSlot branch in ConfigModal is dead
code, and why the only way to change a check-in today is to re-run Setup (which mints NEW ids
and orphans history). The allow-list also ends the leak where config.tab/.tabs render as a raw
text box and a newline textarea with replace semantics. Keep config.time NESTED so it is sync-
safe.

**Plating:** A check-in can be configured from the board for the first time. No unknown config
key renders as an editable raw text box. Changing a check-in's time no longer requires editing
its title. #103 is unblocked.

**Sequence:** Depends on #122 (config.time is parsed at migration). Independent of the library.

### #127 — Onboarding seeds one page

`Small` · Phase 3 — the model · **HOLD**

**Order:** Onboarding creates ONE live page from the user's answers, plus the three day-type
pages only if the day-type question is answered. Re-running Setup on a store with content
creates an OFF page named 'Setup <date>' and drops the user in the library — it no longer writes
activeLayout or overwrites itself.

**Sides:** src/lib/store.js buildOnboardingLayout · src/ui/Onboarding.jsx · src/App.jsx (the ✨
Setup button and post-onboarding banner)

**Allergies:** Today applyStore runs migrateLayout over the onboarding result, so a new user who
picks 4 tiles lands with SEVEN layouts including a 19-tile Solo board they never chose (#111).
Deleting the seeder in #122 fixes that; this fixes the rest. Remove the hardcoded name:'Daily'
that puts two Dailys in the picker. Re-running Setup currently mints NEW check-in tile ids each
time — with no delete, those orphans would park on a live board forever, so the off-by-default
landing is load-bearing.

**Plating:** A fresh onboarding with 4 tiles yields ONE live page with 4 tiles. Re-running Setup
does not change what is live and does not overwrite the previous setup page. No duplicate
'Daily' in the picker. Closes the worst half of #111.

**Sequence:** Depends on #122 (the seeder must be gone) and #124 (it lands the user in the
library).

### #128 — Dead-code sweep and the vocabulary

`Small` · Phase 3 — the model · **HOLD**

**Order:** Delete everything in the brief's §7 this design has not already removed, fix the four
misleading comments, and land the naming: one word for the container (page), one for the card
(tile), 'Layout' button → 'Arrange'.

**Sides:** src/lib/store.js · src/lib/tabs.js · src/lib/drive.js · src/App.jsx ·
src/tiles/registry.js · src/ui/*

**Allergies:** Sweep list: touchDay (exported, tested, called nowhere), findDataFile (exported,
never called), the ~40-line commented-out carry-forward block at App.jsx:201-241, the legacy
config.tab mirror, suggestTimeTabs, column.width, counter.config.target, the empty TILE_EVENTS
for numbers/gcal/notionlinks, @allsteps with no tileComplete case, the unreachable .filter at
store.js:448, the 'days' suffix on select labels, the AM-Routine rename guard, store.version's
write. HARVEST SUGGESTED_BUCKET into pages.js BEFORE deleting tabs.js — it is the seeder #129
will need. Stale comments to fix: tabs.js:2-3, TabsModal.jsx:4, App.jsx:377 (all still say
membership is config.tab), tileStatus.js:71-72 (false), App.jsx:422-423 (describes a re-seed
that does not exist), App.jsx:56-59 (frames the pick as device-local when it writes a synced
field — now true, so update it rather than delete it).

**Plating:** Grep for 'layout', 'preset', 'board', 'module', 'section', 'block' in src/ returns
only page/tile. No dead export remains. All tests green.

**Sequence:** Last. Do not sweep tabs.js until SUGGESTED_BUCKET is harvested.

### #129 — Per-tile time windows (the escape hatch)

`Large` · Phase 4 — held · **HOLD — needs evidence, not a decision**

**Order:** Attach the same When grammar to a tile inside one page (slot.when), so a board slices
itself by time of day instead of forking into N pages. Seeded in one action from
SUGGESTED_BUCKET.

**Sides:** src/lib/pages.js · src/App.jsx (the partition) · src/ui/PageLibrary.jsx (the per-tile
editor)

**Allergies:** This is the RIGHT architecture and the WRONG ergonomics until it has a seeder —
anonymous per-slot clauses cost ~2 inputs per tile (~38 to slice Solo) versus suggestTimeTabs'
one click today, and moving a boundary goes from one edit to N unless the window is a NAMED
SHARED object referenced by slots. It also needs an escape hatch: a window-hidden tile must get
a line in the Set-aside rail with a reason, or Rob loses the one-tap 'show me everything' the
ALL tab gave him. Do not ship either half without the other.

**Plating:** Not defined yet — this is deliberately unspecified until there is evidence it is
needed.

**Sequence:** FIRE ONLY IF six weeks of use shows flat pages duplicate too much. Named so it is
not re-invented from scratch.

### #130 — Kill Arrange entirely

`Medium` · Phase 4 — held · **HOLD — needs evidence, not a decision**

**Order:** Remove the edit-mode gate: drag grips on tile hover/long-press, a ⋯ per tile opening
its settings sheet, no mode to be in.

**Sides:** src/App.jsx (the editMode state and every !editMode guard)

**Allergies:** This is an unpiloted behavioral bet. Every tile becomes draggable on a live board
where finished tiles may have tidied away, and a long-press that fights scroll on mobile is a
real failure mode. It also risks creating TWO drag surfaces over two different tile sets (the
live board showing a tidied subset, the editor showing the complete list). Filed explicitly as
deferrable — it can be dropped without unpicking the model, which is why it is here and not in
Phase 3.

**Plating:** Not defined yet.

**Sequence:** Held on purpose. The read-only preview in #123/#125 already fixes the 'board you
arrange is never the board you see' complaint without this bet.

---

## Appendix — the consolidated brief (the factual floor)

Every claim below was read from source or proven by execution at commit `0bdd074`.

# DAYMASTER VIEW-LAYER BRIEF — THE FACTUAL FLOOR

**Status:** authoritative. Synthesized from five independent full code reads plus re-verification at HEAD. Every claim below is either read from source or proven by execution. **Do not re-read the repo to work from this.** No design is proposed here.

**Verified state:** repo clean; HEAD `0bdd074` (docs-only, one commit past the `eb37b6c` the readers worked at — line numbers valid). Test suite: **25 files / 243 tests, all green** (re-run this session). Fresh store after `migrateLayout(emptyStore())` = **7 layouts**: `default` "Daily" 23 tiles · `am-focus` 11 · `pm-wind` 8 · `fitness` 8 · `together` 12 days=[1,2] · `solo` 19 days=[3,4,5] · `weekend` 11 days=[0,6]. **None** carries `tabs` or `links`.

---

## 0. THE PERSISTED SHAPE (all of it)

```
store = {
  version: 6,                     // WRITE-ONLY. Read nowhere but Math.max in sync.js:73
  activeLayout: "<key>",          // synced
  dayTypes?: true,                // #105 opt-in. TOP-LEVEL → DESTROYED by every mergeStores
  layouts: { [key]: {
      name, 
      columns: [{ id:"col-left"|"col-center"|"col-right", width:22|44|24, tiles:[{id,type,config}] }],
      tabs?:  [{ id, name, start?:"HH:MM", end?:"HH:MM" }],   // #84/#87
      links?: [{ target:{tileId,fieldId}, sources:[…], mode:"any"|"all" }],  // field-links C
      days?:  number[]            // #105, getDay() 0–6
  }},
  days: { "<Y-M-D UNPADDED>": { "<tileId>": {…data, _type}, __mtime } },
  __savedAt                       // stamped on the DRIVE payload only (drive.js:136)
}
```

`tile.config` carries view-layer flags mixed with tile behavior: `tab` (legacy string) + `tabs` (array), `doneBehavior`, `rules`, plus type keys. Per-device chrome (theme/font/background/reminders/install-hint) is **separate localStorage keys, never synced** — the existing precedent for per-device view preference.

**Layout identity is the map key. The key is immutable.** `renameLayout` changes `name` only (App.jsx:461). Two layouts can and do share a display name ("Daily" appears twice after re-running Setup: store.js:7 and store.js:219).

---

## 1. THE DEFINITIVE MECHANISM TABLE

Sixteen mechanisms answer "what tiles do I see." The brief's count of eight omits M6, M9, M14–M18.

| # | Mechanism (ticket) | Trigger | Scope | Configured at | Persisted as | Survives reload? | Survives sync? |
|---|---|---|---|---|---|---|---|
| **M1** | Layout presets — the layout set (#33) | manual | whole-board | Header `<select>` (always visible) + edit-mode ➕ ⎘ ✎ 🗑 (App.jsx:1007-1032) | `store.layouts` | yes | **wholesale-clobbered** |
| **M2** | `store.activeLayout` pointer (#33) | manual | whole-board | No own control; written by switchLayout/duplicate/delete/new/onboarding | `store.activeLayout` | yes | yes (newer `__savedAt` wins) |
| **M3** | `manualLayout` session override (#105) | manual | whole-board | Same header `<select>` — one click writes M2 **and** M3 | React state (App.jsx:60) | **no** | n/a |
| **M4** | Day-type boards (#105) | weekday | whole-board | 📅 Day-types toggle, edit-mode only + only when `hasDayTypes` (App.jsx:1039). **`layout.days` has NO editor anywhere** | `layout.days` (nested, safe) + `store.dayTypes` (top-level) | yes / yes | days: yes · **`dayTypes`: DELETED** |
| **M5** | Preset & board auto-seeding (#33+#105) | automatic | whole-board | none — runs in `applyStore` on every mount, every syncDown, every Restore (App.jsx:192) | mutates `store.layouts` in place | n/a | n/a |
| **M6** | Onboarding `setup` layout (#61) | manual | whole-board | ✨ Setup (always visible) / `?onboarding=1` | `store.layouts.setup`, sets activeLayout | yes | wholesale |
| **M7** | Header tabs (#84 + #91) | manual | within-board | ⊞ Tabs modal, **edit mode only**; strip renders **view mode only** — never both on screen | `layout.tabs` + `tile.config.tabs` (+legacy `.tab` mirror) | yes | wholesale |
| **M8** | Time windows on tabs (#87) | clock (30s tick) | within-board | Two bare `<input type=time>` per tab row inside ⊞ Tabs | `tabs[i].start/.end` "HH:MM" | yes | wholesale |
| **M9** | The ALL pseudo-tab (#84) | manual/fallback | within-board | not configurable — synthesized at render (App.jsx:1110) | none (`ALL_TAB="all"` constant) | n/a | n/a |
| **M10** | Focus mode (#2 + #54) | completion | within-board, session | ◎/◉ Focus header button, today view + non-edit only (App.jsx:999) | **React state only** (App.jsx:77-78) | **no** | **never** |
| **M11** | Done states stay/shelf/hide (#113) | completion | per-tile | ConfigModal "WHEN FINISHED" — edit mode → 20px ⚙ → scroll to bottom. Offered for 10 types; **unreachable on check-ins** | `tile.config.doneBehavior`, **one copy per layout** | yes | wholesale |
| **M12** | Check-in completion sink (#35 + #81) | completion | checkin type | **NO CONTROL. Unconditional in view mode** (App.jsx:1173) | nothing (derived) — its manual override `_done` lives in `store.days` | derived | `_done` merges per-tile |
| **M13** | Stale / dismissed check-in hide (#6 + #35) | clock (60s tick) | checkin type | **NO CONTROL for the 60-min threshold** (literal, App.jsx:1183). User levers: ⏲/✕ glyphs inside the tile header | `store.days[…]._delayMin` / `._dismissed` — **view state inside per-day data** | yes (per-day) | yes (per-tile merge) |
| **M14** | Project tile ▶ collapse (no ticket) | manual | project type | Click the tile header; default from `config.defaultOpen` (a boolean → **invisible in ConfigModal**) | `store.days[…]._open` — **view state inside per-day data** | yes (per-day) | yes |
| **M15** | Guided-AM step-through (#3) | manual | guidedam type | **Two disagreeing controls**: →/≡ glyph in tile header, and ConfigModal `mode` dropdown | `config.mode` (layout) overridden by `data.mode`/`data.step` (per-day) | yes | mixed |
| **M16** | Edit mode (✎ Layout / ✓ Done) | manual | meta-gate | Header button; also the post-onboarding banner | React state (App.jsx:48) | **no** | n/a |
| **M17** | Mise-en-place position enforcement (#39) | automatic | within-board order | none — runs in `migrateLayout` **every load**, on every layout with a col-center (store.js:270-282) | rewrites `layout.columns` order in place | n/a | n/a |
| **M18** | Auto-check engines (field-links C + legacy `config.rules`) | — | completion input | 🔗 Links modal (edit mode) · "AUTO-TICK RULES" in ConfigModal | `layout.links` · `tile.config.rules` | yes | wholesale |

M18 is not itself a visibility control, but it **defines "finished"**, which is the trigger for M10, M11 and M12. Adding a link can make a tile leave the board. Nothing in the Links modal says so.

**Five surfaces is the undercount.** Places a user actually touches to create or change a view: header select · ✎ Layout · ➕ New · ⎘ Duplicate · ✎ Rename · 🗑 Delete · 🔗 Links · ⊞ Tabs · 📅 Day-types · ⚙ ConfigModal (generic fields + rules editor + when-finished) · TileLibrary · "+ Add Project" (**view mode**) · drag/←/→/✕ · the tab strip · ✨ Setup — **fifteen**, plus source code for `layout.days`.

---

## 2. THE RENDER PIPELINE (actual precedence, App.jsx)

```
1. LAYOUT      resolveLayoutKey(manual > calendar > stored > first key)   App.jsx:568
2. TAB FILTER  visibleColumnsForTab — drops tiles, then DROPS EMPTY COLUMNS  tabs.js:34-39
                 → grid template rebuilt from surviving widths (App.jsx:1163): the board visibly reflows
3. STALE/DISMISS  check-ins pulled out into staleTiles                    App.jsx:1170-1198
4. SINK        surviving check-ins reordered not-done→done, re-inserted at the first check-in's slot
5. DONE STATES partition into staying / shelf / hidden                    App.jsx:1205-1218
6. FOCUS       collapses whatever is still in `staying`                   App.jsx:1241-1243
```

**Precedence: stale > sink > done-states > focus.** Edit mode short-circuits steps 2–6 (`!editMode` guards at 1106, 1173, 1206, 1241) — **the board you arrange is never the board you see, and no surface anywhere previews a tab or a done state.**

Session-only: `focusMode`, `focusExpanded`, `showStale`, `showDone`, `manualLayout`, `activeTab`, `editMode`. Three persistence tiers (session / per-device localStorage / synced store) with **no visual distinction** — a user cannot tell which of their choices survives tomorrow.

---

## 3. OVERLAP MAP — CLAIMS A DESIGNER CAN ACT ON

**O1 — ACTIVATION IS ONE ALGORITHM SHIPPED TWICE.** #87 (tabs, clock) and #105 (boards, calendar) are the same state machine typed out twice, twenty lines apart: derive an `auto*` answer from a ticker → keep a `manual*` React override → drop the override in a ref-diff `useEffect` when the auto answer *changes* (App.jsx:600-605 vs 561-566) → resolve `manual > auto > stored` (App.jsx:645-647 inline vs `resolveLayoutKey`, daytypes.js:59-64) → break ties **first-match-wins in declaration order** (tabs.js:82-84 vs daytypes.js:47-52). Two tickers (30s `tabNow`, 60s `clock`). `daytypes.js:7-10, :46, :58` says out loud that it mirrors #87. **This is the highest-value and cheapest merge in the review.** The only substantive differences: #105 is opt-in behind a flag, #87 is not; #105 additionally writes a synced field on a manual pick.

**O2 — PRESETS AND DAY-TYPE BOARDS ARE THE SAME DATA STRUCTURE.** Same seeding loop (store.js:434-452), same `buildDefaultLayout()` source, same map, same `<select>`. The **only** difference is the presence of `layout.days`. No type tag, no grouping. `AM Focus` and `PM Wind-down` are literally "morning tab" and "evening tab" expressed as whole boards — #33-era artifacts that predate #84/#87.

**O3 — FOUR-TO-SIX MECHANISMS ANSWER "THIS IS FINISHED, NOW WHAT."** Focus (global session button, no per-tile control) · #113 (per-tile dropdown, persisted, three outcomes) · check-in sink (no control, always on, reorders) · stale hide (no control, always on, clock, hides) · project ▶ collapse · guided-AM stepping. **Three of them have no off switch.** Three incompatible persistence homes: React state / `tile.config` / `store.days`.

**O4 — #113 STRICTLY SUPERSEDES FOCUS, AND THEY SHARE ONE MEMORY.** The partition (1205-1218) removes shelf/hide tiles *before* Focus is evaluated (1241), so Focus only ever touches `stay` tiles — set everything to shelf and the Focus button is a silent no-op. Meanwhile both write the **same** state key: `setFocusExpanded(…true)` at 1287 (Focus) and 1335 (Done rail). Neither setter can ever write `false`, so once expanded a tile stays expanded for the whole session and toggling Focus off/on does not restore the collapse.

**O5 — STALE HIDE SUPERSEDES #113 FOR CHECK-INS, AND MISLABELS IT.** A dismissed-but-fully-done check-in configured `shelf` renders under "▸ Show 1 hidden check-in" — the Done rail never appears. The reveal label counts finished blocks as "hidden check-ins."

**O6 — #113 MAKES THE SINK DEAD WORK.** Step 4 computes an ordering that step 5 discards for any check-in set to shelf/hide.

**O7 — TWO CALLERS OF ONE PREDICATE, TWO SIGNATURES.** `tileComplete(t, …, effectiveToday, tilesById)` at App.jsx:1211 (#113) vs `tileComplete(tile, …, effectiveToday)` at 1242 (Focus) — **confirmed at HEAD.** The missing 4th arg falls back to the day-data `_type` stamp (rules.js:127). Same board, same render, two answers possible.

**O8 — THE TILE AND `tileComplete` EVALUATE THE SAME RULES AGAINST DIFFERENT DAYS.** The tile renders against **raw** `todayData` (App.jsx:1296 → tiles.jsx:22); `tileComplete` evaluates against **link-overlaid** `effectiveToday` (App.jsx:1211). Probe-verified consequence: a checkbox visibly **unchecked** on screen while #113 hides the tile as finished. The comment at tileStatus.js:71-72 claiming the two answers are identical is **false as shipped**.

**O9 — FIVE MUTUALLY INCONSISTENT DEFINITIONS OF "CHECK-IN IS DONE" SHIP SIMULTANEOUSLY.** `checkinIsDone` (OR, incl. feelingNote — drives reminders) · `checkinFullyDone` (AND + `_done` + feelings-mode — drives sink/Focus/#113) · Daily Numbers' inline copy · `evaluateRule('checkin-any')` · `TILE_EVENTS.checkin.any`. With `{_done:true}`: fullyDone=true, tileComplete=true, but checkinIsDone=**false** → **the #14 reminder still fires for a check-in the user explicitly marked done.**

**O10 — TABS AND DAY-TYPES MUTUALLY ERASE EACH OTHER.** `tabs` and `links` are **per-layout**, and no seeded preset or board carries either. The moment Rob turns on 📅 Day-types, his entire tab configuration and every field-link auto-check vanish from view; turning it off brings them back. Rob's "3 day-types × 3 time tabs" costs 9 hand-built tab definitions plus 9 sets of per-tile assignments, plus every link rebuilt per board.

**O11 — SIX SURFACES EDIT TAB MEMBERSHIP OR CONFIG, TWO OF THEM DISAGREE.** TabsModal chips (name-labelled, toggle semantics, maintains the `tabs`/`tab` mirror) vs the generic ConfigModal field renderer, which does **not** special-case `tab`/`tabs` (unlike `rules` and `doneBehavior`) and therefore renders raw tab ids as a free-text box and a newline textarea with **replace** semantics that break the mirror invariant.

**O12 — THREE WAYS TO SAY "THIS VIEW BELONGS TO THIS TIME," ONE WITH NO UI AND ONE STORED IN A TILE TITLE.** Tab windows (`HH:MM` per tab) · layout weekday claims (`days`, **no editor**) · check-in scheduled time (**regex-parsed out of the tile's title**, rules.js:166, AM/PM disambiguated by `config.planksSlot`).

**O13 — "WHICH TILE SET" IS ANSWERED THREE WAYS.** Live board = active layout only (`tilesById`, App.jsx:572-576). HistoryView = **union across all layouts**, first-id-wins (HistoryView.jsx:25-36). The shelved carry-forward block = a third union. HistoryView's union is the closest thing in the repo to a correct model of "tiles are global, boards are views."

**O14 — ONE CLICK, TWO LIFETIMES.** `switchLayout` sets the session-only override **and** persists+syncs `activeLayout` — so a board pick on the phone changes the board on the desktop, contradicting the code comment at App.jsx:56-59 that frames the pick as device-local.

---

## 4. HARD INVARIANTS AND LANDMINES

### A. Sync / merge — the binding constraint

**L1 — `mergeStores` IS A WHITELIST, NOT A MERGE.** Re-verified at HEAD: it returns exactly `{version, activeLayout, layouts, days, __savedAt}` (sync.js:72-78). **Every other top-level key is destroyed.** Two stores each with `dayTypes:true` merge to `dayTypes: undefined`. It runs on the ordinary returning-user path (App.jsx:169), on duplicate-Drive-file loads (drive.js:105), and on save-conflict reconciliation (drive.js:147 → App.jsx:300). **Any new top-level field — `pages`, `pageOrder`, `activation`, `drafts` — evaporates at the next launch unless sync.js changes first.** Corollary: nesting new state inside `store.layouts[key]` or a tile's `config` rides through untouched.

**L2 — LAYOUT CLOBBER (open, known).** The `layouts` section is taken **wholesale** from whichever side has the newer top-level `__savedAt` — no per-key merge. `__savedAt` bumps on **every** save, including ticking one checkbox. A board built on the phone is destroyed by the next save from the laptop. A page library with more, smaller, more frequently-edited objects makes this strictly worse.

**L3 — OFFLINE / SHORT-SESSION LAYOUT LOSS.** `__savedAt` is stamped on the **Drive payload only** (drive.js:136), never on the in-memory store during editing, so the local store's stamp always lags. localStorage writes synchronously; Drive is debounced 2s. Close the tab within 2s of a layout edit, or edit offline, and the next merge takes layouts from Drive. **Days survive (union); layouts do not.**

**L4 — OFFLINE OVERWRITE (open, known).** `syncedDownRef.current = true` is set in a `finally` (App.jsx:174-180), so the save gate opens even when `loadFromDrive` **threw**. With `_remoteRevision` null the concurrent-write guard short-circuits (drive.js:144) and a plain PATCH lands. If `_fileId` is also null it **creates a second `daymaster-data.json`** (drive.js:168-181) whose `__savedAt` is newest — its empty layouts then win the wholesale merge while #63 consolidation trashes the older copy. Complete layout-loss path, no user-visible error.

**L5 — AN OLD BUNDLE IS AN ACTIVE DESTROYER.** A second device on a pre-redesign bundle reads the same Drive file, strips every new top-level key, resurrects all six seeded layouts, re-hoists `morning`, stamps a fresh `__savedAt`, and uploads the mutilated store — which then wins. **`store.version` is never read by any code path**, so no version gate can make it refuse. Worse: store.js:454 assigns the **constant** 6, so a store at version 9 comes back as 6 (verified) — the version can ratchet *down*.

**L6 — IF THE NEW MODEL DROPS OR RENAMES `store.layouts`, OLD BUNDLES HARD-CRASH.** App.jsx:571 resolves `layout` to null, App.jsx:634 dereferences `layout.links` → TypeError after the splash clears. `migrateLayout` early-returns on `!store?.layouts`, so nothing repairs it.

**L7 — THE PWA CAN PIN A DEVICE TO AN OLD BUNDLE INDEFINITELY.** `public/sw.js` is cache-first for `/assets/*` and `VERSION = 'dm-v1'` has never been bumped. *(single-source claim — see §6)*

### B. Migration / idempotence

**L8 — SEED-IF-MISSING CANNOT EXPRESS A DELETION.** `migrateLayout` re-adds any absent PRESET_SEEDS key on **every** `applyStore` — mount, every syncDown, every Restore. Proven: delete `am-focus`/`weekend`/`solo`, reload, all three return **factory-fresh** (customization lost) and **re-appended at the END of key order**, which changes the `layoutForDay` first-match tiebreak *and* the `deleteLayout` fallback (`Object.keys(next)[0]`). Retiring the six requires a persisted **tombstone the seeder honours** *and* deleting the seeder in the same release — and even then L5 applies.

**L9 — MIGRATION MUST BE A TRUE FIXPOINT, GUARDED BY SHAPE NOT VERSION.** `migrateLayout` mutates **in place** and returns the same object (test/store.test.js:26 asserts identity), and `applyStore` mutates whatever `mergeStores` just produced. It also runs on **imported backups** (App.jsx:518-534) — so a Restore cannot restore a state where those layouts are absent or `morning` is elsewhere. Do not add another permanent enforcer in the shape of #39's hoist (M17).

**L10 — `applyStore` WRITES TODAY'S DAY OBJECT ON EVERY LOAD** (App.jsx:194-196), with no `__mtime`, and the save effect persists it. Any migration walking `store.days` will see an empty-but-present day; `buildOnboardingLayout`'s `hasContent` heuristic reads true after a single load.

### C. Data coupling — read this twice

**L11 — TILE ID IS THE ONLY JOIN BETWEEN THE VIEW LAYER AND PER-DAY DATA.** `store.days[date][tileId]` holds **no** layout/page/tab reference. Consequences: (a) the same id in several layouts is **one shared dataset** — deliberate, and the reason Together and Family Weekend show the same `dinner` (store.js:246-248); (b) `duplicateLayout` deep-clones tiles **with their ids**, so a fork shares data with its parent whether you want it or not, while `newLayout`+addTile mints random `uid()` ids that share with nothing; (c) **any re-keying or namespacing of tile ids is an irreversible history amputation**; (d) HistoryView can only render a past day through tile definitions found in **some current layout** — retiring the last layout containing an id makes that history invisible though the bytes are intact.

**L12 — "`store.days` IS OFF LIMITS" DOES NOT BY ITSELF PROTECT USER DATA.** Real user content lives **inside `store.layouts`**, in `tile.config`: `TileProject` with `persist:true` writes `config.items` and `config.title` (tiles.jsx:137,140), `TileIdeas` always writes `config.ideas` — the whole running AI-ideas log (tiles.jsx:1103), `TileMsTodo` writes `config.listId` (tiles.jsx:1262). **A clean-slate rebuild of `store.layouts` destroys these unless they are carried forward by tile id.** All three write through the same broken `mutateLayout` path **in view mode**.

**L13 — VIEW STATE ALREADY LIVES IN THE OFF-LIMITS REGION.** `_done`, `_dismissed`, `_delayMin` (check-ins), `_open` (projects), `mode`/`step` (guidedam), plus `_type` and the orphaned `_carried`. ConfigModal skips `_`-prefixed keys, so they are invisible to the user and permanently synced. A view layer that retires these mechanisms must either keep reading them or leave them orphaned in every historical day.

**L14 — `tile.config` MIXES VIEW MEMBERSHIP WITH TILE BEHAVIOR,** and ConfigModal renders unknown keys generically — so `tab`/`tabs` already leak as editable raw-id fields. More view keys in `config` = more leakage unless the generic loop becomes an allow-list.

### D. Shipped-today bugs on untasted work

**L15 — EVERY EDIT LANDS ON THE WRONG BOARD WHILE THE CALENDAR IS DRIVING.** Re-verified at HEAD: `mutateLayout` hard-codes `s.activeLayout||"default"` (App.jsx:345) while the render uses `layoutKey` (App.jsx:571). Proven by mounting the real App: Saturday + `dayTypes:true` + `activeLayout:'default'` → the **weekend** board renders; adding a tile grows `layouts.default` 23→24 while `layouts.weekend` stays at 11 and the screen does not change. Hits addTile, removeTile, **saveTileConfig**, moveTile, moveTileAcross, addLink, removeLink, addTab, renameTab, removeTab, setTabWindow, suggestTabs, assignTileTab. `deleteLayout`/`renameLayout` and the #14 reminder scan read `activeLayout` too, so **🗑 Delete deletes the board you are not looking at.** Worse variant: TabsModal is fed the **rendered** layout's tiles while `onAssign` writes to `activeLayout` — and because presets are deep clones, tile ids collide, so the write silently lands on the *other* board's same-id tile with no error.

> **Binding for any redesign: "the board being rendered" and "the board being edited" must be the same value.**

**L16 — `store.dayTypes` TURNS ITSELF OFF.** Per L1. #105's opt-in does not survive a sign-in for any Drive user. Net user-visible effect: pick Family Weekend on Saturday (which writes the synced `activeLayout`), and on Wednesday you are stuck on Family Weekend with auto-switching mysteriously off. No test covers it — test/daytypes.app.test.jsx never authenticates.

**L17 — `layout.days` HAS NO WRITER IN THE UI.** Grep-confirmed: the only assignment in the codebase is store.js:438. Rob's three day-types exist **only because a migration hardcoded them**. He cannot move a day, add a day to a board he made, or clear a collision — except by hand-editing an exported JSON and using ⬆ Restore. And `duplicateLayout` deep-clones `days`, silently creating a second claimant for Mon/Tue with no UI to see or fix it; the phantom takes over the moment key order shifts.

**L18 — AUTO-COMPLETED IS UN-COMPLETABLE.** `LinkedCheck` and `TileChecklist` both render `disabled: auto && !manual`; a check-in's manual ✓ is disabled once auto-done. Combined with `doneBehavior:"hide"`, automation can put a tile off the board for the day with **no recourse but the reveal toggle**.

**L19 — CHECK-IN TILES HAVE NO CONFIGURATION PATH AT ALL.** `TileCheckIn` is the only one of 24 renderers whose signature omits `onConfig` (verified at HEAD, tiles.jsx:361) — App passes it and it is discarded. So `doneBehavior`, `capture`, `notify`, `planksSlot` and the scheduled time (its **title**) are unreachable. The entire `planksSlot` branch in ConfigModal is dead code; the comment at rules.js:172 ("users can override via Configure") is false. The only way to change any of it is to re-run ✨ Setup, which mints **new** check-in tiles with new ids, orphaning history.

**L20 — A FULLY-FINISHED BOARD EXPLAINS NOTHING.** The `renderColumns.length === 0` empty-state hint is computed **before** the #113 partition, so a column whose tiles are all hidden renders a bare "▸ Show 2 finished" stub and no hint. Meanwhile a column emptied by the *tab* filter disappears cleanly with a helpful hint. Same outcome, two different-looking results.

**L21 — THE ONLY SAFETY NET IS 8 SECONDS LONG AND IN MEMORY.** #99's undo ring is capped at 10, session-only, never persisted. It is the *only* protection for 🗑 Delete tab (no confirm), ✕ Remove tile (no confirm), ✕ Remove link (no confirm). Only 🗑 Delete layout has a `window.confirm`. Known separately: **Drive version-history restore does not work** (loses the merge to the cached local copy).

---

## 5. WHAT A USER FACES TODAY

**22 concepts, 15 of which bear on "what will I see":** tile · module *(same thing, two names)* · column (3, fixed, exposed as raw ids) · layout / preset / board *(same thing, three names)* · activeLayout vs weekday claim vs manual pick (a 3-level resolver) · edit mode · tile config · auto-tick rules · field-links · tabs · the built-in "All" tab · tab time windows · day-types · Focus mode · done behavior (stay/shelf/hide) · the Done rail · the check-in sink · the stale reveal · check-in delay/dismiss/mark-done · project collapse · guided-AM mode — then the cosmetic tier (theme, font, background, reminders, backup/restore, setup, history).

**"What will I see Tuesday morning after my check-in?" requires visiting EIGHT surfaces, five behind edit mode, one that does not exist in the UI** (`layout.days` — you must read store.js:412-432). And the answer is currently *wrong*, because of L15 and L16.

**Naming collisions (all grep-verified):** the container is called **layout / preset / board / page** (and "page" appears nowhere in `src/`). The content is called **tile / module / section / block**. "view" means today-vs-history in code but "not edit mode" in every comment. "mode" names six unrelated things. **✕ means three things**: remove permanently, dismiss for today, close banner. ⊞ is both the Tabs button and the Two Lists tile icon.

**Undiscoverable:** 📅 Day-types (edit mode + a precondition + a hover tooltip; the word appears nowhere else) · ⊞ Tabs (the *only* string naming its path is the empty-tab hint you see after already making an empty tab) · 🔗 Links · "when finished" · time windows · `layout.days` (not discoverable at any price) · the ✨ tab seeder (vanishes forever once one tab exists).

**Invisible until later:** every done behavior (edit mode exempts them) · every tab assignment (strip hidden in edit mode; LayoutPreview ignores tabs) · every time window · **every newly added tile** (`defaultConfig` never sets `tabs`, so new tiles are All-only and vanish the moment you press ✓ Done with a time tab active).

---

## 6. THE EIGHT REQUIRED CAPABILITIES — WHAT EXISTS TODAY

1. **Page library** — none. The header `<select>` is the only list: 7 flat options, no grouping, no metadata, no type tag. LayoutPreview shows exactly one board, edit-mode only, with **none** of the six view mechanisms applied.
2. **Enable / disable** — none. Grep for `enabled|disabled|draft|staged|publish|derivedFrom|parent|archived` returns only CSS variables. Delete is the only removal, and for 6 of 7 layouts it does not stick (L8). There is no per-tab disable either.
3. **Stage / draft** — none. ➕ New, ⎘ Duplicate and ✨ Setup all set `activeLayout` and go live immediately.
4. **Publish** — n/a, no draft state to publish.
5. **Fork** — ⎘ Duplicate only: `JSON.parse(JSON.stringify)`, keeps tile ids (→ shares per-day data by construction), clones `days` (→ weekday collision), copies tabs and links, **records no parent link**, goes live instantly.
6. **Activation** — see O1: one algorithm, two implementations, two tickers, two override-release effects, **zero editors** for `layout.days`.
7. **Within-page visibility of finished tiles** — see O3/O4/O5/O6: four-to-six mechanisms, three persistence tiers, precedence stale > sink > done-states > focus, three of them with no off switch.
8. **Rob's three day-types** — expressible **only** as hardcoded migration seeds (Together [1,2], Solo [3,4,5], Weekend [0,6]); no editor; the enabling flag is destroyed by every sync; four tiles (`household`, `dinner`, `familyplans`, `carried`) exist *only* inside these boards, so deleting them orphans that data from History.

---

## 7. FREE TO DELETE (dead or vestigial, all verified)

`store.version` (write-only; downgrades to 6) · `touchDay` (exported, tested, called nowhere) · `findDataFile` (exported, never called) · the ~40-line commented-out carry-forward block at App.jsx:201-241 (SHELVED 2026-05-20, superseded by #93; sole writer of `_carried`) · legacy `config.tab` single-string mirror · `suggestTimeTabs` after the first tab exists (permanently unreachable; also leaves 22:00–05:00 uncovered) · `hasTimeWindows`'s ticker gate (the direct cause of a stale-clock bug) · the `effectiveTab` guard at App.jsx:647 (cannot fire on the auto path) · the `.filter(c => c.tiles.length > 0 || c.id === "col-center")` at store.js:448 (unreachable — all six seeds end with all three columns populated) · `column.width` (22/44/24, sums to 90, editable from nowhere) · `days` suffix on select labels rendered even when day-types is off · the `'AM Routine' → 'Mise-en-place'` rename guard · hardcoded `name:"Daily"` on the `setup` branch · empty `TILE_EVENTS` for numbers/gcal/notionlinks · `counter.config.target` (consumed by nothing) · `@allchecked`/`@allsteps` schema fields with no `tileComplete` case · `sw.js VERSION = 'dm-v1'`.

**Stale comments that will mislead you — do not read them as the model:** tabs.js:2-3, TabsModal.jsx:4 and App.jsx:377 all still say membership is `config.tab` (false since #91 — it's `config.tabs`). tileStatus.js:71-72 claims `tileComplete` matches what TileChecklist renders (false — O8). App.jsx:422-423 describes a `default` re-seed on last-layout delete that does not exist. App.jsx:56-59 frames the manual layout pick as device-local (it writes a synced field).

---

## 8. UNRESOLVED — FLAGGED, NOT SILENTLY DECIDED

**U1 — How many mechanisms is it?** The commissioning brief says 8. Counting per-tile-type disclosure (project ▶ collapse, guided-AM stepping) gives 10. Counting the pseudo-tab, the onboarding layout, the seeder, the #39 enforcer and the edit-mode gate gives 16 (this table). **The count depends entirely on whether single-tile-type disclosure and automatic enforcers are in scope.** A designer must state which definition they are using; reviewers must not treat a different count as an error.

**U2 — How many configuration surfaces?** The brief says 5; a full enumeration of touchpoints gives ~15. Same cause as U1.

**U3 — Blast radius of the Focus/#113 `tilesById` divergence (O7).** Existence is confirmed at HEAD. One reader probe-produced a live divergence via a stale `_type` stamp on a retyped source tile; another argues the `_type` fallback makes the two agree for **any day written since `_type` stamping began**, leaving only legacy days and never-written source tiles. **Severity contested; existence not.**

**U4 — Whether the synced half of a manual board pick is intentional.** The comment at App.jsx:56-59 argues *against* persisting a pick; `switchLayout` persists it anyway via `activeLayout`. No reader could determine whether this is a deliberate trade or an oversight. **Treat cross-device "which page am I on" as an open product decision, not a settled behavior.**

**U5 — Whether #105 is currently tasteable at all.** One read concludes the `dayTypes` drop means a Drive user essentially never has it on. Another notes L15 and L16 **mask each other** (with `dayTypes` eaten, `auto` is null and the wrong-board write disappears) — so the only path that exposes L15 is toggling 📅 Day-types **within a session**, which is exactly the taste path. Both readings are consistent with the code; the practical question of "has Rob ever actually seen #105 work" is unanswered.

**U6 — Single-source claims, unreplicated but source-cited.** The #39 mise-en-place position enforcer (M17, store.js:270-282 — described as running on **every** load and silently undoing user drags) and the `sw.js` old-bundle pin (L7) were each found by one reader only. Both cite specific lines; neither was independently re-verified here. **Verify before relying on either as load-bearing.**

**U7 — Test count.** One read reported 26 files / 251 tests. **Resolved this session: 25 / 243 on a clean tree** — the extra file was a sibling agent's scratch probe. Use 25/243.

**U8 — Coverage gaps that mean "green tests" prove little here.** There is **no test** for Focus mode, for the check-in sink ordering, for the stale/dismiss hide, or for **any interaction between the completion-driven mechanisms**. #113 has 20 tests, all #113-only. Every contradiction in §3 is untested and was found by mounting the app. **A redesign cannot lean on the suite to catch view-layer regressions.**

---

## 9. BACKLOG CONTACT POINTS (factual)

**#31** (iGoogle widget pages) has **zero code** — grep for "page" in `src/` returns one stale comment. It is not a ninth mechanism to build alongside these; it is the same object (`store.layouts`) with a library UI on top. · **#93** (Leftovers) is already blocked on this lane: yesterday's board may differ, so leftovers must come from `store.days`, not a layout's tile list. · **#109** (History) already implements the union-across-layouts read the rest of the app lacks — and renders only 8 of 24 tile types. · **#111** is worse than filed: `applyStore` runs `migrateLayout` on the onboarding result, so a new user who picks 4 tiles lands with **7 layouts**, including three day-type boards packed with a 19-tile Solo default they never chose. · **#115**: `effectiveDayData` overlays field-links only, never `config.rules` — so History renders auto-ticked days as all ○, chained rules read false, and #113 needed a scoped workaround (tileStatus.js:63-77) that itself introduced O8. Fixing #115 properly would let that workaround be deleted and would close O7. · **#103** (registry-driven config) intersects `COMPLETABLE_TYPES`, a hand-maintained mirror of a switch statement kept honest only by one test — any new tile type silently defaults to "can never complete."
