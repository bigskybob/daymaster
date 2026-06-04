// Build stamp (#58). Vite replaces __APP_VERSION__ / __BUILD_DATE__ at build time
// (see the `define` block in vite.config.js). The typeof guards keep dev server
// and the test runner working, where those globals aren't injected.
export const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
export const BUILD_DATE  = typeof __BUILD_DATE__  !== "undefined" ? __BUILD_DATE__  : "";
