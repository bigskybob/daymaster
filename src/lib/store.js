// Store shape, default layout, and idempotent migrations (Phase 0 of #53).
import { deriveCheckinSlot } from "./rules.js";
import { defaultConfig } from "../tiles/registry.js";

export function buildDefaultLayout() {
  return {
    name: "Daily",
    columns: [
      {
        id: "col-left", width: 22,
        tiles: [
          { id: "donts",      type: "textprompt", config: { title: "DON'T", accent: "#a04040", placeholder: "Things to avoid today..." } },
          { id: "priorities", type: "priorities", config: { title: "My Top Priorities", count: 3 } },
          { id: "proj1",      type: "project",    config: { title: "Project 1", count: 5, defaultOpen: false } },
          { id: "proj2",      type: "project",    config: { title: "Project 2", count: 4, defaultOpen: false } },
          { id: "proj3",      type: "project",    config: { title: "Project 3", count: 4, defaultOpen: false } },
          { id: "delayed",    type: "freelist",   config: { title: "Delayed Google / Amazon", count: 6, placeholder: "Search later..." } },
        ]
      },
      {
        id: "col-center", width: 44,
        tiles: [
          // #39 — Mise-en-place pinned to top. On mobile, col-center renders first,
          // so this is the first thing the user sees. Automation rules from #19 preserved.
          { id: "morning", type: "checklist", config: { title: "Mise-en-place", accent: "#c8a96e",
            items: [
              "Hydrate — water first",
              "Supplements / meds",
              "Move — stretch or walk",
              "Review yesterday's incomplete",
              "Set top 3 + frog",
              "Gratitude + intention",
              "Mise en Plac — desk ready",
              "Watch on / devices charged",
              "Review calendar",
              "DON'T list set",
              "8:30 check-in ready"
            ],
            // #49 — Mise auto-tick rules. Index 5 ("Gratitude + intention") uses the new
            // generic `tile-event` connector pointing at the guided AM tile's "gratitude-intention"
            // event (textA && textB filled), replacing the legacy twoprompt-both rule
            // since gratint is no longer a twoprompt tile.
            rules: {
              4: { type: "priorities-any", tileId: "priorities" },
              5: { type: "tile-event", sourceTileId: "gratint", event: "gratitude-intention" },
              10: { type: "checkin-any",   tileId: "checkin1" }
            }
          } },
          { id: "quote",    type: "quote",     config: { title: "Today's Inspiration" } },
          // #3 — guided AM flow: Gratitude → Intention → Today's Priority.
          // mode: "all" (default) shows all three prompts; "guided" walks them one at a time.
          { id: "gratint",  type: "guidedam",  config: {
              titleA: "Gratitude", titleB: "Intention", titleC: "Today's Priority",
              placeholderA: "What are you grateful for?",
              placeholderB: "What do you intend to accomplish?",
              placeholderC: "The one thing that matters most today...",
              accent: "#c8a96e", mode: "all"
          } },
          // #38 — Inline Google Calendar widget (replaces the manual freelist calendar)
          { id: "calendar", type: "gcal",      config: { title: "Today's Calendar", refreshMinutes: 10, calendarId: "primary" } },
          // #45 — planksSlot drives auto-tick of "Planks or Pushups" from the planks tile state.
          { id: "checkin1", type: "checkin",   config: { title: "8:30",  color: "#8B4513", planksSlot: "am" } },
          { id: "checkin2", type: "checkin",   config: { title: "11:00", color: "#B8860B", planksSlot: "noon" } },
          { id: "checkin3", type: "checkin",   config: { title: "2:00",  color: "#1a4a7a", planksSlot: "afternoon" } },
          { id: "pmcheck",  type: "checklist", config: { title: "PM Routine", accent: "#4a7a6a", items: ["Inbox zero or triaged","Desk / office cleared","Charge all devices","Tomorrow's top 3 set","Dinner planned or done","Log food for the day","Grateful moment — one thing","Wind down — no screens 30min"] } },
          { id: "twocol1",  type: "twolists",  config: { titleA: "Tomorrow I'll", titleB: "Remind Myself To", countA: 5, countB: 5 } },
          { id: "foodlog",  type: "foodlog",   config: { title: "Food Log", meals: ["Breakfast","Lunch","Dinner","Snack"] } },
          { id: "twocol2",  type: "twolists",  config: { titleA: "Notes / Misc", titleB: "Someday Maybe", countA: 4, countB: 4 } },
        ]
      },
      {
        id: "col-right", width: 24,
        tiles: [
          { id: "exercise", type: "checklist", config: { title: "Exercise Today", accent: "#4a7a4a",
            items: [
              "Pushups over 75",
              "Planks (2 of 4 sets)",
              "Sobriety 'til 5",
              "No drinking today",
              "No food after 8 yesterday"
            ],
            rules: {
              0: { type: "pushups-total-gte", tileId: "pushups", threshold: 75 },
              1: { type: "planks-count-gte",  tileId: "planks",  threshold: 2 }
            }
          } },
          { id: "planks",   type: "planks",    config: { title: "Planks" } },
          { id: "dangles",  type: "dangles",   config: { title: "Dangles" } },
          { id: "pushups",  type: "pushups",   config: { title: "Pushup Tracker" } },
          { id: "musiclog", type: "musiclog",  config: { title: "Music Today", accent: "#8a6abf" } },
          { id: "numbers",  type: "numbers",   config: { title: "Daily Numbers" } },
        ]
      }
    ]
  };
}

export function emptyStore() {
  return { layouts: { default: buildDefaultLayout() }, activeLayout: "default", days: {}, version: 6 };
}

// #61 — canonical check-in slots offered by the onboarding interview. Each is an
// independent toggle with an editable default time; `planksSlot` carries the
// AM/PM intent (so checkinScheduleMin parses the bare clock correctly) and drives
// the #44/#45 auto-tick + #35 stale logic. The recommended default is the first
// three on, evening off — but any subset is valid (e.g. evening only).
export const ONBOARDING_CHECKIN_SLOTS = [
  { key: "morning",   label: "Morning",   time: "8:30",  planksSlot: "am",        default: true  },
  { key: "midday",    label: "Midday",    time: "11:00", planksSlot: "noon",      default: true  },
  { key: "afternoon", label: "Afternoon", time: "2:00",  planksSlot: "afternoon", default: true  },
  { key: "evening",   label: "Evening",   time: "6:00",  planksSlot: "evening",   default: false },
];

// #61 — Beta Onboarding (Phase 2): build a personalized starter store from the
// guided-interview answers, per the LOCKED answer→tile map. Reuses the polished
// tile definitions from buildDefaultLayout() (by id) so seeded tiles get the same
// configs/auto-rules as the canonical layout; check-ins are built fresh from the
// interview (times / capture mode / notify). Called only when the user FINISHES
// the flow (commit-on-finish — back/skip never persist).
//
// answers shape:
//   { q1: string[],                                   // "what matters" chips
//     fitness: { planks, pushups, dangles },          // gated by q1 "health"
//     calendar: { connect },                          // gated by q1 "calendar"
//     project: { name },                              // gated by q1 "projects"
//     checkins: { want, slots: [{time, planksSlot}], capture, notify } }
//
// Placement: rather than inherit each tile's canonical column (which piled the
// commonly-picked tiles into the center), tiles are seeded into a BALANCED layout —
// Mise-en-place anchors center (migrateLayout enforces this too), then the rest are
// placed largest-group-first into the currently-shortest column (#32). Indivisible
// groups (fitness trackers, check-ins) stay together; singletons fill the gaps.
// `base` is the user's CURRENT store (or null/empty for a true first run). When it
// already holds content (history or non-empty layouts), onboarding must be
// NON-DESTRUCTIVE: it preserves every existing day + layout and adds the seeded
// layout as a new "setup" layout, switching to it. Only a genuinely empty/first-run
// store gets the seeded layout written straight to `default`. (Previously this
// returned `days:{}` + a sole `default`, which wiped history + layouts on re-run.)
export function buildOnboardingLayout(answers = {}, base = null) {
  const q1        = new Set(answers.q1 || []);
  const fitness   = answers.fitness || {};
  const checkins  = answers.checkins || {};
  const projName  = (answers.project?.name || "").trim();
  const connectCal = answers.calendar?.connect !== false; // default yes once on the step

  // Canonical tile definitions, keyed by id, to seed polished configs + auto-rules.
  const byId = {};
  for (const col of buildDefaultLayout().columns) for (const t of col.tiles) byId[t.id] = t;
  // Clone a canonical tile (deep config clone), applying optional config overrides.
  const clone = (id, over) => ({ ...byId[id], config: { ...byId[id].config, ...(over || {}) } });

  // Empty 3-column shell (same ids/widths as the default layout).
  const columns = [
    { id: "col-left",   width: 22, tiles: [] },
    { id: "col-center", width: 44, tiles: [] },
    { id: "col-right",  width: 24, tiles: [] },
  ];
  const center = columns[1];
  // #32 — append a group of tiles together into the currently-shortest column
  // (ties → leftmost). Keeps logically-grouped tiles intact while balancing counts.
  const placeBalanced = group => {
    let best = columns[0];
    for (const c of columns) if (c.tiles.length < best.tiles.length) best = c;
    best.tiles.push(...group);
  };

  // Mise-en-place is anchored to the top of center (locked baseline; #39 migration
  // would move it here regardless).
  center.tiles.push(clone("morning"));

  // Build the placement groups (each kept together). Baseline is always present.
  const groups = [[clone("priorities")], [clone("quote")]];
  if (q1.has("priorities")) groups.push([clone("gratint")]);
  if (q1.has("calendar") && connectCal) groups.push([clone("calendar")]);
  if (q1.has("food")) groups.push([clone("foodlog")]);
  if (q1.has("projects")) groups.push([clone("proj1", projName ? { title: projName, defaultOpen: true } : null)]);
  if (q1.has("health")) {
    groups.push([clone("exercise")]);
    const trackers = [];
    if (fitness.planks)  trackers.push(clone("planks"));
    if (fitness.pushups) trackers.push(clone("pushups"));
    if (fitness.dangles) trackers.push(clone("dangles"));
    if (trackers.length) groups.push(trackers);
  }
  // #15/#16 — Building/learning: AI Ideas + AI Planner (not in the default layout).
  if (q1.has("building")) groups.push([
    { id: "ideas1",   type: "ideas",   config: defaultConfig("ideas") },
    { id: "planner1", type: "planner", config: defaultConfig("planner") },
  ]);
  // Check-ins — built fresh from the interview (own locked dimension): one tile per
  // enabled slot with its editable time + AM/PM-correct planksSlot, plus the shared
  // capture mode and per-check-in notify. Falls back to the recommended defaults.
  if (checkins.want) {
    const slots = (checkins.slots && checkins.slots.length)
      ? checkins.slots
      : ONBOARDING_CHECKIN_SLOTS.filter(s => s.default).map(s => ({ time: s.time, planksSlot: s.planksSlot }));
    const colors = ["#8B4513", "#B8860B", "#1a4a7a", "#4a4a6a"];
    const checkinTiles = slots.map((s, i) => ({
      id: `checkin${i + 1}`,
      type: "checkin",
      config: {
        title: String(s.time).trim() || `Check-in ${i + 1}`,
        color: colors[i % colors.length],
        planksSlot: s.planksSlot || "none",
        capture: checkins.capture === "feelings" ? "feelings" : "both",
        notify: !!checkins.notify,
      },
    }));
    if (checkinTiles.length) groups.push(checkinTiles);
  }

  // Largest groups first → the most even distribution given indivisible blocks.
  // Stable sort (index tiebreak) keeps the build deterministic.
  groups
    .map((g, i) => ({ g, i }))
    .sort((a, b) => (b.g.length - a.g.length) || (a.i - b.i))
    .forEach(({ g }) => placeBalanced(g));

  const seeded = { name: "Daily", columns };

  // Does the existing store hold anything worth preserving?
  const hasContent = base && (
    Object.keys(base.days || {}).length > 0 ||
    Object.values(base.layouts || {}).some(l => (l.columns || []).some(c => (c.tiles || []).length > 0))
  );

  if (hasContent) {
    // Re-run on a built Daymaster: keep ALL history + layouts; add the seeded layout
    // as "setup" and switch to it. Re-running again just overwrites "setup".
    return {
      ...base,
      days: base.days || {},
      layouts: { ...base.layouts, setup: seeded },
      activeLayout: "setup",
      version: 6,
    };
  }

  return { layouts: { default: seeded }, activeLayout: "default", days: {}, version: 6 };
}

// One-shot, idempotent layout migrations for existing users.
// Safe to run on every load — only mutates when the old shape is present.
export function migrateLayout(store) {
  if (!store?.layouts) return store;
  let changed = false;
  for (const key of Object.keys(store.layouts)) {
    const layout = store.layouts[key];
    if (!layout?.columns) continue;
    const cols = layout.columns;
    const centerIdx = cols.findIndex(c => c.id === "col-center");
    if (centerIdx < 0) continue;

    // #39 — ensure the "morning" (Mise-en-place) tile is first in col-center
    let morningTile = null;
    let morningCol  = -1;
    let morningPos  = -1;
    for (let ci = 0; ci < cols.length; ci++) {
      const t = cols[ci].tiles?.find(t => t.id === "morning");
      if (t) { morningTile = t; morningCol = ci; morningPos = cols[ci].tiles.indexOf(t); break; }
    }
    if (morningTile && !(morningCol === centerIdx && morningPos === 0)) {
      cols[morningCol].tiles = cols[morningCol].tiles.filter(t => t.id !== "morning");
      cols[centerIdx].tiles = [morningTile, ...cols[centerIdx].tiles];
      changed = true;
    }
    // Optional rename: if it's still the default "AM Routine", surface the new name
    const mt = cols[centerIdx].tiles.find(t => t.id === "morning");
    if (mt && mt.config?.title === "AM Routine") {
      mt.config = { ...mt.config, title: "Mise-en-place" };
      changed = true;
    }

    // #38 — convert the manual freelist "calendar" tile to the new gcal tile type
    for (const col of cols) {
      const calIdx = col.tiles?.findIndex(t => t.id === "calendar" && t.type === "freelist");
      if (calIdx >= 0) {
        col.tiles[calIdx] = {
          id: "calendar",
          type: "gcal",
          config: { title: "Today's Calendar", refreshMinutes: 10, calendarId: "primary" }
        };
        changed = true;
      }
    }

    // #41 — backfill calendarId on any gcal tile missing it (covers the pre-#41 single-calendar shape)
    for (const col of cols) {
      for (const tile of col.tiles||[]) {
        if (tile.type === "gcal" && !tile.config?.calendarId) {
          tile.config = { ...tile.config, calendarId: "primary" };
          changed = true;
        }
      }
    }

    // #30 — rewrite the legacy Exercise Today tile (venues/states list) to the new habit list + auto-rules.
    // Guarded on the legacy signal "24hr Fitness" so the migration is idempotent.
    for (const col of cols) {
      for (const tile of col.tiles||[]) {
        if (tile.id === "exercise" && tile.type === "checklist"
            && Array.isArray(tile.config?.items)
            && tile.config.items.includes("24hr Fitness")) {
          tile.config = {
            ...tile.config,
            items: [
              "Pushups over 75",
              "Planks (2 of 4 sets)",
              "Sobriety 'til 5",
              "No drinking today",
              "No food after 8 yesterday"
            ],
            rules: {
              0: { type: "pushups-total-gte", tileId: "pushups", threshold: 75 },
              1: { type: "planks-count-gte",  tileId: "planks",  threshold: 2 }
            }
          };
          changed = true;
        }
      }
    }

    // #3 — convert the gratint twoprompt tile to the new guidedam tile (3-prompt flow).
    // Preserves titleA/titleB/placeholderA/placeholderB/accent; adds title/placeholder C defaults.
    // Per-day data carries forward unchanged (textA, textB persist; textC starts empty).
    // Guarded on (id="gratint" && type="twoprompt") so the migration is idempotent.
    for (const col of cols) {
      for (const tile of col.tiles||[]) {
        if (tile.id === "gratint" && tile.type === "twoprompt") {
          const oldCfg = tile.config || {};
          tile.type = "guidedam";
          tile.config = {
            titleA:       oldCfg.titleA       || "Gratitude",
            titleB:       oldCfg.titleB       || "Intention",
            titleC:       "Today's Priority",
            placeholderA: oldCfg.placeholderA || "What are you grateful for?",
            placeholderB: oldCfg.placeholderB || "What do you intend to accomplish?",
            placeholderC: "The one thing that matters most today...",
            accent:       oldCfg.accent       || "#c8a96e",
            mode:         "all",
          };
          changed = true;
        }
      }
    }

    // #45 — backfill planksSlot on existing checkin tiles, derived from title.
    // Guarded on (type="checkin" && planksSlot===undefined) so the migration is idempotent.
    for (const col of cols) {
      for (const tile of col.tiles||[]) {
        if (tile.type === "checkin" && tile.config && tile.config.planksSlot === undefined) {
          tile.config = { ...tile.config, planksSlot: deriveCheckinSlot(tile.config.title) };
          changed = true;
        }
      }
    }

    // #49 — upgrade legacy twoprompt-both rules pointing at gratint to the new
    // generic tile-event mechanism. After the gratint tile became a guidedam tile,
    // twoprompt-both still happens to evaluate correctly (textA && textB), but the
    // rule type is misleadingly named and isn't expressible via the new editor UI.
    // Guarded on (rule.type === "twoprompt-both" && rule.tileId === "gratint").
    for (const col of cols) {
      for (const tile of col.tiles||[]) {
        if (!tile.config?.rules) continue;
        const newRules = { ...tile.config.rules };
        let mut = false;
        for (const k of Object.keys(newRules)) {
          const r = newRules[k];
          if (r?.type === "twoprompt-both" && r.tileId === "gratint") {
            newRules[k] = { type: "tile-event", sourceTileId: "gratint", event: "gratitude-intention" };
            mut = true;
          }
        }
        if (mut) { tile.config = { ...tile.config, rules: newRules }; changed = true; }
      }
    }
  }

  // #33 — seed a few preset layouts derived from the default. Idempotent: each
  // preset key is only added if missing. Users can rename / delete via the UI.
  // Each preset is a fully independent layout (deep clone) so edits don't bleed
  // back into Daily.
  const PRESET_SEEDS = [
    { key: "am-focus",   name: "AM Focus",     tileIds: ["donts","priorities","morning","quote","gratint","calendar","checkin1","exercise","planks","pushups","dangles"] },
    { key: "pm-wind",    name: "PM Wind-down", tileIds: ["priorities","pmcheck","checkin3","twocol1","foodlog","twocol2","musiclog","numbers"] },
    { key: "fitness",    name: "Fitness",      tileIds: ["priorities","morning","checkin1","exercise","planks","pushups","dangles","numbers"] },
  ];
  for (const seed of PRESET_SEEDS) {
    if (!store.layouts[seed.key]) {
      const def = buildDefaultLayout();
      def.name = seed.name;
      def.columns = def.columns.map(c => ({
        ...c,
        tiles: c.tiles.filter(t => seed.tileIds.includes(t.id))
      })).filter(c => c.tiles.length > 0 || c.id === "col-center"); // keep col-center even if empty so layout doesn't collapse weirdly
      store.layouts[seed.key] = def;
      changed = true;
    }
  }

  if (changed) store.version = 6;
  return store;
}
