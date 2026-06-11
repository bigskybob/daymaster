import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "fs";

// index.html is the Vite entry; build → /docs, deployed to GitHub Pages via Actions.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url)));
const BUILD_DATE = new Date().toISOString().slice(0, 10); // #58 — stamped at build time

export default defineConfig({
  base: "/daymaster/",
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(BUILD_DATE),
  },
  build: {
    outDir: "docs",
    emptyOutDir: true,
  },
  // Allow reaching the dev server over Tailscale by MagicDNS name (e.g. "winters"
  // or any "*.ts.net"), not just localhost. Dev-only; the production build is static.
  server: {
    host: true,
    allowedHosts: ["winters", ".ts.net"],
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.{js,jsx}"],
  },
});
