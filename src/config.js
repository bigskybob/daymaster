// App configuration, read from window.DAYMASTER_CONFIG (set in the HTML shell).

export const CFG = window.DAYMASTER_CONFIG || {};
export const CLIENT_ID = CFG.GOOGLE_CLIENT_ID || "";
export const APP_URL = CFG.APP_URL || window.location.origin;
export const DRIVE_FOLDER = CFG.DRIVE_FOLDER || "Daymaster";
export const LOCAL_KEY = "daymaster-v2-local";
export const THEME_KEY  = "daymaster-theme";
// #38 — added calendar.readonly for inline Google Calendar widget.
// First load after this change will trigger a re-consent prompt because the scope set widened.
export const SCOPES = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.readonly";
