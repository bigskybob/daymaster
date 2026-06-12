// Drive-sync status indicator (dot + label) shown in the header.
import React from "react";

export function SyncDot({ status }) {
  const colors = { idle:"var(--text-faint)", saving:"#c8a96e", saved:"#4a7a4a", error:"#a04040", offline:"var(--text-muted)" };
  const labels = { idle:"", saving:"saving...", saved:"saved to Drive", error:"save failed", offline:"offline" };
  // #79 — the label cycles ""→"saving..."→"saved to Drive" on every save. In the
  // space-between, wrap-enabled header that width change reflowed the button row
  // and made the top bar grow/shrink (visible jitter). Reserve a fixed width so the
  // status text can change without moving anything around it.
  return React.createElement("div", { style:{display:"flex",alignItems:"center",gap:"5px",fontSize:"9px",color:"var(--text-muted)",letterSpacing:"0.5px",flexShrink:0} },
    React.createElement("div", { style:{width:"6px",height:"6px",borderRadius:"50%",background:colors[status]||"var(--text-faint)",transition:"background 0.3s"} }),
    React.createElement("span", { style:{width:"82px",whiteSpace:"nowrap",overflow:"hidden"} }, labels[status])
  );
}
