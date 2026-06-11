// Self-describing tile registry: one entry per tile type, the single place a tile
// is declared. Each entry carries everything the app needs to place, label,
// default-configure, and render a tile — so adding tile #N+1 is one entry here,
// not a four-file edit across registry / dispatch / defaults / library.
//
// `family` is the swim lane (capture | track | connect | derive):
//   capture — user types / checks things; per-day data
//   track   — quantitative habit measurement (often a timer)
//   connect — owns an external-service auth + fetch lifecycle
//   derive  — reads ACROSS other tiles (rollups / aggregates)
// The family drives the Add-tile library grouping and makes the architecture's
// lanes explicit rather than implied by accent color.
import React from "react";
import {
  TileChecklist, TileTextPrompt, TilePriorities, TileProject, TileFreeList,
  TileTwoPrompt, TileGuidedAM, TileCheckIn, TileTwoLists, TilePushups,
  TilePlanks, TileDangles, TileNumbers, TileFoodLog, TileQuote, TileNotes,
  TileGcal, TileCounter, TileNotionLinks, TileIdeas, TileMusicLog, TilePlanner,
  TileMsTodo, TileEmbed,
} from "../tiles.jsx";

// ─── TILE REGISTRY ────────────────────────────────────────────────────────────
// Declaration order is preserved by TILE_TYPES below (some consumers iterate it),
// though the library panel regroups by family for display.

export const TILES = {
  checklist:  { family: "capture", label: "Checklist",      icon: "☑", component: TileChecklist,
                defaultConfig: { title: "Checklist", accent: "#c8a96e", items: ["Item 1","Item 2","Item 3"] } },
  textprompt: { family: "capture", label: "Text Prompt",    icon: "✍", component: TileTextPrompt,
                defaultConfig: { title: "Prompt", accent: "#c8a96e", placeholder: "Write here..." } },
  priorities: { family: "capture", label: "Priorities",     icon: "①", component: TilePriorities,
                defaultConfig: { title: "My Top Priorities", count: 3 } },
  project:    { family: "capture", label: "Project Block",  icon: "▤", component: TileProject,
                defaultConfig: { title: "Project", count: 4 } },
  freelist:   { family: "capture", label: "Free List",      icon: "≡", component: TileFreeList,
                defaultConfig: { title: "List", count: 5, placeholder: "..." } },
  twoprompt:  { family: "capture", label: "Two Prompts",    icon: "◫", component: TileTwoPrompt,
                defaultConfig: { titleA: "Prompt A", titleB: "Prompt B", placeholderA: "...", placeholderB: "...", accent: "#c8a96e" } },
  // #3 — three-prompt guided flow tile (Gratitude → Intention → Priority by default).
  guidedam:   { family: "capture", label: "Guided AM",      icon: "➤", component: TileGuidedAM,
                defaultConfig: { titleA: "Gratitude", titleB: "Intention", titleC: "Today's Priority",
                  placeholderA: "What are you grateful for?",
                  placeholderB: "What do you intend to accomplish?",
                  placeholderC: "The one thing that matters most today...",
                  accent: "#c8a96e", mode: "all" } },
  // Compound: primarily a capture tile (checks / feelings), but also DERIVES from
  // the priorities + planks + food tiles. Filed under capture for the library.
  // #45 — planksSlot defaults to "am" for newly added check-ins; existing tiles get it via migration.
  checkin:    { family: "capture", label: "Check-In",       icon: "⏱", component: TileCheckIn,
                defaultConfig: { title: "Check-In", color: "#8B4513", planksSlot: "am" } },
  twolists:   { family: "capture", label: "Two Lists",      icon: "⊞", component: TileTwoLists,
                defaultConfig: { titleA: "List A", titleB: "List B", countA: 5, countB: 5 } },
  foodlog:    { family: "capture", label: "Food Log",       icon: "⬡", component: TileFoodLog,
                defaultConfig: { title: "Food Log", meals: ["Breakfast","Lunch","Dinner","Snack"] } },
  notes:      { family: "capture", label: "Notes",          icon: "✎", component: TileNotes,
                defaultConfig: { title: "Notes" } },
  // #11 — single-checkbox + free-text-note daily log for music sessions.
  musiclog:   { family: "capture", label: "Music Log",      icon: "♪", component: TileMusicLog,
                defaultConfig: { title: "Music Today", accent: "#8a6abf" } },
  // #15 — "Build With AI" running idea log. Ideas live in config (layout-level),
  // not per-day data, so the list persists and accumulates across every day.
  ideas:      { family: "capture", label: "AI Ideas",       icon: "✲", component: TileIdeas,
                defaultConfig: { title: "Build With AI", accent: "#7a6abf", ideas: [] } },
  // #16 — pick today's AI build + break into steps (per-day data).
  planner:    { family: "capture", label: "AI Planner",     icon: "◇", component: TilePlanner,
                defaultConfig: { title: "Today's AI Build", accent: "#7a6abf" } },

  // ── track ──
  planks:     { family: "track", label: "Planks",         icon: "▬", component: TilePlanks,
                defaultConfig: { title: "Planks" } },
  pushups:    { family: "track", label: "Pushups",        icon: "◉", component: TilePushups,
                defaultConfig: { title: "Pushup Tracker" } },
  dangles:    { family: "track", label: "Dangles",        icon: "↕", component: TileDangles,
                defaultConfig: { title: "Dangles" } },
  counter:    { family: "track", label: "Counter",        icon: "+", component: TileCounter,
                defaultConfig: { title: "Counter", target: 10 } },

  // ── connect ──
  gcal:       { family: "connect", label: "Google Calendar", icon: "🗓", component: TileGcal,
                defaultConfig: { title: "Today's Calendar", refreshMinutes: 10, calendarId: "primary" } },
  // #46 — static list of clickable Notion (or any) links. #50 adds live DB favorites.
  notionlinks:{ family: "connect", label: "Notion Links",    icon: "⌘", component: TileNotionLinks,
                defaultConfig: { title: "Notion Quick Links", accent: "#7a6abf", dynamic: true,
                  links: [
                    { label: "Project Enhancement Hub", url: "https://www.notion.so/Project-Enhancement-Hub-35ed876ed61e8176b89acca7984123ca" },
                    { label: "Projects Home",           url: "https://www.notion.so/Projects-Home-e482841b692440fc9afcef8ad6f5caf8" },
                    { label: "Applications (Job Lab)",  url: "https://www.notion.so/d16c804a265b4834b7af42ab91bb0c1d?v=4faf230febe3461a91bd4905723d077e" },
                  ] } },
  // #34 — Microsoft To Do (MSAL + Graph). listId chosen at runtime, saved to config.
  mstodo:     { family: "connect", label: "MS To Do",      icon: "✔", component: TileMsTodo,
                defaultConfig: { title: "Microsoft To Do", accent: "#3a6ea5" } },
  quote:      { family: "connect", label: "Daily Quote",   icon: "✦", component: TileQuote,
                defaultConfig: { title: "Today's Inspiration" } },
  // #21 — generic iframe embed. Paste a Spotify/YouTube/etc. embed URL via Configure.
  embed:      { family: "connect", label: "Embed",         icon: "▭", component: TileEmbed,
                defaultConfig: { title: "Embed", accent: "#7a6abf", url: "", height: 152 } },

  // ── derive ──
  numbers:    { family: "derive", label: "Daily Numbers", icon: "▲", component: TileNumbers,
                defaultConfig: { title: "Daily Numbers" } },
};

// Human-facing labels for each family, in library display order.
export const FAMILIES = [
  { key: "capture", label: "Capture" },
  { key: "track",   label: "Track" },
  { key: "connect", label: "Connect" },
  { key: "derive",  label: "Derive" },
];

// ─── BACK-COMPAT DERIVED EXPORTS ──────────────────────────────────────────────
// Existing consumers (ConfigModal, store.js, the library) read these; deriving
// them from TILES keeps a single source of truth.

export const TILE_TYPES = Object.fromEntries(
  Object.entries(TILES).map(([type, t]) => [type, { label: t.label, icon: t.icon, family: t.family }])
);

export function defaultConfig(type) {
  const entry = TILES[type];
  // structuredClone so each tile gets its own copy of nested arrays/objects
  // (preserves the prior "fresh literal per call" semantics).
  return entry ? structuredClone(entry.defaultConfig) : { title: type };
}

// ─── FIELD SCHEMA (field-links Phase A) ───────────────────────────────────────
// Per-tile enumeration of addressable fields for the field-link system: every
// checkbox/text field a link can read (source) or drive (target). kind ∈ text |
// checkbox. A field with `path` is read at data[path] (dot/bracket path) and is
// targetable; a field with `derive(data)` is a computed SOURCE only (no path).
// Config-sized lists expand to one field per row; data-sized lists (planner steps,
// check-in items, ideas) are exposed as aggregate derive-sources instead, since a
// row that may not exist can't be a stable target. Tiles absent here have no
// addressable fields (external/connect tiles, numbers, ideas).
const FIELD_SCHEMAS = {
  checklist:  c => (c.items || []).map((it, i) => ({ id: `checks[${i}]`, path: `checks[${i}]`, label: it || `Item ${i+1}`, kind: "checkbox" })),
  textprompt: c => [{ id: "text", path: "text", label: c.title || "Text", kind: "text" }],
  notes:      c => [{ id: "text", path: "text", label: c.title || "Notes", kind: "text" }],
  priorities: c => {
    const n = c.count || 3, out = [];
    for (let i = 0; i < n; i++) {
      out.push({ id: `priorities[${i}].text`, path: `priorities[${i}].text`, label: `Priority ${i+1}`, kind: "text" });
      out.push({ id: `priorities[${i}].done`, path: `priorities[${i}].done`, label: `Priority ${i+1} done`, kind: "checkbox" });
    }
    return out;
  },
  project: c => {
    const n = c.count || 4, out = [];
    for (let i = 0; i < n; i++) {
      out.push({ id: `items[${i}].text`, path: `items[${i}].text`, label: `Item ${i+1}`, kind: "text" });
      out.push({ id: `items[${i}].done`, path: `items[${i}].done`, label: `Item ${i+1} done`, kind: "checkbox" });
    }
    return out;
  },
  freelist:  c => Array.from({ length: c.count || 5 }, (_, i) => ({ id: `items[${i}]`, path: `items[${i}]`, label: `Item ${i+1}`, kind: "text" })),
  twoprompt: c => [
    { id: "textA", path: "textA", label: c.titleA || "Prompt A", kind: "text" },
    { id: "textB", path: "textB", label: c.titleB || "Prompt B", kind: "text" },
  ],
  guidedam: c => [
    { id: "textA", path: "textA", label: c.titleA || "Gratitude", kind: "text" },
    { id: "textB", path: "textB", label: c.titleB || "Intention", kind: "text" },
    { id: "textC", path: "textC", label: c.titleC || "Priority", kind: "text" },
  ],
  twolists: c => [
    ...Array.from({ length: c.countA || 5 }, (_, i) => ({ id: `itemsA[${i}]`, path: `itemsA[${i}]`, label: `${c.titleA || "List A"} ${i+1}`, kind: "text" })),
    ...Array.from({ length: c.countB || 5 }, (_, i) => ({ id: `itemsB[${i}]`, path: `itemsB[${i}]`, label: `${c.titleB || "List B"} ${i+1}`, kind: "text" })),
  ],
  foodlog: c => (c.meals || []).flatMap((m, i) => [
    { id: `logs[${i}].done`, path: `logs[${i}].done`, label: `${m} logged`, kind: "checkbox" },
    { id: `logs[${i}].text`, path: `logs[${i}].text`, label: m, kind: "text" },
  ]),
  checkin: () => [
    { id: "planks",      path: "planks",      label: "Planks or Pushups", kind: "checkbox" },
    { id: "food",        path: "food",        label: "Food Logged",       kind: "checkbox" },
    { id: "priorities",  path: "priorities",  label: "Next Priorities",   kind: "checkbox" },
    { id: "feeling",     path: "feeling",     label: "Feeling",           kind: "text" },
    { id: "feelingNote", path: "feelingNote", label: "Feeling note",      kind: "text" },
  ],
  musiclog: () => [
    { id: "done", path: "done", label: "Made music", kind: "checkbox" },
    { id: "note", path: "note", label: "Note",       kind: "text" },
  ],
  planner: () => [
    { id: "build",     path: "build", label: "Build name",     kind: "text" },
    { id: "@anystep",  label: "Any step done",  kind: "checkbox", derive: d => (d.steps || []).some(s => s && s.done) },
    { id: "@allsteps", label: "All steps done", kind: "checkbox", derive: d => { const s = d.steps || []; return s.length > 0 && s.every(x => x && x.done); } },
  ],
  planks:  () => [["am","AM"],["noon","Noon"],["afternoon","PM"],["evening","Eve"]].map(([k, l]) =>
    ({ id: `planks.${k}`, path: `planks.${k}`, label: `Planks ${l}`, kind: "checkbox" })),
  dangles: () => ["AM","Noon","PM","Eve"].map((l, i) => ({ id: `checks[${i}]`, path: `checks[${i}]`, label: `Dangle ${l}`, kind: "checkbox" })),
  pushups: () => [{ id: "@any",      label: "Any reps logged",  kind: "checkbox", derive: d => Object.values(d.pushups || {}).some(Boolean) }],
  counter: () => [{ id: "@positive", label: "Count above zero", kind: "checkbox", derive: d => (d.count || 0) > 0 }],
};

// Addressable fields for a tile instance. [] for tiles with none.
export function tileFields(type, config = {}) {
  const fn = FIELD_SCHEMAS[type];
  return fn ? fn(config || {}) : [];
}

// ─── TILE DISPATCH ────────────────────────────────────────────────────────────
// Registry lookup replaces the old per-type switch. Every available prop is passed
// through; each tile component destructures only what it needs (extras are ignored).
export function RenderTile({
  tile, data, onChange, editMode, onRemove, onConfig, onConfigPatch,
  allDayData, tilesById, links, isAuthed, authEpoch, onReauth,
}) {
  const entry = TILES[tile.type];
  if (!entry) {
    return React.createElement("div", { style: { color: "var(--text-muted)", padding: "12px", fontSize: "11px" } }, `Unknown: ${tile.type}`);
  }
  return React.createElement(entry.component, {
    config: tile.config,
    // stamp _type so cross-tile readers (numbers, checkin, project) can identify data
    onChange: d => onChange({ ...d, _type: tile.type }),
    data, editMode, onRemove, onConfig, onConfigPatch,
    allDayData, tilesById, tileId: tile.id,
    links, // field-links (Phase B) — checkbox tiles read this to auto-check targets
    isAuthed, authEpoch, onReauth,
  });
}
