// App shell: TileLibrary, ConfigModal, HistoryView, SyncDot, and the App component.
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { CLIENT_ID, APP_URL, DRIVE_FOLDER, LOCAL_KEY, THEME_KEY, SCOPES } from "./config.js";
import { setToken } from "./lib/token.js";
import { loadFromDrive, saveToDrive } from "./lib/drive.js";
import { fetchCalendarList, clearCalendarListCache } from "./lib/calendar.js";
import { buildDefaultLayout, emptyStore, migrateLayout } from "./lib/store.js";
import { mergeStores } from "./lib/sync.js";
import { evaluateRule, TILE_EVENTS, checkinIsDone, checkinScheduleMin, deriveCheckinSlot } from "./lib/rules.js";
import { DAYS, MONTHS, todayKey, fmtDate, uid } from "./lib/helpers.js";
import { CardShell, AutoTA, CB, iconBtnStyle, EmojiPicker } from "./ui.jsx";
import { TILE_TYPES, defaultConfig } from "./tiles/registry.js";
import { RenderTile, AddProjectButton } from "./tiles.jsx";

// ─── TILE LIBRARY PANEL ───────────────────────────────────────────────────────

function TileLibrary({ onAdd, columns }) {
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
  return React.createElement("div", { style:{background:"var(--bg-hover)",border:"1px solid var(--border)",borderRadius:"6px",padding:"14px",marginBottom:"14px"} },
    React.createElement("div", { style:{display:"flex",alignItems:"center",gap:"10px",marginBottom:"10px",flexWrap:"wrap"} },
      React.createElement("span", { style:{fontFamily:"'Archivo Black',sans-serif",fontSize:"9px",letterSpacing:"2px",textTransform:"uppercase",color:"var(--text-muted)"} }, "Add to column:"),
      columns.map(c => React.createElement("button", { key:c.id, onClick:()=>setCol(c.id),
        style:{background:col===c.id?"var(--accent-dim)":"var(--bg-card)",border:`1px solid ${col===c.id?"var(--accent)":"var(--border)"}`,
          color:col===c.id?"var(--accent)":"var(--text-dim)",fontSize:"10px",padding:"3px 10px",borderRadius:"3px",cursor:"pointer",fontFamily:"'DM Mono',monospace"} },
        c.id
      ))
    ),
    React.createElement("div", { style:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(90px,1fr))",gap:"6px"} },
      Object.entries(TILE_TYPES).map(([type,{label,icon}]) =>
        React.createElement("button", { key:type, onClick:()=>onAdd(col,type),
          style:{background:"var(--bg-card)",border:"1px solid var(--border)",color:"var(--text-dim)",fontFamily:"'DM Mono',monospace",
            fontSize:"10px",padding:"8px 6px",borderRadius:"4px",cursor:"pointer",textAlign:"center",
            display:"flex",flexDirection:"column",alignItems:"center",gap:"3px"} },
          React.createElement("span", { style:{fontSize:"16px"} }, icon),
          label
        )
      )
    )
  );
}

// ─── CONFIG MODAL ─────────────────────────────────────────────────────────────

function ConfigModal({ tile, tiles, onSave, onClose }) {
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

  const inputStyle = {width:"100%",background:"var(--bg)",border:"1px solid var(--border)",borderRadius:"3px",color:"var(--text)",fontFamily:"'DM Mono',monospace",fontSize:"11px",padding:"6px 8px"};
  const tinyBtn   = {background:"var(--bg-card)",border:"1px solid var(--border)",color:"var(--text-dim)",fontFamily:"'DM Mono',monospace",fontSize:"10px",padding:"3px 8px",borderRadius:"3px",cursor:"pointer"};
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
      React.createElement("div", { style:{fontFamily:"'Archivo Black',sans-serif",fontSize:"10px",color:"var(--accent)",letterSpacing:"1.5px",marginBottom:"4px"} }, "AUTO-TICK RULES"),
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
      React.createElement("div", { style:{fontFamily:"'Archivo Black',sans-serif",fontSize:"12px",color:"var(--accent)",marginBottom:"16px",letterSpacing:"1px"} },
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
          style:{flex:1,background:"var(--accent-dim)",border:"1px solid var(--accent)",color:"var(--accent)",fontFamily:"'DM Mono',monospace",fontSize:"11px",padding:"8px",borderRadius:"4px",cursor:"pointer"} },
          "Save"),
        React.createElement("button", { onClick:onClose,
          style:{flex:1,background:"var(--bg-card)",border:"1px solid var(--border)",color:"var(--text-dim)",fontFamily:"'DM Mono',monospace",fontSize:"11px",padding:"8px",borderRadius:"4px",cursor:"pointer"} },
          "Cancel")
      )
    )
  );
}

// ─── HISTORY VIEW ─────────────────────────────────────────────────────────────

function HistoryView({ store }) {
  // #48 — newest-first by default; toggle to reverse. The "latest" day is always
  // identified as the lexicographically-largest key (newest), independent of sort
  // direction — the badge anchors to the most recent day, not the topmost row.
  const [sortDir, setSortDir] = useState("desc");
  const [sel, setSel] = useState(null);
  const sortedDesc = Object.entries(store.days).sort((a,b)=>b[0].localeCompare(a[0]));
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
    style:{textAlign:"center",padding:"80px",color:"var(--text-faint)",fontFamily:"'DM Mono',monospace",fontSize:"12px"}
  }, "No history yet — your completed days will appear here.");

  const selData = sel ? store.days[sel] : null;

  return React.createElement("div", { style:{maxWidth:"960px",margin:"0 auto",padding:"24px",display:"grid",gridTemplateColumns:"200px 1fr",gap:"16px"} },
    React.createElement("div", null,
      React.createElement("div", { style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"10px"} },
        React.createElement("div", { style:{fontFamily:"'Archivo Black',sans-serif",fontSize:"9px",letterSpacing:"2px",textTransform:"uppercase",color:"var(--text-faint)"} }, "Past Days"),
        // #48 — sort toggle. Clicking flips direction; chevron indicates current.
        React.createElement("button", {
          onClick: () => setSortDir(d => d === "desc" ? "asc" : "desc"),
          title: sortDir === "desc" ? "Showing newest first — click for oldest first" : "Showing oldest first — click for newest first",
          style:{background:"transparent",border:"none",color:"var(--text-faint)",fontFamily:"'DM Mono',monospace",fontSize:"9px",cursor:"pointer",letterSpacing:"0.5px",padding:"0 2px"}
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
            marginBottom:"4px",color:txtCol,fontFamily:"'DM Mono',monospace",
            fontSize:"10px",cursor:"pointer",position:"relative"} },
          fmtDate(key),
          isLatest && React.createElement("span", {
            style:{position:"absolute",top:"3px",right:"4px",fontSize:"7px",letterSpacing:"1px",
              color:"var(--accent)",background:"var(--bg)",border:"1px solid var(--accent)",
              padding:"1px 4px",borderRadius:"2px",fontFamily:"'Archivo Black',sans-serif"}
          }, "LATEST")
        );
      })
    ),
    React.createElement("div", null,
      selData ? React.createElement("div", null,
        React.createElement("div", { style:{fontFamily:"'Archivo Black',sans-serif",fontSize:"16px",color:"var(--accent)",marginBottom:"16px"} }, fmtDate(sel)),
        allTiles.map(tile => {
          const td = selData[tile.id];
          if (!td) return null;
          return React.createElement("div", { key:tile.id, style:{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"5px",padding:"13px",marginBottom:"10px"} },
            React.createElement("div", { style:{fontFamily:"'Archivo Black',sans-serif",fontSize:"9px",letterSpacing:"2px",textTransform:"uppercase",color:"var(--text-muted)",marginBottom:"8px"} }, tile.config?.title||tile.id),
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
      ) : React.createElement("div", { style:{color:"var(--text-faint)",fontFamily:"'DM Mono',monospace",fontSize:"12px",padding:"60px",textAlign:"center"} }, "← Select a day")
    )
  );
}

// ─── SYNC STATUS INDICATOR ────────────────────────────────────────────────────

function SyncDot({ status }) {
  const colors = { idle:"var(--text-faint)", saving:"#c8a96e", saved:"#4a7a4a", error:"#a04040", offline:"var(--text-muted)" };
  const labels = { idle:"", saving:"saving...", saved:"saved to Drive", error:"save failed", offline:"offline" };
  return React.createElement("div", { style:{display:"flex",alignItems:"center",gap:"5px",fontSize:"9px",color:"var(--text-muted)",letterSpacing:"0.5px"} },
    React.createElement("div", { style:{width:"6px",height:"6px",borderRadius:"50%",background:colors[status]||"var(--text-faint)",transition:"background 0.3s"} }),
    labels[status]
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

function App() {
  const [store, setStore]         = useState(null);
  const [authState, setAuthState] = useState("idle"); // idle | authing | authed | error
  const [authEpoch, setAuthEpoch] = useState(0); // bumps after each successful auth; calendar tile etc. watch this to re-fetch
  const [syncStatus, setSyncStatus] = useState("idle"); // idle | saving | saved | error | offline
  const [view, setView]           = useState("today");
  const [editMode, setEditMode]   = useState(false);
  const [configTile, setConfigTile] = useState(null);
  const [dragState, setDragState] = useState(null);
  const [theme, setTheme]         = useState(() => localStorage.getItem(THEME_KEY) || "dark");
  // #35 — per-column reveal of past-due check-in blocks, plus a minute ticker so
  // staleness re-evaluates as the day rolls on without needing a user interaction.
  const [showStale, setShowStale] = useState({});
  const [, setClock]              = useState(0);
  const saveTimer = useRef(null);
  const isAuthed = authState === "authed";

  // #35 — re-render every minute so check-in blocks become stale on schedule.
  useEffect(() => {
    const id = setInterval(() => setClock(c => c + 1), 60000);
    return () => clearInterval(id);
  }, []);

  // ── Theme ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);
  const toggleTheme = () => setTheme(t => t === "dark" ? "light" : "dark");

  // ── Auth ──────────────────────────────────────────────────────────────────

  // `force` = true means we want the consent dialog to actually appear
  // (e.g. user clicked "Re-authorize" because a needed scope is missing).
  // Without `prompt: "consent"`, Google will silently return whatever scopes
  // it already has on file, even if that's an incomplete subset of what we asked for.
  function initGoogleAuth(force = false) {
    if (!CLIENT_ID || CLIENT_ID === "YOUR_GOOGLE_CLIENT_ID_HERE") {
      setAuthState("no-config");
      return;
    }
    setAuthState("authing");
    try {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: async (resp) => {
          if (resp.error) {
            console.error("Google auth error:", resp.error, resp.error_description);
            setAuthState("error");
            return;
          }
          setToken(resp.access_token);
          // Surface any missing scopes so the calendar tile can show a real error
          // instead of silently looping on 403.
          const granted = (resp.scope || "").split(" ").filter(Boolean);
          const requested = SCOPES.split(" ").filter(Boolean);
          const missing = requested.filter(s => !granted.includes(s));
          if (missing.length) {
            console.warn("OAuth token issued without requested scopes:", missing,
              "— check Google Cloud Console: enable the API and add the scope to your OAuth consent screen.");
          }
          window.__daymasterGrantedScopes = granted;
          setAuthState("authed");
          setAuthEpoch(e => e + 1);
          await syncDown();
        }
      });
      client.requestAccessToken({ prompt: force ? "consent" : "" });
    } catch(e) {
      console.error("Auth error", e);
      setAuthState("error");
    }
  }

  // ── Load ──────────────────────────────────────────────────────────────────

  async function syncDown() {
    // #53 Phase 1 — merge Drive with any locally-cached store rather than letting
    // Drive blindly overwrite unsynced local edits made before auth completed.
    let localStore = null;
    try { const raw = localStorage.getItem(LOCAL_KEY); if (raw) localStore = JSON.parse(raw); } catch {}
    try {
      const driveData = await loadFromDrive();
      if (driveData) {
        applyStore(localStore ? mergeStores(localStore, driveData) : driveData);
        return;
      }
    } catch(e) {
      console.warn("Drive load failed, using local", e);
    }
    // Fall back to localStorage
    applyStore(localStore || emptyStore());
  }

  function applyStore(s) {
    // Run layout migrations (idempotent) for any features that reshape the default layout
    s = migrateLayout(s);
    // Day rollover
    const today = todayKey();
    if (!s.days) s.days = {};
    if (!s.days[today]) {
      s.days[today] = {};
      const keys = Object.keys(s.days).filter(k=>k!==today).sort().reverse();
      const yesterday = keys[0];
      if (yesterday) {
        // ── SHELVED 2026-05-20 — Both carry-forwards (priorities + #27 check-in items) ──
        // Each new day starts clear. Pull-forward semantics are awaiting revision per owner.
        // To restore the prior behavior verbatim, remove the /* */ around the block below.
        // Tickets: pre-existing priorities carry-forward (no ticket) + #27 check-in items.
        /*
        // #33 — carry-forward should work regardless of which preset is active.
        // Union tiles across all layouts (deduped by id, first wins) so switching
        // between Daily / AM Focus / etc. doesn't break the rollover.
        const tilesById = {};
        for (const lk of Object.keys(s.layouts || {})) {
          for (const col of s.layouts[lk]?.columns || []) {
            for (const t of col.tiles || []) if (!tilesById[t.id]) tilesById[t.id] = t;
          }
        }

        // Priorities carry-forward (pre-existing behaviour, now layout-agnostic).
        const priTile = Object.values(tilesById).find(t => t.type === "priorities");
        if (priTile) {
          const yd = s.days[yesterday]?.[priTile.id];
          const carried = (yd?.priorities||[]).filter(p=>p.text&&!p.done);
          if (carried.length) s.days[today][priTile.id] = { priorities:carried.map(p=>({...p})), added:["","","",""], _type:"priorities", _carried:true };
        }

        // #27 — check-in next-priorities items get the same _carried treatment as
        // the priorities tile. Each check-in's undone {text,done} items from yesterday
        // pre-fill today's same-id check-in. Items get done:false on carry. Items
        // with empty text are dropped. Legacy string items are upgraded to {text,done}.
        for (const tile of Object.values(tilesById)) {
          if (tile.type !== "checkin") continue;
          if (s.days[today][tile.id]) continue; // user already touched / something else seeded it
          const yd = s.days[yesterday]?.[tile.id];
          const ydItems = yd?.items || [];
          const carriedItems = ydItems
            .map(it => typeof it === "string" ? { text: it, done: false } : (it || { text: "", done: false }))
            .filter(it => it.text?.trim() && !it.done)
            .map(it => ({ text: it.text, done: false }));
          if (carriedItems.length) {
            s.days[today][tile.id] = { items: carriedItems, _type: "checkin", _carried: true };
          }
        }
        */
      }
    }
    setStore(s);
    if (window.__daymasterReady) window.__daymasterReady();
  }

  // On mount — load from localStorage immediately, then auth + sync Drive
  useEffect(() => {
    const local = localStorage.getItem(LOCAL_KEY);
    applyStore(local ? JSON.parse(local) : emptyStore());
    // Auto-init auth if Google API loaded
    const tryAuth = () => {
      if (window.google?.accounts?.oauth2 && CLIENT_ID && CLIENT_ID !== "YOUR_GOOGLE_CLIENT_ID_HERE") {
        initGoogleAuth();
      } else {
        setAuthState("no-config");
        if (window.__daymasterReady) window.__daymasterReady();
      }
    };
    // Give Google script a moment to load
    setTimeout(tryAuth, 1200);
  }, []);

  // ── Save (debounced) ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!store) return;
    // Always save to localStorage immediately
    localStorage.setItem(LOCAL_KEY, JSON.stringify(store));
    // Debounce Drive save by 2s
    if (!isAuthed) return;
    setSyncStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        // #53 Phase 1 — if the save reconciled a concurrent edit from another
        // device, adopt the merged result so this device shows the union too.
        const merged = await saveToDrive(store);
        if (merged) setStore(merged);
        setSyncStatus("saved");
        setTimeout(()=>setSyncStatus("idle"), 3000);
      } catch(e) {
        console.error("Drive save failed", e);
        setSyncStatus("error");
      }
    }, 2000);
  }, [store, isAuthed]);

  // ── Store mutations ───────────────────────────────────────────────────────

  const updateTileData = useCallback((tileId, data) => {
    // #53 Phase 1 — stamp the day's __mtime so cross-device merges can pick the
    // freshest copy of a contested day.
    const k = todayKey();
    setStore(s => ({ ...s, days: { ...s.days, [k]: { ...s.days[k], [tileId]: data, __mtime: Date.now() } } }));
  }, []);

  const mutateLayout = useCallback(fn => {
    setStore(s => {
      const layoutKey = s.activeLayout||"default";
      return { ...s, layouts: { ...s.layouts, [layoutKey]: fn(s.layouts[layoutKey]) } };
    });
  }, []);

  const removeTile = useCallback((colId, tileId) =>
    mutateLayout(l => ({ ...l, columns: l.columns.map(c => c.id===colId ? {...c, tiles:c.tiles.filter(t=>t.id!==tileId)} : c) })), []);

  const addTile = useCallback((colId, type) =>
    mutateLayout(l => ({ ...l, columns: l.columns.map(c => c.id===colId ? {...c, tiles:[...c.tiles, {id:uid(),type,config:defaultConfig(type)}]} : c) })), []);

  const saveTileConfig = useCallback((colId, tileId, cfg) =>
    mutateLayout(l => ({ ...l, columns: l.columns.map(c => c.id===colId ? {...c, tiles:c.tiles.map(t=>t.id===tileId?{...t,config:cfg}:t)} : c) })), []);

  const moveTile = useCallback((colId, from, to) =>
    mutateLayout(l => ({ ...l, columns: l.columns.map(c => {
      if (c.id!==colId) return c;
      const tiles=[...c.tiles]; const [t]=tiles.splice(from,1); tiles.splice(to,0,t); return {...c,tiles};
    })})), []);

  const moveTileAcross = useCallback((fromColId, tileId, toColId) =>
    mutateLayout(l => {
      let tile = null;
      const cols = l.columns.map(c => {
        if (c.id !== fromColId) return c;
        tile = c.tiles.find(t => t.id === tileId);
        return { ...c, tiles: c.tiles.filter(t => t.id !== tileId) };
      });
      return { ...l, columns: cols.map(c => {
        if (c.id !== toColId || !tile) return c;
        return { ...c, tiles: [...c.tiles, tile] };
      })};
    }), []);

  // #33 — layout management. Presets live in store.layouts; activeLayout selects one.
  // Switch / Duplicate / Rename / Delete / New. Keys are derived from names but
  // stay stable thereafter (rename only changes display name). At least one
  // layout must remain; deleting the last falls back to seeding `default`.
  const switchLayout = useCallback((key) => {
    setStore(s => {
      if (!s.layouts?.[key]) return s;
      return { ...s, activeLayout: key };
    });
  }, []);

  const keyFromName = (name) => {
    const base = (name||"").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return (base || "layout") + "-" + uid().slice(0, 4);
  };

  const duplicateLayout = useCallback(() => {
    setStore(s => {
      const srcKey = s.activeLayout || "default";
      const src = s.layouts?.[srcKey];
      if (!src) return s;
      const proposed = window.prompt("Name for the duplicate:", `${src.name || srcKey} copy`);
      if (!proposed) return s;
      const newKey = keyFromName(proposed);
      const clone = JSON.parse(JSON.stringify(src));
      clone.name = proposed;
      return { ...s, layouts: { ...s.layouts, [newKey]: clone }, activeLayout: newKey };
    });
  }, []);

  const renameLayout = useCallback(() => {
    setStore(s => {
      const key = s.activeLayout || "default";
      const cur = s.layouts?.[key];
      if (!cur) return s;
      const proposed = window.prompt("Rename layout:", cur.name || key);
      if (!proposed || proposed === cur.name) return s;
      return { ...s, layouts: { ...s.layouts, [key]: { ...cur, name: proposed } } };
    });
  }, []);

  const deleteLayout = useCallback(() => {
    setStore(s => {
      const key = s.activeLayout || "default";
      const keys = Object.keys(s.layouts || {});
      if (keys.length <= 1) { alert("Can't delete the last layout — create another one first."); return s; }
      const cur = s.layouts[key];
      if (!window.confirm(`Delete layout "${cur?.name || key}"?\n\nYour per-day data stays. The tiles in this layout disappear from your sidebar; switch back to another layout to see them.`)) return s;
      const nextLayouts = { ...s.layouts };
      delete nextLayouts[key];
      const nextActive = Object.keys(nextLayouts)[0];
      return { ...s, layouts: nextLayouts, activeLayout: nextActive };
    });
  }, []);

  const newLayout = useCallback(() => {
    setStore(s => {
      const proposed = window.prompt("New layout name:", "Untitled");
      if (!proposed) return s;
      const newKey = keyFromName(proposed);
      const empty = { name: proposed, columns: [
        { id: "col-left",   width: 22, tiles: [] },
        { id: "col-center", width: 44, tiles: [] },
        { id: "col-right",  width: 24, tiles: [] },
      ]};
      return { ...s, layouts: { ...s.layouts, [newKey]: empty }, activeLayout: newKey };
    });
  }, []);

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(store,null,2)],{type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=`daymaster-${todayKey()}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const importBackup = e => {
    const f = e.target.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = ev => { try { applyStore(JSON.parse(ev.target.result)); } catch { alert("Invalid backup file"); } };
    r.readAsText(f);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  // #49 — tilesById is the lookup the tile-event rule type uses to resolve a
  // source tile's CURRENT type. Must be declared BEFORE the early-return below
  // (Rules of Hooks: hook count must be stable across renders).
  // Uses optional-chaining so it's safe to call when store is still null on
  // first render; on later renders the proper layout object flows in.
  const layoutKey = store?.activeLayout || "default";
  const layout    = store?.layouts?.[layoutKey] || (store && store.layouts ? store.layouts[Object.keys(store.layouts)[0]] : null);
  const tilesById = React.useMemo(() => {
    const map = {};
    for (const col of layout?.columns || []) for (const t of col.tiles || []) map[t.id] = t;
    return map;
  }, [layout]);

  if (!store) return React.createElement("div", { style:{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"var(--bg)",color:"var(--text-muted)",fontFamily:"monospace"} }, "Loading...");

  const todayData = store.days[todayKey()]||{};
  const allLayoutEntries = Object.entries(store.layouts || {});
  const d = new Date();

  const headerBtn = (label, onClick, active=false, extra={}) => React.createElement("button", {
    onClick,
    style:{background:active?"var(--accent-dim)":"var(--bg-hover)",border:`1px solid ${active?"var(--accent)":"var(--border)"}`,
      color:active?"var(--accent)":"var(--text-dim)",padding:"5px 12px",borderRadius:"4px",cursor:"pointer",
      fontFamily:"'DM Mono',monospace",fontSize:"10px",letterSpacing:"0.5px",...extra}
  }, label);

  return React.createElement("div", { style:{minHeight:"100vh",background:"var(--bg)",color:"var(--text)",fontFamily:"'DM Mono',monospace",fontSize:"12px"} },

    // GLOBAL STYLES — CSS variables drive both dark and light themes
    React.createElement("style", null, `
      @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Archivo+Black&family=Instrument+Serif:ital@0;1&display=swap');

      /* ── Dark theme (default) ── */
      :root, [data-theme="dark"] {
        --bg:           #0f0f0f;
        --bg-card:      #161616;
        --bg-header:    #0c0c0c;
        --bg-input:     transparent;
        --bg-hover:     #1a1a1a;
        --border:       #252525;
        --border-dim:   #1e1e1e;
        --border-head:  #1e1e1e;
        --text:         #e8e4dc;
        --text-dim:     #888;
        --text-muted:   #555;
        --text-faint:   #444;
        --text-xfaint:  #333;
        --accent:       #c8a96e;
        --accent-dim:   #c8a96e22;
        --scrollbar-track: #111;
        --scrollbar-thumb: #2a2a2a;
        --input-border: #222;
        --sep:          #222;
      }

      /* ── Light theme ── */
      [data-theme="light"] {
        --bg:           #f5f0e8;
        --bg-card:      #faf7f2;
        --bg-header:    #ede8de;
        --bg-input:     transparent;
        --bg-hover:     #f0ebe0;
        --border:       #d8cfc0;
        --border-dim:   #e0d8cc;
        --border-head:  #ccc4b4;
        --text:         #2a2520;
        --text-dim:     #6a5f50;
        --text-muted:   #8a7f70;
        --text-faint:   #a09080;
        --text-xfaint:  #b0a090;
        --accent:       #b08040;
        --accent-dim:   #b0804022;
        --scrollbar-track: #e8e0d0;
        --scrollbar-thumb: #c0b8a8;
        --input-border: #ccc4b4;
        --sep:          #d8d0c0;
      }

      *{box-sizing:border-box;margin:0;padding:0;}
      input,textarea,button{font-family:inherit;}
      input:focus,textarea:focus{outline:none;}
      textarea{display:block;overflow:hidden;resize:none;field-sizing:content;}
      ::-webkit-scrollbar{width:4px;height:4px;}
      ::-webkit-scrollbar-track{background:var(--scrollbar-track);}
      ::-webkit-scrollbar-thumb{background:var(--scrollbar-thumb);border-radius:2px;}
      .tile-hover{outline:2px dashed var(--accent)55!important;}

      /* ── Mobile layout ── */
      @media (max-width: 768px) {
        .dm-header {
          flex-wrap: wrap;
          padding: 10px 12px !important;
          gap: 8px;
        }
        .dm-header-date { display: none !important; }
        .dm-header-btns {
          flex-wrap: wrap;
          gap: 4px !important;
          width: 100%;
        }
        .dm-header-btns button,
        .dm-header-btns label {
          font-size: 9px !important;
          padding: 4px 8px !important;
        }
        .dm-grid {
          display: flex !important;
          flex-direction: column !important;
          gap: 12px !important;
        }
        .dm-col-left   { order: 2; }
        .dm-col-center { order: 1; }
        .dm-col-right  { order: 3; }
        .dm-main { padding: 10px !important; }
      }
    `),

    // HEADER
    React.createElement("div", { className:"dm-header", style:{background:"var(--bg-header)",borderBottom:"1px solid var(--border-head)",padding:"12px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:50} },
      React.createElement("div", { style:{display:"flex",alignItems:"center",gap:"12px"} },
        React.createElement("div", { style:{fontFamily:"'Archivo Black',sans-serif",fontSize:"20px",letterSpacing:"-0.5px"} },
          "Day", React.createElement("span", { style:{color:"var(--accent)"} }, "master")
        ),
        React.createElement(SyncDot, { status: isAuthed ? syncStatus : (authState==="no-config"?"offline":"idle") })
      ),
      React.createElement("div", { className:"dm-header-date", style:{fontFamily:"'Instrument Serif',serif",fontStyle:"italic",fontSize:"13px",color:"var(--text-muted)"} },
        `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
      ),
      React.createElement("div", { className:"dm-header-btns", style:{display:"flex",gap:"6px",alignItems:"center",flexWrap:"wrap"} },
        headerBtn("Today", ()=>setView("today"), view==="today"),
        headerBtn("History", ()=>setView("history"), view==="history"),
        React.createElement("div", { style:{width:"1px",height:"18px",background:"var(--sep)",margin:"0 2px"} }),
        // #33 — layout switcher. Always visible; in edit mode the manage actions appear next to it.
        React.createElement("select", {
          value: layoutKey,
          onChange: e => switchLayout(e.target.value),
          title: "Switch layout preset",
          style:{background:"var(--bg-hover)",border:"1px solid var(--border)",color:"var(--text-dim)",
            fontFamily:"'DM Mono',monospace",fontSize:"10px",padding:"4px 8px",borderRadius:"4px",
            cursor:"pointer",letterSpacing:"0.5px"}
        },
          allLayoutEntries.map(([k, l]) => React.createElement("option", { key:k, value:k }, l?.name || k))
        ),
        editMode && headerBtn("➕ New",      newLayout,       false, {fontSize:"9px",padding:"4px 8px"}),
        editMode && headerBtn("⎘ Duplicate", duplicateLayout, false, {fontSize:"9px",padding:"4px 8px"}),
        editMode && headerBtn("✎ Rename",    renameLayout,    false, {fontSize:"9px",padding:"4px 8px"}),
        editMode && allLayoutEntries.length > 1 && headerBtn("🗑 Delete", deleteLayout, false, {fontSize:"9px",padding:"4px 8px",color:"#a08070"}),
        React.createElement("div", { style:{width:"1px",height:"18px",background:"var(--sep)",margin:"0 2px"} }),
        headerBtn(editMode?"✓ Done":"✎ Layout", ()=>setEditMode(e=>!e), editMode,
          editMode?{background:"var(--accent)",color:"var(--bg)",border:"1px solid var(--accent)"}:{}),
        React.createElement("div", { style:{width:"1px",height:"18px",background:"var(--sep)",margin:"0 2px"} }),
        headerBtn(theme==="dark"?"☀ Light":"☾ Dark", toggleTheme),
        React.createElement("div", { style:{width:"1px",height:"18px",background:"var(--sep)",margin:"0 2px"} }),
        !isAuthed && authState!=="authing" && React.createElement("button", {
          onClick:initGoogleAuth,
          style:{background:"#1a2a1a",border:"1px solid #3a6a3a",color:"#7ac97a",padding:"5px 12px",borderRadius:"4px",cursor:"pointer",fontFamily:"'DM Mono',monospace",fontSize:"10px"}
        }, authState==="no-config"?"⚙ Add Client ID":"↻ Connect Drive"),
        authState==="authing" && React.createElement("span", { style:{color:"var(--text-muted)",fontSize:"10px"} }, "Connecting..."),
        headerBtn("⬇ Backup", exportBackup),
        React.createElement("label", { style:{background:"var(--bg-hover)",border:"1px solid var(--border)",color:"var(--text-dim)",padding:"5px 12px",borderRadius:"4px",cursor:"pointer",fontFamily:"'DM Mono',monospace",fontSize:"10px"} },
          "⬆ Restore",
          React.createElement("input", { type:"file", accept:".json", style:{display:"none"}, onChange:importBackup })
        )
      )
    ),

    // VIEWS
    view==="history" && React.createElement(HistoryView, { store }),

    view==="today" && React.createElement("div", { className:"dm-main", style:{padding:"16px"} },
      editMode && React.createElement(TileLibrary, { onAdd:addTile, columns:layout.columns }),

      React.createElement("div", { className:"dm-grid", style:{display:"grid",gridTemplateColumns:layout.columns.map(c=>`${c.width}fr`).join(" "),gap:"14px"} },
        layout.columns.map((col, colIdx) => {
          // #35 — view-mode reorder/hide of check-in tiles. Completed blocks sink to
          // the bottom of their group; incomplete blocks more than an hour past their
          // scheduled time are pulled out behind a reveal toggle so the morning's
          // missed check-ins don't clutter the active flow. Edit mode is left intact
          // so drag/index logic keeps operating on the real layout order.
          const nowMin = (() => { const d = new Date(); return d.getHours()*60 + d.getMinutes(); })();
          const checkinIds = col.tiles.filter(t => t.type === "checkin");
          let orderedTiles = col.tiles, staleTiles = [];
          if (!editMode && checkinIds.length) {
            const meta = new Map(checkinIds.map(t => {
              const done = checkinIsDone(t.config, todayData[t.id]||{}, todayData);
              const sched = checkinScheduleMin(t.config);
              return [t.id, { done, stale: !done && sched != null && nowMin > sched + 60 }];
            }));
            staleTiles = checkinIds.filter(t => meta.get(t.id).stale);
            const grouped = [
              ...checkinIds.filter(t => !meta.get(t.id).stale && !meta.get(t.id).done),
              ...checkinIds.filter(t => !meta.get(t.id).stale &&  meta.get(t.id).done),
            ];
            let placed = false;
            orderedTiles = [];
            for (const t of col.tiles) {
              if (t.type === "checkin") { if (!placed) { orderedTiles.push(...grouped); placed = true; } }
              else orderedTiles.push(t);
            }
          }
          return React.createElement("div", { key:col.id, className:`dm-col-${col.id.replace("col-","")}`,
            style:{display:"flex",flexDirection:"column",gap:"12px"},
            onDragOver: e => e.preventDefault(),
            onDrop: e => {
              e.preventDefault();
              if (!dragState) return;
              if (dragState.colId === col.id) {
                // same-column reorder — drop on column bg means move to end
                setDragState(null);
              } else {
                // cross-column drop
                moveTileAcross(dragState.colId, dragState.tileId, col.id);
                setDragState(null);
              }
            }
          },
            editMode && React.createElement("div", { style:{fontFamily:"'Archivo Black',sans-serif",fontSize:"8px",letterSpacing:"3px",textTransform:"uppercase",color:"var(--text-xfaint)",textAlign:"center",padding:"4px",border:"1px dashed var(--border-dim)",borderRadius:"4px"} }, col.id),
            orderedTiles.map((tile, tileIdx) => {
              const isDragging = dragState?.colId===col.id && dragState?.tileIdx===tileIdx;
              const prevCol = colIdx > 0 ? layout.columns[colIdx-1] : null;
              const nextCol = colIdx < layout.columns.length-1 ? layout.columns[colIdx+1] : null;
              return React.createElement("div", { key:tile.id,
                draggable:editMode,
                onDragStart: () => setDragState({colId:col.id, tileIdx, tileId:tile.id}),
                onDragOver: e => e.preventDefault(),
                onDrop: e => {
                  e.stopPropagation();
                  if (!dragState) return;
                  if (dragState.colId === col.id && dragState.tileIdx !== tileIdx) {
                    moveTile(col.id, dragState.tileIdx, tileIdx);
                  } else if (dragState.colId !== col.id) {
                    moveTileAcross(dragState.colId, dragState.tileId, col.id);
                  }
                  setDragState(null);
                },
                style:{cursor:editMode?"grab":"default", opacity:isDragging?0.4:1, transition:"opacity 0.15s", position:"relative"} },
                // Cross-column arrow buttons in edit mode
                editMode && React.createElement("div", {
                  style:{position:"absolute",top:"7px",left:"7px",display:"flex",gap:"3px",zIndex:20}
                },
                  prevCol && React.createElement("button", {
                    onClick: e => { e.stopPropagation(); moveTileAcross(col.id, tile.id, prevCol.id); },
                    title: `Move to ${prevCol.id}`,
                    style:{background:"var(--bg-hover)",border:"1px solid var(--border)",color:"var(--text-dim)",
                      width:"20px",height:"20px",borderRadius:"3px",cursor:"pointer",fontSize:"11px",
                      lineHeight:"20px",textAlign:"center",padding:0}
                  }, "←"),
                  nextCol && React.createElement("button", {
                    onClick: e => { e.stopPropagation(); moveTileAcross(col.id, tile.id, nextCol.id); },
                    title: `Move to ${nextCol.id}`,
                    style:{background:"var(--bg-hover)",border:"1px solid var(--border)",color:"var(--text-dim)",
                      width:"20px",height:"20px",borderRadius:"3px",cursor:"pointer",fontSize:"11px",
                      lineHeight:"20px",textAlign:"center",padding:0}
                  }, "→")
                ),
                React.createElement(RenderTile, {
                  tile,
                  data: todayData[tile.id]||{},
                  onChange: data => updateTileData(tile.id, data),
                  editMode,
                  onRemove: () => removeTile(col.id, tile.id),
                  onConfig: () => setConfigTile({tile, colId:col.id}),
                  onConfigPatch: patch => saveTileConfig(col.id, tile.id, {...tile.config, ...patch}),
                  allDayData: todayData,
                  tilesById,
                  isAuthed,
                  authEpoch,
                  onReauth: () => initGoogleAuth(true),
                })
              );
            }),
            // #35 — past-due, still-incomplete check-ins, tucked behind a reveal toggle.
            (!editMode && staleTiles.length > 0) && React.createElement("div", { key:`stale-${col.id}` },
              React.createElement("button", {
                onClick: () => setShowStale(s => ({ ...s, [col.id]: !s[col.id] })),
                style:{ width:"100%", background:"transparent", border:"1px dashed var(--border-dim)",
                  color:"var(--text-faint)", fontFamily:"'DM Mono',monospace", fontSize:"10px",
                  letterSpacing:"1px", textTransform:"uppercase", padding:"6px", borderRadius:"4px", cursor:"pointer" }
              }, `${showStale[col.id] ? "▾ Hide" : "▸ Show"} ${staleTiles.length} earlier check-in${staleTiles.length>1?"s":""}`),
              showStale[col.id] && React.createElement("div", {
                style:{ display:"flex", flexDirection:"column", gap:"12px", marginTop:"12px", opacity:0.65 }
              },
                staleTiles.map(tile =>
                  React.createElement("div", { key:tile.id, style:{position:"relative"} },
                    React.createElement(RenderTile, {
                      tile, data: todayData[tile.id]||{},
                      onChange: data => updateTileData(tile.id, data),
                      editMode: false,
                      onRemove: () => removeTile(col.id, tile.id),
                      onConfig: () => setConfigTile({tile, colId:col.id}),
                      onConfigPatch: patch => saveTileConfig(col.id, tile.id, {...tile.config, ...patch}),
                      allDayData: todayData, tilesById, isAuthed, authEpoch,
                      onReauth: () => initGoogleAuth(true),
                    })
                  )
                )
              )
            ),
            col.id === "col-left" && !editMode &&
              React.createElement(AddProjectButton, { colId: col.id, onAdd: addTile })
          )
        })
      )
    ),

    // CONFIG MODAL
    configTile && React.createElement(ConfigModal, {
      tile: configTile.tile,
      // #49 — supply the full list of tiles in the current layout so the rules editor
      // can populate its source-tile dropdown.
      tiles: layout.columns.flatMap(c => c.tiles),
      onSave: cfg => { saveTileConfig(configTile.colId, configTile.tile.id, cfg); setConfigTile(null); },
      onClose: () => setConfigTile(null)
    })
  );
}

export { App };
