// ─── LINKS MANAGER (field-links Phase C) ──────────────────────────────────────
// Create/remove "auto-check" links: when one or more SOURCE fields are complete
// (all of / any of), a TARGET checkbox auto-checks. Targets + sources are
// enumerated from the registry's per-tile field schema (tileFields). Links live
// on the active layout (layout.links).
import React, { useState } from "react";
import { tileFields } from "../tiles/registry.js";

const tileTitle = t => t.config?.title || t.config?.titleA || t.type;
const refKey = (r) => `${r.tileId}::${r.fieldId}`;

export function LinksModal({ tiles, links, onAdd, onRemove, onClose }) {
  // Build the source + target catalogs from every tile's field schema.
  const sourceOpts = [];
  const targetOpts = [];
  for (const t of tiles || []) {
    for (const f of tileFields(t.type, t.config)) {
      const opt = { tileId: t.id, fieldId: f.id, label: `${tileTitle(t)} · ${f.label}`, kind: f.kind };
      sourceOpts.push(opt);
      if (f.kind === "checkbox" && f.path) targetOpts.push(opt); // only real (writable) checkboxes are targets
    }
  }
  const labelFor = (ref) => {
    const o = sourceOpts.find(o => o.tileId === ref.tileId && o.fieldId === ref.fieldId);
    return o ? o.label : `${ref.tileId} · ${ref.fieldId}`;
  };

  const [sources, setSources] = useState([]);
  const [mode, setMode]       = useState("all");
  const [target, setTarget]   = useState("");

  const addSource = (val) => {
    if (!val) return;
    const [tileId, fieldId] = val.split("::");
    if (sources.some(s => s.tileId === tileId && s.fieldId === fieldId)) return;
    setSources([...sources, { tileId, fieldId }]);
  };
  const dropSource = (i) => setSources(sources.filter((_, j) => j !== i));
  // "Others in the same module": the target tile's OTHER checkbox fields. One click
  // fills them as sources with mode "all" → check this box when the rest are done.
  const [tTile, tField] = target ? target.split("::") : [null, null];
  const siblings = targetOpts.filter(o => o.tileId === tTile && o.fieldId !== tField);
  const fillSiblings = () => { setSources(siblings.map(o => ({ tileId: o.tileId, fieldId: o.fieldId }))); setMode("all"); };
  const canAdd = sources.length >= 1 && !!target;
  const submit = () => {
    if (!canAdd) return;
    const [tTile, tField] = target.split("::");
    onAdd({ target: { tileId: tTile, fieldId: tField }, sources, mode: sources.length > 1 ? mode : "any" });
    setSources([]); setTarget(""); setMode("all");
  };

  const inputStyle = { width: "100%", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "3px", color: "var(--text)", fontFamily: "var(--font-body)", fontSize: "11px", padding: "6px 8px" };
  const tinyBtn    = { background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-dim)", fontFamily: "var(--font-body)", fontSize: "10px", padding: "3px 8px", borderRadius: "3px", cursor: "pointer" };
  const sectionLbl = txt => React.createElement("div", { style: { fontSize: "9px", color: "var(--text-muted)", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "5px" } }, txt);

  return React.createElement("div", {
    style: { position: "fixed", inset: 0, background: "#000b", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" },
    onClick: onClose,
  },
    React.createElement("div", {
      onClick: e => e.stopPropagation(),
      style: { background: "var(--bg-hover)", border: "1px solid var(--border)", borderRadius: "8px", padding: "22px", width: "min(460px,94vw)", maxHeight: "84vh", overflow: "auto" },
    },
      React.createElement("div", { style: { fontFamily: "var(--font-display)", fontSize: "12px", color: "var(--accent)", letterSpacing: "1px", marginBottom: "4px" } }, "🔗 Auto-check links"),
      React.createElement("div", { style: { fontSize: "10px", color: "var(--text-muted)", lineHeight: 1.5, marginBottom: "14px" } },
        "Auto-check a box when other fields are filled or checked — e.g. tick “8:30 check-in ready” when all the check-in boxes are done."),

      // ── existing links ──
      sectionLbl("Current links"),
      (links || []).length === 0
        ? React.createElement("div", { style: { fontSize: "11px", color: "var(--text-faint)", fontStyle: "italic", marginBottom: "14px" } }, "None yet.")
        : React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "6px", marginBottom: "14px" } },
            (links || []).map((lk, i) => {
              const srcs = Array.isArray(lk.sources) ? lk.sources : (lk.source ? [lk.source] : []);
              const join = srcs.length > 1 ? ` ${lk.mode === "all" ? "AND" : "OR"} ` : "";
              return React.createElement("div", { key: i, style: { display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "11px", color: "var(--text-dim)", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "4px", padding: "6px 8px" } },
                React.createElement("div", { style: { flex: 1, lineHeight: 1.5 } },
                  React.createElement("span", { style: { color: "var(--accent)" } }, "☑ " + labelFor(lk.target)),
                  React.createElement("span", { style: { color: "var(--text-muted)" } }, "  ⟵  "),
                  srcs.map(labelFor).join(join)),
                React.createElement("button", { onClick: () => onRemove(i), title: "Remove", style: { ...tinyBtn, padding: "2px 6px", flexShrink: 0 } }, "✕"));
            })
          ),

      React.createElement("div", { style: { height: "1px", background: "var(--border)", margin: "4px 0 14px" } }),

      // ── new link builder ──
      sectionLbl("When these are complete"),
      sources.length > 0 && React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: "5px", marginBottom: "7px" } },
        sources.map((s, i) => React.createElement("span", { key: i, style: { display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "10px", color: "var(--text-dim)", background: "var(--accent-dim)", border: "1px solid var(--accent)", borderRadius: "3px", padding: "2px 6px" } },
          labelFor(s),
          React.createElement("span", { onClick: () => dropSource(i), title: "Remove", style: { cursor: "pointer", color: "var(--text-muted)" } }, "✕")))),
      React.createElement("select", { value: "", onChange: e => addSource(e.target.value), style: { ...inputStyle, marginBottom: "8px" } },
        React.createElement("option", { value: "" }, "+ add a source field…"),
        sourceOpts.filter(o => refKey(o) !== target).map(o => React.createElement("option", { key: refKey(o), value: refKey(o) }, o.label + (o.kind === "text" ? "  (filled)" : "")))),
      sources.length > 1 && React.createElement("div", { style: { display: "flex", gap: "6px", marginBottom: "10px" } },
        ["all", "any"].map(m => React.createElement("button", { key: m, onClick: () => setMode(m),
          style: { ...tinyBtn, flex: 1, background: mode === m ? "var(--accent-dim)" : "var(--bg-card)", borderColor: mode === m ? "var(--accent)" : "var(--border)", color: mode === m ? "var(--accent)" : "var(--text-dim)" } },
          m === "all" ? "AND" : "OR"))),

      sectionLbl("check this box"),
      React.createElement("select", { value: target, onChange: e => setTarget(e.target.value), style: { ...inputStyle, marginBottom: target && siblings.length ? "8px" : "14px" } },
        React.createElement("option", { value: "" }, "— pick a target checkbox —"),
        targetOpts.filter(o => !sources.some(s => refKey(s) === refKey(o))).map(o => React.createElement("option", { key: refKey(o), value: refKey(o) }, o.label))),
      // one-click: drive this box from the OTHER checkboxes in its own module (all)
      target && siblings.length > 0 && React.createElement("button", { onClick: fillSiblings,
        style: { ...tinyBtn, width: "100%", marginBottom: "14px", textAlign: "left", color: "var(--text-muted)" } },
        `↳ when the other ${siblings.length} box${siblings.length > 1 ? "es" : ""} in this module are all checked`),

      React.createElement("div", { style: { display: "flex", gap: "8px" } },
        React.createElement("button", { onClick: submit, disabled: !canAdd,
          style: { flex: 1, background: "var(--accent-dim)", border: "1px solid var(--accent)", color: "var(--accent)", fontFamily: "var(--font-body)", fontSize: "11px", padding: "8px", borderRadius: "4px", cursor: canAdd ? "pointer" : "default", opacity: canAdd ? 1 : 0.5 } }, "+ Add link"),
        React.createElement("button", { onClick: onClose,
          style: { flex: 1, background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-dim)", fontFamily: "var(--font-body)", fontSize: "11px", padding: "8px", borderRadius: "4px", cursor: "pointer" } }, "Done"))
    )
  );
}
