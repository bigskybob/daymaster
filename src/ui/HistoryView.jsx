// ─── HISTORY VIEW ─────────────────────────────────────────────────────────────
// Past-day browser: a list of logged days plus a per-tile readable summary of the
// selected day, rendered from the union of tiles across all layouts.
import React, { useState } from "react";
import { fmtDate, dayKeyVal } from "../lib/helpers.js";

export function HistoryView({ store }) {
  // #48 — newest-first by default; toggle to reverse. The "latest" day is always
  // identified as the calendar-largest key (newest), independent of sort
  // direction — the badge anchors to the most recent day, not the topmost row.
  // #78 — compare by real calendar value, not string order (unpadded keys like
  // 2026-6-11 vs 2026-6-9 were alphabetized, ranking "11" before "9").
  const [sortDir, setSortDir] = useState("desc");
  const [sel, setSel] = useState(null);
  const sortedDesc = Object.entries(store.days).sort((a,b)=>dayKeyVal(b[0])-dayKeyVal(a[0]));
  const days = sortDir === "desc" ? sortedDesc : [...sortedDesc].reverse();
  const latestKey = sortedDesc[0]?.[0];

  // Union tiles across all layouts so history renders even if the user switched
  // to a preset that excludes some tiles previously logged.
  const allTiles = React.useMemo(() => {
    const map = {};
    for (const layoutKey of Object.keys(store.layouts || {})) {
      const layout = store.layouts[layoutKey];
      for (const col of layout?.columns || []) {
        for (const t of col.tiles || []) if (!map[t.id]) map[t.id] = t;
      }
    }
    return Object.values(map);
  }, [store.layouts]);

  if (!sortedDesc.length) return React.createElement("div", {
    style:{textAlign:"center",padding:"80px",color:"var(--text-faint)",fontFamily:"var(--font-body)",fontSize:"12px"}
  }, "No history yet — your completed days will appear here.");

  const selData = sel ? store.days[sel] : null;

  return React.createElement("div", { style:{maxWidth:"960px",margin:"0 auto",padding:"24px",display:"grid",gridTemplateColumns:"200px 1fr",gap:"16px"} },
    React.createElement("div", null,
      React.createElement("div", { style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"10px"} },
        React.createElement("div", { style:{fontFamily:"var(--font-display)",fontSize:"9px",letterSpacing:"2px",textTransform:"uppercase",color:"var(--text-faint)"} }, "Past Days"),
        // #48 — sort toggle. Clicking flips direction; chevron indicates current.
        React.createElement("button", {
          onClick: () => setSortDir(d => d === "desc" ? "asc" : "desc"),
          title: sortDir === "desc" ? "Showing newest first — click for oldest first" : "Showing oldest first — click for newest first",
          style:{background:"transparent",border:"none",color:"var(--text-faint)",fontFamily:"var(--font-body)",fontSize:"9px",cursor:"pointer",letterSpacing:"0.5px",padding:"0 2px"}
        }, sortDir === "desc" ? "↓ newest" : "↑ oldest")
      ),
      days.map(([key]) => {
        const isLatest  = key === latestKey;
        const isSel     = sel === key;
        // #48 — most-recent day gets a brighter border + LATEST tag, regardless of sort.
        const borderCol = isSel ? "var(--accent)" : (isLatest ? "var(--accent)" : "var(--border-dim)");
        const bgCol     = isSel ? "var(--accent-dim)" : (isLatest ? "var(--accent-dim)" : "transparent");
        const txtCol    = isSel ? "var(--accent)" : (isLatest ? "var(--accent)" : "var(--text-dim)");
        return React.createElement("button", { key, onClick:()=>setSel(key),
          style:{display:"block",width:"100%",textAlign:"left",background:bgCol,
            border:`1px solid ${borderCol}`,borderRadius:"4px",padding:"8px 10px",
            marginBottom:"4px",color:txtCol,fontFamily:"var(--font-body)",
            fontSize:"10px",cursor:"pointer",position:"relative"} },
          fmtDate(key),
          isLatest && React.createElement("span", {
            style:{position:"absolute",top:"3px",right:"4px",fontSize:"7px",letterSpacing:"1px",
              color:"var(--accent)",background:"var(--bg)",border:"1px solid var(--accent)",
              padding:"1px 4px",borderRadius:"2px",fontFamily:"var(--font-display)"}
          }, "LATEST")
        );
      })
    ),
    React.createElement("div", null,
      selData ? React.createElement("div", null,
        React.createElement("div", { style:{fontFamily:"var(--font-display)",fontSize:"16px",color:"var(--accent)",marginBottom:"16px"} }, fmtDate(sel)),
        allTiles.map(tile => {
          const td = selData[tile.id];
          if (!td) return null;
          return React.createElement("div", { key:tile.id, style:{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"5px",padding:"13px",marginBottom:"10px"} },
            React.createElement("div", { style:{fontFamily:"var(--font-display)",fontSize:"9px",letterSpacing:"2px",textTransform:"uppercase",color:"var(--text-muted)",marginBottom:"8px"} }, tile.config?.title||tile.id),
            // Render a readable summary based on tile type
            tile.type === "priorities" && React.createElement("div", null,
              (td.priorities||[]).filter(p=>p.text).map((p,i) =>
                React.createElement("div", { key:i, style:{color:p.done?"#4a7a4a":"#aaa",fontSize:"12px",marginBottom:"3px",textDecoration:p.done?"line-through":"none"} },
                  `${p.done?"✓":"○"} ${p.text}`)
              )
            ),
            tile.type === "textprompt" && td.text && React.createElement("div", { style:{color:"var(--text-dim)",fontSize:"12px",lineHeight:1.6} }, td.text),
            tile.type === "twoprompt" && React.createElement("div", null,
              td.textA && React.createElement("div", { style:{color:"var(--text-dim)",fontSize:"12px",marginBottom:"6px"} }, React.createElement("span", { style:{color:"var(--text-muted)"} }, `${tile.config.titleA}: `), td.textA),
              td.textB && React.createElement("div", { style:{color:"var(--text-dim)",fontSize:"12px"} }, React.createElement("span", { style:{color:"var(--text-muted)"} }, `${tile.config.titleB}: `), td.textB)
            ),
            // #3 — guidedam history mirrors twoprompt, plus the third "Priority" prompt.
            // Past-day data written under the old twoprompt type still renders correctly here
            // since the migration only changes the tile type, not the per-day field names.
            tile.type === "guidedam" && React.createElement("div", null,
              td.textA && React.createElement("div", { style:{color:"var(--text-dim)",fontSize:"12px",marginBottom:"6px"} },
                React.createElement("span", { style:{color:"var(--text-muted)"} }, `${tile.config.titleA||"Gratitude"}: `), td.textA),
              td.textB && React.createElement("div", { style:{color:"var(--text-dim)",fontSize:"12px",marginBottom:"6px"} },
                React.createElement("span", { style:{color:"var(--text-muted)"} }, `${tile.config.titleB||"Intention"}: `), td.textB),
              td.textC && React.createElement("div", { style:{color:"var(--text-dim)",fontSize:"12px"} },
                React.createElement("span", { style:{color:"var(--text-muted)"} }, `${tile.config.titleC||"Priority"}: `), td.textC)
            ),
            (tile.type === "freelist" || tile.type === "project") && React.createElement("div", null,
              // #52 — project items are now {text,done}; freelist items stay strings. Handle both.
              (td.items||[]).map(it => typeof it === "string" ? { text: it, done: false } : (it || { text:"", done:false }))
                .filter(it => it.text?.trim())
                .map((it,i) => React.createElement("div", { key:i, style:{color:"var(--text-dim)",fontSize:"12px",marginBottom:"2px",textDecoration: it.done?"line-through":"none"} }, `${it.done?"✓":"○"} ${it.text}`))
            ),
            tile.type === "checkin" && React.createElement("div", null,
              React.createElement("div", { style:{color:"var(--text-dim)",fontSize:"12px",marginBottom:"4px"} },
                [td.planks&&"Planks ✓", td.food&&"Food ✓", td.priorities&&"Priorities ✓"].filter(Boolean).join("  ·  ")
              ),
              // #27 — show carried/completed next-priorities items so history reflects
              // the new checkbox state introduced by #43.
              (td.items||[]).filter(it => (typeof it === "string" ? it : it?.text)).length > 0 && React.createElement("div", {
                style:{marginTop:"6px",paddingTop:"6px",borderTop:"1px solid var(--border-dim)"}
              },
                React.createElement("div", { style:{fontSize:"9px",color:"var(--text-muted)",marginBottom:"3px",letterSpacing:"1px",textTransform:"uppercase"} }, "Next priorities"),
                (td.items||[]).map((it, i) => {
                  const obj = typeof it === "string" ? { text: it, done: false } : it;
                  if (!obj?.text) return null;
                  return React.createElement("div", { key:i, style:{color:obj.done?"#4a7a4a":"var(--text-dim)",fontSize:"11px",marginBottom:"2px",textDecoration:obj.done?"line-through":"none"} },
                    `${obj.done?"✓":"○"} ${obj.text}`);
                })
              ),
              // #37 — emoji + paired text note side-by-side
              (td.feeling || td.feelingNote) && React.createElement("div", {
                style:{display:"flex",alignItems:"flex-start",gap:"8px",color:"var(--text-dim)",fontSize:"11px",fontStyle:"italic",marginTop:"6px"}
              },
                td.feeling && React.createElement("span", { style:{fontSize:"16px",fontStyle:"normal",flexShrink:0,lineHeight:1.3} }, td.feeling),
                td.feelingNote && React.createElement("span", { style:{lineHeight:1.5} }, `"${td.feelingNote}"`)
              )
            ),
            // #11 — music log history: checkbox state + optional note.
            tile.type === "musiclog" && React.createElement("div", { style:{fontSize:"12px"} },
              React.createElement("div", { style:{color: td.done?"#4a7a4a":"var(--text-muted)",marginBottom:td.note?"4px":0} },
                td.done ? "✓ Made music" : "○ No music logged"
              ),
              td.note && React.createElement("div", { style:{fontStyle:"italic",color:"var(--text-dim)",lineHeight:1.5} }, `"${td.note}"`)
            ),
            // #46 — notionlinks history just lists the links that were configured on that day's layout.
            // Since links live in tile config (not per-day data), we render them as a faded reminder.
            tile.type === "notionlinks" && React.createElement("div", { style:{fontSize:"11px",color:"var(--text-faint)",fontStyle:"italic"} },
              `${(tile.config?.links||[]).filter(l=>l?.url).length} link${(tile.config?.links||[]).filter(l=>l?.url).length===1?"":"s"} configured`
            ),
            ["checklist"].includes(tile.type) && React.createElement("div", null,
              tile.config.items?.map((item,i) =>
                React.createElement("div", { key:i, style:{color:(td.checks||[])[i]?"#4a7a4a":"#555",fontSize:"12px",marginBottom:"2px"} },
                  `${(td.checks||[])[i]?"✓":"○"} ${item}`)
              )
            )
          );
        })
      ) : React.createElement("div", { style:{color:"var(--text-faint)",fontFamily:"var(--font-body)",fontSize:"12px",padding:"60px",textAlign:"center"} }, "← Select a day")
    )
  );
}
