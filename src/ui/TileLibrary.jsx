// ─── TILE LIBRARY PANEL ───────────────────────────────────────────────────────
// The "add a tile" picker shown in edit mode. Tiles are grouped by family
// (Capture / Track / Connect / Derive) so the swim lanes are visible at the point
// of choosing — the grouping is driven entirely by the registry's `family` field.
import React, { useState } from "react";
import { TILE_TYPES, FAMILIES } from "../tiles/registry.js";

export function TileLibrary({ onAdd, columns }) {
  // #32 — default destination to the column with the fewest tiles (shortest by tile count).
  // Ties broken by current order (i.e. leftmost shortest wins).
  const shortestColId = React.useMemo(() => {
    if (!columns?.length) return "";
    let best = columns[0];
    for (const c of columns) {
      if ((c.tiles?.length||0) < (best.tiles?.length||0)) best = c;
    }
    return best.id;
  }, [columns]);
  const [col, setCol] = useState(shortestColId);
  // Re-pick the shortest column whenever columns rebalance (e.g. after adding/removing/moving tiles)
  React.useEffect(() => { setCol(shortestColId); }, [shortestColId]);

  // Group the registered tile types by family, preserving registry order within each.
  const byFamily = FAMILIES.map(f => ({
    ...f,
    tiles: Object.entries(TILE_TYPES).filter(([, t]) => t.family === f.key),
  })).filter(g => g.tiles.length > 0);

  const tileBtn = ([type, { label, icon }]) =>
    React.createElement("button", { key:type, onClick:()=>onAdd(col,type),
      style:{background:"var(--bg-card)",border:"1px solid var(--border)",color:"var(--text-dim)",fontFamily:"var(--font-body)",
        fontSize:"10px",padding:"8px 6px",borderRadius:"4px",cursor:"pointer",textAlign:"center",
        display:"flex",flexDirection:"column",alignItems:"center",gap:"3px"} },
      React.createElement("span", { style:{fontSize:"16px"} }, icon),
      label
    );

  return React.createElement("div", { style:{background:"var(--bg-hover)",border:"1px solid var(--border)",borderRadius:"6px",padding:"14px",marginBottom:"14px"} },
    React.createElement("div", { style:{display:"flex",alignItems:"center",gap:"10px",marginBottom:"10px",flexWrap:"wrap"} },
      React.createElement("span", { style:{fontFamily:"var(--font-display)",fontSize:"9px",letterSpacing:"2px",textTransform:"uppercase",color:"var(--text-muted)"} }, "Add to column:"),
      columns.map(c => React.createElement("button", { key:c.id, onClick:()=>setCol(c.id),
        style:{background:col===c.id?"var(--accent-dim)":"var(--bg-card)",border:`1px solid ${col===c.id?"var(--accent)":"var(--border)"}`,
          color:col===c.id?"var(--accent)":"var(--text-dim)",fontSize:"10px",padding:"3px 10px",borderRadius:"3px",cursor:"pointer",fontFamily:"var(--font-body)"} },
        c.id
      ))
    ),
    React.createElement("div", { style:{display:"flex",flexDirection:"column",gap:"12px"} },
      byFamily.map(g =>
        React.createElement("div", { key:g.key },
          React.createElement("div", { style:{fontFamily:"var(--font-display)",fontSize:"8px",letterSpacing:"2px",textTransform:"uppercase",color:"var(--text-faint)",marginBottom:"6px"} }, g.label),
          React.createElement("div", { style:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(90px,1fr))",gap:"6px"} },
            g.tiles.map(tileBtn)
          )
        )
      )
    )
  );
}
