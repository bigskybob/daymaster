import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Phase 0 of the architecture migration (#53).
//
// The LIVE site is still served from the repo-root index.html + app.js (in-browser
// Babel, React via CDN). This Vite config is the NEW pipeline being stood up in
// parallel — it does NOT touch the live files. Build entry is app.build.html so the
// root index.html (live) is never overwritten. Output goes to /docs; once verified,
// flip GitHub Pages "Deploy from branch" to the /docs folder to cut over.
export default defineConfig({
  base: "/daymaster/",
  plugins: [react()],
  build: {
    outDir: "docs",
    emptyOutDir: true,
    rollupOptions: {
      input: "app.build.html",
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.js"],
  },
});
