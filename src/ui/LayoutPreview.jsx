// #73 — Layout-page visual preview. A compact, schematic "module stack" of the
// current layout shown while editing, so you can see the shape of the arrangement
// at a glance — and, via the Mobile toggle, how it collapses on a phone (where the
// CSS stacks everything into one column in center → left → right order).
import React from "react";
import { TILE_TYPES } from "../tiles/registry.js";
import { tileTitle } from "../lib/tileStatus.js";

const el = React.createElement;

// Per-family tint so the schematic reads the same way the Add-tile library does.
const FAM_COLOR = { capture: "#c8a96e", track: "#6ea36e", connect: "#7a6abf", derive: "#5b9bd5" };

// Mobile stacking order mirrors the @media(max-width:768px) rules in App.jsx:
// col-center (order 1) → col-left (order 2) → col-right (order 3); unknown columns
// keep their natural order after the named ones.
const MOBILE_ORDER = { "col-center": 0, "col-left": 1, "col-right": 2 };

function miniBlock(tile) {
  const meta = TILE_TYPES[tile.type] || {};
  const fam = meta.family || "capture";
  const c = FAM_COLOR[fam] || "#c8a96e";
  return el("div", {
    key: tile.id,
    title: `${meta.label || tile.type} · ${fam}`,
    style: { display: "flex", alignItems: "center", gap: "6px", padding: "5px 7px",
      background: `${c}22`, borderLeft: `3px solid ${c}`, borderRadius: "3px",
      fontSize: "9px", color: "var(--text-dim)", lineHeight: 1.3, overflow: "hidden" },
  },
    el("span", { style: { flexShrink: 0 } }, meta.icon || "▫"),
    el("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, tileTitle(tile)),
  );
}

function colLabel(col) {
  return el("div", {
    key: `lbl-${col.id}`,
    style: { fontFamily: "var(--font-display)", fontSize: "7px", letterSpacing: "2px",
      textTransform: "uppercase", color: "var(--text-xfaint)", textAlign: "center", marginBottom: "3px" },
  }, (col.id || "").replace("col-", "") || "col");
}

function emptyHint(col) {
  return el("div", {
    key: `empty-${col?.id || "x"}`,
    style: { fontSize: "8px", color: "var(--text-xfaint)", fontStyle: "italic",
      textAlign: "center", padding: "8px 4px", border: "1px dashed var(--border-dim)", borderRadius: "3px" },
  }, "empty");
}

export function LayoutPreview({ columns }) {
  const [mobile, setMobile] = React.useState(false);
  const cols = columns || [];
  const totalTiles = cols.reduce((n, c) => n + (c.tiles?.length || 0), 0);

  const toggleBtn = (label, on, onClick) => el("button", {
    onClick,
    style: { background: on ? "var(--accent-dim)" : "var(--bg-hover)",
      border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
      color: on ? "var(--accent)" : "var(--text-dim)", fontFamily: "var(--font-body)",
      fontSize: "9px", letterSpacing: "0.5px", padding: "3px 9px", borderRadius: "3px", cursor: "pointer" },
  }, label);

  // Desktop: columns side by side at their real fr widths. Mobile: one column in
  // the phone stack order, with a faint source-column label before each group.
  let body;
  if (!mobile) {
    body = el("div", {
      style: { display: "grid", gridTemplateColumns: cols.map(c => `${c.width || 1}fr`).join(" "), gap: "6px" },
    },
      cols.map(col => el("div", { key: col.id, style: { display: "flex", flexDirection: "column", gap: "4px" } },
        colLabel(col),
        (col.tiles || []).length ? (col.tiles || []).map(miniBlock) : emptyHint(col),
      )),
    );
  } else {
    const ordered = [...cols].sort((a, b) => (MOBILE_ORDER[a.id] ?? 99) - (MOBILE_ORDER[b.id] ?? 99));
    body = el("div", {
      style: { maxWidth: "180px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "4px",
        border: "1px solid var(--border-dim)", borderRadius: "6px", padding: "6px" },
    },
      ordered.flatMap(col => [
        colLabel(col),
        ...((col.tiles || []).length ? (col.tiles || []).map(miniBlock) : [emptyHint(col)]),
      ]),
    );
  }

  return el("div", {
    style: { background: "var(--bg-hover)", border: "1px dashed var(--border)", borderRadius: "8px",
      padding: "10px 12px", marginBottom: "12px" },
  },
    el("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px", flexWrap: "wrap", gap: "6px" } },
      el("div", { style: { fontFamily: "var(--font-display)", fontSize: "9px", letterSpacing: "2px",
        textTransform: "uppercase", color: "var(--text-muted)" } },
        `Layout preview · ${cols.length} col${cols.length === 1 ? "" : "s"} · ${totalTiles} tile${totalTiles === 1 ? "" : "s"}`),
      el("div", { style: { display: "flex", gap: "4px" } },
        toggleBtn("🖥 Desktop", !mobile, () => setMobile(false)),
        toggleBtn("📱 Mobile", mobile, () => setMobile(true)),
      ),
    ),
    body,
  );
}
