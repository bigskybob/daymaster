import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";

// Phase 2 of #53 — entry point for the bundled app. Mounts the real Daymaster App
// (ported from the repo-root app.js into ES modules). The live site still runs from
// the root index.html + app.js until the GitHub Pages cutover.
createRoot(document.getElementById("root")).render(React.createElement(App));
