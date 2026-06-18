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
