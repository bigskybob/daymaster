// App configuration, read from window.DAYMASTER_CONFIG (set in the HTML shell).
// Guarded so this module is import-safe outside the browser (e.g. node-env tests
// that transitively import it via the tile registry).

const _win = typeof window !== "undefined" ? window : {};
export const CFG = _win.DAYMASTER_CONFIG || {};
export const CLIENT_ID = CFG.GOOGLE_CLIENT_ID || "";
export const APP_URL = CFG.APP_URL || _win.location?.origin || "";
export const DRIVE_FOLDER = CFG.DRIVE_FOLDER || "Daymaster";
// Base URL of the Daymaster API proxy Worker (Notion features). Empty until the
// Worker is deployed; the Notion client no-ops while unset.
export const WORKER_URL = (CFG.WORKER_URL || "").replace(/\/$/, "");
// #34 — Microsoft Entra app (client) ID for MSAL / Microsoft To Do. Empty = feature off.
export const MS_CLIENT_ID = CFG.MS_CLIENT_ID || "";
export const LOCAL_KEY = "daymaster-v2-local";
export const THEME_KEY  = "daymaster-theme";
export const FONT_KEY   = "daymaster-font"; // #60 — selected font style
export const BG_KEY     = "daymaster-bg";   // #25 — background image URL
export const REMIND_KEY = "daymaster-remind"; // #14 — check-in reminders on/off
// #38 — added calendar.readonly for inline Google Calendar widget.
// #62 — added openid+email so access tokens carry the signed-in email; this lets the
// API Worker enforce OWNER_EMAIL (owner-only gate + a clean "someone else tried" signal).
// Widening the scope set triggers a one-time re-consent prompt on next sign-in.
export const SCOPES = "openid email https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.readonly";
