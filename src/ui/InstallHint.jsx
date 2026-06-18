// #82 — "Add to Home Screen" nudge. iOS Safari never fires beforeinstallprompt and
// hides install behind the Share sheet, so iOS gets a one-line instruction; Chromium
// gets a real Install button driven by the captured beforeinstallprompt event. Shows
// nothing when already installed (standalone), when there's nothing to offer, or once
// dismissed (remembered in localStorage). Fully self-contained — no store coupling.
import React, { useState, useEffect } from "react";

const DISMISS_KEY = "daymaster-install-hint-dismissed";

const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator?.standalone === true);

const isIOS = () =>
  typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent || "");

export function InstallHint() {
  const [deferred, setDeferred] = useState(null); // Chromium beforeinstallprompt event
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });

  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setDeferred(e); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (dismissed || isStandalone()) return null;
  const ios = isIOS();
  if (!deferred && !ios) return null; // nothing actionable to show (e.g. desktop, no prompt yet)

  const close = () => {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch {}
    setDismissed(true);
  };
  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch {}
    setDeferred(null);
    close();
  };

  return React.createElement("div", {
    style: { position: "fixed", left: "50%", bottom: "18px", transform: "translateX(-50%)", zIndex: 300,
      display: "flex", alignItems: "center", gap: "12px", maxWidth: "min(440px,92vw)",
      background: "var(--bg-hover)", border: "1px solid var(--accent)", borderRadius: "10px",
      padding: "10px 12px", boxShadow: "0 6px 24px #0008" },
  },
    React.createElement("span", { style: { fontSize: "20px", flexShrink: 0 } }, "📲"),
    React.createElement("div", { style: { flex: 1, fontSize: "11px", color: "var(--text)", lineHeight: 1.5 } },
      React.createElement("b", { style: { color: "var(--accent)" } }, "Install Daymaster"),
      ios
        ? React.createElement(React.Fragment, null, " — tap ", React.createElement("b", null, "Share"), " ⎙ then ", React.createElement("b", null, "Add to Home Screen"), ".")
        : " as an app for full-screen, offline access."),
    !ios && deferred && React.createElement("button", {
      onClick: install,
      style: { flexShrink: 0, background: "var(--accent)", color: "var(--bg)", border: "none",
        borderRadius: "5px", padding: "6px 12px", fontFamily: "var(--font-body)", fontSize: "11px", cursor: "pointer" },
    }, "Install"),
    React.createElement("button", { onClick: close, title: "Dismiss",
      style: { flexShrink: 0, background: "transparent", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: "16px", lineHeight: 1, padding: "2px 4px" } }, "✕")
  );
}
