// #61 — Beta Onboarding (Phase 2 prototype). First-run guided interview that seeds
// a personalized starter layout from the LOCKED answer→tile map. Shown for a fresh
// profile (no Drive store + empty localStorage) or forced/replayed via ?onboarding=1
// (and from the in-app "Re-run setup" entry). Mounted full-screen by App; overlays
// the app and NEVER persists until the flow completes — back/skip leave stored data
// untouched (locked: "don't commit until the flow completes; back = replace/redo").
//
// Flow (locked): Q1 multi-select "what matters" → conditional detail steps
// (fitness if Health · calendar if Calendar · project if Projects) → Check-ins
// dimension (want? → times → capture → notify) → done. No tile cap.
//
// NOTE: this renders as an early return BEFORE App's main tree, so the app's CSS
// variables (defined in App's inline <style>) are NOT in scope here. The palette is
// therefore inlined (the app's dark-theme values) so the overlay is fully self-
// contained — a first-run user hasn't picked a theme yet anyway.
import React, { useMemo, useState } from "react";
import { ONBOARDING_CHECKIN_SLOTS } from "../lib/store.js";

// Q1 — "what matters to you" multi-select. Each chip seeds tiles and/or gates a
// later detail step (see buildOnboardingLayout for the mapping).
export const Q1_OPTIONS = [
  { key: "priorities", label: "Priorities & tasks",  icon: "✓"  },
  { key: "health",     label: "Health & fitness",    icon: "🏃" },
  { key: "food",       label: "Food & nutrition",    icon: "🍎" },
  { key: "mood",       label: "Mood & reflection",   icon: "🧠" },
  { key: "projects",   label: "Projects",            icon: "📁" },
  { key: "calendar",   label: "Calendar",            icon: "📅" },
  { key: "building",   label: "Building / learning", icon: "🛠"  },
];

// Initial per-slot toggle state for the check-ins step (recommended default =
// first three on, evening off). Each is independently togglable + time-editable.
const initialSlots = () => ONBOARDING_CHECKIN_SLOTS.map(s =>
  ({ key: s.key, label: s.label, on: s.default, time: s.time, planksSlot: s.planksSlot }));

// Short labels for the progress rail (the aggregator of major steps).
const STEP_LABELS = { q1: "What matters", fitness: "Fitness", calendar: "Calendar", project: "Project", checkins: "Check-ins", connect: "Connect", done: "Finish" };

// ── palette (inlined app dark-theme values — see file header) ────────────────
const C = {
  bg: "#0f0f0f", card: "#161616", hover: "#1a1a1a", border: "#252525",
  text: "#e8e4dc", dim: "#888", muted: "#555", faint: "#444",
  accent: "#c8a96e", accentDim: "#c8a96e22",
};
const FONT = "'DM Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const DISPLAY = "'Archivo Black', system-ui, sans-serif";

// ── shared styles ────────────────────────────────────────────────────────────
const wrap     = { minHeight: "100vh", background: C.bg, color: C.text, fontFamily: FONT, fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" };
const card     = { width: "100%", maxWidth: "560px" };
const stepLbl  = { fontFamily: DISPLAY, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: C.faint, marginBottom: "8px" };
const qStyle   = { fontFamily: DISPLAY, fontSize: "18px", lineHeight: 1.3, marginBottom: "6px", color: C.text };
const subStyle = { fontSize: "12px", color: C.dim, marginBottom: "20px" };

function chipStyle(on) {
  return { display: "flex", alignItems: "center", gap: "8px", textAlign: "left",
    background: on ? C.accentDim : C.card,
    border: `1px solid ${on ? C.accent : C.border}`,
    color: on ? C.accent : C.dim,
    padding: "12px 14px", borderRadius: "8px", cursor: "pointer",
    fontFamily: FONT, fontSize: "12px", letterSpacing: "0.3px", transition: "border-color .12s, background .12s, color .12s" };
}
function primaryBtn(enabled) {
  return { background: enabled ? C.accent : C.hover,
    color: enabled ? C.bg : C.muted,
    border: `1px solid ${enabled ? C.accent : C.border}`,
    padding: "9px 22px", borderRadius: "6px", cursor: enabled ? "pointer" : "not-allowed",
    fontFamily: FONT, fontSize: "12px", letterSpacing: "0.5px" };
}
const linkBtn  = { background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: FONT, fontSize: "11px", letterSpacing: "0.5px", textDecoration: "underline" };
const ghostBtn = { background: C.hover, border: `1px solid ${C.border}`, color: C.dim, padding: "9px 18px", borderRadius: "6px", cursor: "pointer", fontFamily: FONT, fontSize: "12px", letterSpacing: "0.5px" };
const inputStyle = { width: "100%", background: C.card, border: `1px solid ${C.border}`, color: C.text, padding: "11px 13px", borderRadius: "8px", fontFamily: FONT, fontSize: "13px" };

const h = React.createElement;

export function Onboarding({ onComplete, onSkip, onConnect, connected, authState }) {
  // All answers live here until the user FINISHES; nothing is seeded/persisted
  // mid-flow, so navigating back and changing Q1 transparently re-derives the
  // remaining steps and the final seed (locked: back = replace/redo).
  const [q1, setQ1]             = useState([]);
  const [fitness, setFitness]   = useState({ planks: false, pushups: false, dangles: false });
  const [calendar, setCalendar] = useState({ connect: true });
  const [project, setProject]   = useState({ name: "" });
  const [checkins, setCheckins] = useState({ want: true, capture: "both", notify: false, slots: initialSlots() });
  const [idx, setIdx]           = useState(0);

  // Derive the active step list from the current answers (conditional steps).
  const steps = useMemo(() => {
    const s = ["q1"];
    if (q1.includes("health"))   s.push("fitness");
    if (q1.includes("calendar")) s.push("calendar");
    if (q1.includes("projects")) s.push("project");
    s.push("checkins", "connect", "done");
    return s;
  }, [q1]);

  const step = steps[Math.min(idx, steps.length - 1)];
  const stepNo = Math.min(idx, steps.length - 1) + 1;
  const isLast = step === "done";

  const toggleQ1 = key => setQ1(p => p.includes(key) ? p.filter(k => k !== key) : [...p, key]);
  const next = () => setIdx(i => Math.min(i + 1, steps.length - 1));
  const back = () => setIdx(i => Math.max(i - 1, 0));

  // Commit: only the enabled check-in slots (in order) flow to the seeder.
  const finish = () => onComplete({ q1, fitness, calendar, project, checkins: {
    want: checkins.want,
    capture: checkins.capture,
    notify: checkins.notify,
    slots: checkins.slots.filter(s => s.on).map(s => ({ time: s.time, planksSlot: s.planksSlot })),
  } });

  // Continue gating: Q1 needs ≥1 chip; if check-ins are wanted, ≥1 slot must be on.
  const canContinue = step === "q1"
    ? q1.length > 0
    : step === "checkins"
      ? (!checkins.want || checkins.slots.some(s => s.on))
      : true;

  const toggleSlot  = key => setCheckins(c => ({ ...c, slots: c.slots.map(s => s.key === key ? { ...s, on: !s.on } : s) }));
  const setSlotTime = (key, v) => setCheckins(c => ({ ...c, slots: c.slots.map(s => s.key === key ? { ...s, time: v } : s) }));

  // ── step bodies ────────────────────────────────────────────────────────
  let body;
  if (step === "q1") {
    body = h("div", null,
      h("div", { style: qStyle }, "What do you want to stay on top of each day?"),
      h("div", { style: subStyle }, "Pick as many as feel right — nothing's permanent, you can change it all later."),
      h("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: "10px" } },
        Q1_OPTIONS.map(opt => h("button", { key: opt.key, onClick: () => toggleQ1(opt.key), style: chipStyle(q1.includes(opt.key)) },
          h("span", { style: { fontSize: "15px" } }, opt.icon),
          h("span", null, opt.label)))));
  } else if (step === "fitness") {
    const tog = k => setFitness(f => ({ ...f, [k]: !f[k] }));
    body = h("div", null,
      h("div", { style: qStyle }, "Nice — which do you want to track?"),
      h("div", { style: subStyle }, "Each one gets its own little tracker."),
      h("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: "10px" } },
        [["planks", "Planks", "🧘"], ["pushups", "Pushups", "💪"], ["dangles", "Dangles", "🪢"]].map(([k, label, icon]) =>
          h("button", { key: k, onClick: () => tog(k), style: chipStyle(fitness[k]) },
            h("span", { style: { fontSize: "15px" } }, icon),
            h("span", null, label)))));
  } else if (step === "calendar") {
    body = h("div", null,
      h("div", { style: qStyle }, "Connect your Google Calendar?"),
      h("div", { style: subStyle }, "See today's events right on your dashboard. No rush — you can always connect later."),
      h("div", { style: { display: "flex", gap: "10px" } },
        [["yes", "Yes, connect it", true], ["no", "Not now", false]].map(([k, label, val]) =>
          h("button", { key: k, onClick: () => setCalendar({ connect: val }), style: { ...chipStyle(calendar.connect === val), flex: 1, justifyContent: "center" } }, label))));
  } else if (step === "project") {
    body = h("div", null,
      h("div", { style: qStyle }, "Name your first project"),
      h("div", { style: subStyle }, "Optional — we'll add a project tile you can fill with tasks. Leave it blank to skip."),
      h("input", { value: project.name, autoFocus: true,
        onChange: e => setProject({ name: e.target.value }),
        placeholder: "e.g. Launch the beta", style: inputStyle }));
  } else if (step === "checkins") {
    body = h("div", null,
      h("div", { style: qStyle }, "Daily check-ins"),
      h("div", { style: subStyle }, "A quiet moment through the day to notice how you're feeling and line up what's next."),
      // want?
      h("div", { style: { display: "flex", gap: "10px", marginBottom: checkins.want ? "22px" : "0" } },
        [["yes", "Yes, add them", true], ["no", "Not for me", false]].map(([k, label, val]) =>
          h("button", { key: k, onClick: () => setCheckins(c => ({ ...c, want: val })), style: { ...chipStyle(checkins.want === val), flex: 1, justifyContent: "center" } }, label))),
      checkins.want && h("div", null,
        // per-slot toggles + editable times (toggle any combination on/off)
        h("div", { style: stepLbl }, "Pick your times — toggle any on or off"),
        h("div", { style: { display: "flex", flexDirection: "column", gap: "8px", marginBottom: "18px" } },
          checkins.slots.map(s => h("div", { key: s.key, style: { display: "flex", alignItems: "center", gap: "8px" } },
            h("button", { onClick: () => toggleSlot(s.key), style: { ...chipStyle(s.on), flex: 1, justifyContent: "space-between" } },
              h("span", null, s.label),
              h("span", { style: { fontSize: "13px", width: "12px", textAlign: "center" } }, s.on ? "✓" : "")),
            h("input", { value: s.time, disabled: !s.on, onChange: e => setSlotTime(s.key, e.target.value),
              "aria-label": `${s.label} time`,
              style: { width: "76px", textAlign: "center", background: C.card, border: `1px solid ${C.border}`,
                color: s.on ? C.text : C.faint, opacity: s.on ? 1 : 0.5, cursor: s.on ? "text" : "not-allowed",
                padding: "8px", borderRadius: "6px", fontFamily: FONT, fontSize: "12px" } })))),
        // capture mode
        h("div", { style: stepLbl }, "What each one captures"),
        h("div", { style: { display: "flex", gap: "10px", marginBottom: "18px" } },
          [["both", "Feelings + planning"], ["feelings", "Feelings only"]].map(([k, label]) =>
            h("button", { key: k, onClick: () => setCheckins(c => ({ ...c, capture: k })), style: { ...chipStyle(checkins.capture === k), flex: 1, justifyContent: "center" } }, label))),
        // notify (off by default)
        h("label", { style: { display: "flex", alignItems: "center", gap: "9px", cursor: "pointer", color: C.dim } },
          h("input", { type: "checkbox", checked: checkins.notify, onChange: e => setCheckins(c => ({ ...c, notify: e.target.checked })),
            style: { accentColor: C.accent, width: "14px", height: "14px", cursor: "pointer" } }),
          h("span", null, "Nudge me ~10 min before each one (browser notification)"))));
  } else if (step === "connect") {
    const noConfig = authState === "no-config";
    const authing = authState === "authing";
    body = h("div", null,
      h("div", { style: qStyle }, "Connect Google to save your dashboard"),
      h("div", { style: subStyle }, "Daymaster saves to your own Google Drive — private to you, and synced across your devices. Optional, and you can connect anytime later."),
      // The unverified-app heads-up (text-only for now; illustrated walkthrough is Phase 4).
      h("div", { style: { background: C.card, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "13px 15px", marginBottom: "20px", lineHeight: 1.7, color: C.dim, fontSize: "11.5px" } },
        h("div", { style: { color: C.text, marginBottom: "6px", fontFamily: DISPLAY, fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase" } }, "⚠ Heads-up — the \"unverified app\" screen"),
        "Daymaster's in private beta, so Google shows a scary-looking warning first — that's expected. Click ",
        h("b", { style: { color: C.text } }, "Advanced"), " → ",
        h("b", { style: { color: C.text } }, "Go to Daymaster (unsafe)"), ", then allow access. Daymaster can only ever see the files it creates itself."),
      connected
        ? h("div", { style: { display: "flex", alignItems: "center", gap: "9px", color: C.accent, fontSize: "13px" } },
            h("span", { style: { fontSize: "16px" } }, "✓"), h("span", null, "Connected. Your dashboard will sync to your Drive."))
        : noConfig
          ? h("div", { style: { color: C.muted, fontSize: "11.5px", fontStyle: "italic" } }, "Google sign-in isn't set up in this build yet — skip for now, you can connect later.")
          : h("button", { onClick: onConnect, disabled: authing, style: { ...primaryBtn(!authing), background: authing ? C.hover : "#1a2a1a", color: authing ? C.muted : "#7ac97a", border: `1px solid ${authing ? C.border : "#3a6a3a"}` } },
              authing ? "Connecting…" : "↻ Connect Google Drive"));
  } else { // done
    body = h("div", null,
      h("div", { style: qStyle }, "You're all set ✦"),
      h("div", { style: { ...subStyle, marginBottom: "10px" } }, "We'll put your starter dashboard together now."),
      h("div", { style: { fontSize: "12px", color: C.dim, lineHeight: 1.7 } },
        "Nothing's locked in — you can add, remove, or rearrange anything anytime in edit mode."));
  }

  // ── frame ─────────────────────────────────────────────────────────────
  return h("div", { style: wrap },
    h("div", { style: card },
      h("div", { style: { fontFamily: DISPLAY, fontSize: "22px", letterSpacing: "-0.5px", textAlign: "center", marginBottom: "6px" } },
        "Day", h("span", { style: { color: C.accent } }, "master")),
      h("div", { style: { fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: C.muted, textAlign: "center", marginBottom: "26px" } }, "Let's set up your day"),
      // Progress rail — aggregator of the major steps; completed ones tick, the
      // current one highlights, and a finished step can be clicked to jump back.
      h("div", { style: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "4px", marginBottom: "26px" } },
        steps.map((st, i) => {
          const state = i < stepNo - 1 ? "done" : i === stepNo - 1 ? "current" : "future";
          const clickable = state === "done";
          const ring = state === "future" ? C.border : C.accent;
          return h("div", { key: st, onClick: clickable ? () => setIdx(i) : undefined,
            style: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", cursor: clickable ? "pointer" : "default" } },
            h("div", { style: { width: "22px", height: "22px", borderRadius: "50%", flexShrink: 0,
              border: `1.5px solid ${ring}`, background: state === "done" ? C.accent : "transparent",
              color: state === "done" ? C.bg : state === "current" ? C.accent : C.faint,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontFamily: DISPLAY } },
              state === "done" ? "✓" : String(i + 1)),
            h("div", { style: { fontSize: "8.5px", letterSpacing: "0.5px", textTransform: "uppercase", textAlign: "center",
              lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%",
              color: state === "current" ? C.accent : state === "future" ? C.faint : C.dim } }, STEP_LABELS[st] || st));
        })),
      body,
      h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginTop: "28px" } },
        idx === 0
          ? h("button", { onClick: onSkip, style: linkBtn }, "Skip for now")
          : h("button", { onClick: back, style: ghostBtn }, "← Back"),
        isLast
          ? h("button", { onClick: finish, style: primaryBtn(true) }, "Build my dashboard →")
          : h("button", { onClick: next, disabled: !canContinue, style: primaryBtn(canContinue) }, "Continue"))));
}
