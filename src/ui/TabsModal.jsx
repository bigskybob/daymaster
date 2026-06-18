// ─── TABS MANAGER (#84) ───────────────────────────────────────────────────────
// Create / rename / delete header tabs (named sets of modules), and assign each
// tile to a tab. Tabs live on the active layout (layout.tabs = [{id, name}]); a
// tile's tab is stored in its config.tab. Unassigned tiles only appear under "All".
import React, { useState } from "react";
import { TILE_TYPES } from "../tiles/registry.js";

const tileTitle = t => t.config?.title || t.config?.titleA || TILE_TYPES[t.type]?.label || t.type;

export function TabsModal({ tiles, tabs, onAdd, onRename, onRemove, onAssign, onClose }) {
  const [draft, setDraft] = useState("");
  const list = tabs || [];

  const inputStyle = { width: "100%", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "3px", color: "var(--text)", fontFamily: "var(--font-body)", fontSize: "11px", padding: "6px 8px" };
  const tinyBtn    = { background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-dim)", fontFamily: "var(--font-body)", fontSize: "10px", padding: "3px 8px", borderRadius: "3px", cursor: "pointer" };
  const sectionLbl = txt => React.createElement("div", { style: { fontSize: "9px", color: "var(--text-muted)", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "5px" } }, txt);

  const add = () => { const n = draft.trim(); if (!n) return; onAdd(n); setDraft(""); };

  return React.createElement("div", {
    style: { position: "fixed", inset: 0, background: "#000b", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" },
    onClick: onClose,
  },
    React.createElement("div", {
      onClick: e => e.stopPropagation(),
      style: { background: "var(--bg-hover)", border: "1px solid var(--border)", borderRadius: "8px", padding: "22px", width: "min(460px,94vw)", maxHeight: "84vh", overflow: "auto" },
    },
      React.createElement("div", { style: { fontFamily: "var(--font-display)", fontSize: "12px", color: "var(--accent)", letterSpacing: "1px", marginBottom: "4px" } }, "⊞ Header tabs"),
      React.createElement("div", { style: { fontSize: "10px", color: "var(--text-muted)", lineHeight: 1.5, marginBottom: "14px" } },
        "Group modules into tabs you can flip between from the header (web + mobile). Unassigned tiles show only under “All”."),

      // ── existing tabs (rename inline / delete) ──
      sectionLbl("Tabs"),
      list.length === 0
        ? React.createElement("div", { style: { fontSize: "11px", color: "var(--text-faint)", fontStyle: "italic", marginBottom: "12px" } }, "None yet — add one below.")
        : React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "6px", marginBottom: "12px" } },
            list.map(tab => React.createElement("div", { key: tab.id, style: { display: "flex", alignItems: "center", gap: "8px" } },
              React.createElement("input", {
                value: tab.name,
                onChange: e => onRename(tab.id, e.target.value),
                style: { ...inputStyle, flex: 1 },
              }),
              React.createElement("button", { onClick: () => onRemove(tab.id), title: "Delete tab", style: { ...tinyBtn, padding: "5px 8px", color: "#a08070", flexShrink: 0 } }, "🗑")))),

      React.createElement("div", { style: { display: "flex", gap: "6px", marginBottom: "14px" } },
        React.createElement("input", {
          value: draft, placeholder: "New tab name…",
          onChange: e => setDraft(e.target.value),
          onKeyDown: e => { if (e.key === "Enter") { e.preventDefault(); add(); } },
          style: { ...inputStyle, flex: 1 },
        }),
        React.createElement("button", { onClick: add, style: { ...tinyBtn, padding: "3px 12px" } }, "+ Add")),

      React.createElement("div", { style: { height: "1px", background: "var(--border)", margin: "2px 0 14px" } }),

      // ── per-tile assignment ──
      sectionLbl("Assign modules"),
      (tiles || []).length === 0
        ? React.createElement("div", { style: { fontSize: "11px", color: "var(--text-faint)", fontStyle: "italic" } }, "No tiles to assign.")
        : React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } },
            (tiles || []).map(t => React.createElement("div", { key: t.id, style: { display: "flex", alignItems: "center", gap: "8px" } },
              React.createElement("div", { style: { flex: 1, fontSize: "11px", color: "var(--text-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, tileTitle(t)),
              React.createElement("select", {
                value: t.config?.tab || "",
                onChange: e => onAssign(t._colId, t.id, e.target.value),
                disabled: list.length === 0,
                style: { ...inputStyle, flex: "0 0 46%", cursor: list.length === 0 ? "default" : "pointer", opacity: list.length === 0 ? 0.5 : 1 },
              },
                React.createElement("option", { value: "" }, "— All (unassigned) —"),
                list.map(tab => React.createElement("option", { key: tab.id, value: tab.id }, tab.name)))))),

      React.createElement("div", { style: { display: "flex", marginTop: "16px" } },
        React.createElement("button", { onClick: onClose,
          style: { flex: 1, background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-dim)", fontFamily: "var(--font-body)", fontSize: "11px", padding: "8px", borderRadius: "4px", cursor: "pointer" } }, "Done"))
    )
  );
}
