// Shared UI primitives (CardShell, AutoTA, BulletList, CB, EmojiPicker, iconBtnStyle).
import React, { useState, useEffect, useRef, useCallback } from "react";

// ─── SHARED UI PRIMITIVES ─────────────────────────────────────────────────────
// ─── AUTO-RULE ENGINE ────────────────────────────────────────────────────────
// Evaluates whether a checklist item should be auto-completed
// based on the state of another tile. Extensible — add new rule types here.
//
// #49 — TILE_EVENTS is the named-event vocabulary for the generic `tile-event`
// rule type. Each tile type lists a small set of evaluable boolean events that
// can drive auto-ticks on other tiles. This is the first-class linkage layer:
// new event keys can be added here without touching evaluateRule, and the
// ConfigModal rules editor surfaces these names verbatim.
//
// Add a new event: pick the source tile type, append { key, label, evaluate(td) }.
// Quantitative rules with thresholds (pushups-total-gte, planks-count-gte) remain
// as dedicated rule types since they take parameters.



export function AutoTA({ value, onChange, placeholder, style = {} }) {
  const ref = useCallback(el => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [value]);
  return React.createElement("textarea", {
    ref, value, rows: 1, placeholder,
    onChange: e => { onChange(e.target.value); e.target.style.height="auto"; e.target.style.height=e.target.scrollHeight+"px"; },
    onFocus: e => { e.target.style.height="auto"; e.target.style.height=e.target.scrollHeight+"px"; },
    style: { background:"transparent", border:"none", borderBottom:"1px solid var(--input-border)", color:"var(--text)",
      fontFamily:"'DM Mono',monospace", fontSize:"12px", padding:"3px 2px", resize:"none",
      overflow:"hidden", lineHeight:1.6, minHeight:"22px", width:"100%", ...style }
  });
}

export function BulletList({ items, onChange, placeholder="..." }) {
  return React.createElement("div", { style:{display:"flex",flexDirection:"column",gap:"4px"} },
    items.map((item,i) =>
      React.createElement("div", { key:i, style:{display:"flex",alignItems:"flex-start",gap:"6px"} },
        React.createElement("span", { style:{color:"var(--text-faint)",fontSize:"13px",paddingTop:"2px",flexShrink:0} }, "○"),
        React.createElement(AutoTA, { value:item, placeholder,
          onChange: v => { const n=[...items]; n[i]=v; onChange(n); } })
      )
    )
  );
}

export function CB({ checked, onChange, label, strike=false }) {
  return React.createElement("label", {
    style:{display:"flex",alignItems:"flex-start",gap:"7px",cursor:"pointer",padding:"3px 0",color:"var(--text-dim)",fontSize:"12px",lineHeight:1.5}
  },
    React.createElement("input", { type:"checkbox", checked, onChange:e=>onChange(e.target.checked),
      style:{marginTop:"3px",flexShrink:0,accentColor:"#c8a96e",width:"13px",height:"13px"} }),
    React.createElement("span", { style: strike&&checked ? {textDecoration:"line-through",color:"var(--text-muted)"} : {} }, label)
  );
}

export function iconBtnStyle(bg="var(--bg-hover)") {
  return { background:bg, border:"none", color:"var(--text-dim)", width:"22px", height:"22px",
    borderRadius:"3px", cursor:"pointer", fontSize:"11px", lineHeight:"22px", textAlign:"center", padding:0 };
}

// ─── EMOJI PICKER ─────────────────────────────────────────────────────────────
// Used by TileCheckIn "How I'm feeling" field (#28)

export const FEELING_EMOJIS = [
  "😊","😄","🙂","😐","😔","😩","😤","😰","🤒","😴",
  "🔥","⚡","💪","🧘","🌊","🎯","🌟","✨","🙏","❤️",
  "😅","🤔","😮","😬","🥳","😎","🤩","😶","🫠","🥱",
];

export function EmojiPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const select = emoji => {
    onChange(emoji);
    setOpen(false);
  };

  return React.createElement("div", { ref, style:{position:"relative"} },
    // Trigger button — shows current emoji or placeholder
    React.createElement("button", {
      onClick: () => setOpen(o => !o),
      title: "Pick a feeling",
      style:{
        background: open ? "var(--accent-dim)" : "var(--bg-hover)",
        border: `1px solid ${open ? "var(--accent)" : "var(--input-border)"}`,
        borderRadius:"5px", cursor:"pointer",
        fontSize: value ? "20px" : "13px",
        width:"100%", padding: value ? "4px 8px" : "4px 8px",
        color: value ? "inherit" : "var(--text-faint)",
        textAlign:"left", lineHeight:1.4,
        fontFamily:"'DM Mono',monospace",
        display:"flex", alignItems:"center", gap:"6px",
        transition:"all 0.15s"
      }
    },
      React.createElement("span", null, value || "＋"),
      !value && React.createElement("span", { style:{fontSize:"10px",letterSpacing:"0.5px"} }, "how are you feeling?")
    ),

    // Picker popover
    open && React.createElement("div", {
      style:{
        position:"absolute", top:"calc(100% + 4px)", left:0, zIndex:200,
        background:"var(--bg-hover)", border:"1px solid var(--border)",
        borderRadius:"8px", padding:"8px", boxShadow:"0 4px 20px #0008",
        display:"grid", gridTemplateColumns:"repeat(10, 1fr)", gap:"2px",
        width:"240px"
      }
    },
      FEELING_EMOJIS.map(emoji =>
        React.createElement("button", {
          key: emoji,
          onClick: () => select(emoji),
          title: emoji,
          style:{
            background: value === emoji ? "var(--accent-dim)" : "transparent",
            border: `1px solid ${value === emoji ? "var(--accent)" : "transparent"}`,
            borderRadius:"5px", cursor:"pointer", fontSize:"16px",
            padding:"4px", lineHeight:1, textAlign:"center",
            transition:"background 0.1s"
          }
        }, emoji)
      ),
      // Clear button if value set
      value && React.createElement("button", {
        onClick: () => { onChange(""); setOpen(false); },
        style:{
          gridColumn:"span 10", marginTop:"4px",
          background:"transparent", border:"1px solid var(--border-dim)",
          borderRadius:"4px", cursor:"pointer",
          color:"var(--text-faint)", fontSize:"9px", letterSpacing:"1px",
          padding:"4px", fontFamily:"'DM Mono',monospace", textTransform:"uppercase"
        }
      }, "✕ clear")
    )
  );
}

export function CardShell({ title, accent="#c8a96e", bg, border, children, editMode, onRemove, onConfig, style={} }) {
  // Ignore hardcoded dark hex values from old saved configs — use CSS vars instead
  const safeBg = (!bg || bg.startsWith('#')) ? undefined : bg;
  const safeBorder = (!border || border.startsWith('#')) ? undefined : border;
  return React.createElement("div", {
    style:{ background:safeBg||"var(--bg-card)", border:`1px solid ${safeBorder||"var(--border)"}`,
      borderLeft:`3px solid ${accent}`, borderRadius:"6px", padding:"13px",
      position:"relative", ...style }
  },
    editMode && React.createElement("div", { style:{position:"absolute",top:"7px",right:"7px",display:"flex",gap:"4px",zIndex:10} },
      onConfig && React.createElement("button", { onClick:onConfig, style:iconBtnStyle("var(--bg-hover)"), title:"Configure" }, "⚙"),
      React.createElement("button", { onClick:onRemove, style:iconBtnStyle("#5a1a1a"), title:"Remove" }, "✕")
    ),
    React.createElement("div", {
      style:{fontFamily:"'Archivo Black',sans-serif",fontSize:"9px",letterSpacing:"2px",
        textTransform:"uppercase",color:"var(--text-muted)",marginBottom:"9px",paddingBottom:"5px",
        borderBottom:"1px solid var(--border-dim)",paddingRight:editMode?"50px":"0"}
    }, title),
    children
  );
}

