// Field-link engine (Phase A): pure evaluation of "this checkbox auto-checks when
// that field is filled/checked" links. No React, no UI — data in, booleans out.
//
// A link: { target: { tileId, fieldId }, sources: [{ tileId, fieldId }], mode }
//   sources — one or more fields combined by `mode`: "all" (every source complete →
//             AND) or "any" (some source complete → OR, the default). A field is
//             complete when: text → non-empty; checkbox → checked; derive → computed.
//   target  — a checkbox field (Phase B writes it). Multiple links to the same
//             target OR together. (Legacy single-`source` shape is still accepted.)
// Links live at the layout level (layout.links). Field definitions come from the
// registry's per-tile schema (tileFields), so this engine stays declarative.
import { tileFields } from "../tiles/registry.js";

// Resolve a dot/bracket path ("checks[2]", "priorities[0].done", "planks.am",
// "logs[1].text", "textA") into a value within a tile's per-day data object.
export function getPath(obj, path) {
  if (obj == null || !path) return undefined;
  const parts = String(path).replace(/\[(\d+)\]/g, ".$1").split(".").filter(p => p !== "");
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

// Is a single field "complete" given its tile's per-day data?
//   text     → non-empty (trimmed)
//   checkbox → truthy
//   derive   → field.derive(data)
export function fieldComplete(field, data) {
  if (!field) return false;
  if (typeof field.derive === "function") return !!field.derive(data || {});
  const v = getPath(data || {}, field.path);
  if (field.kind === "text") return typeof v === "string" ? v.trim().length > 0 : !!v;
  return !!v;
}

// Look up a link source's field definition (via the tile's registry schema) and
// evaluate its completion against that tile's per-day data.
export function sourceComplete(source, allDayData, tilesById) {
  if (!source) return false;
  const tile = tilesById?.[source.tileId];
  if (!tile) return false;
  const field = tileFields(tile.type, tile.config).find(f => f.id === source.fieldId);
  if (!field) return false;
  return fieldComplete(field, allDayData?.[source.tileId]);
}

// The source list of a link (supports the legacy single-`source` shape).
export function linkSources(link) {
  if (Array.isArray(link?.sources)) return link.sources;
  return link?.source ? [link.source] : [];
}

// Is a single link's source condition met? "all" → every source complete (AND);
// otherwise "any" → some source complete (OR, the default).
export function linkSatisfied(link, allDayData, tilesById) {
  const sources = linkSources(link);
  if (!sources.length) return false;
  const all = link?.mode === "all";
  return all
    ? sources.every(s => sourceComplete(s, allDayData, tilesById))
    : sources.some(s => sourceComplete(s, allDayData, tilesById));
}

// Does any link currently drive (auto-check) the given target checkbox? OR across
// every link pointing at that target.
export function isLinkAutoOn(targetTileId, targetFieldId, links, allDayData, tilesById) {
  if (!Array.isArray(links)) return false;
  for (const link of links) {
    if (link?.target?.tileId !== targetTileId || link?.target?.fieldId !== targetFieldId) continue;
    if (linkSatisfied(link, allDayData, tilesById)) return true;
  }
  return false;
}

// The set of a tile's target fieldIds that are currently auto-on. Lets a tile
// resolve all its links in one pass when rendering (Phase B).
export function autoOnFieldIds(targetTileId, links, allDayData, tilesById) {
  const on = new Set();
  if (!Array.isArray(links)) return on;
  for (const link of links) {
    if (link?.target?.tileId !== targetTileId) continue;
    if (on.has(link.target.fieldId)) continue;
    if (linkSatisfied(link, allDayData, tilesById)) on.add(link.target.fieldId);
  }
  return on;
}
