// Tile completion + title helpers, shared by the App shell (Focus mode collapse,
// history labels). Kept out of the tile renderers so these read-only derivations
// don't pull React into pure-logic call sites.
import { checkinFullyDone, evaluateRule } from "./rules.js";
import { TILE_TYPES } from "../tiles/registry.js";

// #2 / #54 — is a tile "complete" for the day? Used by Focus mode to collapse
// finished sections into a one-line summary, and by #113's Done rail. Still
// conservative: a type this function does not model is never treated as complete,
// so it stays fully visible rather than silently vanishing. Connect tiles (gcal,
// notionlinks, embed, quote), free-form lists and the trackers have no honest
// "finished" state and are deliberately left out.
//
// #113 — what a finished tile does with the space it's taking up.
//   stay  — nothing changes (the pre-#113 behavior, and the default)
//   shelf — collapse to a one-line ✓ and sink to the column's Done rail
//   hide  — leave the board entirely until the tile is relevant again
export const DONE_BEHAVIORS = ["stay", "shelf", "hide"];

// The types tileComplete actually models. Only these may carry a shelf/hide
// behavior: offering the setting on a tile that can never report "done" would
// put a control in the UI that silently does nothing.
export const COMPLETABLE_TYPES = new Set([
  "checkin", "textprompt", "twoprompt", "guidedam", "priorities",
  "project", "foodlog", "planner", "checklist", "musiclog",
]);

// A tile's done-behavior, normalized. Anything unrecognized — including a
// behavior left on a tile whose type was changed afterwards — reads as "stay",
// so a bad value can never make a tile disappear.
export function doneBehavior(tile) {
  const b = tile?.config?.doneBehavior;
  return COMPLETABLE_TYPES.has(tile?.type) && DONE_BEHAVIORS.includes(b) ? b : "stay";
}

export function tileComplete(tile, d = {}, allDayData = {}, tilesById = null) {
  switch (tile.type) {
    case "checkin":    return checkinFullyDone(tile.config, d, allDayData);
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
    // #113 — checklists were deliberately excluded before because their boxes can
    // be auto-ticked and this function only saw manual data. Both automation paths
    // are now accounted for, so the tiles that dominate the board (Mise-en-place,
    // PM Routine, Exercise Today) can finally report done.
    case "checklist": {
      const items = tile.config?.items || [];
      if (items.length === 0) return false;
      const checks = d.checks || [];
      return items.every((_, i) => {
        // Manual, or already overlaid by a field-link (#92 puts those into `d`)…
        if (checks[i]) return true;
        // …or satisfied by a legacy config.rules auto-rule, which effectiveDayData
        // does NOT overlay. Evaluating it here is what keeps this function's answer
        // identical to what TileChecklist renders (tiles.jsx:20–23); without it,
        // Mise-en-place reads unfinished with every box visibly ticked.
        const rule = tile.config?.rules?.[i];
        return rule ? evaluateRule(rule, allDayData, tilesById) : false;
      });
    }
    case "musiclog": return !!d.done;
    default: return false;
  }
}

export function tileTitle(tile) {
  return tile.config?.title || tile.config?.titleA || TILE_TYPES[tile.type]?.label || tile.type;
}
