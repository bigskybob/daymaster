// #84 — header tabs: named sets of modules you can quickly flip between from the
// header, on web + mobile. A tile is assigned to a tab via config.tab; unassigned
// tiles appear only under the built-in "All" tab. Tabs live on the active layout
// (layout.tabs = [{ id, name }]); absent/empty means tabbing is off and every tile
// shows, exactly as before — so this is fully back-compat with pre-#84 layouts.

export const ALL_TAB = "all";

// Columns to render for a given tab. For "All" (or an empty/unknown id) every column
// is returned untouched (same reference, so React sees no change). For a named tab,
// each column keeps only the tiles assigned to it, and columns that end up empty are
// dropped so the grid doesn't leave gaps.
export function visibleColumnsForTab(columns = [], tabId = ALL_TAB) {
  if (!tabId || tabId === ALL_TAB) return columns;
  return columns
    .map(c => ({ ...c, tiles: (c.tiles || []).filter(t => (t.config?.tab || "") === tabId) }))
    .filter(c => (c.tiles || []).length > 0);
}

// Whether a tab id actually exists on a layout (used to fall back to "All" when the
// active tab was deleted or belongs to a different layout preset).
export function tabExists(layout, tabId) {
  return !!(layout?.tabs || []).some(t => t.id === tabId);
}

// ─── TIME-RELEVANT TABS (#87) ────────────────────────────────────────────────
// A tab may carry an optional time window (`start`/`end`, "HH:MM" 24h strings).
// When the clock falls inside a tab's window, that tab is auto-selected, so the
// dashboard condenses down to just the modules that matter right now. Tabs with
// no window are manual-only, and a layout with no windowed tabs behaves exactly
// as it did under #84 — so this is fully back-compat.

// Minutes since midnight for an "HH:MM" string, or null if unset/malformed.
// Rejects out-of-range values rather than silently wrapping them.
export function parseTime(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? "").trim());
  if (!m) return null;
  const h = +m[1], min = +m[2];
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// Minutes since midnight for a Date (defaults to now).
export function minutesNow(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}

// Is `mins` inside this tab's window? Windows are half-open [start, end) so
// adjacent tabs (…–11:00 and 11:00–…) never both claim the boundary minute.
// A window whose start is after its end wraps past midnight (22:00–05:00).
// No window, an unparseable one, or a zero-length one (start === end) = never.
export function tabWindowActive(tab, mins) {
  const start = parseTime(tab?.start), end = parseTime(tab?.end);
  if (start == null || end == null || start === end) return false;
  return start < end ? (mins >= start && mins < end) : (mins >= start || mins < end);
}

// The tab that the clock says should be showing, or null if none claims this
// minute. Overlapping windows resolve first-match-wins in tab order, which
// makes the strip's left-to-right order the tiebreaker the user can see.
export function activeTimeTab(tabs = [], mins = minutesNow()) {
  return (tabs || []).find(t => tabWindowActive(t, mins)) || null;
}

// Does any tab on this layout carry a usable window? Used to skip the clock
// ticker entirely on layouts that don't use time-relevant tabs.
export function hasTimeWindows(tabs = []) {
  return (tabs || []).some(t => parseTime(t?.start) != null && parseTime(t?.end) != null);
}

// ─── SUGGESTED TIME TABS (#87) ───────────────────────────────────────────────
// One-click starting point: three time-windowed tabs with every tile sorted into
// the part of the day it's actually for. Meant to be TUNED, not obeyed — it saves
// the blank-page problem, nothing more. Note the "All" tab is always present and
// unfiltered, so seeding this can never hide a tile permanently.

export const SUGGESTED_TABS = [
  { id: "tab-morning", name: "Morning", start: "05:00", end: "11:00" },
  { id: "tab-midday",  name: "Midday",  start: "11:00", end: "17:00" },
  { id: "tab-evening", name: "Evening", start: "17:00", end: "22:00" },
];

// Tile type → which part of the day that module is for. Morning = set intent and
// look ahead; Midday = do the work and log as you go; Evening = reflect and total
// up. Anything not listed falls to Midday, the catch-all working tab.
const SUGGESTED_BUCKET = {
  guidedam: "tab-morning", priorities: "tab-morning", gcal: "tab-morning",
  quote: "tab-morning", checklist: "tab-morning", twoprompt: "tab-morning",

  project: "tab-midday", mstodo: "tab-midday", checkin: "tab-midday",
  foodlog: "tab-midday", planks: "tab-midday", pushups: "tab-midday",
  dangles: "tab-midday", counter: "tab-midday", notionlinks: "tab-midday",
  embed: "tab-midday", ideas: "tab-midday", planner: "tab-midday",

  notes: "tab-evening", freelist: "tab-evening", musiclog: "tab-evening",
  numbers: "tab-evening", twolists: "tab-evening",
};

// Seed the three tabs onto a layout and assign every tile to one. Pure; returns a
// new layout. Refuses to run on a layout that already has tabs, so it can never
// silently trample hand-built ones.
export function suggestTimeTabs(layout) {
  if (!layout || (layout.tabs || []).length > 0) return layout;
  return {
    ...layout,
    tabs: SUGGESTED_TABS.map(t => ({ ...t })),
    columns: (layout.columns || []).map(c => ({
      ...c,
      tiles: (c.tiles || []).map(t => ({
        ...t,
        config: { ...t.config, tab: SUGGESTED_BUCKET[t.type] || "tab-midday" },
      })),
    })),
  };
}

// Remove a tab from the layout and clear it off any tile assigned to it, so deleting
// a tab never strands a tile pointing at a tab that no longer exists.
export function withoutTab(layout, tabId) {
  if (!layout) return layout;
  const tabs = (layout.tabs || []).filter(t => t.id !== tabId);
  const columns = (layout.columns || []).map(c => ({
    ...c,
    tiles: (c.tiles || []).map(t =>
      t.config?.tab === tabId ? { ...t, config: { ...t.config, tab: "" } } : t),
  }));
  return { ...layout, tabs, columns };
}
