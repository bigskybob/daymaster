// Auto-rule / tile-event engine + check-in time helpers (Phase 0 of #53).

export const TILE_EVENTS = {
  guidedam: [
    { key: "any-prompt",           label: "Any prompt filled",          evaluate: td => !!(td.textA?.trim() || td.textB?.trim() || td.textC?.trim()) },
    { key: "gratitude-intention",  label: "Gratitude + intention done", evaluate: td => !!(td.textA?.trim() && td.textB?.trim()) },
    { key: "all-prompts-filled",   label: "All three prompts filled",   evaluate: td => !!(td.textA?.trim() && td.textB?.trim() && td.textC?.trim()) },
  ],
  twoprompt: [
    { key: "either",  label: "Either prompt filled",  evaluate: td => !!(td.textA?.trim() || td.textB?.trim()) },
    { key: "both",    label: "Both prompts filled",   evaluate: td => !!(td.textA?.trim() && td.textB?.trim()) },
  ],
  priorities: [
    { key: "any",        label: "Any priority filled",  evaluate: td => (td.priorities||[]).some(p=>p.text?.trim()) },
    { key: "frog-set",   label: "Frog set (top item)",  evaluate: td => !!(td.priorities?.[0]?.text?.trim()) },
    { key: "frog-done",  label: "Frog completed",        evaluate: td => !!(td.priorities?.[0]?.text?.trim() && td.priorities?.[0]?.done) },
    { key: "all-done",   label: "All filled priorities done", evaluate: td => {
        const p = (td.priorities||[]).filter(x => x.text?.trim());
        return p.length > 0 && p.every(x => x.done);
    } },
  ],
  musiclog: [
    { key: "done",   label: "Made music today",     evaluate: td => !!td.done },
    { key: "noted",  label: "Note written",         evaluate: td => !!(td.note?.trim()) },
  ],
  checkin: [
    { key: "any",       label: "Any field filled",                evaluate: td => !!(td.planks||td.food||td.priorities||td.feeling?.trim()||td.feelingNote?.trim()) },
    { key: "complete",  label: "All three boxes checked",          evaluate: td => !!(td.planks && td.food && td.priorities) },
    { key: "items-any", label: "Any next-priorities item ticked",  evaluate: td => (td.items||[]).some(it => typeof it === "object" ? !!it.done : false) },
  ],
  checklist: [
    { key: "any",   label: "Any item checked",   evaluate: td => (td.checks||[]).some(Boolean) },
    { key: "all",   label: "All items checked",  evaluate: td => (td.checks||[]).length > 0 && (td.checks||[]).every(Boolean) },
  ],
  textprompt: [
    { key: "any",  label: "Text filled",  evaluate: td => !!(td.text?.trim()) },
  ],
  freelist: [
    { key: "any",  label: "Any item filled",  evaluate: td => (td.items||[]).some(x=>x?.trim()) },
  ],
  foodlog: [
    { key: "any",  label: "Any meal logged",   evaluate: td => (td.logs||[]).some(l=>l.done) },
    { key: "all",  label: "All meals logged",  evaluate: td => (td.logs||[]).length > 0 && (td.logs||[]).every(l=>l.done) },
  ],
  pushups: [
    { key: "any",  label: "Any pushup count ticked", evaluate: td => Object.values(td.pushups||{}).some(Boolean) },
  ],
  planks: [
    { key: "any",  label: "Any plank slot done", evaluate: td => Object.values(td.planks||{}).some(Boolean) },
  ],
  dangles: [
    { key: "any",  label: "Any dangle ticked",   evaluate: td => (td.checks||[]).some(Boolean) },
  ],
  notes: [
    { key: "any",  label: "Note written",  evaluate: td => !!(td.text?.trim()) },
  ],
  numbers: [],
  project: [
    { key: "any",  label: "Any project item filled",  evaluate: td => (td.items||[]).some(x=>x?.trim()) },
  ],
  twolists: [
    { key: "any",   label: "Any item filled (either list)",  evaluate: td => ((td.itemsA||[]).some(x=>x?.trim()) || (td.itemsB||[]).some(x=>x?.trim())) },
  ],
  counter: [
    { key: "any",  label: "Counter above zero", evaluate: td => (td.count||0) > 0 },
  ],
  gcal: [],
  notionlinks: [],
};

// #49 — evaluateRule now optionally accepts a tilesById lookup so the new
// tile-event rule type can resolve the source tile's type. Legacy rules ignore
// the third arg, so existing callers that don't pass it still work.
export function evaluateRule(rule, allDayData, tilesById) {
  if (!rule || !allDayData) return false;
  const td = allDayData[rule.tileId || rule.sourceTileId];
  if (!td && rule.type !== "tile-event") return false;

  switch(rule.type) {
    case "twoprompt-both":
      return !!(td.textA?.trim() && td.textB?.trim());
    case "twoprompt-either":
      return !!(td.textA?.trim() || td.textB?.trim());
    case "priorities-any":
      return (td.priorities||[]).some(p=>p.text?.trim());
    case "priorities-frog":
      return !!(td.priorities?.[0]?.text?.trim());
    case "priorities-frog-done":
      return !!(td.priorities?.[0]?.text?.trim() && td.priorities?.[0]?.done);
    case "checkin-any":
      return !!(td.planks||td.food||td.priorities||td.feeling?.trim());
    case "checkin-done":
      return !!(td.planks&&td.food&&td.priorities);
    case "foodlog-any":
      return (td.logs||[]).some(l=>l.done);
    case "foodlog-all":
      return (td.logs||[]).length > 0 && (td.logs||[]).every(l=>l.done);
    case "checklist-all": {
      const items = td.checks||[];
      return items.length > 0 && items.every(Boolean);
    }
    case "checklist-any":
      return (td.checks||[]).some(Boolean);
    case "freelist-any":
      return (td.items||[]).some(x=>x?.trim());
    case "textprompt-any":
      return !!(td.text?.trim());
    // #30 — auto-rules driven by tracker tiles
    case "pushups-total-gte": {
      // #55 — cumulative model: total reps = the highest tapped milestone, not the
      // sum of every milestone tapped (which double-counts under cascade marking).
      const reached = Object.entries(td.pushups||{}).filter(([,v]) => v).map(([k]) => Number(k||0));
      return (reached.length ? Math.max(...reached) : 0) >= (rule.threshold||0);
    }
    case "planks-count-gte":
      return Object.values(td.planks||{}).filter(Boolean).length >= (rule.threshold||0);
    // #45 — a specific planks slot is active. Used to auto-tick the check-in's
    // "Planks or Pushups" box when the slot matching the check-in's window is done.
    case "planks-slot-active":
      return !!(td.planks?.[rule.slot]);
    // #49 — generic tile-event connector. Resolves event from TILE_EVENTS based
    // on the source tile's CURRENT type (looked up via tilesById; falls back to
    // td._type if no layout map is available, e.g. legacy callers).
    case "tile-event": {
      const srcData = allDayData[rule.sourceTileId];
      if (!srcData) return false;
      const srcType = tilesById?.[rule.sourceTileId]?.type || srcData._type;
      if (!srcType) return false;
      const events = TILE_EVENTS[srcType];
      if (!events) return false;
      const ev = events.find(e => e.key === rule.event);
      return ev ? !!ev.evaluate(srcData) : false;
    }
    default:
      return false;
  }
}


// #44 / #45 — time-of-day slot picker. Returns one of am | noon | afternoon | evening.
// Boundaries per spec: am < 11:30, noon 11:30–13:59, afternoon 14:00–17:59, evening 18:00+.
export function currentSlotKey() {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins < 11 * 60 + 30) return "am";        // before 11:30
  if (mins < 14 * 60)      return "noon";      // 11:30 ≤ now < 14:00
  if (mins < 18 * 60)      return "afternoon"; // 14:00 ≤ now < 18:00
  return "evening";                             // 18:00 onward
}

// #45 — default planksSlot for a check-in, derived from the canonical default titles.
// Custom-titled check-ins fall back to "evening"; users can override via Configure.
export function deriveCheckinSlot(title) {
  const t = (title||"").trim();
  if (t === "8:30")  return "am";
  if (t === "11:00") return "noon";
  if (t === "2:00")  return "afternoon";
  return "evening";
}

// #35 — derive a check-in's scheduled time as minutes-from-midnight. The title
// carries a bare clock ("8:30", "2:00") with no AM/PM, so the planksSlot
// (am/noon → morning, afternoon/evening → afternoon/PM) disambiguates. Returns
// null when no time can be parsed, in which case the block is never treated as stale.
export function checkinScheduleMin(config={}) {
  const m = String(config.title||"").match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (hour < 0 || hour > 23 || min < 0 || min > 59) return null;
  const slot = config.planksSlot || deriveCheckinSlot(config.title);
  const pm = slot === "afternoon" || slot === "evening";
  if (pm && hour < 12) hour += 12;       // 2:00 afternoon → 14:00
  if (!pm && hour === 12) hour = 0;       // 12:xx morning → 00:xx (rare)
  return hour * 60 + min;
}

// #35 / #45 — a check-in counts as "done" when any of its tracked dimensions is
// satisfied: planks (manual or auto from the planks tile via its slot), food,
// next-priorities, or a feeling emoji / note. Shared by TileCheckIn and the
// stale-block reordering so both agree on completion.
export function checkinIsDone(config={}, data={}, allDayData={}) {
  const planksSlot = config.planksSlot || deriveCheckinSlot(config.title);
  const planksAutoChecked = planksSlot && planksSlot !== "none"
    && !!(allDayData?.planks?.planks?.[planksSlot]);
  const planksEffective = !!data.planks || planksAutoChecked;
  return !!(planksEffective || data.food || data.priorities
    || data.feeling?.trim() || data.feelingNote?.trim());
}


