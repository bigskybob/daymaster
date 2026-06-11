// Tile completion + title helpers, shared by the App shell (Focus mode collapse,
// history labels). Kept out of the tile renderers so these read-only derivations
// don't pull React into pure-logic call sites.
import { checkinIsDone } from "./rules.js";
import { TILE_TYPES } from "../tiles/registry.js";

// #2 / #54 — is a tile "complete" for the day? Used by Focus mode to collapse
// finished sections into a one-line summary. Conservative: types we don't model
// (e.g. checklist with auto-rules) are never treated as complete, so they stay
// fully visible. Covers the morning-input + daily-flow tiles that benefit most.
export function tileComplete(tile, d = {}, allDayData = {}) {
  switch (tile.type) {
    case "checkin":    return checkinIsDone(tile.config, d, allDayData);
    case "textprompt": return !!(d.text && d.text.trim());
    case "twoprompt":  return !!(d.textA?.trim() && d.textB?.trim());
    case "guidedam":   return !!(d.textA?.trim() && d.textB?.trim() && d.textC?.trim());
    case "priorities": {
      const p = (d.priorities || []).filter(x => x.text?.trim());
      return p.length > 0 && p.every(x => x.done);
    }
    case "project": {
      const items = (d.items || []).map(it => typeof it === "string" ? { text: it, done: false } : (it || {})).filter(x => x.text?.trim());
      return items.length > 0 && items.every(x => x.done);
    }
    case "foodlog": {
      const logs = d.logs || [];
      const meals = (tile.config?.meals || []).length || 4;
      return logs.length > 0 && logs.filter(l => l.done).length >= meals;
    }
    case "planner": {
      const steps = d.steps || [];
      return steps.length > 0 && steps.every(s => s.done);
    }
    default: return false;
  }
}

export function tileTitle(tile) {
  return tile.config?.title || tile.config?.titleA || TILE_TYPES[tile.type]?.label || tile.type;
}
