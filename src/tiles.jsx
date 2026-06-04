// All tile renderers + the RenderTile dispatch + AddProjectButton.
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { CardShell, AutoTA, BulletList, CB, iconBtnStyle, EmojiPicker } from "./ui.jsx";
import { FullscreenTimer } from "./ui/FullscreenTimer.jsx";
import { evaluateRule, TILE_EVENTS, checkinIsDone, deriveCheckinSlot, checkinScheduleMin, currentSlotKey } from "./lib/rules.js";
import { uid, todayKey, fmtDate, DAYS, MONTHS } from "./lib/helpers.js";
import { fetchTodayEvents, fetchCalendarList, fmtEventTime, clearCalendarListCache } from "./lib/calendar.js";
import { playBeep, playDone } from "./lib/audio.js";
import { fetchFavorites } from "./lib/notion.js";

// ─── TILE RENDERERS ───────────────────────────────────────────────────────────

export function TileChecklist({ config, data={}, onChange, editMode, onRemove, onConfig, allDayData, tilesById }) {
  const manualChecks = data.checks || config.items.map(()=>false);

  // Evaluate auto-rules for each item
  const autoChecks = config.items.map((item, i) => {
    const rule = config.rules?.[i];
    return rule ? evaluateRule(rule, allDayData||{}, tilesById) : false;
  });

  // Effective state: auto OR manual
  const effectiveChecks = config.items.map((_, i) => autoChecks[i] || manualChecks[i]);
  const autoCount = autoChecks.filter(Boolean).length;
  const doneCount = effectiveChecks.filter(Boolean).length;
  const total = config.items.length;
  // #36 — whole-section completion state
  const allDone = total > 0 && doneCount === total;
  const effectiveAccent = allDone ? "#4a7a4a" : config.accent;

  return React.createElement(CardShell, { title:config.title, accent:effectiveAccent, bg:config.bg, border:config.border, editMode, onRemove, onConfig },
    // #36 — completion banner takes precedence over the auto-rule banner when everything's done
    allDone && React.createElement("div", {
      style:{display:"flex",alignItems:"center",gap:"5px",marginBottom:"8px",
        padding:"4px 7px",background:"#0a1a0a",border:"1px solid #1a3a1a",borderRadius:"3px"}
    },
      React.createElement("span", { style:{fontSize:"10px",color:"#4a7a4a"} }, "✓"),
      React.createElement("span", { style:{fontSize:"9px",color:"#4a7a4a",letterSpacing:"1px",textTransform:"uppercase"} },
        `Complete${autoCount > 0 ? ` · ${autoCount} auto` : ""}`)
    ),
    !allDone && autoCount > 0 && React.createElement("div", {
      style:{display:"flex",alignItems:"center",gap:"5px",marginBottom:"8px",
        padding:"4px 7px",background:"var(--accent-dim)",border:"1px solid var(--border-dim)",borderRadius:"3px"}
    },
      React.createElement("span", { style:{fontSize:"10px"} }, "⚡"),
      React.createElement("span", { style:{fontSize:"9px",color:"var(--text-dim)",letterSpacing:"0.5px"} },
        `${autoCount} auto-completed · ${doneCount}/${total} done`)
    ),
    React.createElement("div", { style:{display:"flex",flexDirection:"column",gap:"2px"} },
      config.items.map((item, i) => {
        const isAuto = autoChecks[i];
        const isManual = manualChecks[i];
        const isChecked = isAuto || isManual;
        return React.createElement("label", { key:i,
          style:{display:"flex",alignItems:"flex-start",gap:"7px",cursor:"pointer",
            padding:"3px 0",color:isChecked?"var(--text-muted)":"var(--text-dim)",fontSize:"12px",lineHeight:1.5,
            opacity: isAuto && !isManual ? 0.8 : 1}
        },
          React.createElement("div", { style:{position:"relative",flexShrink:0,marginTop:"3px"} },
            React.createElement("input", { type:"checkbox",
              checked: isChecked,
              disabled: isAuto && !isManual,
              onChange: e => {
                const n=[...manualChecks]; n[i]=e.target.checked; onChange({...data,checks:n});
              },
              style:{accentColor:isAuto?"#8a7040":"#c8a96e",width:"13px",height:"13px",cursor:isAuto?"default":"pointer"}
            }),
            isAuto && React.createElement("span", {
              style:{position:"absolute",top:"-1px",right:"-8px",fontSize:"8px",color:"var(--accent)",pointerEvents:"none",lineHeight:1}
            }, "⚡")
          ),
          React.createElement("span", {
            style: isChecked ? {textDecoration:"line-through",color:"var(--text-muted)"} : {}
          }, item)
        );
      })
    )
  );
}

export function TileTextPrompt({ config, data={}, onChange, editMode, onRemove, onConfig }) {
  return React.createElement(CardShell, { title:config.title, accent:config.accent||"#c8a96e", bg:config.bg, border:config.border, editMode, onRemove, onConfig },
    React.createElement(AutoTA, { value:data.text||"", placeholder:config.placeholder||"...",
      onChange:v=>onChange({...data,text:v}), style:{minHeight:"60px"} })
  );
}

export function TilePriorities({ config, data={}, onChange, editMode, onRemove, onConfig }) {
  const count = config.count||3;
  const priorities = data.priorities || Array(count).fill(null).map(()=>({text:"",done:false}));
  const added = data.added || ["","","",""];
  return React.createElement(CardShell, { title:config.title||"My Top Priorities", accent:"#c8a96e", editMode, onRemove, onConfig },
    priorities.map((p,i) =>
      React.createElement("div", { key:i, style:{display:"flex",alignItems:"flex-start",gap:"6px",marginBottom:"6px"} },
        React.createElement("span", { style:{fontFamily:"'Archivo Black',sans-serif",fontSize:"16px",color:"var(--accent)",width:"18px",flexShrink:0,lineHeight:1.2} }, i+1),
        React.createElement("input", { type:"checkbox", checked:!!p.done,
          onChange: e => { const n=[...priorities]; n[i]={...p,done:e.target.checked}; onChange({...data,priorities:n}); },
          style:{marginTop:"4px",flexShrink:0,accentColor:"#c8a96e",width:"13px",height:"13px"} }),
        React.createElement(AutoTA, { value:p.text, placeholder:i===0?"☞ Eat this frog first...":"Priority...",
          onChange: v => { const n=[...priorities]; n[i]={...p,text:v}; onChange({...data,priorities:n}); },
          style: p.done?{textDecoration:"line-through",color:"var(--text-muted)"}:{} })
      )
    ),
    React.createElement("div", { style:{height:"1px",background:"var(--border-dim)",margin:"8px 0"} }),
    React.createElement("div", { style:{fontFamily:"'Archivo Black',sans-serif",fontSize:"9px",letterSpacing:"2px",textTransform:"uppercase",color:"var(--text-faint)",marginBottom:"6px"} }, "Added Through Day"),
    React.createElement(BulletList, { items:added, onChange:v=>onChange({...data,added:v}), placeholder:"Added task..." })
  );
}

export function TileProject({ config, data={}, onChange, editMode, onRemove, onConfig }) {
  const count = config.count||4;
  // #52 — project rows are completable: {text, done}. Lazy-convert legacy string[].
  const rawItems = data.items || Array(count).fill("");
  const items = rawItems.map(it => typeof it === "string" ? { text: it, done: false } : (it || { text:"", done:false }));
  const [localTitle, setLocalTitle] = useState(data.title||config.title||"Project");
  const isOpen = data._open !== undefined ? data._open : (config.defaultOpen !== false);
  const hasContent = items.some(x=>x.text?.trim());
  const filledCount = items.filter(x=>x.text?.trim()).length;
  const doneCount = items.filter(x=>x.done).length;

  const header = React.createElement("div", {
    style:{display:"flex",alignItems:"center",gap:"8px",cursor:"pointer",userSelect:"none"},
    onClick: e => { if(editMode) return; onChange({...data, _open:!isOpen}); }
  },
    React.createElement("span", { style:{color:isOpen?"var(--accent)":"var(--text-muted)",fontSize:"12px",transition:"transform 0.2s",display:"inline-block",transform:isOpen?"rotate(90deg)":"rotate(0deg)"} }, "▶"),
    editMode
      ? React.createElement("input", {
          value:localTitle,
          onClick:e=>e.stopPropagation(),
          onChange:e=>{ setLocalTitle(e.target.value); onChange({...data,title:e.target.value}); },
          style:{background:"transparent",border:"none",borderBottom:"1px solid var(--border-dim)",
            color:"var(--text-dim)",fontFamily:"'Archivo Black',sans-serif",fontSize:"9px",letterSpacing:"2px",
            textTransform:"uppercase",flex:1,padding:"2px 0"}
        })
      : React.createElement("span", {
          style:{fontFamily:"'Archivo Black',sans-serif",fontSize:"9px",letterSpacing:"2px",
            textTransform:"uppercase",color:isOpen?"var(--accent)":"var(--text-muted)",flex:1}
        }, localTitle || "Untitled Project"),
    !isOpen && hasContent && React.createElement("span", {
      style:{fontSize:"9px",color:"#4a7a4a",background:"#1a2a1a",border:"1px solid #2a4a2a",
        borderRadius:"3px",padding:"1px 6px"}
    }, `${doneCount}/${filledCount} done`),
    editMode && React.createElement("div", { style:{display:"flex",gap:"3px",marginLeft:"auto"}, onClick:e=>e.stopPropagation() },
      React.createElement("button", { onClick:onConfig, style:{background:"var(--bg-hover)",border:"none",color:"var(--text-dim)",width:"20px",height:"20px",borderRadius:"3px",cursor:"pointer",fontSize:"10px"} }, "⚙"),
      React.createElement("button", { onClick:onRemove, style:{background:"#5a1a1a",border:"none",color:"#aaa",width:"20px",height:"20px",borderRadius:"3px",cursor:"pointer",fontSize:"10px"} }, "✕")
    )
  );

  return React.createElement("div", {
    style:{background:"var(--bg-card)",border:`1px solid ${isOpen?"var(--border)":"var(--border-dim)"}`,
      borderLeft:`3px solid ${isOpen?"var(--accent)55":"var(--border)"}`,borderRadius:"6px",
      padding:isOpen?"13px":"8px 13px",transition:"all 0.2s",position:"relative"}
  },
    header,
    isOpen && React.createElement("div", { style:{marginTop:"10px",paddingTop:"10px",borderTop:"1px solid var(--border-dim)"} },
      React.createElement("input", {
        value: localTitle,
        onChange: e => { setLocalTitle(e.target.value); onChange({...data, title:e.target.value}); },
        placeholder: "Project name...",
        style:{background:"transparent",border:"none",borderBottom:"1px solid var(--border)",
          color:"var(--accent)",fontFamily:"'Archivo Black',sans-serif",fontSize:"11px",letterSpacing:"1.5px",
          textTransform:"uppercase",width:"100%",padding:"3px 0",marginBottom:"10px"}
      }),
      // #52 — completable rows: checkbox + auto-expanding text, persisting {text,done}[].
      React.createElement("div", { style:{display:"flex",flexDirection:"column",gap:"4px"} },
        items.map((it,i) =>
          React.createElement("div", { key:i, style:{display:"flex",alignItems:"flex-start",gap:"6px"} },
            React.createElement("input", { type:"checkbox", checked:!!it.done,
              onChange: e => { const n=[...items]; n[i]={...it,done:e.target.checked}; onChange({...data,items:n}); },
              style:{marginTop:"4px",flexShrink:0,accentColor:"var(--accent)",width:"13px",height:"13px",cursor:"pointer"} }),
            React.createElement(AutoTA, { value:it.text||"", placeholder:"Task...",
              onChange: v => { const n=[...items]; n[i]={...it,text:v}; onChange({...data,items:n}); },
              style: it.done ? {textDecoration:"line-through",color:"var(--text-muted)"} : {} })
          )
        )
      )
    )
  );
}

export function AddProjectButton({ colId, onAdd }) {
  return React.createElement("button", {
    onClick: () => onAdd(colId, "project"),
    style:{width:"100%",background:"transparent",border:"1px dashed var(--border)",borderRadius:"6px",
      padding:"8px",color:"var(--text-faint)",fontFamily:"'DM Mono',monospace",fontSize:"10px",
      cursor:"pointer",letterSpacing:"0.5px",display:"flex",alignItems:"center",justifyContent:"center",gap:"6px",
      transition:"all 0.15s"}
  },
    React.createElement("span", { style:{fontSize:"14px"} }, "+"),
    "Add Project"
  );
}

export function TileFreeList({ config, data={}, onChange, editMode, onRemove, onConfig }) {
  const count = config.count||5;
  const items = data.items || Array(count).fill("");
  return React.createElement(CardShell, { title:config.title, accent:"#555", editMode, onRemove, onConfig },
    React.createElement(BulletList, { items, onChange:v=>onChange({...data,items:v}), placeholder:config.placeholder||"..." })
  );
}

export function TileTwoPrompt({ config, data={}, onChange, editMode, onRemove, onConfig }) {
  return React.createElement("div", { style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"} },
    ["A","B"].map(k =>
      React.createElement(CardShell, { key:k, title:config[`title${k}`]||`Prompt ${k}`, accent:config.accent||"#c8a96e",
        editMode:k==="A"?editMode:false, onRemove:k==="A"?onRemove:undefined, onConfig:k==="A"?onConfig:undefined },
        React.createElement(AutoTA, { value:data[`text${k}`]||"", placeholder:config[`placeholder${k}`]||"...",
          onChange:v=>onChange({...data,[`text${k}`]:v}), style:{minHeight:"70px"} })
      )
    )
  );
}

// #3 — Guided AM flow tile.
// Three prompts (titleA/titleB/titleC), two modes:
//   "all"    — all prompts visible at once inside a single card (data: textA/textB/textC)
//   "guided" — one prompt at a time, advances on Next, Back rewinds (data: also `step`)
// Mode is persisted on a per-day basis via data.mode (an inline toggle flips it),
// with config.mode acting as the per-tile default for fresh days.
export function TileGuidedAM({ config, data={}, onChange, editMode, onRemove, onConfig }) {
  const defaultMode = config.mode === "guided" ? "guided" : "all";
  const mode = (data.mode === "guided" || data.mode === "all") ? data.mode : defaultMode;

  const prompts = [
    { key: "A", title: config.titleA || "Gratitude",        placeholder: config.placeholderA || "What are you grateful for?" },
    { key: "B", title: config.titleB || "Intention",        placeholder: config.placeholderB || "What do you intend to accomplish?" },
    { key: "C", title: config.titleC || "Today's Priority", placeholder: config.placeholderC || "The one thing that matters most today..." },
  ];

  const stepRaw = Number.isInteger(data.step) ? data.step : 0;
  const step    = Math.max(0, Math.min(stepRaw, prompts.length - 1));
  const filled  = prompts.map(p => !!(data[`text${p.key}`] && data[`text${p.key}`].trim()));
  const filledCount = filled.filter(Boolean).length;
  const accent  = config.accent || "#c8a96e";

  const updateText = (key, v) => onChange({...data, [`text${key}`]: v});
  const setStep    = n        => onChange({...data, step: Math.max(0, Math.min(n, prompts.length-1))});
  const toggleMode = ()       => onChange({...data, mode: mode === "guided" ? "all" : "guided"});

  const header = React.createElement("div", {
    style:{display:"flex",alignItems:"center",justifyContent:"space-between",
      paddingBottom:"5px",marginBottom:"9px",borderBottom:"1px solid var(--border-dim)"}
  },
    React.createElement("div", { style:{fontFamily:"'Archivo Black',sans-serif",fontSize:"9px",letterSpacing:"2px",textTransform:"uppercase",color:"var(--text-muted)"} },
      mode === "guided" ? `Guided · step ${step+1}/${prompts.length}` : `${filledCount}/${prompts.length} filled`
    ),
    React.createElement("div", { style:{display:"flex",alignItems:"center",gap:"7px"} },
      React.createElement("div", { style:{display:"flex",gap:"5px"} },
        prompts.map((_, i) => React.createElement("div", { key:i,
          style:{width:"7px",height:"7px",borderRadius:"50%",
            background: filled[i] ? accent : (mode==="guided" && i===step ? "var(--border)" : "var(--border-dim)"),
            border: mode==="guided" && i===step && !filled[i] ? `1px solid ${accent}` : "none",
            transition:"all 0.2s"}
        }))
      ),
      React.createElement("button", {
        onClick: toggleMode,
        title: mode === "guided" ? "Show all prompts" : "Step-by-step mode",
        style:{background:"transparent",border:"1px solid var(--border-dim)",color:"var(--text-faint)",
          fontFamily:"'DM Mono',monospace",fontSize:"11px",padding:"1px 7px",borderRadius:"3px",
          cursor:"pointer",letterSpacing:"0.5px",lineHeight:1.4}
      }, mode === "guided" ? "≡" : "→")
    )
  );

  if (mode === "guided") {
    const p = prompts[step];
    return React.createElement(CardShell, {
      title: config.title || "AM Guided Flow", accent, editMode, onRemove, onConfig
    },
      header,
      React.createElement("div", { style:{fontFamily:"'Archivo Black',sans-serif",fontSize:"10px",letterSpacing:"1.5px",textTransform:"uppercase",color:accent,marginBottom:"6px"} }, p.title),
      React.createElement(AutoTA, {
        value: data[`text${p.key}`] || "",
        placeholder: p.placeholder,
        onChange: v => updateText(p.key, v),
        style: { minHeight: "70px", fontSize: "12px" }
      }),
      React.createElement("div", { style:{display:"flex",gap:"6px",marginTop:"10px"} },
        React.createElement("button", {
          onClick: () => setStep(step-1),
          disabled: step === 0,
          style:{flex:"0 0 auto",background:"var(--bg-hover)",border:"1px solid var(--border)",
            color: step===0 ? "var(--text-faint)" : "var(--text-dim)",
            fontFamily:"'DM Mono',monospace",fontSize:"11px",padding:"6px 12px",borderRadius:"4px",
            cursor: step===0 ? "default" : "pointer"}
        }, "← Back"),
        React.createElement("button", {
          onClick: () => { if (step < prompts.length-1) setStep(step+1); },
          disabled: step === prompts.length-1,
          style:{flex:1,background: step===prompts.length-1 ? "var(--bg-hover)" : "var(--accent-dim)",
            border:`1px solid ${step===prompts.length-1 ? "var(--border)" : accent}`,
            color: step===prompts.length-1 ? "var(--text-faint)" : accent,
            fontFamily:"'DM Mono',monospace",fontSize:"11px",padding:"6px 12px",borderRadius:"4px",
            cursor: step===prompts.length-1 ? "default" : "pointer"}
        }, step === prompts.length-1 ? "✓ Done" : "Next →")
      )
    );
  }

  // mode === "all" — stack the three prompts inside one card.
  return React.createElement(CardShell, {
    title: config.title || "AM Guided Flow", accent, editMode, onRemove, onConfig
  },
    header,
    React.createElement("div", { style:{display:"flex",flexDirection:"column",gap:"12px"} },
      prompts.map(p =>
        React.createElement("div", { key:p.key },
          React.createElement("div", { style:{fontFamily:"'Archivo Black',sans-serif",fontSize:"9px",letterSpacing:"1.5px",textTransform:"uppercase",color:accent,marginBottom:"4px"} }, p.title),
          React.createElement(AutoTA, {
            value: data[`text${p.key}`] || "",
            placeholder: p.placeholder,
            onChange: v => updateText(p.key, v),
            style: { fontSize: "12px", minHeight: "32px" }
          })
        )
      )
    )
  );
}

export function TileCheckIn({ config, data={}, onChange, editMode, onRemove, allDayData }) {
  const c = config.color||"var(--border)";

  // #43 — items shape changed from string[] to {text,done}[]; convert legacy data lazily.
  // No data migration needed; the lazy convert handles both old and new days transparently.
  const rawItems = data.items || ["","","","",""];
  const items = rawItems.map(it => typeof it === "string" ? { text: it, done: false } : (it || { text:"", done:false }));

  // #45 — auto-tick "Planks or Pushups" from the planks tile state, gated by the
  // configured planksSlot (am/noon/afternoon/evening, or "none" to disable).
  // planksSlot falls back to a title-derived default for tiles that haven't been migrated yet.
  const planksSlot = config.planksSlot || deriveCheckinSlot(config.title);
  const planksAutoChecked = planksSlot && planksSlot !== "none"
    && !!(allDayData?.planks?.planks?.[planksSlot]);
  const planksEffective = !!data.planks || planksAutoChecked;

  // #37 — feeling (emoji) and feelingNote (text) are paired and either may be set.
  // Completion logic lives in the shared checkinIsDone so #35's reordering agrees.
  const isDone = checkinIsDone(config, data, allDayData);

  // Frog = priority #1 (index 0) only
  const priData = Object.values(allDayData||{}).find(t=>t?._type==="priorities");
  const frog = priData?.priorities?.[0]?.text && !priData?.priorities?.[0]?.done
    ? priData.priorities[0] : null;
  const frogDone = !!(priData?.priorities?.[0]?.text && priData?.priorities?.[0]?.done);

  return React.createElement("div", {
    style:{border:`1px solid var(--border)`,borderLeft:`3px solid ${c}`,borderRadius:"6px",overflow:"hidden",position:"relative"}
  },
    editMode && React.createElement("div", { style:{position:"absolute",top:"7px",right:"7px",zIndex:10} },
      React.createElement("button", { onClick:onRemove, style:iconBtnStyle("#5a1a1a") }, "✕")
    ),
    React.createElement("div", {
      style:{padding:"8px 10px",background:c,fontFamily:"'Archivo Black',sans-serif",
        fontSize:"9px",letterSpacing:"1.5px",color:"var(--bg)",textTransform:"uppercase",
        display:"flex",alignItems:"center",justifyContent:"space-between"}
    },
      React.createElement("span", null, `${config.title} Check-In`),
      // #6 — per-block actions: delay 1h (pushes its scheduled time so #35 won't
      // treat it as stale), dismiss for the day, or restore a dismissed one.
      !editMode && React.createElement("span", { style:{display:"flex",gap:"7px",alignItems:"center"} },
        (data._delayMin > 0) && React.createElement("span", {
          title:"Delayed — click to reset", onClick:()=>onChange({...data, _delayMin:0}),
          style:{cursor:"pointer",fontSize:"8px",opacity:0.85} }, `+${Math.round(data._delayMin/60)}h`),
        React.createElement("span", { title:"Delay 1 hour", onClick:()=>onChange({...data, _delayMin:(data._delayMin||0)+60}),
          style:{cursor:"pointer",fontSize:"11px"} }, "⏲"),
        data._dismissed
          ? React.createElement("span", { title:"Restore", onClick:()=>onChange({...data, _dismissed:false}), style:{cursor:"pointer",fontSize:"11px"} }, "↺")
          : React.createElement("span", { title:"Dismiss for today", onClick:()=>onChange({...data, _dismissed:true}), style:{cursor:"pointer",fontSize:"11px"} }, "✕"),
        isDone && React.createElement("span", { style:{fontSize:"13px"} }, "✓")
      )
    ),
    frog && React.createElement("div", {
      style:{padding:"7px 10px",background:"var(--accent-dim)",borderBottom:"1px solid var(--border-dim)",
        display:"flex",alignItems:"center",gap:"7px"}
    },
      React.createElement("span", { style:{fontSize:"11px",flexShrink:0} }, "☞"),
      React.createElement("span", { style:{fontSize:"11px",color:"var(--accent)",fontStyle:"italic",lineHeight:1.4} }, frog.text),
    ),
    frogDone && React.createElement("div", {
      style:{padding:"6px 10px",background:"#1a3a1a33",borderBottom:"1px solid #1a3a1a55",
        display:"flex",alignItems:"center",gap:"6px"}
    },
      React.createElement("span", { style:{fontSize:"10px",color:"#4a7a4a"} }, "✓ Frog done")
    ),
    React.createElement("div", { style:{padding:"10px",background:"var(--bg-card)",display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"} },
      React.createElement("div", null,
        // #45 — planks checkbox shows effective state (auto OR manual). Auto-checked-only
        // is disabled to mirror the TileChecklist auto-rule UX. ⚡ marker indicates auto.
        React.createElement("label", {
          style:{display:"flex",alignItems:"flex-start",gap:"7px",
            cursor: planksAutoChecked && !data.planks ? "default" : "pointer",
            padding:"3px 0",color:"var(--text-dim)",fontSize:"12px",lineHeight:1.5,
            opacity: planksAutoChecked && !data.planks ? 0.85 : 1}
        },
          React.createElement("div", { style:{position:"relative",flexShrink:0,marginTop:"3px"} },
            React.createElement("input", { type:"checkbox",
              checked: planksEffective,
              disabled: planksAutoChecked && !data.planks,
              onChange: e => onChange({...data, planks: e.target.checked}),
              style:{accentColor: planksAutoChecked ? "#8a7040" : "#c8a96e", width:"13px", height:"13px",
                cursor: planksAutoChecked && !data.planks ? "default" : "pointer"}
            }),
            planksAutoChecked && React.createElement("span", {
              style:{position:"absolute",top:"-1px",right:"-8px",fontSize:"8px",color:"var(--accent)",pointerEvents:"none",lineHeight:1}
            }, "⚡")
          ),
          React.createElement("span", null, "Planks or Pushups")
        ),
        React.createElement(CB, { checked:!!data.food, onChange:v=>onChange({...data,food:v}), label:"Food Logged" }),
        React.createElement(CB, { checked:!!data.priorities, onChange:v=>onChange({...data,priorities:v}), label:"Next Priorities" }),
        React.createElement("div", { style:{marginTop:"8px"} },
          React.createElement("div", { style:{fontSize:"9px",color:"var(--text-muted)",marginBottom:"5px",letterSpacing:"1px",textTransform:"uppercase"} }, "How I'm feeling"),
          React.createElement(EmojiPicker, { value:data.feeling||"", onChange:v=>onChange({...data,feeling:v}) }),
          // #37 — free-form text note paired with the emoji. Either can be empty.
          React.createElement("div", { style:{marginTop:"6px"} },
            React.createElement(AutoTA, {
              value: data.feelingNote || "",
              placeholder: "a note about how you feel…",
              onChange: v => onChange({...data, feelingNote: v}),
              style: { fontSize:"11px", lineHeight:1.5 }
            })
          )
        )
      ),
      React.createElement("div", null,
        React.createElement("div", { style:{fontSize:"9px",color:"var(--text-muted)",marginBottom:"5px",letterSpacing:"1px",textTransform:"uppercase"} }, "Next 2.5 hrs"),
        // #43 — tickable rows: checkbox + auto-expanding text. Data shape is {text,done}[].
        React.createElement("div", { style:{display:"flex",flexDirection:"column",gap:"4px"} },
          items.map((it, i) =>
            React.createElement("div", { key:i, style:{display:"flex",alignItems:"flex-start",gap:"6px"} },
              React.createElement("input", { type:"checkbox", checked:!!it.done,
                onChange: e => { const n=[...items]; n[i]={...it,done:e.target.checked}; onChange({...data,items:n}); },
                style:{marginTop:"4px",flexShrink:0,accentColor:"#c8a96e",width:"13px",height:"13px",cursor:"pointer"} }),
              React.createElement(AutoTA, { value:it.text||"", placeholder:"...",
                onChange: v => { const n=[...items]; n[i]={...it,text:v}; onChange({...data,items:n}); },
                style: it.done ? {textDecoration:"line-through",color:"var(--text-muted)"} : {} })
            )
          )
        )
      )
    )
  );
}

export function TileTwoLists({ config, data={}, onChange, editMode, onRemove, onConfig }) {
  return React.createElement("div", { style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"} },
    ["A","B"].map(k => {
      const count = config[`count${k}`]||5;
      const items = data[`items${k}`] || Array(count).fill("");
      return React.createElement(CardShell, { key:k, title:config[`title${k}`]||`List ${k}`, accent:"#555",
        editMode:k==="A"?editMode:false, onRemove:k==="A"?onRemove:undefined, onConfig:k==="A"?onConfig:undefined },
        React.createElement(BulletList, { items, onChange:v=>onChange({...data,[`items${k}`]:v}) })
      );
    })
  );
}

export const PUSHUP_NUMS = [5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95,100,105,110,115,120,125,130,135,140,145,150];

export function TilePushups({ config, data={}, onChange, editMode, onRemove, onConfig }) {
  const p = data.pushups||{};
  // #55 — cumulative marking: the highest tapped count is "today's reps". Tapping n
  // fills every milestone <= n; re-tapping an already-done n lowers the bar below it.
  const reached = PUSHUP_NUMS.filter(n => p[n]);
  const maxReached = reached.length ? Math.max(...reached) : 0;
  const tapTo = n => {
    const reaching = !p[n];
    const next = {};
    for (const m of PUSHUP_NUMS) next[m] = reaching ? (m <= n) : (m < n);
    onChange({ ...data, pushups: next });
  };
  return React.createElement(CardShell, { title:config.title||"Pushup Tracker", accent:"#c8a96e", editMode, onRemove, onConfig },
    React.createElement("div", { style:{fontSize:"10px",color:"var(--text-muted)",marginBottom:"6px",letterSpacing:"1px",textTransform:"uppercase"} },
      maxReached > 0 ? `${maxReached} reps today` : "Tap your count"),
    React.createElement("div", { style:{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:"3px"} },
      PUSHUP_NUMS.map(n =>
        React.createElement("button", { key:n, onClick:()=>tapTo(n),
          style:{background:p[n]?"var(--accent-dim)":"var(--bg-card)",border:`1px solid ${p[n]?"var(--accent)":"var(--border)"}`,
            color:p[n]?"var(--accent)":"var(--text-muted)",fontFamily:"'DM Mono',monospace",fontSize:"9px",
            padding:"4px 2px",borderRadius:"3px",cursor:"pointer"} }, n)
      )
    )
  );
}

export function TilePlanks({ config, data={}, onChange, editMode, onRemove, onConfig }) {
  const slots = [["am","AM"],["noon","Noon"],["afternoon","PM"],["evening","Eve"]];
  const p = data.planks||{};
  const [timerSecs, setTimerSecs] = useState(data.timerSecs||120);
  const [running, setRunning] = useState(false);
  const doneCount = slots.filter(([k])=>p[k]).length;

  const adjustTimer = delta => {
    const next = Math.max(10, Math.min(600, timerSecs + delta));
    setTimerSecs(next);
    onChange({...data, timerSecs: next});
  };

  const handleComplete = () => {
    setRunning(false);
    // #44 — prefer the slot matching the current time of day. Fall back to the first
    // unchecked slot (the prior behavior) if that slot is already done.
    const nowKey  = currentSlotKey();
    const nowSlot = slots.find(([k])=>k===nowKey && !p[k]);
    const target  = nowSlot || slots.find(([k])=>!p[k]);
    if (target) {
      onChange({...data, planks:{...p, [target[0]]:true}, timerSecs});
    }
  };

  const mins = Math.floor(timerSecs/60);
  const secs = timerSecs%60;
  const timeStr = `${mins}:${secs.toString().padStart(2,"0")}`;

  return React.createElement(React.Fragment, null,
    running && React.createElement(FullscreenTimer, {
      seconds: timerSecs, label: "Planks",
      onComplete: handleComplete,
      onCancel: () => setRunning(false)
    }),
    React.createElement(CardShell, { title:config.title||"Planks", accent:"#4a7a4a", editMode, onRemove, onConfig },
      // Session slots
      React.createElement("div", { style:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"5px",marginBottom:"10px"} },
        slots.map(([k,label]) =>
          React.createElement("button", { key:k, onClick:()=>onChange({...data,planks:{...p,[k]:!p[k]}}),
            style:{background:p[k]?"#2a3a2a":"var(--bg-hover)",border:`1px solid ${p[k]?"#4a7a4a":"var(--border)"}`,
              color:p[k]?"#7ac97a":"#555",fontFamily:"'DM Mono',monospace",fontSize:"11px",
              padding:"7px 4px",borderRadius:"3px",cursor:"pointer"} }, label)
        )
      ),
      // Progress
      doneCount > 0 && React.createElement("div", { style:{fontSize:"9px",color:"#4a7a4a",marginBottom:"8px",letterSpacing:"0.5px"} },
        `${doneCount} session${doneCount>1?"s":""} done today`
      ),
      // Timer controls
      React.createElement("div", { style:{height:"1px",background:"var(--border-dim)",marginBottom:"10px"} }),
      React.createElement("div", { style:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"6px"} },
        React.createElement("button", { onClick:()=>adjustTimer(-10),
          style:{background:"var(--bg-hover)",border:"1px solid var(--border)",color:"var(--text-dim)",width:"28px",height:"28px",
            borderRadius:"4px",cursor:"pointer",fontSize:"14px",lineHeight:"28px",textAlign:"center"} }, "−"),
        React.createElement("div", { style:{flex:1,textAlign:"center"} },
          React.createElement("div", { style:{fontFamily:"'Archivo Black',sans-serif",fontSize:"22px",color:"#4a7a4a",letterSpacing:"1px"} }, timeStr),
          React.createElement("div", { style:{fontSize:"9px",color:"var(--text-faint)",letterSpacing:"1px",textTransform:"uppercase",marginTop:"1px"} }, "duration")
        ),
        React.createElement("button", { onClick:()=>adjustTimer(10),
          style:{background:"var(--bg-hover)",border:"1px solid var(--border)",color:"var(--text-dim)",width:"28px",height:"28px",
            borderRadius:"4px",cursor:"pointer",fontSize:"14px",lineHeight:"28px",textAlign:"center"} }, "+"),
        React.createElement("button", { onClick:()=>setRunning(true),
          style:{background:"#1a3a1a",border:"1px solid #3a6a3a",color:"#7ac97a",padding:"6px 14px",
            borderRadius:"4px",cursor:"pointer",fontFamily:"'DM Mono',monospace",fontSize:"11px",letterSpacing:"0.5px"} },
          "▶ Start")
      )
    )
  );
}

export function TileDangles({ config, data={}, onChange, editMode, onRemove, onConfig }) {
  // #44 — slots map array indices to time-of-day labels (AM, Noon, PM, Eve).
  // Data shape stays positional (data.checks is still a 4-element bool array): index 0=AM, 1=Noon, 2=PM, 3=Eve.
  const SLOT_LABELS = ["AM", "Noon", "PM", "Eve"];
  const SLOT_KEYS   = ["am", "noon", "afternoon", "evening"];
  const checks = data.checks || [false, false, false, false];
  const [running, setRunning] = useState(false);
  const doneCount = checks.filter(Boolean).length;
  const allDone = doneCount === 4;

  // Slot to use when starting / on timer complete: prefer the current time-of-day slot,
  // fall back to the first unchecked (the prior behavior).
  const pickTargetIdx = () => {
    const nowIdx = SLOT_KEYS.indexOf(currentSlotKey());
    if (nowIdx >= 0 && !checks[nowIdx]) return nowIdx;
    return checks.findIndex(c=>!c);
  };

  const handleComplete = () => {
    setRunning(false);
    const useIdx = pickTargetIdx();
    if (useIdx !== -1) {
      const n = [...checks]; n[useIdx] = true;
      onChange({...data, checks: n});
    }
  };

  const startIdx = allDone ? 0 : Math.max(0, pickTargetIdx());

  return React.createElement(React.Fragment, null,
    running && React.createElement(FullscreenTimer, {
      seconds: 30, label: "Dangle",
      onComplete: handleComplete,
      onCancel: () => setRunning(false)
    }),
    React.createElement(CardShell, {
      title: config.title||"Dangles",
      accent: allDone ? "#4a7a4a" : "#6a4a8a",
      style: allDone ? {background:"#0a1a0a",border:"1px solid #1a3a1a"} : {},
      editMode, onRemove, onConfig
    },
      // Status line
      React.createElement("div", { style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"10px"} },
        React.createElement("div", { style:{fontSize:"9px",color:allDone?"#4a7a4a":"#6a4a8a",letterSpacing:"1px",textTransform:"uppercase"} },
          allDone ? "2:00 complete ✓" : `${doneCount * 30}s / 2:00`
        ),
        // Progress dots
        React.createElement("div", { style:{display:"flex",gap:"5px"} },
          checks.map((done,i) => React.createElement("div", { key:i,
            style:{width:"10px",height:"10px",borderRadius:"50%",
              background: done ? "#4a7a4a" : "#2a2a2a",
              border:`1px solid ${done?"#4a7a4a":"#333"}`,
              transition:"all 0.3s"}
          }))
        )
      ),
      // 4 checkboxes — each = 30 sec hang, labeled AM/Noon/PM/Eve (#44)
      React.createElement("div", { style:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"6px",marginBottom:"10px"} },
        checks.map((done, i) =>
          React.createElement("button", { key:i,
            onClick: () => { const n=[...checks]; n[i]=!n[i]; onChange({...data,checks:n}); },
            style:{background:done?"#1a2a1a":"var(--bg-card)",border:`1px solid ${done?"#4a7a4a":"var(--border)"}`,
              borderRadius:"5px",padding:"8px 4px",cursor:"pointer",
              display:"flex",flexDirection:"column",alignItems:"center",gap:"3px"}
          },
            React.createElement("span", { style:{fontSize:"9px",color:done?"#4a7a4a":"#888",fontFamily:"'DM Mono',monospace",letterSpacing:"0.5px"} }, SLOT_LABELS[i]),
            React.createElement("span", { style:{fontSize:"16px"} }, done ? "✓" : "○"),
            React.createElement("span", { style:{fontSize:"9px",color:done?"#4a7a4a":"#444",fontFamily:"'DM Mono',monospace",letterSpacing:"0.5px"} }, "0:30")
          )
        )
      ),
      // Start button
      React.createElement("div", { style:{height:"1px",background:"var(--border-dim)",marginBottom:"10px"} }),
      React.createElement("button", {
        onClick: () => { if (!allDone) setRunning(true); },
        disabled: allDone,
        style:{width:"100%",background:allDone?"#0a1a0a":"#1a0a2a",
          border:`1px solid ${allDone?"#2a4a2a":"#4a2a6a"}`,
          color:allDone?"#4a7a4a":"#9a7ab0",padding:"8px",borderRadius:"4px",
          cursor:allDone?"default":"pointer",fontFamily:"'DM Mono',monospace",
          fontSize:"11px",letterSpacing:"1px"}
      }, allDone ? "✓ All sets done" : `▶ Start ${SLOT_LABELS[startIdx]} set`)
    )
  );
}

export function TileNumbers({ config, data={}, editMode, onRemove, onConfig, allDayData }) {
  const d = allDayData||{};
  const priData = Object.values(d).find(t=>t?._type==="priorities");
  const priDone = (priData?.priorities||[]).filter(p=>p?.done).length;
  const priTotal = (priData?.priorities||[]).length||3;
  const checkins = Object.values(d).filter(t=>t?._type==="checkin");
  const checkinsDone = checkins.filter(c=>c?.planks||c?.food||c?.priorities||c?.feeling?.trim()).length;
  const puData = Object.values(d).find(t=>t?._type==="pushups");
  const pushupsTotal = Object.values(puData?.pushups||{}).filter(Boolean).length*5;

  const foodData = Object.values(d).find(t=>t?._type==="foodlog");
  const foodDone = (foodData?.logs||[]).filter(l=>l?.done).length;
  const foodTotal = (foodData?.logs||[]).length||4;

  const dangleData = Object.values(d).find(t=>t?._type==="dangles");
  const danglesDone = (dangleData?.checks||[]).filter(Boolean).length;

  const stats = [
    { label:"Priorities Done", val:priDone, target:priTotal||3, color:"#c8a96e" },
    { label:"Check-ins Done", val:checkinsDone, target:Math.max(checkins.length,1), color:"#8B8B4B" },
    { label:"Meals Logged", val:foodDone, target:foodTotal, color:"#c8670a" },
    { label:"Pushups Logged", val:pushupsTotal, target:150, color:"#4a7a7a" },
    { label:"Dangles Done", val:danglesDone, target:4, color:"#7a5a9a" },
  ];

  return React.createElement(CardShell, { title:config.title||"Daily Numbers", accent:"#c8a96e",
    style:{background:"var(--bg-card)",borderColor:"var(--border)"}, editMode, onRemove, onConfig },
    stats.map(({label,val,target,color}) =>
      React.createElement("div", { key:label, style:{marginBottom:"10px"} },
        React.createElement("div", { style:{display:"flex",justifyContent:"space-between",marginBottom:"3px"} },
          React.createElement("span", { style:{color:"var(--text-dim)",fontSize:"10px"} }, label),
          React.createElement("span", { style:{color,fontFamily:"'Archivo Black',sans-serif",fontSize:"12px"} },
            val, React.createElement("span", { style:{color:"var(--text-faint)"} }, `/${target}`)
          )
        ),
        React.createElement("div", { style:{background:"var(--border-dim)",borderRadius:"2px",height:"3px",overflow:"hidden"} },
          React.createElement("div", { style:{background:color,height:"100%",width:`${Math.min(100,(val/target)*100)}%`,transition:"width 0.4s"} })
        )
      )
    )
  );
}

export function TileFoodLog({ config, data={}, onChange, editMode, onRemove, onConfig }) {
  const meals = config.meals || ["Breakfast","Lunch","Dinner","Snack"];
  const logs = data.logs || meals.map(()=>({ text:"", done:false }));
  const doneCount = logs.filter(l=>l.done).length;
  const allDone = doneCount === meals.length;

  return React.createElement(CardShell, {
    title: config.title||"Food Log",
    accent: allDone ? "#4a7a4a" : "#c8670a",
    style: allDone ? {background:"#0a1a0a",borderColor:"#1a3a1a"} : {background:"var(--bg-card)",borderColor:"var(--border)"},
    editMode, onRemove, onConfig
  },
    React.createElement("div", { style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"8px"} },
      React.createElement("div", { style:{fontSize:"9px",color:allDone?"#4a7a4a":"#7a5020",letterSpacing:"1px",textTransform:"uppercase"} },
        allDone ? "All meals logged ✓" : `${doneCount}/${meals.length} logged`
      ),
      React.createElement("div", { style:{display:"flex",gap:"3px"} },
        meals.map((_,i) => React.createElement("div", { key:i,
          style:{width:"8px",height:"8px",borderRadius:"50%",
            background:logs[i]?.done ? "#4a7a4a" : "#2a2a2a",
            border:`1px solid ${logs[i]?.done ? "#4a7a4a" : "#333"}`}
        }))
      )
    ),
    meals.map((meal, i) =>
      React.createElement("div", { key:i, style:{display:"flex",alignItems:"flex-start",gap:"7px",marginBottom:"6px"} },
        React.createElement("input", { type:"checkbox", checked:!!logs[i]?.done,
          onChange: e => { const n=[...logs]; n[i]={...n[i],done:e.target.checked}; onChange({...data,logs:n}); },
          style:{marginTop:"4px",flexShrink:0,accentColor:"#c8670a",width:"13px",height:"13px"} }),
        React.createElement("div", { style:{flex:1} },
          React.createElement("div", { style:{fontSize:"9px",color:logs[i]?.done?"#4a7a4a":"#666",letterSpacing:"0.5px",marginBottom:"2px"} }, meal),
          React.createElement(AutoTA, {
            value: logs[i]?.text||"",
            placeholder: `What did you eat?`,
            onChange: v => { const n=[...logs]; n[i]={...n[i],text:v}; onChange({...data,logs:n}); },
            style: logs[i]?.done ? {color:"var(--text-muted)",textDecoration:"line-through"} : {}
          })
        )
      )
    )
  );
}

export function TileQuote({ config, data={}, onChange, editMode, onRemove, onConfig }) {
  const [quote, setQuote] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  // One quote per day — keyed by date
  React.useEffect(() => {
    const today = todayKey();
    if (data.quote && data.date === today) {
      setQuote({ q: data.quote, a: data.author });
      return;
    }
    // Fetch a fresh quote for today
    setLoading(true);
    fetch("https://api.quotable.io/random?maxLength=120&tags=inspirational|wisdom|success|stoicism")
      .then(r => r.json())
      .then(d => {
        const q = { q: d.content, a: d.author };
        setQuote(q);
        onChange({ ...data, quote: d.content, author: d.author, date: today });
      })
      .catch(() => {
        // Fallback quotes if API fails
        const fallbacks = [
          { q: "The secret of getting ahead is getting started.", a: "Mark Twain" },
          { q: "It does not matter how slowly you go as long as you do not stop.", a: "Confucius" },
          { q: "Everything you have ever wanted is on the other side of fear.", a: "George Addair" },
          { q: "Success is not final, failure is not fatal: it is the courage to continue that counts.", a: "Winston Churchill" },
          { q: "Hardships often prepare ordinary people for an extraordinary destiny.", a: "C.S. Lewis" },
        ];
        const f = fallbacks[new Date().getDate() % fallbacks.length];
        setQuote(f);
        onChange({ ...data, quote: f.q, author: f.a, date: today });
      })
      .finally(() => setLoading(false));
  }, []);

  const refresh = () => {
    setLoading(true);
    fetch("https://api.quotable.io/random?maxLength=120&tags=inspirational|wisdom|success|stoicism")
      .then(r => r.json())
      .then(d => {
        const q = { q: d.content, a: d.author };
        setQuote(q);
        onChange({ ...data, quote: d.content, author: d.author, date: todayKey() });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  return React.createElement(CardShell, {
    title: config.title || "Today's Inspiration",
    accent: "#7a6a5a", editMode, onRemove, onConfig
  },
    loading
      ? React.createElement("div", { style:{color:"var(--text-faint)",fontSize:"11px",padding:"8px 0",letterSpacing:"0.5px"} }, "Fetching today's quote...")
      : quote
        ? React.createElement("div", null,
            React.createElement("div", {
              style:{fontSize:"13px",color:"var(--accent)",lineHeight:1.7,fontStyle:"italic",
                fontFamily:"'Instrument Serif',serif",marginBottom:"10px"}
            }, `"${quote.q}"`),
            React.createElement("div", { style:{display:"flex",alignItems:"center",justifyContent:"space-between"} },
              React.createElement("div", { style:{fontSize:"10px",color:"var(--text-dim)",letterSpacing:"0.5px"} }, `— ${quote.a}`),
              React.createElement("button", {
                onClick: refresh,
                style:{background:"transparent",border:"none",color:"var(--text-faint)",cursor:"pointer",
                  fontSize:"11px",padding:"2px 6px",borderRadius:"3px"}
              }, "↻")
            )
          )
        : null
  );
}

export function TileNotes({ config, data={}, onChange, editMode, onRemove, onConfig }) {
  return React.createElement(CardShell, { title:config.title||"Notes", accent:"#6a6a8a", editMode, onRemove, onConfig },
    React.createElement(AutoTA, { value:data.text||"", placeholder:"Free notes...",
      onChange:v=>onChange({...data,text:v}), style:{minHeight:"100px"} })
  );
}

// ─── #38 — INLINE GOOGLE CALENDAR ────────────────────────────────────────────
// Read-only single-day timeline of today's events from the user's primary calendar.
// Auth is shared with the rest of the app (drive.file + calendar.readonly scopes).
// Re-fetches on mount and on the configured interval (default 10 min).
export function TileGcal({ config, data={}, onChange, editMode, onRemove, onConfig, allDayData, isAuthed, authEpoch, onReauth }) {
  const [events, setEvents]   = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError]     = React.useState(null);
  const [expandedId, setExpandedId] = React.useState(null);
  // #41 — accent reflects the bound calendar's native color (set after calendar list resolves)
  const [accentColor, setAccentColor] = React.useState("#5a7aa0");

  const refreshMin = Number(config.refreshMinutes) || 10;
  const calendarId = config.calendarId || "primary";

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchTodayEvents(calendarId);
      setEvents(list);
    } catch (e) {
      if (e.code === "NO_AUTH" || e.code === "REAUTH") {
        setError(e.code);
      } else {
        setError("FETCH");
        console.error("Calendar load failed", e);
      }
    } finally {
      setLoading(false);
    }
  }, [calendarId]);

  React.useEffect(() => {
    if (!isAuthed) { setEvents(null); setError("NO_AUTH"); return; }
    load();
    const id = setInterval(load, refreshMin * 60 * 1000);
    return () => clearInterval(id);
    // authEpoch bumps after every successful auth so a fresh consent re-triggers the fetch.
    // calendarId is captured via `load`'s dependency so swapping calendars in tile config re-fetches.
  }, [isAuthed, authEpoch, refreshMin, load]);

  // #41 — look up the bound calendar's native color from the cached calendar list
  React.useEffect(() => {
    if (!isAuthed) return;
    let alive = true;
    fetchCalendarList()
      .then(list => {
        if (!alive) return;
        const match = list.find(c => c.id === calendarId) || list.find(c => c.primary);
        if (match?.backgroundColor) setAccentColor(match.backgroundColor);
      })
      .catch(() => { /* swallow — accent stays at default */ });
    return () => { alive = false; };
  }, [isAuthed, authEpoch, calendarId]);

  const accent = accentColor;

  let body;
  if (!isAuthed || error === "NO_AUTH") {
    body = React.createElement("div", { style:{padding:"10px 2px",color:"var(--text-faint)",fontSize:"11px",lineHeight:1.6} },
      "Sign in with Google to see today's events.",
      onReauth && React.createElement("div", { style:{marginTop:"8px"} },
        React.createElement("button", { onClick:onReauth, style:{
          background:"var(--bg-hover)", border:"1px solid var(--border)",
          color:"var(--text-dim)", padding:"5px 10px", borderRadius:"4px",
          cursor:"pointer", fontFamily:"'DM Mono',monospace", fontSize:"10px"
        } }, "Connect Google Calendar")
      )
    );
  } else if (error === "REAUTH") {
    body = React.createElement("div", { style:{padding:"10px 2px",color:"#c8a020",fontSize:"11px",lineHeight:1.6} },
      "Calendar access needs re-authorization.",
      onReauth && React.createElement("div", { style:{marginTop:"8px"} },
        React.createElement("button", { onClick:onReauth, style:{
          background:"var(--bg-hover)", border:"1px solid #c8a02055",
          color:"#c8a020", padding:"5px 10px", borderRadius:"4px",
          cursor:"pointer", fontFamily:"'DM Mono',monospace", fontSize:"10px"
        } }, "Re-authorize")
      )
    );
  } else if (error === "FETCH") {
    body = React.createElement("div", { style:{padding:"10px 2px",color:"#a04040",fontSize:"11px"} },
      "Couldn't load calendar. ",
      React.createElement("button", { onClick:load, style:{
        background:"transparent",border:"none",color:"var(--accent)",cursor:"pointer",fontSize:"11px",
        textDecoration:"underline",padding:0,fontFamily:"'DM Mono',monospace"
      } }, "Retry")
    );
  } else if (loading && !events) {
    body = React.createElement("div", { style:{padding:"10px 2px",color:"var(--text-faint)",fontSize:"11px",letterSpacing:"0.5px"} }, "Loading events…");
  } else if (events && events.length === 0) {
    body = React.createElement("div", { style:{padding:"10px 2px",color:"var(--text-faint)",fontSize:"11px",fontStyle:"italic"} }, "No events today.");
  } else if (events) {
    body = React.createElement("div", { style:{display:"flex",flexDirection:"column",gap:"6px",padding:"2px 0"} },
      events.map(ev => {
        const isOpen = expandedId === ev.id;
        const timeLabel = ev.allDay ? "all day" : fmtEventTime(ev.start, false);
        const endLabel = !ev.allDay && ev.end ? fmtEventTime(ev.end, false) : "";
        return React.createElement("div", { key: ev.id,
          onClick: () => setExpandedId(isOpen ? null : ev.id),
          style:{
            cursor:"pointer",
            borderLeft:`2px solid ${accent}`,
            background: isOpen ? "var(--bg-hover)" : "transparent",
            padding:"6px 8px",
            borderRadius:"3px",
            transition:"background 0.15s"
          }
        },
          React.createElement("div", { style:{display:"flex",gap:"10px",alignItems:"baseline",fontSize:"12px"} },
            React.createElement("span", { style:{
              color:"var(--text-muted)",
              fontFamily:"'DM Mono',monospace",
              fontSize:"10px",
              minWidth:"60px",
              flexShrink:0,
              letterSpacing:"0.3px"
            } }, timeLabel),
            React.createElement("span", { style:{color:"var(--text)",lineHeight:1.4,flex:1} }, ev.title)
          ),
          isOpen && React.createElement("div", { style:{marginTop:"6px",paddingLeft:"70px",fontSize:"11px",color:"var(--text-dim)",lineHeight:1.5} },
            endLabel && React.createElement("div", null, `${timeLabel} – ${endLabel}`),
            ev.location && React.createElement("div", { style:{marginTop:"3px"} }, "📍 ", ev.location),
            ev.description && React.createElement("div", { style:{marginTop:"4px",whiteSpace:"pre-wrap",color:"var(--text-muted)",maxHeight:"120px",overflow:"auto"} }, ev.description),
            ev.htmlLink && React.createElement("a", { href:ev.htmlLink, target:"_blank", rel:"noopener noreferrer",
              style:{display:"inline-block",marginTop:"6px",fontSize:"10px",color:"var(--accent)",textDecoration:"none"} }, "Open in Google Calendar →")
          )
        );
      })
    );
  } else {
    body = React.createElement("div", { style:{padding:"10px 2px",color:"var(--text-faint)",fontSize:"11px"} }, "—");
  }

  // Title row with subtle refresh control
  const titleRow = React.createElement("div", { style:{display:"flex",alignItems:"center",gap:"6px"} },
    React.createElement("span", null, config.title || "Today's Calendar"),
    isAuthed && !error && React.createElement("button", {
      onClick:(e)=>{e.stopPropagation(); load();},
      title:"Refresh",
      style:{background:"transparent",border:"none",color:"var(--text-faint)",cursor:"pointer",fontSize:"11px",padding:"0 4px",lineHeight:1}
    }, loading ? "…" : "↻")
  );

  return React.createElement(CardShell, { title: titleRow, accent, editMode, onRemove, onConfig },
    body
  );
}

export function TileCounter({ config, data={}, onChange, editMode, onRemove, onConfig }) {
  const val = data.count||0;
  return React.createElement(CardShell, { title:config.title||"Counter", accent:"#7a6a9a", editMode, onRemove, onConfig },
    React.createElement("div", { style:{display:"flex",alignItems:"center",justifyContent:"center",gap:"16px",padding:"8px 0"} },
      React.createElement("button", { onClick:()=>onChange({...data,count:Math.max(0,val-1)}),
        style:{...iconBtnStyle("var(--bg-hover)"),width:"32px",height:"32px",fontSize:"20px",color:"var(--text-dim)",lineHeight:"32px"} }, "−"),
      React.createElement("span", { style:{fontFamily:"'Archivo Black',sans-serif",fontSize:"40px",color:"var(--accent)",minWidth:"60px",textAlign:"center"} }, val),
      React.createElement("button", { onClick:()=>onChange({...data,count:val+1}),
        style:{...iconBtnStyle("var(--bg-hover)"),width:"32px",height:"32px",fontSize:"20px",color:"var(--text-dim)",lineHeight:"32px"} }, "+")
    ),
    config.target && React.createElement("div", null,
      React.createElement("div", { style:{background:"var(--border-dim)",borderRadius:"2px",height:"3px",overflow:"hidden"} },
        React.createElement("div", { style:{background:"#7a6a9a",height:"100%",width:`${Math.min(100,(val/(config.target))*100)}%`,transition:"width 0.3s"} })
      ),
      React.createElement("div", { style:{color:"var(--text-faint)",fontSize:"9px",marginTop:"3px",textAlign:"right"} }, `${val}/${config.target}`)
    )
  );
}

// #46 — Static list of clickable Notion (or any) quick-links. Pure UI tile, no API.
// Edit links via Configure. Dynamic Notion-DB version deferred to #50, which will
// inherit auth from the first ZipRecruiter/Notion-style integration to ship.
export function TileNotionLinks({ config, data={}, onChange, editMode, onRemove, onConfig, isAuthed }) {
  const accent = config.accent || "#7a6abf";
  const staticLinks = (Array.isArray(config.links) ? config.links : [])
    .filter(l => (l?.url||"").trim() && (l?.label||"").trim());
  // #50 — dynamic mode: pull favorites live from the Worker (Notion DB query) and
  // merge them in (deduped by URL). No-ops silently when not configured/authed.
  const [dynamic, setDynamic] = useState([]);
  useEffect(() => {
    let alive = true;
    if (config.dynamic && isAuthed) {
      fetchFavorites().then(ls => { if (alive) setDynamic(Array.isArray(ls) ? ls : []); }).catch(() => {});
    } else { setDynamic([]); }
    return () => { alive = false; };
  }, [config.dynamic, isAuthed]);
  const seen = new Set();
  const visible = [...staticLinks, ...dynamic].filter(l => {
    const k = (l.url||"").trim();
    if (!k || seen.has(k)) return false;
    seen.add(k); return true;
  });
  return React.createElement(CardShell, {
    title: config.title || "Quick Links", accent, editMode, onRemove, onConfig
  },
    visible.length === 0
      ? React.createElement("div", { style:{color:"var(--text-faint)",fontSize:"11px",fontStyle:"italic",padding:"4px 0"} },
          "No links yet — open Configure to add some.")
      : React.createElement("div", { style:{display:"flex",flexDirection:"column",gap:"4px"} },
          visible.map((l, i) =>
            React.createElement("a", {
              key: i,
              href: l.url,
              target: "_blank",
              rel: "noopener noreferrer",
              style: {
                display:"flex", alignItems:"center", gap:"8px",
                padding:"5px 7px", borderRadius:"3px",
                color:"var(--text-dim)", textDecoration:"none",
                fontSize:"12px", lineHeight:1.4,
                borderLeft:`2px solid ${accent}`,
                background:"transparent",
                transition:"background 0.12s"
              },
              onMouseEnter: e => { e.currentTarget.style.background = "var(--bg-hover)"; },
              onMouseLeave: e => { e.currentTarget.style.background = "transparent"; }
            },
              React.createElement("span", { style:{color:accent,fontSize:"10px",flexShrink:0,opacity:0.8} }, "↗"),
              React.createElement("span", { style:{flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"} }, l.label)
            )
          )
        )
  );
}

// #15 — "Build With AI" idea list: a persistent running log of AI project ideas.
// Unlike most tiles, the list lives in `config.ideas` (layout-level) rather than
// per-day data, so it carries forward and accumulates across days. Add via the
// input, check an idea to mark it built (strikethrough + demoted to the bottom),
// ✕ to drop it. Persisted through onConfigPatch, which merges into the tile config.
export function TileIdeas({ config, editMode, onRemove, onConfig, onConfigPatch }) {
  const accent = config.accent || "#7a6abf";
  const ideas = Array.isArray(config.ideas) ? config.ideas : [];
  const [draft, setDraft] = useState("");
  const patch = next => onConfigPatch && onConfigPatch({ ideas: next });

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    patch([...ideas, { id: uid(), text, done: false }]);
    setDraft("");
  };
  const setIdea = (id, fields) => patch(ideas.map(it => it.id === id ? { ...it, ...fields } : it));
  const remove  = id => patch(ideas.filter(it => it.id !== id));

  // active first, built (done) demoted to the bottom — the running-log feel.
  const ordered = [...ideas.filter(it => !it.done), ...ideas.filter(it => it.done)];

  return React.createElement(CardShell, { title: config.title || "Build With AI", accent, editMode, onRemove, onConfig },
    React.createElement("div", { style:{display:"flex",gap:"6px",marginBottom:"9px"} },
      React.createElement("input", {
        value: draft,
        placeholder: "New AI build idea…",
        onChange: e => setDraft(e.target.value),
        onKeyDown: e => { if (e.key === "Enter") { e.preventDefault(); add(); } },
        style:{flex:1,background:"var(--bg)",border:"1px solid var(--border)",borderRadius:"3px",
          color:"var(--text)",fontFamily:"'DM Mono',monospace",fontSize:"12px",padding:"5px 7px"}
      }),
      React.createElement("button", { onClick: add, title:"Add idea",
        style:{background:"var(--bg-hover)",border:"1px solid var(--border)",color:accent,
          fontSize:"15px",lineHeight:1,padding:"0 11px",borderRadius:"3px",cursor:"pointer"} }, "+")
    ),
    ordered.length === 0
      ? React.createElement("div", { style:{color:"var(--text-faint)",fontSize:"11px",fontStyle:"italic",padding:"2px 0"} },
          "No ideas yet — capture one above.")
      : React.createElement("div", { style:{display:"flex",flexDirection:"column",gap:"4px"} },
          ordered.map(it =>
            React.createElement("div", { key: it.id, style:{display:"flex",alignItems:"flex-start",gap:"7px"} },
              React.createElement("input", { type:"checkbox", checked:!!it.done,
                title: it.done ? "Mark as not built" : "Mark as built",
                onChange: e => setIdea(it.id, { done: e.target.checked }),
                style:{marginTop:"4px",flexShrink:0,accentColor:accent,width:"13px",height:"13px",cursor:"pointer"} }),
              React.createElement(AutoTA, { value: it.text || "", placeholder:"…",
                onChange: v => setIdea(it.id, { text: v }),
                style: it.done ? {textDecoration:"line-through",color:"var(--text-muted)"} : {} }),
              React.createElement("button", { onClick: () => remove(it.id), title:"Remove",
                style:{background:"none",border:"none",color:"var(--text-xfaint)",cursor:"pointer",
                  fontSize:"12px",padding:"2px",flexShrink:0,marginTop:"2px"} }, "✕")
            )
          )
        )
  );
}

// #11 — Music creation daily log. One checkbox ("Made music today") + a free-form note.
// Both are optional; check + empty note is fine, note + unchecked is fine.
// When checked, the accent flips green to match the completion pattern used elsewhere.
export function TileMusicLog({ config, data={}, onChange, editMode, onRemove, onConfig }) {
  const checked = !!data.done;
  const accent = checked ? "#4a7a4a" : (config.accent || "#8a6abf");
  return React.createElement(CardShell, {
    title: config.title || "Music Today", accent, editMode, onRemove, onConfig
  },
    React.createElement(CB, {
      checked,
      onChange: v => onChange({...data, done: v}),
      label: "Made music today"
    }),
    React.createElement("div", { style:{marginTop:"8px"} },
      React.createElement(AutoTA, {
        value: data.note || "",
        placeholder: "what did you work on?",
        onChange: v => onChange({...data, note: v}),
        style: { fontSize:"11px", lineHeight:1.5 }
      })
    )
  );
}

// #16 — AI project planner: name today's build and break it into checkable steps.
// Per-day data: { build, steps: [{id,text,done}] }. Pairs with the #15 AI Ideas log.
export function TilePlanner({ config, data={}, onChange, editMode, onRemove, onConfig }) {
  const accent = config.accent || "#7a6abf";
  const steps = Array.isArray(data.steps) ? data.steps : [];
  const setSteps = next => onChange({ ...data, steps: next });
  const doneCount = steps.filter(s => s.done).length;
  const allDone = steps.length > 0 && doneCount === steps.length;
  return React.createElement(CardShell, { title: config.title || "Today's AI Build", accent: allDone ? "#4a7a4a" : accent, editMode, onRemove, onConfig },
    React.createElement("input", {
      value: data.build || "",
      placeholder: "What are you building today?",
      onChange: e => onChange({ ...data, build: e.target.value }),
      style:{width:"100%",background:"var(--bg)",border:"1px solid var(--border)",borderRadius:"4px",
        color:"var(--text)",fontFamily:"'DM Mono',monospace",fontSize:"13px",padding:"7px 8px",marginBottom:"10px"}
    }),
    React.createElement("div", { style:{fontSize:"9px",color:"var(--text-muted)",letterSpacing:"1px",textTransform:"uppercase",marginBottom:"6px",display:"flex",justifyContent:"space-between"} },
      React.createElement("span", null, "Steps"),
      steps.length > 0 && React.createElement("span", { style: allDone ? {color:"#4a7a4a"} : {} }, `${doneCount}/${steps.length}${allDone ? " ✓" : ""}`)),
    React.createElement("div", { style:{display:"flex",flexDirection:"column",gap:"4px"} },
      steps.map((s,i) =>
        React.createElement("div", { key:s.id||i, style:{display:"flex",alignItems:"flex-start",gap:"6px"} },
          React.createElement("input", { type:"checkbox", checked:!!s.done,
            onChange: e => { const n=[...steps]; n[i]={...s,done:e.target.checked}; setSteps(n); },
            style:{marginTop:"4px",flexShrink:0,accentColor:accent,width:"13px",height:"13px",cursor:"pointer"} }),
          React.createElement(AutoTA, { value:s.text||"", placeholder:"Step…",
            onChange: v => { const n=[...steps]; n[i]={...s,text:v}; setSteps(n); },
            style: s.done ? {textDecoration:"line-through",color:"var(--text-muted)"} : {} }),
          React.createElement("button", { onClick:()=>setSteps(steps.filter((_,j)=>j!==i)), title:"Remove",
            style:{background:"none",border:"none",color:"var(--text-xfaint)",cursor:"pointer",fontSize:"12px",padding:"2px",flexShrink:0,marginTop:"2px"} }, "✕")
        )
      )
    ),
    React.createElement("button", { onClick:()=>setSteps([...steps, { id: uid(), text:"", done:false }]),
      style:{marginTop:"8px",background:"var(--bg-hover)",border:"1px solid var(--border)",color:accent,
        fontFamily:"'DM Mono',monospace",fontSize:"10px",padding:"5px 10px",borderRadius:"3px",cursor:"pointer"} }, "+ Step")
  );
}

// ─── TILE DISPATCH ────────────────────────────────────────────────────────────

export function RenderTile({ tile, data, onChange, editMode, onRemove, onConfig, onConfigPatch, allDayData, tilesById, isAuthed, authEpoch, onReauth }) {
  const wrapped = d => onChange({ ...d, _type: tile.type });
  const props = { config:tile.config, data, onChange:wrapped, editMode, onRemove, onConfig, allDayData };
  switch(tile.type) {
    case "checklist":  return React.createElement(TileChecklist, {...props, allDayData, tilesById});
    case "textprompt": return React.createElement(TileTextPrompt, props);
    case "priorities": return React.createElement(TilePriorities, props);
    case "project":    return React.createElement(TileProject, props);
    case "freelist":   return React.createElement(TileFreeList, props);
    case "twoprompt":  return React.createElement(TileTwoPrompt, props);
    case "guidedam":   return React.createElement(TileGuidedAM, props);
    case "checkin":    return React.createElement(TileCheckIn, props);
    case "twolists":   return React.createElement(TileTwoLists, props);
    case "pushups":    return React.createElement(TilePushups, props);
    case "planks":     return React.createElement(TilePlanks, props);
    case "numbers":    return React.createElement(TileNumbers, props);
    case "notes":      return React.createElement(TileNotes, props);
    case "foodlog":    return React.createElement(TileFoodLog, props);
    case "dangles":    return React.createElement(TileDangles, props);
    case "musiclog":   return React.createElement(TileMusicLog, props);
    case "quote":      return React.createElement(TileQuote, props);
    case "counter":    return React.createElement(TileCounter, props);
    case "gcal":       return React.createElement(TileGcal, {...props, isAuthed, authEpoch, onReauth});
    case "notionlinks":return React.createElement(TileNotionLinks, {...props, isAuthed});
    case "ideas":      return React.createElement(TileIdeas, {...props, onConfigPatch});
    case "planner":    return React.createElement(TilePlanner, props);
    default: return React.createElement("div", { style:{color:"var(--text-muted)",padding:"12px",fontSize:"11px"} }, `Unknown: ${tile.type}`);
  }
}
