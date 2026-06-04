// Read-only Google Calendar layer (#38).
import { getToken } from "./token.js";

// ─── GOOGLE CALENDAR LAYER (#38) ──────────────────────────────────────────────
// Read-only fetch of today's events from the user's primary calendar.

export function todayRangeISO() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date();   end.setHours(23, 59, 59, 999);
  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}

// #41 — secondary calendar support: per-session cache of the user's calendar list
export let _calendarListCache = null;
export async function fetchCalendarList() {
  if (_calendarListCache) return _calendarListCache;
  const token = getToken();
  if (!token) { const e = new Error("Not authenticated"); e.code = "NO_AUTH"; throw e; }
  const url = `https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader&fields=items(id,summary,summaryOverride,backgroundColor,foregroundColor,primary,selected)`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401 || res.status === 403) {
    const e = new Error(`Calendar auth error ${res.status}`); e.code = "REAUTH"; throw e;
  }
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Calendar list error ${res.status}: ${txt}`);
  }
  const json = await res.json();
  _calendarListCache = (json.items || []).map(c => ({
    id: c.id,
    name: c.summaryOverride || c.summary || c.id,
    backgroundColor: c.backgroundColor || "#5a7aa0",
    primary: !!c.primary,
  }));
  // Sort: primary first, then alphabetical
  _calendarListCache.sort((a,b) => (b.primary?1:0) - (a.primary?1:0) || a.name.localeCompare(b.name));
  return _calendarListCache;
}
export function clearCalendarListCache() { _calendarListCache = null; }

export async function fetchTodayEvents(calendarId = "primary") {
  const token = getToken();
  if (!token) { const e = new Error("Not authenticated"); e.code = "NO_AUTH"; throw e; }
  const { timeMin, timeMax } = todayRangeISO();
  const params = new URLSearchParams({
    timeMin, timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401 || res.status === 403) {
    const e = new Error(`Calendar auth error ${res.status}`); e.code = "REAUTH"; throw e;
  }
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Calendar error ${res.status}: ${txt}`);
  }
  const json = await res.json();
  return (json.items || []).map(ev => ({
    id: ev.id,
    title: ev.summary || "(no title)",
    location: ev.location || "",
    description: ev.description || "",
    start: ev.start?.dateTime || ev.start?.date || null,
    end: ev.end?.dateTime || ev.end?.date || null,
    allDay: !!ev.start?.date && !ev.start?.dateTime,
    htmlLink: ev.htmlLink || "",
  }));
}

export function fmtEventTime(iso, allDay) {
  if (!iso) return "";
  if (allDay) return "all day";
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return m === 0 ? `${h} ${ampm}` : `${h}:${String(m).padStart(2,"0")} ${ampm}`;
}



