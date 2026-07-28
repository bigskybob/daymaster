// ─── TABS MANAGER (#84, #87) ──────────────────────────────────────────────────
// Create / rename / delete header tabs (named sets of modules), and assign each
// tile to a tab. Tabs live on the active layout (layout.tabs = [{id, name}]); a
// tile's tab is stored in its config.tab. Unassigned tiles only appear under "All".
// #87 adds an optional start/end time window per tab — set both and the tab
// auto-selects itself while the clock is inside it.
import React, { useState } from "react";
import { TILE_TYPES } from "../tiles/registry.js";
import { parseTime, tileTabs } from "../lib/tabs.js";

const tileTitle = t => t.config?.title || t.config?.titleA || TILE_TYPES[t.type]?.label || t.type;

export function TabsModal({ tiles, tabs, onAdd, onRename, onRemove, onAssign, onSetWindow, onSuggest, onClose }) {
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
        "Group modules into tabs you can flip between from the header (web + mobile). Unassigned tiles show only under “All”. ",
        React.createElement("span", { style: { color: "var(--text-dim)" } },
          "Give a tab a 🕐 time window and it selects itself during those hours — tap another tab to override until the next window starts.")),

      // ── existing tabs (rename inline / delete) ──
      sectionLbl("Tabs"),
      list.length === 0
        // #87 — the blank state doubles as the one-click seeder: three windowed
        // tabs with every tile sorted into a part of the day, ready to tune.
        ? React.createElement("div", { style: { marginBottom: "12px" } },
            React.createElement("div", { style: { fontSize: "11px", color: "var(--text-faint)", fontStyle: "italic", marginBottom: "8px" } }, "None yet — add one below."),
            onSuggest && React.createElement("button", { onClick: onSuggest,
              style: { ...tinyBtn, padding: "6px 10px", color: "var(--accent)", borderColor: "var(--accent)" } },
              "✨ Start me off — Morning / Midday / Evening"),
            onSuggest && React.createElement("div", { style: { fontSize: "9px", color: "var(--text-faint)", marginTop: "6px", lineHeight: 1.5 } },
              "Sorts every module into a time of day and sets the windows. Tune anything after — “All” always shows everything."))
        : React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "10px", marginBottom: "12px" } },
            list.map(tab => {
              // #87 — a window only takes effect once BOTH ends parse; until then the
              // tab stays manual-only, so a half-typed time never hijacks the view.
              const windowed = parseTime(tab.start) != null && parseTime(tab.end) != null;
              return React.createElement("div", { key: tab.id,
                style: { display: "flex", flexDirection: "column", gap: "5px" } },
                React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
                  React.createElement("input", {
                    value: tab.name,
                    onChange: e => onRename(tab.id, e.target.value),
                    style: { ...inputStyle, flex: 1 },
                  }),
                  React.createElement("button", { onClick: () => onRemove(tab.id), title: "Delete tab", style: { ...tinyBtn, padding: "5px 8px", color: "#a08070", flexShrink: 0 } }, "🗑")),
                // ── optional time window (#87) ──
                React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "6px", paddingLeft: "2px" } },
                  React.createElement("span", { title: windowed ? "Shows automatically during this window" : "No time window — manual only",
                    style: { fontSize: "10px", opacity: windowed ? 1 : 0.4 } }, "🕐"),
                  React.createElement("input", {
                    type: "time", value: tab.start || "", "aria-label": `${tab.name} start time`,
                    onChange: e => onSetWindow?.(tab.id, { start: e.target.value }),
                    style: { ...inputStyle, flex: "0 0 auto", width: "auto", fontSize: "10px", padding: "3px 5px" },
                  }),
                  React.createElement("span", { style: { fontSize: "10px", color: "var(--text-muted)" } }, "–"),
                  React.createElement("input", {
                    type: "time", value: tab.end || "", "aria-label": `${tab.name} end time`,
                    onChange: e => onSetWindow?.(tab.id, { end: e.target.value }),
                    style: { ...inputStyle, flex: "0 0 auto", width: "auto", fontSize: "10px", padding: "3px 5px" },
                  }),
                  windowed && React.createElement("button", {
                    onClick: () => onSetWindow?.(tab.id, { start: "", end: "" }), title: "Clear the time window",
                    style: { ...tinyBtn, padding: "2px 6px", fontSize: "9px" } }, "clear"),
                  !windowed && React.createElement("span", {
                    style: { fontSize: "9px", color: "var(--text-faint)", fontStyle: "italic" } }, "manual only")));
            })),

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
      React.createElement("div", { style: { fontSize: "9px", color: "var(--text-faint)", lineHeight: 1.5, marginBottom: "8px" } },
        "Tap a tab to put a module in it — a module can live in several at once (morning and midday, but not evening). None selected = shows only under “All”."),
      (tiles || []).length === 0
        ? React.createElement("div", { style: { fontSize: "11px", color: "var(--text-faint)", fontStyle: "italic" } }, "No tiles to assign.")
        : list.length === 0
        ? React.createElement("div", { style: { fontSize: "11px", color: "var(--text-faint)", fontStyle: "italic" } }, "Add a tab first.")
        // #91 — toggle chips rather than a <select>: a dropdown can't show multi-tab
        // membership at a glance, and multi-selects are miserable on a phone.
        : React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "9px" } },
            (tiles || []).map(t => {
              const on = tileTabs(t);
              return React.createElement("div", { key: t.id, style: { display: "flex", flexDirection: "column", gap: "4px" } },
                React.createElement("div", { style: { fontSize: "11px", color: "var(--text-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } },
                  tileTitle(t),
                  on.length === 0 && React.createElement("span", { style: { color: "var(--text-faint)", fontStyle: "italic" } }, "  · All only")),
                React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: "5px" } },
                  list.map(tab => {
                    const sel = on.includes(tab.id);
                    return React.createElement("button", {
                      key: tab.id, onClick: () => onAssign(t._colId, t.id, tab.id),
                      "aria-pressed": sel, title: `${sel ? "Remove from" : "Add to"} ${tab.name}`,
                      style: { ...tinyBtn, fontSize: "9px", padding: "3px 8px",
                        background: sel ? "var(--accent-dim)" : "var(--bg-card)",
                        borderColor: sel ? "var(--accent)" : "var(--border)",
                        color: sel ? "var(--accent)" : "var(--text-faint)" },
                    }, tab.name);
                  })));
            })),

      React.createElement("div", { style: { display: "flex", marginTop: "16px" } },
        React.createElement("button", { onClick: onClose,
          style: { flex: 1, background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-dim)", fontFamily: "var(--font-body)", fontSize: "11px", padding: "8px", borderRadius: "4px", cursor: "pointer" } }, "Done"))
    )
  );
}
