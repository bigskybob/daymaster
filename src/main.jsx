import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";

// Phase 2 of #53 — entry point for the bundled app. Mounts the real Daymaster App
// (ported from the repo-root app.js into ES modules). The live site still runs from
// the root index.html + app.js until the GitHub Pages cutover.
createRoot(document.getElementById("root")).render(React.createElement(App));

// #82 — register the PWA service worker for offline app-shell support. Production
// only (dev would cache the Vite dev server and fight HMR), after load so it never
// competes with first paint. BASE_URL is "/daymaster/", so scope is the app root.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js").catch(() => {});
  });
}
