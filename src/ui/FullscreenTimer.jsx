// Fullscreen countdown timer used by the planks/dangles tiles.
import React, { useState, useEffect, useRef } from "react";
import { playBeep, playDone } from "../lib/audio.js";
import { iconBtnStyle } from "../ui.jsx";

// ─── FULLSCREEN TIMER ─────────────────────────────────────────────────────────

export function FullscreenTimer({ seconds, label, onComplete, onCancel }) {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(true);
  const intervalRef = useRef(null);
  const remainingRef = useRef(seconds);

  useEffect(() => {
    remainingRef.current = remaining;
  }, [remaining]);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      const next = remainingRef.current - 1;
      // Countdown beeps for last 10 seconds
      if (next > 0 && next <= 10) playBeep(660, 0.06, 0.25);
      if (next <= 0) {
        clearInterval(intervalRef.current);
        setRemaining(0);
        playDone();
        setTimeout(onComplete, 800);
      } else {
        setRemaining(next);
      }
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [running]);

  const pct = (remaining / seconds) * 100;
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const timeStr = `${mins}:${secs.toString().padStart(2,"0")}`;
  const isLow = remaining <= 10;
  const color = remaining === 0 ? "#4a7a4a" : isLow ? "#c84a4a" : remaining <= seconds * 0.4 ? "#c8a020" : "#c8a96e";

  return React.createElement("div", {
    style:{position:"fixed",inset:0,background:"var(--bg)",zIndex:9999,
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"24px"}
  },
    // Arc progress
    React.createElement("svg", { width:"260", height:"260", viewBox:"0 0 260 260" },
      React.createElement("circle", { cx:"130",cy:"130",r:"110",fill:"none",stroke:"var(--border)",strokeWidth:"12" }),
      React.createElement("circle", { cx:"130",cy:"130",r:"110",fill:"none",stroke:color,strokeWidth:"12",
        strokeDasharray:`${2*Math.PI*110}`,
        strokeDashoffset:`${2*Math.PI*110*(1-pct/100)}`,
        strokeLinecap:"round",
        style:{transform:"rotate(-90deg)",transformOrigin:"130px 130px",transition:"stroke-dashoffset 0.9s linear, stroke 0.3s"} }),
      React.createElement("text", { x:"130",y:"118",textAnchor:"middle",
        style:{fontFamily:"'Archivo Black',sans-serif",fontSize:"58px",fill:color,transition:"fill 0.3s"} }, timeStr),
      React.createElement("text", { x:"130",y:"152",textAnchor:"middle",
        style:{fontFamily:"'DM Mono',monospace",fontSize:"13px",fill:"var(--text-muted)",letterSpacing:"2px",textTransform:"uppercase"} }, label)
    ),
    // Controls
    React.createElement("div", { style:{display:"flex",gap:"14px"} },
      React.createElement("button", {
        onClick: () => { setRunning(r=>!r); if(!running) {} },
        style:{background:"var(--bg-hover)",border:`1px solid ${running?"var(--border)":"var(--accent)"}`,color:running?"var(--text-dim)":"var(--accent)",
          fontFamily:"'DM Mono',monospace",fontSize:"13px",padding:"10px 28px",borderRadius:"6px",cursor:"pointer",letterSpacing:"1px"}
      }, running ? "⏸ Pause" : "▶ Resume"),
      React.createElement("button", {
        onClick: onCancel,
        style:{background:"#1a0a0a",border:"1px solid #5a1a1a",color:"#a04040",
          fontFamily:"'DM Mono',monospace",fontSize:"13px",padding:"10px 28px",borderRadius:"6px",cursor:"pointer",letterSpacing:"1px"}
      }, "✕ Cancel")
    ),
    isLow && remaining > 0 && React.createElement("div", {
      style:{fontSize:"11px",color:"#c84a4a",letterSpacing:"3px",textTransform:"uppercase",
        animation:"pulse 0.5s infinite alternate"}
    }, "Almost there"),
    React.createElement("style", null, "@keyframes pulse { from{opacity:0.4} to{opacity:1} }")
  );
}

