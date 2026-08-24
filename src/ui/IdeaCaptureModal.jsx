// #40 — quick-capture modal: type an idea and it leaves the app. #112 changed
// where it goes: the Worker now hands it to ClipJob (via Slack) for triage
// instead of writing it straight onto a Notion page. Self-contained state;
// closes on success.
import React, { useState } from "react";
import { sendCapture } from "../lib/notion.js";

export function IdeaCaptureModal({ onClose }) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [err, setErr] = useState("");
  const send = async () => {
    const t = text.trim();
    if (!t || status === "sending") return;
    setStatus("sending");
    try {
      await sendCapture(t);
      setStatus("sent");
      setTimeout(onClose, 700);
    } catch (e) {
      setErr((e && e.message) || "failed");
      setStatus("error");
    }
  };
  return React.createElement("div", {
    style:{position:"fixed",inset:0,background:"#000b",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:"12vh"},
    onClick: onClose
  },
    React.createElement("div", {
      onClick: e => e.stopPropagation(),
      style:{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"8px",padding:"18px",width:"min(440px,92vw)",boxShadow:"0 12px 40px #000a"}
    },
      React.createElement("div", { style:{fontFamily:"var(--font-display)",fontSize:"10px",letterSpacing:"1.5px",textTransform:"uppercase",color:"var(--accent)",marginBottom:"10px"} }, "💡 Capture an idea"),
      React.createElement("div", { style:{fontSize:"10px",color:"var(--text-muted)",marginBottom:"10px",lineHeight:1.5} }, "Goes to ClipJob for triage — it files this where it belongs."),
      React.createElement("textarea", {
        value: text, autoFocus: true, rows: 3,
        placeholder: "A rough idea, half-formed thought…",
        onChange: e => setText(e.target.value),
        onKeyDown: e => { if ((e.metaKey||e.ctrlKey) && e.key === "Enter") send(); },
        style:{width:"100%",background:"var(--bg)",border:"1px solid var(--border)",borderRadius:"4px",color:"var(--text)",fontFamily:"var(--font-body)",fontSize:"12px",padding:"8px",resize:"vertical",lineHeight:1.5}
      }),
      React.createElement("div", { style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:"12px",gap:"10px"} },
        React.createElement("span", { style:{fontSize:"10px",color: status==="error"?"#c97a7a":"var(--text-muted)"} },
          status==="sending" ? "Sending…" : status==="sent" ? "Sent ✓" : status==="error" ? `Failed: ${err}` : "⌘↵ to send"),
        React.createElement("div", { style:{display:"flex",gap:"8px"} },
          React.createElement("button", { onClick:onClose,
            style:{background:"var(--bg-hover)",border:"1px solid var(--border)",color:"var(--text-dim)",fontFamily:"var(--font-body)",fontSize:"11px",padding:"6px 12px",borderRadius:"4px",cursor:"pointer"} }, "Cancel"),
          React.createElement("button", { onClick:send, disabled: !text.trim()||status==="sending",
            style:{background:"var(--accent)",border:"1px solid var(--accent)",color:"var(--bg)",fontFamily:"var(--font-body)",fontSize:"11px",padding:"6px 14px",borderRadius:"4px",cursor:"pointer",opacity:(!text.trim()||status==="sending")?0.5:1} }, "Send")
        )
      )
    )
  );
}
