// Store shape, default layout, and idempotent migrations (Phase 0 of #53).
import { deriveCheckinSlot } from "./rules.js";

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
