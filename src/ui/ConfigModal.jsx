// ─── CONFIG MODAL ─────────────────────────────────────────────────────────────
// Per-tile configuration editor. Renders generic field editors derived from the
// tile's config shape, plus a few tile-type-specific editors (gcal calendar
// dropdown, checkin planksSlot, guidedam mode, notionlinks link list, checklist
// auto-tick rules).
import React, { useState } from "react";
import { TILE_TYPES } from "../tiles/registry.js";
import { TILE_EVENTS } from "../lib/rules.js";
import { fetchCalendarList } from "../lib/calendar.js";

export function ConfigModal({ tile, tiles, onSave, onClose }) {
  const [cfg, setCfg] = useState({...tile.config});
  // #41 — when configuring a gcal tile, pull the user's calendar list so calendarId can render as a dropdown.
  const [calendarList, setCalendarList] = useState(null);
  React.useEffect(() => {
    if (tile.type !== "gcal") return;
    let alive = true;
    fetchCalendarList()
      .then(list => { if (alive) setCalendarList(list); })
      .catch(() => { if (alive) setCalendarList([]); });
    return () => { alive = false; };
  }, [tile.type]);

  const inputStyle = {width:"100%",background:"var(--bg)",border:"1px solid var(--border)",borderRadius:"3px",color:"var(--text)",fontFamily:"var(--font-body)",fontSize:"11px",padding:"6px 8px"};
  const tinyBtn   = {background:"var(--bg-card)",border:"1px solid var(--border)",color:"var(--text-dim)",fontFamily:"var(--font-body)",fontSize:"10px",padding:"3px 8px",borderRadius:"3px",cursor:"pointer"};
  const labelEl   = k => React.createElement("div", { style:{fontSize:"9px",color:"var(--text-muted)",letterSpacing:"1px",textTransform:"uppercase",marginBottom:"3px"} }, k);

  // #46 — custom editor for notionlinks.links (array of {label, url}). The default
  // array editor only handles string arrays; object arrays need their own UI.
  const renderLinksEditor = (links) => {
    const arr = Array.isArray(links) ? links : [];
    const update = next => setCfg({...cfg, links: next});
    return React.createElement("div", { style:{marginBottom:"10px"} },
      labelEl("links"),
      React.createElement("div", { style:{fontSize:"9px",color:"var(--text-faint)",marginBottom:"6px"} }, "Label + URL. Drop a link to remove it."),
      React.createElement("div", { style:{display:"flex",flexDirection:"column",gap:"6px"} },
        arr.map((l, i) =>
          React.createElement("div", { key:i, style:{display:"flex",gap:"4px",alignItems:"center"} },
            React.createElement("input", {
              value: l?.label || "",
              placeholder: "Label",
              onChange: e => { const n=[...arr]; n[i]={...(n[i]||{}),label:e.target.value}; update(n); },
              style: {...inputStyle, flex:"0 0 100px"}
            }),
            React.createElement("input", {
              value: l?.url || "",
              placeholder: "https://...",
              onChange: e => { const n=[...arr]; n[i]={...(n[i]||{}),url:e.target.value}; update(n); },
              style: {...inputStyle, flex:1}
            }),
            React.createElement("button", {
              onClick: () => { const n=[...arr]; n.splice(i,1); update(n); },
              title: "Remove",
              style: {...tinyBtn, padding:"3px 7px"}
            }, "✕")
          )
        )
      ),
      React.createElement("button", {
        onClick: () => update([...arr, { label:"", url:"" }]),
        style: {...tinyBtn, marginTop:"6px"}
      }, "+ Add link")
    );
  };

  // #49 — per-item rules editor for checklist tiles. Surfaces TILE_EVENTS as
  // a label-friendly dropdown. Quantitative legacy rules (pushups-total-gte etc.)
  // are rendered as readonly tags — users can clear them but not edit numerics
  // here; threshold rules are configured by editing the layout JSON directly.
  const renderRulesEditor = () => {
    if (tile.type !== "checklist") return null;
    const items = Array.isArray(cfg.items) ? cfg.items : [];
    const rules = cfg.rules || {};
    const candidateTiles = (tiles||[]).filter(t => t.id !== tile.id && TILE_EVENTS[t.type] && TILE_EVENTS[t.type].length > 0);

    const setRuleAt = (i, rule) => {
      const next = { ...rules };
      if (rule == null) delete next[i]; else next[i] = rule;
      setCfg({ ...cfg, rules: next });
    };

    return React.createElement("div", { style:{marginTop:"14px",paddingTop:"12px",borderTop:"1px solid var(--border)"} },
      React.createElement("div", { style:{fontFamily:"var(--font-display)",fontSize:"10px",color:"var(--accent)",letterSpacing:"1.5px",marginBottom:"4px"} }, "AUTO-TICK RULES"),
      React.createElement("div", { style:{fontSize:"9px",color:"var(--text-faint)",marginBottom:"10px",lineHeight:1.5} },
        "Each item can auto-check when something happens on another tile."),
      items.length === 0
        ? React.createElement("div", { style:{fontSize:"10px",color:"var(--text-faint)",fontStyle:"italic"} }, "Add items above first.")
        : React.createElement("div", { style:{display:"flex",flexDirection:"column",gap:"10px"} },
            items.map((item, i) => {
              const r = rules[i];
              const isTileEvent = r?.type === "tile-event";
              const isLegacy = r && !isTileEvent;
              const srcTile = isTileEvent ? (candidateTiles.find(t => t.id === r.sourceTileId) || (tiles||[]).find(t => t.id === r.sourceTileId)) : null;
              const srcEvents = srcTile ? (TILE_EVENTS[srcTile.type] || []) : [];

              const itemLabel = React.createElement("div", { style:{fontSize:"10px",color:"var(--text-dim)",marginBottom:"4px"} },
                React.createElement("span", { style:{color:"var(--text-muted)",marginRight:"5px"} }, `${i+1}.`),
                item || React.createElement("span", { style:{fontStyle:"italic",color:"var(--text-faint)"} }, "(empty item)")
              );

              if (isLegacy) {
                return React.createElement("div", { key:i },
                  itemLabel,
                  React.createElement("div", { style:{display:"flex",alignItems:"center",gap:"6px"} },
                    React.createElement("span", { style:{fontSize:"9px",color:"var(--accent)",background:"var(--accent-dim)",border:"1px solid var(--accent)",padding:"2px 6px",borderRadius:"3px"} },
                      `⚡ ${r.type}${r.threshold!=null?` ≥ ${r.threshold}`:""}`),
                    React.createElement("button", { onClick:()=>setRuleAt(i,null), style:{...tinyBtn,padding:"2px 6px"} }, "Clear")
                  )
                );
              }

              return React.createElement("div", { key:i },
                itemLabel,
                React.createElement("div", { style:{display:"flex",gap:"4px"} },
                  React.createElement("select", {
                    value: isTileEvent ? r.sourceTileId : "",
                    onChange: e => {
                      const newSrcId = e.target.value;
                      if (!newSrcId) { setRuleAt(i, null); return; }
                      const newSrc = candidateTiles.find(t => t.id === newSrcId);
                      const firstEvent = newSrc ? (TILE_EVENTS[newSrc.type]?.[0]?.key || "") : "";
                      setRuleAt(i, { type:"tile-event", sourceTileId:newSrcId, event:firstEvent });
                    },
                    style: {...inputStyle, flex:"0 0 45%"}
                  },
                    React.createElement("option", { value:"" }, "— none —"),
                    candidateTiles.map(t => React.createElement("option", { key:t.id, value:t.id },
                      `${t.config?.title || t.id} (${TILE_TYPES[t.type]?.label || t.type})`
                    ))
                  ),
                  isTileEvent && React.createElement("select", {
                    value: r.event || "",
                    onChange: e => setRuleAt(i, { ...r, event: e.target.value }),
                    style: {...inputStyle, flex:1}
                  },
                    srcEvents.map(ev => React.createElement("option", { key:ev.key, value:ev.key }, ev.label))
                  )
                )
              );
            })
          )
    );
  };

  return React.createElement("div", {
    style:{position:"fixed",inset:0,background:"#000b",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}
  },
    React.createElement("div", { style:{background:"var(--bg-hover)",border:"1px solid var(--border)",borderRadius:"8px",padding:"22px",width:"380px",maxHeight:"82vh",overflow:"auto"} },
      React.createElement("div", { style:{fontFamily:"var(--font-display)",fontSize:"12px",color:"var(--accent)",marginBottom:"16px",letterSpacing:"1px"} },
        `Configure: ${TILE_TYPES[tile.type]?.label||tile.type}`
      ),
      Object.entries(cfg).map(([k,v]) => {
        if (k.startsWith("_")) return null;
        const label = labelEl(k);
        // #49 — `rules` is rendered by the dedicated rules editor section below, not as a raw field.
        if (k === "rules") return null;
        // #46 — special-case the notionlinks `links` field as an object-array editor.
        if (k === "links" && tile.type === "notionlinks") return React.createElement(React.Fragment, { key:k }, renderLinksEditor(v));
        // #41 — special-case the gcal calendarId field as a dropdown of the user's calendars
        if (k === "calendarId" && tile.type === "gcal") {
          if (calendarList === null) return React.createElement("div", { key:k, style:{marginBottom:"10px"} },
            label,
            React.createElement("div", { style:{fontSize:"10px",color:"var(--text-faint)",padding:"6px 0"} }, "Loading calendars…"));
          if (calendarList.length === 0) return React.createElement("div", { key:k, style:{marginBottom:"10px"} },
            label,
            React.createElement("input", { value:v, onChange:e=>setCfg({...cfg,[k]:e.target.value}), style:inputStyle }),
            React.createElement("div", { style:{fontSize:"9px",color:"var(--text-faint)",marginTop:"3px"} }, "Couldn't load calendar list — enter ID manually."));
          return React.createElement("div", { key:k, style:{marginBottom:"10px"} },
            label,
            React.createElement("select", {
              value: v,
              onChange: e => setCfg({...cfg, [k]: e.target.value}),
              style: inputStyle
            },
              calendarList.map(c => React.createElement("option", { key:c.id, value:c.id },
                `${c.name}${c.primary ? " (primary)" : ""}`
              ))
            )
          );
        }
        // #45 — special-case the checkin planksSlot field as a time-of-day dropdown.
        if (k === "planksSlot" && tile.type === "checkin") {
          return React.createElement("div", { key:k, style:{marginBottom:"10px"} },
            label,
            React.createElement("select", {
              value: v,
              onChange: e => setCfg({...cfg, [k]: e.target.value}),
              style: inputStyle
            },
              [
                ["am",        "AM (before 11:30)"],
                ["noon",      "Noon (11:30–14:00)"],
                ["afternoon", "PM (14:00–18:00)"],
                ["evening",   "Evening (18:00+)"],
                ["none",      "Disable auto-tick"],
              ].map(([val,name]) => React.createElement("option", { key:val, value:val }, name))
            )
          );
        }
        // #3 — special-case the guidedam mode field as a dropdown.
        if (k === "mode" && tile.type === "guidedam") {
          return React.createElement("div", { key:k, style:{marginBottom:"10px"} },
            label,
            React.createElement("select", {
              value: v,
              onChange: e => setCfg({...cfg, [k]: e.target.value}),
              style: inputStyle
            },
              React.createElement("option", { value: "all" }, "All visible"),
              React.createElement("option", { value: "guided" }, "Guided (step-by-step)")
            )
          );
        }
        if (typeof v === "string") return React.createElement("div", { key:k, style:{marginBottom:"10px"} },
          label, React.createElement("input", { value:v, onChange:e=>setCfg({...cfg,[k]:e.target.value}), style:inputStyle }));
        if (typeof v === "number") return React.createElement("div", { key:k, style:{marginBottom:"10px"} },
          label, React.createElement("input", { type:"number", value:v, onChange:e=>setCfg({...cfg,[k]:+e.target.value}), style:inputStyle }));
        if (Array.isArray(v)) return React.createElement("div", { key:k, style:{marginBottom:"10px"} },
          label,
          React.createElement("div", { style:{fontSize:"9px",color:"var(--text-faint)",marginBottom:"3px"} }, "one item per line"),
          React.createElement("textarea", { value:v.join("\n"), rows:Math.max(3,v.length+1),
            onChange: e => { setCfg({...cfg,[k]:e.target.value.split("\n")}); e.target.style.height="auto"; e.target.style.height=e.target.scrollHeight+"px"; },
            onFocus: e => { e.target.style.height="auto"; e.target.style.height=e.target.scrollHeight+"px"; },
            style:{...inputStyle,resize:"none",overflow:"hidden"} }));
        return null;
      }),
      // #49 — per-item rules editor, only relevant to checklist tiles.
      renderRulesEditor(),
      React.createElement("div", { style:{display:"flex",gap:"8px",marginTop:"16px"} },
        React.createElement("button", { onClick:()=>onSave(cfg),
          style:{flex:1,background:"var(--accent-dim)",border:"1px solid var(--accent)",color:"var(--accent)",fontFamily:"var(--font-body)",fontSize:"11px",padding:"8px",borderRadius:"4px",cursor:"pointer"} },
          "Save"),
        React.createElement("button", { onClick:onClose,
          style:{flex:1,background:"var(--bg-card)",border:"1px solid var(--border)",color:"var(--text-dim)",fontFamily:"var(--font-body)",fontSize:"11px",padding:"8px",borderRadius:"4px",cursor:"pointer"} },
          "Cancel")
      )
    )
  );
}
