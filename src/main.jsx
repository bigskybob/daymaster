import React from "react";
import { createRoot } from "react-dom/client";
import { emptyStore, migrateLayout } from "./lib/store.js";

// Phase 0 build harness for #53. This proves the Vite + React + ESM toolchain
// bundles the extracted pure logic cleanly. The full Daymaster UI is ported to
// this pipeline in Phase 2 (component split); until then the LIVE site continues
// to be served from the repo-root index.html + app.js (in-browser Babel, CDN React).
const store = migrateLayout(emptyStore());
const tileCount = store.layouts.default.columns.reduce((n, c) => n + c.tiles.length, 0);
const presets = Object.keys(store.layouts);

function BuildStatus() {
  return React.createElement(
    "div",
    { style: { fontFamily: "monospace", padding: 24, color: "#e8e4dc", background: "#0f0f0f", minHeight: "100vh" } },
    React.createElement("h1", { style: { color: "#c8a96e" } }, "Daymaster — build pipeline OK"),
    React.createElement("p", null, `Default layout: ${tileCount} tiles across ${store.layouts.default.columns.length} columns, store v${store.version}.`),
    React.createElement("p", null, `Presets: ${presets.join(", ")}`),
    React.createElement("p", { style: { color: "#888" } }, "Phase 0 of #53 — extracted logic bundles cleanly via Vite. Full UI ported in Phase 2.")
  );
}

createRoot(document.getElementById("root")).render(React.createElement(BuildStatus));
