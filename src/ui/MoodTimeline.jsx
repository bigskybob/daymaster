// ─── MOOD TIMELINE (#97) ──────────────────────────────────────────────────────
// Check-ins have been capturing {feeling, feelingNote} up to 4×/day and rendering
// them exactly once (that day's history card). This surfaces the last 30 days as
// an emoji strip per check-in slot — notes on tap, plus a small observation line.
// Read-only over store.days; days with nothing logged render as gaps.
import React, { useMemo, useState } from "react";
import { fmtDate } from "../lib/helpers.js";

// The last `n` calendar day keys, oldest→newest, in the store's UNPADDED "Y-M-D"
// format (#78 — never zero-pad, never string-compare).
export function lastNDayKeys(n, now = new Date()) {
  const keys = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    keys.push(`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`);
  }
  return keys;
}

// One row per check-in tile: a cell per day ({key, feeling, note}), the row's
// most-frequent emoji, and how many of the window's days logged a feeling.
export function moodRows(days, checkinTiles, keys) {
  return (checkinTiles || []).map(tile => {
    const cells = keys.map(k => {
      const td = days?.[k]?.[tile.id];
      return { key: k, feeling: td?.feeling || null, note: td?.feelingNote || "" };
    });
    const counts = {};
    for (const c of cells) if (c.feeling) counts[c.feeling] = (counts[c.feeling] || 0) + 1;
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    return { tile, cells, top, logged: cells.filter(c => c.feeling).length };
  });
}

// Whole-window rollup: most common emoji + how many days logged any feeling.
export function moodSummary(rows) {
  const counts = {};
  const daysWith = new Set();
  for (const r of rows) for (const c of r.cells) if (c.feeling) {
    counts[c.feeling] = (counts[c.feeling] || 0) + 1;
    daysWith.add(c.key);
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  return { top, daysWithAny: daysWith.size };
}

export function MoodTimeline({ store, checkinTiles, windowDays = 30 }) {
  const [selected, setSelected] = useState(null); // { tileId, key, feeling, note }
  const keys = useMemo(() => lastNDayKeys(windowDays), [windowDays]);
  const rows = useMemo(() => moodRows(store.days, checkinTiles, keys), [store.days, checkinTiles, keys]);
  const summary = useMemo(() => moodSummary(rows), [rows]);

  if (!rows.length || !summary.daysWithAny) return null; // nothing logged yet — stay quiet

  return React.createElement("div", { style:{maxWidth:"960px",margin:"0 auto",padding:"24px 24px 0"} },
    React.createElement("div", { style:{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"5px",padding:"13px"} },
      React.createElement("div", { style:{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:"10px",flexWrap:"wrap",marginBottom:"8px"} },
        React.createElement("div", { style:{fontFamily:"var(--font-display)",fontSize:"9px",letterSpacing:"2px",textTransform:"uppercase",color:"var(--text-muted)"} },
          `Mood — last ${windowDays} days`),
        React.createElement("div", { style:{fontSize:"10px",color:"var(--text-dim)"} },
          summary.top ? `Most common ${summary.top} · logged ${summary.daysWithAny} of ${windowDays} days` : "")
      ),
      rows.map(({ tile, cells, top, logged }) =>
        React.createElement("div", { key: tile.id, style:{display:"flex",alignItems:"center",gap:"8px",marginBottom:"6px"} },
          React.createElement("div", { style:{width:"84px",flexShrink:0,fontSize:"9px",color:"var(--text-muted)",letterSpacing:"1px",textTransform:"uppercase",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},
            title: tile.config?.title || tile.id }, tile.config?.title || "Check-In"),
          // The strip scrolls inside its own container so mobile never scrolls sideways.
          React.createElement("div", { style:{display:"flex",gap:"2px",overflowX:"auto",flex:1,paddingBottom:"2px"} },
            cells.map(c => {
              const isSel = selected && selected.tileId === tile.id && selected.key === c.key;
              return React.createElement("button", {
                key: c.key,
                onClick: () => setSelected(c.feeling ? { tileId: tile.id, key: c.key, feeling: c.feeling, note: c.note } : null),
                title: c.feeling ? `${fmtDate(c.key)}${c.note ? ` — "${c.note}"` : ""}` : fmtDate(c.key),
                style:{flexShrink:0,width:"20px",height:"22px",lineHeight:"20px",textAlign:"center",padding:0,
                  background: isSel ? "var(--accent-dim)" : "transparent",
                  border: isSel ? "1px solid var(--accent)" : "1px solid transparent",
                  borderRadius:"3px",cursor: c.feeling ? "pointer" : "default",
                  fontSize: c.feeling ? "13px" : "10px",
                  color:"var(--text-xfaint)"}
              }, c.feeling || "·");
            })
          ),
          React.createElement("div", { style:{width:"40px",flexShrink:0,fontSize:"10px",color:"var(--text-faint)",textAlign:"right"},
            title:`Logged ${logged} of ${windowDays} days` }, top ? `${top}` : "")
        )
      ),
      // Tap-to-read: the selected day's note, in the check-in's own words.
      selected && React.createElement("div", { style:{marginTop:"8px",paddingTop:"8px",borderTop:"1px solid var(--border-dim)",
        display:"flex",alignItems:"flex-start",gap:"8px",fontSize:"11px",color:"var(--text-dim)"} },
        React.createElement("span", { style:{fontSize:"16px",lineHeight:1.3,flexShrink:0} }, selected.feeling),
        React.createElement("span", { style:{lineHeight:1.5} },
          `${fmtDate(selected.key)}`, selected.note ? ` — "${selected.note}"` : " — no note")
      )
    )
  );
}
