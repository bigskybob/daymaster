// #105 — day-type layouts. A layout may declare which weekdays it owns
// (`layout.days = [1,2]`, JS getDay() indices, 0=Sun … 6=Sat). On those days that
// layout auto-activates, so the board you land on already matches the KIND of day
// you're having — home-with-wife, solo work, family weekend — without reaching for
// the header select yourself.
//
// The mechanism deliberately mirrors #87's time-relevant tabs: the calendar
// proposes, a manual pick wins until the next boundary (there, a window edge;
// here, the day roll), and a layout set with no `days` anywhere behaves exactly as
// it did before — so this is fully back-compat with every pre-#105 store.

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Normalize a layout's `days` to a clean, sorted, de-duplicated array of 0–6
// ints. Anything malformed (a string, an out-of-range index, a repeat) is
// dropped rather than silently shifting which weekday a board claims.
export function layoutDays(layout) {
  const raw = layout?.days;
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  for (const d of raw) {
    // Guard the coercion before it happens: Number(null), Number(false) and
    // Number([]) are all 0, so a malformed entry would otherwise claim Sunday.
    if (typeof d !== "number" && typeof d !== "string") continue;
    if (typeof d === "string" && d.trim() === "") continue;
    const n = Number(d);
    if (Number.isInteger(n) && n >= 0 && n <= 6) seen.add(n);
  }
  return [...seen].sort((a, b) => a - b);
}

// Does this layout claim `dayIdx`?
export function layoutClaimsDay(layout, dayIdx) {
  return layoutDays(layout).includes(dayIdx);
}

// Does any layout in the store declare a day-type? Used to skip the auto-select
// entirely on layout sets that don't use this feature, so pre-#105 stores keep
// resolving through `activeLayout` exactly as before.
export function hasDayTypes(layouts = {}) {
  return Object.values(layouts || {}).some(l => layoutDays(l).length > 0);
}

// The layout KEY the calendar says should be showing, or null when no layout
// claims this weekday. Overlapping claims resolve first-match-wins in key order,
// matching how activeTimeTab breaks ties on tab order.
export function layoutForDay(layouts = {}, dayIdx = new Date().getDay()) {
  for (const [key, layout] of Object.entries(layouts || {})) {
    if (layoutClaimsDay(layout, dayIdx)) return key;
  }
  return null;
}

// Resolve which layout should actually render: a live manual pick wins, else the
// calendar's, else the stored `activeLayout`, else the first layout present. Pure
// so the resolution order is testable without mounting the app. A manual pick
// naming a layout that no longer exists is ignored rather than pinning the board
// to a dead key — the same guard tabExists() gives the tab strip.
export function resolveLayoutKey(layouts = {}, { manual = null, auto = null, stored = "default" } = {}) {
  if (manual && layouts[manual]) return manual;
  if (auto && layouts[auto]) return auto;
  if (stored && layouts[stored]) return stored;
  return Object.keys(layouts || {})[0] || "default";
}

// Short "Mon · Tue" summary of the days a layout owns, for the layout manager and
// the header hint. Empty string when the layout claims none.
export function daysLabel(layout) {
  return layoutDays(layout).map(d => DAY_NAMES[d]).join(" · ");
}
