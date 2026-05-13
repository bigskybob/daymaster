// ─── DAYMASTER v2 — app.js ────────────────────────────────────────────────────
// Modular tile-based daily planner with Google Drive persistence
// All inputs save per-day, keyed by tile ID, to a JSON file in Google Drive

const { useState, useEffect, useCallback, useRef } = React;

// ─── CONFIG ───────────────────────────────────────────────────────────────────

const CFG = window.DAYMASTER_CONFIG || {};
const CLIENT_ID = CFG.GOOGLE_CLIENT_ID || "";
const APP_URL = CFG.APP_URL || window.location.origin;
const DRIVE_FOLDER = CFG.DRIVE_FOLDER || "Daymaster";
const LOCAL_KEY = "daymaster-v2-local";
const THEME_KEY  = "daymaster-theme";
// #38 — added calendar.readonly for inline Google Calendar widget.
// First load after this change will trigger a re-consent prompt because the scope set widened.
const SCOPES = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.readonly";

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}

function fmtDate(key) {
  const [y,m,d] = key.split("-");
  const dt = new Date(+y, +m-1, +d);
  return `${DAYS[dt.getDay()]}, ${MONTHS[dt.getMonth()]} ${d}, ${y}`;
}

function uid() { return Math.random().toString(36).slice(2,9); }

// ─── GOOGLE DRIVE LAYER ───────────────────────────────────────────────────────

let _token = null;
let _folderId = null;
let _fileId = null;
const FILENAME = "daymaster-data.json";

function getToken() { return _token; }

async function driveRequest(url, opts = {}) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");
  const res = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts.headers||{}) }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive error ${res.status}: ${err}`);
  }
  return res;
}

async function ensureFolder() {
  if (_folderId) return _folderId;
  // Search for existing folder
  const q = encodeURIComponent(`name='${DRIVE_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await driveRequest(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`);
  const data = await res.json();
  if (data.files && data.files.length > 0) {
    _folderId = data.files[0].id;
    return _folderId;
  }
  // Create folder
  const create = await driveRequest("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: DRIVE_FOLDER, mimeType: "application/vnd.google-apps.folder" })
  });
  const folder = await create.json();
  _folderId = folder.id;
  return _folderId;
}

async function findDataFile(folderId) {
  if (_fileId) return _fileId;
  const q = encodeURIComponent(`name='${FILENAME}' and '${folderId}' in parents and trashed=false`);
  const res = await driveRequest(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`);
  const data = await res.json();
  if (data.files && data.files.length > 0) {
    _fileId = data.files[0].id;
    return _fileId;
  }
  return null;
}

async function loadFromDrive() {
  const folderId = await ensureFolder();
  const fileId = await findDataFile(folderId);
  if (!fileId) return null;
  const res = await driveRequest(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  const text = await res.text();
  return JSON.parse(text);
}

async function saveToDrive(store) {
  const folderId = await ensureFolder();
  const json = JSON.stringify(store, null, 2);
  const blob = new Blob([json], { type: "application/json" });

  if (_fileId) {
    // Update existing file
    const form = new FormData();
    form.append("file", blob);
    await driveRequest(`https://www.googleapis.com/upload/drive/v3/files/${_fileId}?uploadType=media`, {
      method: "PATCH",
      body: blob,
      headers: { "Content-Type": "application/json" }
    });
  } else {
    // Create new file with metadata
    const meta = { name: FILENAME, parents: [folderId] };
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(meta)], { type: "application/json" }));
    form.append("file", blob);
    const res = await driveRequest("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
      method: "POST",
      body: form
    });
    const created = await res.json();
    _fileId = created.id;
  }
}

// ─── GOOGLE CALENDAR LAYER (#38) ──────────────────────────────────────────────
// Read-only fetch of today's events from the user's primary calendar.

function todayRangeISO() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date();   end.setHours(23, 59, 59, 999);
  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}

// #41 — secondary calendar support: per-session cache of the user's calendar list
let _calendarListCache = null;
async function fetchCalendarList() {
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
function clearCalendarListCache() { _calendarListCache = null; }

async function fetchTodayEvents(calendarId = "primary") {
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

function fmtEventTime(iso, allDay) {
  if (!iso) return "";
  if (allDay) return "all day";
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return m === 0 ? `${h} ${ampm}` : `${h}:${String(m).padStart(2,"0")} ${ampm}`;
}



function buildDefaultLayout() {
  return {
    name: "Daily",
    columns: [
      {
        id: "col-left", width: 22,
        tiles: [
          { id: "donts",      type: "textprompt", config: { title: "DON'T", accent: "#a04040", placeholder: "Things to avoid today..." } },
          { id: "priorities", type: "priorities", config: { title: "My Top Priorities", count: 3 } },
          { id: "proj1",      type: "project",    config: { title: "Project 1", count: 5, defaultOpen: false } },
          { id: "proj2",      type: "project",    config: { title: "Project 2", count: 4, defaultOpen: false } },
          { id: "proj3",      type: "project",    config: { title: "Project 3", count: 4, defaultOpen: false } },
          { id: "delayed",    type: "freelist",   config: { title: "Delayed Google / Amazon", count: 6, placeholder: "Search later..." } },
        ]
      },
      {
        id: "col-center", width: 44,
        tiles: [
          // #39 — Mise-en-place pinned to top. On mobile, col-center renders first,
          // so this is the first thing the user sees. Automation rules from #19 preserved.
          { id: "morning", type: "checklist", config: { title: "Mise-en-place", accent: "#c8a96e",
            items: [
              "Hydrate — water first",
              "Supplements / meds",
              "Move — stretch or walk",
              "Review yesterday's incomplete",
              "Set top 3 + frog",
              "Gratitude + intention",
              "Mise en Plac — desk ready",
              "Watch on / devices charged",
              "Review calendar",
              "DON'T list set",
              "8:30 check-in ready"
            ],
            rules: {
              4: { type: "priorities-any",   tileId: "priorities" },
              5: { type: "twoprompt-both",   tileId: "gratint"    },
              10: { type: "checkin-any",     tileId: "checkin1"   }
            }
          } },
          { id: "quote",    type: "quote",     config: { title: "Today's Inspiration" } },
          { id: "gratint",  type: "twoprompt", config: { titleA: "Gratitude", titleB: "Intention", placeholderA: "What are you grateful for?", placeholderB: "What do you intend to accomplish?", accent: "#c8a96e" } },
          // #38 — Inline Google Calendar widget (replaces the manual freelist calendar)
          { id: "calendar", type: "gcal",      config: { title: "Today's Calendar", refreshMinutes: 10, calendarId: "primary" } },
          { id: "checkin1", type: "checkin",   config: { title: "8:30",  color: "#8B4513" } },
          { id: "checkin2", type: "checkin",   config: { title: "11:00", color: "#B8860B" } },
          { id: "checkin3", type: "checkin",   config: { title: "2:00",  color: "#1a4a7a" } },
          { id: "pmcheck",  type: "checklist", config: { title: "PM Routine", accent: "#4a7a6a", items: ["Inbox zero or triaged","Desk / office cleared","Charge all devices","Tomorrow's top 3 set","Dinner planned or done","Log food for the day","Grateful moment — one thing","Wind down — no screens 30min"] } },
          { id: "twocol1",  type: "twolists",  config: { titleA: "Tomorrow I'll", titleB: "Remind Myself To", countA: 5, countB: 5 } },
          { id: "foodlog",  type: "foodlog",   config: { title: "Food Log", meals: ["Breakfast","Lunch","Dinner","Snack"] } },
          { id: "twocol2",  type: "twolists",  config: { titleA: "Notes / Misc", titleB: "Someday Maybe", countA: 4, countB: 4 } },
        ]
      },
      {
        id: "col-right", width: 24,
        tiles: [
          { id: "exercise", type: "checklist", config: { title: "Exercise Today", accent: "#4a7a4a",
            items: [
              "Pushups over 75",
              "Planks (2 of 4 sets)",
              "Sobriety 'til 5",
              "No drinking today",
              "No food after 8 yesterday"
            ],
            rules: {
              0: { type: "pushups-total-gte", tileId: "pushups", threshold: 75 },
              1: { type: "planks-count-gte",  tileId: "planks",  threshold: 2 }
            }
          } },
          { id: "planks",   type: "planks",    config: { title: "Planks" } },
          { id: "dangles",  type: "dangles",   config: { title: "Dangles" } },
          { id: "pushups",  type: "pushups",   config: { title: "Pushup Tracker" } },
          { id: "numbers",  type: "numbers",   config: { title: "Daily Numbers" } },
        ]
      }
    ]
  };
}

function emptyStore() {
  return { layouts: { default: buildDefaultLayout() }, activeLayout: "default", days: {}, version: 4 };
}

// One-shot, idempotent layout migrations for existing users.
// Safe to run on every load — only mutates when the old shape is present.
function migrateLayout(store) {
  if (!store?.layouts) return store;
  let changed = false;
  for (const key of Object.keys(store.layouts)) {
    const layout = store.layouts[key];
    if (!layout?.columns) continue;
    const cols = layout.columns;
    const centerIdx = cols.findIndex(c => c.id === "col-center");
    if (centerIdx < 0) continue;

    // #39 — ensure the "morning" (Mise-en-place) tile is first in col-center
    let morningTile = null;
    let morningCol  = -1;
    let morningPos  = -1;
    for (let ci = 0; ci < cols.length; ci++) {
      const t = cols[ci].tiles?.find(t => t.id === "morning");
      if (t) { morningTile = t; morningCol = ci; morningPos = cols[ci].tiles.indexOf(t); break; }
    }
    if (morningTile && !(morningCol === centerIdx && morningPos === 0)) {
      cols[morningCol].tiles = cols[morningCol].tiles.filter(t => t.id !== "morning");
      cols[centerIdx].tiles = [morningTile, ...cols[centerIdx].tiles];
      changed = true;
    }
    // Optional rename: if it's still the default "AM Routine", surface the new name
    const mt = cols[centerIdx].tiles.find(t => t.id === "morning");
    if (mt && mt.config?.title === "AM Routine") {
      mt.config = { ...mt.config, title: "Mise-en-place" };
      changed = true;
    }

    // #38 — convert the manual freelist "calendar" tile to the new gcal tile type
    for (const col of cols) {
      const calIdx = col.tiles?.findIndex(t => t.id === "calendar" && t.type === "freelist");
      if (calIdx >= 0) {
        col.tiles[calIdx] = {
          id: "calendar",
          type: "gcal",
          config: { title: "Today's Calendar", refreshMinutes: 10, calendarId: "primary" }
        };
        changed = true;
      }
    }

    // #41 — backfill calendarId on any gcal tile missing it (covers the pre-#41 single-calendar shape)
    for (const col of cols) {
      for (const tile of col.tiles||[]) {
        if (tile.type === "gcal" && !tile.config?.calendarId) {
          tile.config = { ...tile.config, calendarId: "primary" };
          changed = true;
        }
      }
    }

    // #30 — rewrite the legacy Exercise Today tile (venues/states list) to the new habit list + auto-rules.
    // Guarded on the legacy signal "24hr Fitness" so the migration is idempotent.
    for (const col of cols) {
      for (const tile of col.tiles||[]) {
        if (tile.id === "exercise" && tile.type === "checklist"
            && Array.isArray(tile.config?.items)
            && tile.config.items.includes("24hr Fitness")) {
          tile.config = {
            ...tile.config,
            items: [
              "Pushups over 75",
              "Planks (2 of 4 sets)",
              "Sobriety 'til 5",
              "No drinking today",
              "No food after 8 yesterday"
            ],
            rules: {
              0: { type: "pushups-total-gte", tileId: "pushups", threshold: 75 },
              1: { type: "planks-count-gte",  tileId: "planks",  threshold: 2 }
            }
          };
          changed = true;
        }
      }
    }
  }
  if (changed) store.version = 4;
  return store;
}

// ─── TILE TYPES REGISTRY ──────────────────────────────────────────────────────

const TILE_TYPES = {
  checklist:  { label: "Checklist",      icon: "☑" },
  textprompt: { label: "Text Prompt",    icon: "✍" },
  priorities: { label: "Priorities",     icon: "①" },
  project:    { label: "Project Block",  icon: "▤" },
  freelist:   { label: "Free List",      icon: "≡" },
  twoprompt:  { label: "Two Prompts",    icon: "◫" },
  checkin:    { label: "Check-In",       icon: "⏱" },
  twolists:   { label: "Two Lists",      icon: "⊞" },
  planks:     { label: "Planks",         icon: "▬" },
  pushups:    { label: "Pushups",        icon: "◉" },
  numbers:    { label: "Daily Numbers",  icon: "▲" },
  counter:    { label: "Counter",        icon: "+" },
  notes:      { label: "Notes",          icon: "✎" },
  foodlog:    { label: "Food Log",       icon: "⬡" },
  dangles:    { label: "Dangles",         icon: "↕" },
  quote:      { label: "Daily Quote",      icon: "✦" },
  gcal:       { label: "Google Calendar", icon: "🗓" },
};

function defaultConfig(type) {
  const map = {
    checklist:  { title: "Checklist", accent: "#c8a96e", items: ["Item 1","Item 2","Item 3"] },
    textprompt: { title: "Prompt", accent: "#c8a96e", placeholder: "Write here..." },
    priorities: { title: "My Top Priorities", count: 3 },
    project:    { title: "Project", count: 4 },
    freelist:   { title: "List", count: 5, placeholder: "..." },
    twoprompt:  { titleA: "Prompt A", titleB: "Prompt B", placeholderA: "...", placeholderB: "...", accent: "#c8a96e" },
    checkin:    { title: "Check-In", color: "#8B4513" },
    twolists:   { titleA: "List A", titleB: "List B", countA: 5, countB: 5 },
    planks:     { title: "Planks" },
    pushups:    { title: "Pushup Tracker" },
    numbers:    { title: "Daily Numbers" },
    notes:      { title: "Notes" },
    foodlog:    { title: "Food Log", meals: ["Breakfast","Lunch","Dinner","Snack"] },
    dangles:    { title: "Dangles" },
    quote:      { title: "Today's Inspiration" },
    counter:    { title: "Counter", target: 10 },
    gcal:       { title: "Today's Calendar", refreshMinutes: 10, calendarId: "primary" },
  };
  return map[type] || { title: type };
}

// ─── SHARED UI PRIMITIVES ─────────────────────────────────────────────────────
// ─── AUTO-RULE ENGINE ────────────────────────────────────────────────────────
// Evaluates whether a checklist item should be auto-completed
// based on the state of another tile. Extensible — add new rule types here.

function evaluateRule(rule, allDayData) {
  if (!rule || !allDayData) return false;
  const td = allDayData[rule.tileId];
  if (!td) return false;

  switch(rule.type) {
    case "twoprompt-both":
      return !!(td.textA?.trim() && td.textB?.trim());
    case "twoprompt-either":
      return !!(td.textA?.trim() || td.textB?.trim());
    case "priorities-any":
      return (td.priorities||[]).some(p=>p.text?.trim());
    case "priorities-frog":
      return !!(td.priorities?.[0]?.text?.trim());
    case "priorities-frog-done":
      return !!(td.priorities?.[0]?.text?.trim() && td.priorities?.[0]?.done);
    case "checkin-any":
      return !!(td.planks||td.food||td.priorities||td.feeling?.trim());
    case "checkin-done":
      return !!(td.planks&&td.food&&td.priorities);
    case "foodlog-any":
      return (td.logs||[]).some(l=>l.done);
    case "foodlog-all":
      return (td.logs||[]).length > 0 && (td.logs||[]).every(l=>l.done);
    case "checklist-all": {
      const items = td.checks||[];
      return items.length > 0 && items.every(Boolean);
    }
    case "checklist-any":
      return (td.checks||[]).some(Boolean);
    case "freelist-any":
      return (td.items||[]).some(x=>x?.trim());
    case "textprompt-any":
      return !!(td.text?.trim());
    // #30 — auto-rules driven by tracker tiles
    case "pushups-total-gte":
      return Object.entries(td.pushups||{})
        .filter(([,v]) => v)
        .reduce((sum,[k]) => sum + Number(k||0), 0) >= (rule.threshold||0);
    case "planks-count-gte":
      return Object.values(td.planks||{}).filter(Boolean).length >= (rule.threshold||0);
    default:
      return false;
  }
}


function AutoTA({ value, onChange, placeholder, style = {} }) {
  const ref = useCallback(el => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [value]);
  return React.createElement("textarea", {
    ref, value, rows: 1, placeholder,
    onChange: e => { onChange(e.target.value); e.target.style.height="auto"; e.target.style.height=e.target.scrollHeight+"px"; },
    onFocus: e => { e.target.style.height="auto"; e.target.style.height=e.target.scrollHeight+"px"; },
    style: { background:"transparent", border:"none", borderBottom:"1px solid var(--input-border)", color:"var(--text)",
      fontFamily:"'DM Mono',monospace", fontSize:"12px", padding:"3px 2px", resize:"none",
      overflow:"hidden", lineHeight:1.6, minHeight:"22px", width:"100%", ...style }
  });
}

function BulletList({ items, onChange, placeholder="..." }) {
  return React.createElement("div", { style:{display:"flex",flexDirection:"column",gap:"4px"} },
    items.map((item,i) =>
      React.createElement("div", { key:i, style:{display:"flex",alignItems:"flex-start",gap:"6px"} },
        React.createElement("span", { style:{color:"var(--text-faint)",fontSize:"13px",paddingTop:"2px",flexShrink:0} }, "○"),
        React.createElement(AutoTA, { value:item, placeholder,
          onChange: v => { const n=[...items]; n[i]=v; onChange(n); } })
      )
    )
  );
}

function CB({ checked, onChange, label, strike=false }) {
  return React.createElement("label", {
    style:{display:"flex",alignItems:"flex-start",gap:"7px",cursor:"pointer",padding:"3px 0",color:"var(--text-dim)",fontSize:"12px",lineHeight:1.5}
  },
    React.createElement("input", { type:"checkbox", checked, onChange:e=>onChange(e.target.checked),
      style:{marginTop:"3px",flexShrink:0,accentColor:"#c8a96e",width:"13px",height:"13px"} }),
    React.createElement("span", { style: strike&&checked ? {textDecoration:"line-through",color:"var(--text-muted)"} : {} }, label)
  );
}

function iconBtnStyle(bg="var(--bg-hover)") {
  return { background:bg, border:"none", color:"var(--text-dim)", width:"22px", height:"22px",
    borderRadius:"3px", cursor:"pointer", fontSize:"11px", lineHeight:"22px", textAlign:"center", padding:0 };
}

// ─── EMOJI PICKER ─────────────────────────────────────────────────────────────
// Used by TileCheckIn "How I'm feeling" field (#28)

const FEELING_EMOJIS = [
  "😊","😄","🙂","😐","😔","😩","😤","😰","🤒","😴",
  "🔥","⚡","💪","🧘","🌊","🎯","🌟","✨","🙏","❤️",
  "😅","🤔","😮","😬","🥳","😎","🤩","😶","🫠","🥱",
];

function EmojiPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const select = emoji => {
    onChange(emoji);
    setOpen(false);
  };

  return React.createElement("div", { ref, style:{position:"relative"} },
    // Trigger button — shows current emoji or placeholder
    React.createElement("button", {
      onClick: () => setOpen(o => !o),
      title: "Pick a feeling",
      style:{
        background: open ? "var(--accent-dim)" : "var(--bg-hover)",
        border: `1px solid ${open ? "var(--accent)" : "var(--input-border)"}`,
        borderRadius:"5px", cursor:"pointer",
        fontSize: value ? "20px" : "13px",
        width:"100%", padding: value ? "4px 8px" : "4px 8px",
        color: value ? "inherit" : "var(--text-faint)",
        textAlign:"left", lineHeight:1.4,
        fontFamily:"'DM Mono',monospace",
        display:"flex", alignItems:"center", gap:"6px",
        transition:"all 0.15s"
      }
    },
      React.createElement("span", null, value || "＋"),
      !value && React.createElement("span", { style:{fontSize:"10px",letterSpacing:"0.5px"} }, "how are you feeling?")
    ),

    // Picker popover
    open && React.createElement("div", {
      style:{
        position:"absolute", top:"calc(100% + 4px)", left:0, zIndex:200,
        background:"var(--bg-hover)", border:"1px solid var(--border)",
        borderRadius:"8px", padding:"8px", boxShadow:"0 4px 20px #0008",
        display:"grid", gridTemplateColumns:"repeat(10, 1fr)", gap:"2px",
        width:"240px"
      }
    },
      FEELING_EMOJIS.map(emoji =>
        React.createElement("button", {
          key: emoji,
          onClick: () => select(emoji),
          title: emoji,
          style:{
            background: value === emoji ? "var(--accent-dim)" : "transparent",
            border: `1px solid ${value === emoji ? "var(--accent)" : "transparent"}`,
            borderRadius:"5px", cursor:"pointer", fontSize:"16px",
            padding:"4px", lineHeight:1, textAlign:"center",
            transition:"background 0.1s"
          }
        }, emoji)
      ),
      // Clear button if value set
      value && React.createElement("button", {
        onClick: () => { onChange(""); setOpen(false); },
        style:{
          gridColumn:"span 10", marginTop:"4px",
          background:"transparent", border:"1px solid var(--border-dim)",
          borderRadius:"4px", cursor:"pointer",
          color:"var(--text-faint)", fontSize:"9px", letterSpacing:"1px",
          padding:"4px", fontFamily:"'DM Mono',monospace", textTransform:"uppercase"
        }
      }, "✕ clear")
    )
  );
}

function CardShell({ title, accent="#c8a96e", bg, border, children, editMode, onRemove, onConfig, style={} }) {
  // Ignore hardcoded dark hex values from old saved configs — use CSS vars instead
  const safeBg = (!bg || bg.startsWith('#')) ? undefined : bg;
  const safeBorder = (!border || border.startsWith('#')) ? undefined : border;
  return React.createElement("div", {
    style:{ background:safeBg||"var(--bg-card)", border:`1px solid ${safeBorder||"var(--border)"}`,
      borderLeft:`3px solid ${accent}`, borderRadius:"6px", padding:"13px",
      position:"relative", ...style }
  },
    editMode && React.createElement("div", { style:{position:"absolute",top:"7px",right:"7px",display:"flex",gap:"4px",zIndex:10} },
      onConfig && React.createElement("button", { onClick:onConfig, style:iconBtnStyle("var(--bg-hover)"), title:"Configure" }, "⚙"),
      React.createElement("button", { onClick:onRemove, style:iconBtnStyle("#5a1a1a"), title:"Remove" }, "✕")
    ),
    React.createElement("div", {
      style:{fontFamily:"'Archivo Black',sans-serif",fontSize:"9px",letterSpacing:"2px",
        textTransform:"uppercase",color:"var(--text-muted)",marginBottom:"9px",paddingBottom:"5px",
        borderBottom:"1px solid var(--border-dim)",paddingRight:editMode?"50px":"0"}
    }, title),
    children
  );
}

// ─── TILE RENDERERS ───────────────────────────────────────────────────────────

function TileChecklist({ config, data={}, onChange, editMode, onRemove, onConfig, allDayData }) {
  const manualChecks = data.checks || config.items.map(()=>false);

  // Evaluate auto-rules for each item
  const autoChecks = config.items.map((item, i) => {
    const rule = config.rules?.[i];
    return rule ? evaluateRule(rule, allDayData||{}) : false;
  });

  // Effective state: auto OR manual
  const effectiveChecks = config.items.map((_, i) => autoChecks[i] || manualChecks[i]);
  const autoCount = autoChecks.filter(Boolean).length;
  const doneCount = effectiveChecks.filter(Boolean).length;
  const total = config.items.length;
  // #36 — whole-section completion state
  const allDone = total > 0 && doneCount === total;
  const effectiveAccent = allDone ? "#4a7a4a" : config.accent;

  return React.createElement(CardShell, { title:config.title, accent:effectiveAccent, bg:config.bg, border:config.border, editMode, onRemove, onConfig },
    // #36 — completion banner takes precedence over the auto-rule banner when everything's done
    allDone && React.createElement("div", {
      style:{display:"flex",alignItems:"center",gap:"5px",marginBottom:"8px",
        padding:"4px 7px",background:"#0a1a0a",border:"1px solid #1a3a1a",borderRadius:"3px"}
    },
      React.createElement("span", { style:{fontSize:"10px",color:"#4a7a4a"} }, "✓"),
      React.createElement("span", { style:{fontSize:"9px",color:"#4a7a4a",letterSpacing:"1px",textTransform:"uppercase"} },
        `Complete${autoCount > 0 ? ` · ${autoCount} auto` : ""}`)
    ),
    !allDone && autoCount > 0 && React.createElement("div", {
      style:{display:"flex",alignItems:"center",gap:"5px",marginBottom:"8px",
        padding:"4px 7px",background:"var(--accent-dim)",border:"1px solid var(--border-dim)",borderRadius:"3px"}
    },
      React.createElement("span", { style:{fontSize:"10px"} }, "⚡"),
      React.createElement("span", { style:{fontSize:"9px",color:"var(--text-dim)",letterSpacing:"0.5px"} },
        `${autoCount} auto-completed · ${doneCount}/${total} done`)
    ),
    React.createElement("div", { style:{display:"flex",flexDirection:"column",gap:"2px"} },
      config.items.map((item, i) => {
        const isAuto = autoChecks[i];
        const isManual = manualChecks[i];
        const isChecked = isAuto || isManual;
        return React.createElement("label", { key:i,
          style:{display:"flex",alignItems:"flex-start",gap:"7px",cursor:"pointer",
            padding:"3px 0",color:isChecked?"var(--text-muted)":"var(--text-dim)",fontSize:"12px",lineHeight:1.5,
            opacity: isAuto && !isManual ? 0.8 : 1}
        },
          React.createElement("div", { style:{position:"relative",flexShrink:0,marginTop:"3px"} },
            React.createElement("input", { type:"checkbox",
              checked: isChecked,
              disabled: isAuto && !isManual,
              onChange: e => {
                const n=[...manualChecks]; n[i]=e.target.checked; onChange({...data,checks:n});
              },
              style:{accentColor:isAuto?"#8a7040":"#c8a96e",width:"13px",height:"13px",cursor:isAuto?"default":"pointer"}
            }),
            isAuto && React.createElement("span", {
              style:{position:"absolute",top:"-1px",right:"-8px",fontSize:"8px",color:"var(--accent)",pointerEvents:"none",lineHeight:1}
            }, "⚡")
          ),
          React.createElement("span", {
            style: isChecked ? {textDecoration:"line-through",color:"var(--text-muted)"} : {}
          }, item)
        );
      })
    )
  );
}

function TileTextPrompt({ config, data={}, onChange, editMode, onRemove, onConfig }) {
  return React.createElement(CardShell, { title:config.title, accent:config.accent||"#c8a96e", bg:config.bg, border:config.border, editMode, onRemove, onConfig },
    React.createElement(AutoTA, { value:data.text||"", placeholder:config.placeholder||"...",
      onChange:v=>onChange({...data,text:v}), style:{minHeight:"60px"} })
  );
}

function TilePriorities({ config, data={}, onChange, editMode, onRemove, onConfig }) {
  const count = config.count||3;
  const priorities = data.priorities || Array(count).fill(null).map(()=>({text:"",done:false}));
  const added = data.added || ["","","",""];
  return React.createElement(CardShell, { title:config.title||"My Top Priorities", accent:"#c8a96e", editMode, onRemove, onConfig },
    priorities.map((p,i) =>
      React.createElement("div", { key:i, style:{display:"flex",alignItems:"flex-start",gap:"6px",marginBottom:"6px"} },
        React.createElement("span", { style:{fontFamily:"'Archivo Black',sans-serif",fontSize:"16px",color:"var(--accent)",width:"18px",flexShrink:0,lineHeight:1.2} }, i+1),
        React.createElement("input", { type:"checkbox", checked:!!p.done,
          onChange: e => { const n=[...priorities]; n[i]={...p,done:e.target.checked}; onChange({...data,priorities:n}); },
          style:{marginTop:"4px",flexShrink:0,accentColor:"#c8a96e",width:"13px",height:"13px"} }),
        React.createElement(AutoTA, { value:p.text, placeholder:i===0?"☞ Eat this frog first...":"Priority...",
          onChange: v => { const n=[...priorities]; n[i]={...p,text:v}; onChange({...data,priorities:n}); },
          style: p.done?{textDecoration:"line-through",color:"var(--text-muted)"}:{} })
      )
    ),
    React.createElement("div", { style:{height:"1px",background:"var(--border-dim)",margin:"8px 0"} }),
    React.createElement("div", { style:{fontFamily:"'Archivo Black',sans-serif",fontSize:"9px",letterSpacing:"2px",textTransform:"uppercase",color:"var(--text-faint)",marginBottom:"6px"} }, "Added Through Day"),
    React.createElement(BulletList, { items:added, onChange:v=>onChange({...data,added:v}), placeholder:"Added task..." })
  );
}

function TileProject({ config, data={}, onChange, editMode, onRemove, onConfig }) {
  const count = config.count||4;
  const items = data.items || Array(count).fill("");
  const [localTitle, setLocalTitle] = useState(data.title||config.title||"Project");
  const isOpen = data._open !== undefined ? data._open : (config.defaultOpen !== false);
  const hasContent = items.some(x=>x);
  const doneCount = items.filter(x=>x).length;

  const header = React.createElement("div", {
    style:{display:"flex",alignItems:"center",gap:"8px",cursor:"pointer",userSelect:"none"},
    onClick: e => { if(editMode) return; onChange({...data, _open:!isOpen}); }
  },
    React.createElement("span", { style:{color:isOpen?"var(--accent)":"var(--text-muted)",fontSize:"12px",transition:"transform 0.2s",display:"inline-block",transform:isOpen?"rotate(90deg)":"rotate(0deg)"} }, "▶"),
    editMode
      ? React.createElement("input", {
          value:localTitle,
          onClick:e=>e.stopPropagation(),
          onChange:e=>{ setLocalTitle(e.target.value); onChange({...data,title:e.target.value}); },
          style:{background:"transparent",border:"none",borderBottom:"1px solid var(--border-dim)",
            color:"var(--text-dim)",fontFamily:"'Archivo Black',sans-serif",fontSize:"9px",letterSpacing:"2px",
            textTransform:"uppercase",flex:1,padding:"2px 0"}
        })
      : React.createElement("span", {
          style:{fontFamily:"'Archivo Black',sans-serif",fontSize:"9px",letterSpacing:"2px",
            textTransform:"uppercase",color:isOpen?"var(--accent)":"var(--text-muted)",flex:1}
        }, localTitle || "Untitled Project"),
    !isOpen && hasContent && React.createElement("span", {
      style:{fontSize:"9px",color:"#4a7a4a",background:"#1a2a1a",border:"1px solid #2a4a2a",
        borderRadius:"3px",padding:"1px 6px"}
    }, `${doneCount} items`),
    editMode && React.createElement("div", { style:{display:"flex",gap:"3px",marginLeft:"auto"}, onClick:e=>e.stopPropagation() },
      React.createElement("button", { onClick:onConfig, style:{background:"var(--bg-hover)",border:"none",color:"var(--text-dim)",width:"20px",height:"20px",borderRadius:"3px",cursor:"pointer",fontSize:"10px"} }, "⚙"),
      React.createElement("button", { onClick:onRemove, style:{background:"#5a1a1a",border:"none",color:"#aaa",width:"20px",height:"20px",borderRadius:"3px",cursor:"pointer",fontSize:"10px"} }, "✕")
    )
  );

  return React.createElement("div", {
    style:{background:"var(--bg-card)",border:`1px solid ${isOpen?"var(--border)":"var(--border-dim)"}`,
      borderLeft:`3px solid ${isOpen?"var(--accent)55":"var(--border)"}`,borderRadius:"6px",
      padding:isOpen?"13px":"8px 13px",transition:"all 0.2s",position:"relative"}
  },
    header,
    isOpen && React.createElement("div", { style:{marginTop:"10px",paddingTop:"10px",borderTop:"1px solid var(--border-dim)"} },
      React.createElement("input", {
        value: localTitle,
        onChange: e => { setLocalTitle(e.target.value); onChange({...data, title:e.target.value}); },
        placeholder: "Project name...",
        style:{background:"transparent",border:"none",borderBottom:"1px solid var(--border)",
          color:"var(--accent)",fontFamily:"'Archivo Black',sans-serif",fontSize:"11px",letterSpacing:"1.5px",
          textTransform:"uppercase",width:"100%",padding:"3px 0",marginBottom:"10px"}
      }),
      React.createElement(BulletList, { items, onChange:v=>onChange({...data,items:v}), placeholder:"Task..." })
    )
  );
}

function AddProjectButton({ colId, onAdd }) {
  return React.createElement("button", {
    onClick: () => onAdd(colId, "project"),
    style:{width:"100%",background:"transparent",border:"1px dashed var(--border)",borderRadius:"6px",
      padding:"8px",color:"var(--text-faint)",fontFamily:"'DM Mono',monospace",fontSize:"10px",
      cursor:"pointer",letterSpacing:"0.5px",display:"flex",alignItems:"center",justifyContent:"center",gap:"6px",
      transition:"all 0.15s"}
  },
    React.createElement("span", { style:{fontSize:"14px"} }, "+"),
    "Add Project"
  );
}

function TileFreeList({ config, data={}, onChange, editMode, onRemove, onConfig }) {
  const count = config.count||5;
  const items = data.items || Array(count).fill("");
  return React.createElement(CardShell, { title:config.title, accent:"#555", editMode, onRemove, onConfig },
    React.createElement(BulletList, { items, onChange:v=>onChange({...data,items:v}), placeholder:config.placeholder||"..." })
  );
}

function TileTwoPrompt({ config, data={}, onChange, editMode, onRemove, onConfig }) {
  return React.createElement("div", { style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"} },
    ["A","B"].map(k =>
      React.createElement(CardShell, { key:k, title:config[`title${k}`]||`Prompt ${k}`, accent:config.accent||"#c8a96e",
        editMode:k==="A"?editMode:false, onRemove:k==="A"?onRemove:undefined, onConfig:k==="A"?onConfig:undefined },
        React.createElement(AutoTA, { value:data[`text${k}`]||"", placeholder:config[`placeholder${k}`]||"...",
          onChange:v=>onChange({...data,[`text${k}`]:v}), style:{minHeight:"70px"} })
      )
    )
  );
}

function TileCheckIn({ config, data={}, onChange, editMode, onRemove, allDayData }) {
  const c = config.color||"var(--border)";
  const items = data.items || ["","","","",""];
  // #37 — feeling (emoji) and feelingNote (text) are paired and either may be set
  const isDone = data.planks||data.food||data.priorities||data.feeling?.trim()||data.feelingNote?.trim();

  // Frog = priority #1 (index 0) only
  const priData = Object.values(allDayData||{}).find(t=>t?._type==="priorities");
  const frog = priData?.priorities?.[0]?.text && !priData?.priorities?.[0]?.done
    ? priData.priorities[0] : null;
  const frogDone = !!(priData?.priorities?.[0]?.text && priData?.priorities?.[0]?.done);

  return React.createElement("div", {
    style:{border:`1px solid var(--border)`,borderLeft:`3px solid ${c}`,borderRadius:"6px",overflow:"hidden",position:"relative"}
  },
    editMode && React.createElement("div", { style:{position:"absolute",top:"7px",right:"7px",zIndex:10} },
      React.createElement("button", { onClick:onRemove, style:iconBtnStyle("#5a1a1a") }, "✕")
    ),
    React.createElement("div", {
      style:{padding:"8px 10px",background:c,fontFamily:"'Archivo Black',sans-serif",
        fontSize:"9px",letterSpacing:"1.5px",color:"var(--bg)",textTransform:"uppercase",
        display:"flex",alignItems:"center",justifyContent:"space-between"}
    },
      React.createElement("span", null, `${config.title} Check-In`),
      isDone && React.createElement("span", { style:{fontSize:"13px"} }, "✓")
    ),
    frog && React.createElement("div", {
      style:{padding:"7px 10px",background:"var(--accent-dim)",borderBottom:"1px solid var(--border-dim)",
        display:"flex",alignItems:"center",gap:"7px"}
    },
      React.createElement("span", { style:{fontSize:"11px",flexShrink:0} }, "☞"),
      React.createElement("span", { style:{fontSize:"11px",color:"var(--accent)",fontStyle:"italic",lineHeight:1.4} }, frog.text),
    ),
    frogDone && React.createElement("div", {
      style:{padding:"6px 10px",background:"#1a3a1a33",borderBottom:"1px solid #1a3a1a55",
        display:"flex",alignItems:"center",gap:"6px"}
    },
      React.createElement("span", { style:{fontSize:"10px",color:"#4a7a4a"} }, "✓ Frog done")
    ),
    React.createElement("div", { style:{padding:"10px",background:"var(--bg-card)",display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"} },
      React.createElement("div", null,
        React.createElement(CB, { checked:!!data.planks, onChange:v=>onChange({...data,planks:v}), label:"Planks or Pushups" }),
        React.createElement(CB, { checked:!!data.food, onChange:v=>onChange({...data,food:v}), label:"Food Logged" }),
        React.createElement(CB, { checked:!!data.priorities, onChange:v=>onChange({...data,priorities:v}), label:"Next Priorities" }),
        React.createElement("div", { style:{marginTop:"8px"} },
          React.createElement("div", { style:{fontSize:"9px",color:"var(--text-muted)",marginBottom:"5px",letterSpacing:"1px",textTransform:"uppercase"} }, "How I'm feeling"),
          React.createElement(EmojiPicker, { value:data.feeling||"", onChange:v=>onChange({...data,feeling:v}) }),
          // #37 — free-form text note paired with the emoji. Either can be empty.
          React.createElement("div", { style:{marginTop:"6px"} },
            React.createElement(AutoTA, {
              value: data.feelingNote || "",
              placeholder: "a note about how you feel…",
              onChange: v => onChange({...data, feelingNote: v}),
              style: { fontSize:"11px", lineHeight:1.5 }
            })
          )
        )
      ),
      React.createElement("div", null,
        React.createElement("div", { style:{fontSize:"9px",color:"var(--text-muted)",marginBottom:"5px",letterSpacing:"1px",textTransform:"uppercase"} }, "Next 2.5 hrs"),
        React.createElement(BulletList, { items, onChange:v=>onChange({...data,items:v}) })
      )
    )
  );
}

function TileTwoLists({ config, data={}, onChange, editMode, onRemove, onConfig }) {
  return React.createElement("div", { style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"} },
    ["A","B"].map(k => {
      const count = config[`count${k}`]||5;
      const items = data[`items${k}`] || Array(count).fill("");
      return React.createElement(CardShell, { key:k, title:config[`title${k}`]||`List ${k}`, accent:"#555",
        editMode:k==="A"?editMode:false, onRemove:k==="A"?onRemove:undefined, onConfig:k==="A"?onConfig:undefined },
        React.createElement(BulletList, { items, onChange:v=>onChange({...data,[`items${k}`]:v}) })
      );
    })
  );
}

const PUSHUP_NUMS = [5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95,100,105,110,115,120,125,130,135,140,145,150];

function TilePushups({ config, data={}, onChange, editMode, onRemove, onConfig }) {
  const p = data.pushups||{};
  return React.createElement(CardShell, { title:config.title||"Pushup Tracker", accent:"#c8a96e", editMode, onRemove, onConfig },
    React.createElement("div", { style:{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:"3px"} },
      PUSHUP_NUMS.map(n =>
        React.createElement("button", { key:n, onClick:()=>onChange({...data,pushups:{...p,[n]:!p[n]}}),
          style:{background:p[n]?"var(--accent-dim)":"var(--bg-card)",border:`1px solid ${p[n]?"var(--accent)":"var(--border)"}`,
            color:p[n]?"var(--accent)":"var(--text-muted)",fontFamily:"'DM Mono',monospace",fontSize:"9px",
            padding:"4px 2px",borderRadius:"3px",cursor:"pointer"} }, n)
      )
    )
  );
}

// ─── AUDIO ENGINE ────────────────────────────────────────────────────────────

function playBeep(freq=880, duration=0.08, vol=0.3) {
  try {
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = "sine";
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch(e) {}
}

function playDone() {
  // Three ascending tones
  setTimeout(()=>playBeep(523, 0.15, 0.4), 0);
  setTimeout(()=>playBeep(659, 0.15, 0.4), 160);
  setTimeout(()=>playBeep(784, 0.35, 0.5), 320);
}

// ─── FULLSCREEN TIMER ─────────────────────────────────────────────────────────

function FullscreenTimer({ seconds, label, onComplete, onCancel }) {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(true);
  const intervalRef = useRef(null);
  const remainingRef = useRef(seconds);

  useEffect(() => {
    remainingRef.current = remaining;
  }, [remaining]);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      const next = remainingRef.current - 1;
      // Countdown beeps for last 10 seconds
      if (next > 0 && next <= 10) playBeep(660, 0.06, 0.25);
      if (next <= 0) {
        clearInterval(intervalRef.current);
        setRemaining(0);
        playDone();
        setTimeout(onComplete, 800);
      } else {
        setRemaining(next);
      }
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [running]);

  const pct = (remaining / seconds) * 100;
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const timeStr = `${mins}:${secs.toString().padStart(2,"0")}`;
  const isLow = remaining <= 10;
  const color = remaining === 0 ? "#4a7a4a" : isLow ? "#c84a4a" : remaining <= seconds * 0.4 ? "#c8a020" : "#c8a96e";

  return React.createElement("div", {
    style:{position:"fixed",inset:0,background:"var(--bg)",zIndex:9999,
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"24px"}
  },
    // Arc progress
    React.createElement("svg", { width:"260", height:"260", viewBox:"0 0 260 260" },
      React.createElement("circle", { cx:"130",cy:"130",r:"110",fill:"none",stroke:"var(--border)",strokeWidth:"12" }),
      React.createElement("circle", { cx:"130",cy:"130",r:"110",fill:"none",stroke:color,strokeWidth:"12",
        strokeDasharray:`${2*Math.PI*110}`,
        strokeDashoffset:`${2*Math.PI*110*(1-pct/100)}`,
        strokeLinecap:"round",
        style:{transform:"rotate(-90deg)",transformOrigin:"130px 130px",transition:"stroke-dashoffset 0.9s linear, stroke 0.3s"} }),
      React.createElement("text", { x:"130",y:"118",textAnchor:"middle",
        style:{fontFamily:"'Archivo Black',sans-serif",fontSize:"58px",fill:color,transition:"fill 0.3s"} }, timeStr),
      React.createElement("text", { x:"130",y:"152",textAnchor:"middle",
        style:{fontFamily:"'DM Mono',monospace",fontSize:"13px",fill:"var(--text-muted)",letterSpacing:"2px",textTransform:"uppercase"} }, label)
    ),
    // Controls
    React.createElement("div", { style:{display:"flex",gap:"14px"} },
      React.createElement("button", {
        onClick: () => { setRunning(r=>!r); if(!running) {} },
        style:{background:"var(--bg-hover)",border:`1px solid ${running?"var(--border)":"var(--accent)"}`,color:running?"var(--text-dim)":"var(--accent)",
          fontFamily:"'DM Mono',monospace",fontSize:"13px",padding:"10px 28px",borderRadius:"6px",cursor:"pointer",letterSpacing:"1px"}
      }, running ? "⏸ Pause" : "▶ Resume"),
      React.createElement("button", {
        onClick: onCancel,
        style:{background:"#1a0a0a",border:"1px solid #5a1a1a",color:"#a04040",
          fontFamily:"'DM Mono',monospace",fontSize:"13px",padding:"10px 28px",borderRadius:"6px",cursor:"pointer",letterSpacing:"1px"}
      }, "✕ Cancel")
    ),
    isLow && remaining > 0 && React.createElement("div", {
      style:{fontSize:"11px",color:"#c84a4a",letterSpacing:"3px",textTransform:"uppercase",
        animation:"pulse 0.5s infinite alternate"}
    }, "Almost there"),
    React.createElement("style", null, "@keyframes pulse { from{opacity:0.4} to{opacity:1} }")
  );
}

function TilePlanks({ config, data={}, onChange, editMode, onRemove, onConfig }) {
  const slots = [["am","AM"],["noon","Noon"],["afternoon","PM"],["evening","Eve"]];
  const p = data.planks||{};
  const [timerSecs, setTimerSecs] = useState(data.timerSecs||120);
  const [running, setRunning] = useState(false);
  const doneCount = slots.filter(([k])=>p[k]).length;

  const adjustTimer = delta => {
    const next = Math.max(10, Math.min(600, timerSecs + delta));
    setTimerSecs(next);
    onChange({...data, timerSecs: next});
  };

  const handleComplete = () => {
    setRunning(false);
    // Check next unchecked slot
    const nextSlot = slots.find(([k])=>!p[k]);
    if (nextSlot) {
      onChange({...data, planks:{...p, [nextSlot[0]]:true}, timerSecs});
    }
  };

  const mins = Math.floor(timerSecs/60);
  const secs = timerSecs%60;
  const timeStr = `${mins}:${secs.toString().padStart(2,"0")}`;

  return React.createElement(React.Fragment, null,
    running && React.createElement(FullscreenTimer, {
      seconds: timerSecs, label: "Planks",
      onComplete: handleComplete,
      onCancel: () => setRunning(false)
    }),
    React.createElement(CardShell, { title:config.title||"Planks", accent:"#4a7a4a", editMode, onRemove, onConfig },
      // Session slots
      React.createElement("div", { style:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"5px",marginBottom:"10px"} },
        slots.map(([k,label]) =>
          React.createElement("button", { key:k, onClick:()=>onChange({...data,planks:{...p,[k]:!p[k]}}),
            style:{background:p[k]?"#2a3a2a":"var(--bg-hover)",border:`1px solid ${p[k]?"#4a7a4a":"var(--border)"}`,
              color:p[k]?"#7ac97a":"#555",fontFamily:"'DM Mono',monospace",fontSize:"11px",
              padding:"7px 4px",borderRadius:"3px",cursor:"pointer"} }, label)
        )
      ),
      // Progress
      doneCount > 0 && React.createElement("div", { style:{fontSize:"9px",color:"#4a7a4a",marginBottom:"8px",letterSpacing:"0.5px"} },
        `${doneCount} session${doneCount>1?"s":""} done today`
      ),
      // Timer controls
      React.createElement("div", { style:{height:"1px",background:"var(--border-dim)",marginBottom:"10px"} }),
      React.createElement("div", { style:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"6px"} },
        React.createElement("button", { onClick:()=>adjustTimer(-10),
          style:{background:"var(--bg-hover)",border:"1px solid var(--border)",color:"var(--text-dim)",width:"28px",height:"28px",
            borderRadius:"4px",cursor:"pointer",fontSize:"14px",lineHeight:"28px",textAlign:"center"} }, "−"),
        React.createElement("div", { style:{flex:1,textAlign:"center"} },
          React.createElement("div", { style:{fontFamily:"'Archivo Black',sans-serif",fontSize:"22px",color:"#4a7a4a",letterSpacing:"1px"} }, timeStr),
          React.createElement("div", { style:{fontSize:"9px",color:"var(--text-faint)",letterSpacing:"1px",textTransform:"uppercase",marginTop:"1px"} }, "duration")
        ),
        React.createElement("button", { onClick:()=>adjustTimer(10),
          style:{background:"var(--bg-hover)",border:"1px solid var(--border)",color:"var(--text-dim)",width:"28px",height:"28px",
            borderRadius:"4px",cursor:"pointer",fontSize:"14px",lineHeight:"28px",textAlign:"center"} }, "+"),
        React.createElement("button", { onClick:()=>setRunning(true),
          style:{background:"#1a3a1a",border:"1px solid #3a6a3a",color:"#7ac97a",padding:"6px 14px",
            borderRadius:"4px",cursor:"pointer",fontFamily:"'DM Mono',monospace",fontSize:"11px",letterSpacing:"0.5px"} },
          "▶ Start")
      )
    )
  );
}

function TileDangles({ config, data={}, onChange, editMode, onRemove, onConfig }) {
  const checks = data.checks || [false, false, false, false];
  const [running, setRunning] = useState(false);
  const doneCount = checks.filter(Boolean).length;
  const allDone = doneCount === 4;

  const handleComplete = () => {
    setRunning(false);
    const nextIdx = checks.findIndex(c=>!c);
    if (nextIdx !== -1) {
      const n = [...checks]; n[nextIdx] = true;
      onChange({...data, checks: n});
    }
  };

  return React.createElement(React.Fragment, null,
    running && React.createElement(FullscreenTimer, {
      seconds: 30, label: "Dangle",
      onComplete: handleComplete,
      onCancel: () => setRunning(false)
    }),
    React.createElement(CardShell, {
      title: config.title||"Dangles",
      accent: allDone ? "#4a7a4a" : "#6a4a8a",
      style: allDone ? {background:"#0a1a0a",border:"1px solid #1a3a1a"} : {},
      editMode, onRemove, onConfig
    },
      // Status line
      React.createElement("div", { style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"10px"} },
        React.createElement("div", { style:{fontSize:"9px",color:allDone?"#4a7a4a":"#6a4a8a",letterSpacing:"1px",textTransform:"uppercase"} },
          allDone ? "2:00 complete ✓" : `${doneCount * 30}s / 2:00`
        ),
        // Progress dots
        React.createElement("div", { style:{display:"flex",gap:"5px"} },
          checks.map((done,i) => React.createElement("div", { key:i,
            style:{width:"10px",height:"10px",borderRadius:"50%",
              background: done ? "#4a7a4a" : "#2a2a2a",
              border:`1px solid ${done?"#4a7a4a":"#333"}`,
              transition:"all 0.3s"}
          }))
        )
      ),
      // 4 checkboxes — each = 30 sec hang
      React.createElement("div", { style:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"6px",marginBottom:"10px"} },
        checks.map((done, i) =>
          React.createElement("button", { key:i,
            onClick: () => { const n=[...checks]; n[i]=!n[i]; onChange({...data,checks:n}); },
            style:{background:done?"#1a2a1a":"var(--bg-card)",border:`1px solid ${done?"#4a7a4a":"var(--border)"}`,
              borderRadius:"5px",padding:"10px 4px",cursor:"pointer",
              display:"flex",flexDirection:"column",alignItems:"center",gap:"4px"}
          },
            React.createElement("span", { style:{fontSize:"16px"} }, done ? "✓" : "○"),
            React.createElement("span", { style:{fontSize:"9px",color:done?"#4a7a4a":"#444",fontFamily:"'DM Mono',monospace",letterSpacing:"0.5px"} }, "0:30")
          )
        )
      ),
      // Start button
      React.createElement("div", { style:{height:"1px",background:"var(--border-dim)",marginBottom:"10px"} }),
      React.createElement("button", {
        onClick: () => { if (!allDone) setRunning(true); },
        disabled: allDone,
        style:{width:"100%",background:allDone?"#0a1a0a":"#1a0a2a",
          border:`1px solid ${allDone?"#2a4a2a":"#4a2a6a"}`,
          color:allDone?"#4a7a4a":"#9a7ab0",padding:"8px",borderRadius:"4px",
          cursor:allDone?"default":"pointer",fontFamily:"'DM Mono',monospace",
          fontSize:"11px",letterSpacing:"1px"}
      }, allDone ? "✓ All sets done" : `▶ Start set ${doneCount+1} of 4`)
    )
  );
}

function TileNumbers({ config, data={}, editMode, onRemove, onConfig, allDayData }) {
  const d = allDayData||{};
  const priData = Object.values(d).find(t=>t?._type==="priorities");
  const priDone = (priData?.priorities||[]).filter(p=>p?.done).length;
  const priTotal = (priData?.priorities||[]).length||3;
  const checkins = Object.values(d).filter(t=>t?._type==="checkin");
  const checkinsDone = checkins.filter(c=>c?.planks||c?.food||c?.priorities||c?.feeling?.trim()).length;
  const puData = Object.values(d).find(t=>t?._type==="pushups");
  const pushupsTotal = Object.values(puData?.pushups||{}).filter(Boolean).length*5;

  const foodData = Object.values(d).find(t=>t?._type==="foodlog");
  const foodDone = (foodData?.logs||[]).filter(l=>l?.done).length;
  const foodTotal = (foodData?.logs||[]).length||4;

  const dangleData = Object.values(d).find(t=>t?._type==="dangles");
  const danglesDone = (dangleData?.checks||[]).filter(Boolean).length;

  const stats = [
    { label:"Priorities Done", val:priDone, target:priTotal||3, color:"#c8a96e" },
    { label:"Check-ins Done", val:checkinsDone, target:Math.max(checkins.length,1), color:"#8B8B4B" },
    { label:"Meals Logged", val:foodDone, target:foodTotal, color:"#c8670a" },
    { label:"Pushups Logged", val:pushupsTotal, target:150, color:"#4a7a7a" },
    { label:"Dangles Done", val:danglesDone, target:4, color:"#7a5a9a" },
  ];

  return React.createElement(CardShell, { title:config.title||"Daily Numbers", accent:"#c8a96e",
    style:{background:"var(--bg-card)",borderColor:"var(--border)"}, editMode, onRemove, onConfig },
    stats.map(({label,val,target,color}) =>
      React.createElement("div", { key:label, style:{marginBottom:"10px"} },
        React.createElement("div", { style:{display:"flex",justifyContent:"space-between",marginBottom:"3px"} },
          React.createElement("span", { style:{color:"var(--text-dim)",fontSize:"10px"} }, label),
          React.createElement("span", { style:{color,fontFamily:"'Archivo Black',sans-serif",fontSize:"12px"} },
            val, React.createElement("span", { style:{color:"var(--text-faint)"} }, `/${target}`)
          )
        ),
        React.createElement("div", { style:{background:"var(--border-dim)",borderRadius:"2px",height:"3px",overflow:"hidden"} },
          React.createElement("div", { style:{background:color,height:"100%",width:`${Math.min(100,(val/target)*100)}%`,transition:"width 0.4s"} })
        )
      )
    )
  );
}

function TileFoodLog({ config, data={}, onChange, editMode, onRemove, onConfig }) {
  const meals = config.meals || ["Breakfast","Lunch","Dinner","Snack"];
  const logs = data.logs || meals.map(()=>({ text:"", done:false }));
  const doneCount = logs.filter(l=>l.done).length;
  const allDone = doneCount === meals.length;

  return React.createElement(CardShell, {
    title: config.title||"Food Log",
    accent: allDone ? "#4a7a4a" : "#c8670a",
    style: allDone ? {background:"#0a1a0a",borderColor:"#1a3a1a"} : {background:"var(--bg-card)",borderColor:"var(--border)"},
    editMode, onRemove, onConfig
  },
    React.createElement("div", { style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"8px"} },
      React.createElement("div", { style:{fontSize:"9px",color:allDone?"#4a7a4a":"#7a5020",letterSpacing:"1px",textTransform:"uppercase"} },
        allDone ? "All meals logged ✓" : `${doneCount}/${meals.length} logged`
      ),
      React.createElement("div", { style:{display:"flex",gap:"3px"} },
        meals.map((_,i) => React.createElement("div", { key:i,
          style:{width:"8px",height:"8px",borderRadius:"50%",
            background:logs[i]?.done ? "#4a7a4a" : "#2a2a2a",
            border:`1px solid ${logs[i]?.done ? "#4a7a4a" : "#333"}`}
        }))
      )
    ),
    meals.map((meal, i) =>
      React.createElement("div", { key:i, style:{display:"flex",alignItems:"flex-start",gap:"7px",marginBottom:"6px"} },
        React.createElement("input", { type:"checkbox", checked:!!logs[i]?.done,
          onChange: e => { const n=[...logs]; n[i]={...n[i],done:e.target.checked}; onChange({...data,logs:n}); },
          style:{marginTop:"4px",flexShrink:0,accentColor:"#c8670a",width:"13px",height:"13px"} }),
        React.createElement("div", { style:{flex:1} },
          React.createElement("div", { style:{fontSize:"9px",color:logs[i]?.done?"#4a7a4a":"#666",letterSpacing:"0.5px",marginBottom:"2px"} }, meal),
          React.createElement(AutoTA, {
            value: logs[i]?.text||"",
            placeholder: `What did you eat?`,
            onChange: v => { const n=[...logs]; n[i]={...n[i],text:v}; onChange({...data,logs:n}); },
            style: logs[i]?.done ? {color:"var(--text-muted)",textDecoration:"line-through"} : {}
          })
        )
      )
    )
  );
}

function TileQuote({ config, data={}, onChange, editMode, onRemove, onConfig }) {
  const [quote, setQuote] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  // One quote per day — keyed by date
  React.useEffect(() => {
    const today = todayKey();
    if (data.quote && data.date === today) {
      setQuote({ q: data.quote, a: data.author });
      return;
    }
    // Fetch a fresh quote for today
    setLoading(true);
    fetch("https://api.quotable.io/random?maxLength=120&tags=inspirational|wisdom|success|stoicism")
      .then(r => r.json())
      .then(d => {
        const q = { q: d.content, a: d.author };
        setQuote(q);
        onChange({ ...data, quote: d.content, author: d.author, date: today });
      })
      .catch(() => {
        // Fallback quotes if API fails
        const fallbacks = [
          { q: "The secret of getting ahead is getting started.", a: "Mark Twain" },
          { q: "It does not matter how slowly you go as long as you do not stop.", a: "Confucius" },
          { q: "Everything you have ever wanted is on the other side of fear.", a: "George Addair" },
          { q: "Success is not final, failure is not fatal: it is the courage to continue that counts.", a: "Winston Churchill" },
          { q: "Hardships often prepare ordinary people for an extraordinary destiny.", a: "C.S. Lewis" },
        ];
        const f = fallbacks[new Date().getDate() % fallbacks.length];
        setQuote(f);
        onChange({ ...data, quote: f.q, author: f.a, date: today });
      })
      .finally(() => setLoading(false));
  }, []);

  const refresh = () => {
    setLoading(true);
    fetch("https://api.quotable.io/random?maxLength=120&tags=inspirational|wisdom|success|stoicism")
      .then(r => r.json())
      .then(d => {
        const q = { q: d.content, a: d.author };
        setQuote(q);
        onChange({ ...data, quote: d.content, author: d.author, date: todayKey() });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  return React.createElement(CardShell, {
    title: config.title || "Today's Inspiration",
    accent: "#7a6a5a", editMode, onRemove, onConfig
  },
    loading
      ? React.createElement("div", { style:{color:"var(--text-faint)",fontSize:"11px",padding:"8px 0",letterSpacing:"0.5px"} }, "Fetching today's quote...")
      : quote
        ? React.createElement("div", null,
            React.createElement("div", {
              style:{fontSize:"13px",color:"var(--accent)",lineHeight:1.7,fontStyle:"italic",
                fontFamily:"'Instrument Serif',serif",marginBottom:"10px"}
            }, `"${quote.q}"`),
            React.createElement("div", { style:{display:"flex",alignItems:"center",justifyContent:"space-between"} },
              React.createElement("div", { style:{fontSize:"10px",color:"var(--text-dim)",letterSpacing:"0.5px"} }, `— ${quote.a}`),
              React.createElement("button", {
                onClick: refresh,
                style:{background:"transparent",border:"none",color:"var(--text-faint)",cursor:"pointer",
                  fontSize:"11px",padding:"2px 6px",borderRadius:"3px"}
              }, "↻")
            )
          )
        : null
  );
}

function TileNotes({ config, data={}, onChange, editMode, onRemove, onConfig }) {
  return React.createElement(CardShell, { title:config.title||"Notes", accent:"#6a6a8a", editMode, onRemove, onConfig },
    React.createElement(AutoTA, { value:data.text||"", placeholder:"Free notes...",
      onChange:v=>onChange({...data,text:v}), style:{minHeight:"100px"} })
  );
}

// ─── #38 — INLINE GOOGLE CALENDAR ────────────────────────────────────────────
// Read-only single-day timeline of today's events from the user's primary calendar.
// Auth is shared with the rest of the app (drive.file + calendar.readonly scopes).
// Re-fetches on mount and on the configured interval (default 10 min).
function TileGcal({ config, data={}, onChange, editMode, onRemove, onConfig, allDayData, isAuthed, authEpoch, onReauth }) {
  const [events, setEvents]   = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError]     = React.useState(null);
  const [expandedId, setExpandedId] = React.useState(null);
  // #41 — accent reflects the bound calendar's native color (set after calendar list resolves)
  const [accentColor, setAccentColor] = React.useState("#5a7aa0");

  const refreshMin = Number(config.refreshMinutes) || 10;
  const calendarId = config.calendarId || "primary";

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchTodayEvents(calendarId);
      setEvents(list);
    } catch (e) {
      if (e.code === "NO_AUTH" || e.code === "REAUTH") {
        setError(e.code);
      } else {
        setError("FETCH");
        console.error("Calendar load failed", e);
      }
    } finally {
      setLoading(false);
    }
  }, [calendarId]);

  React.useEffect(() => {
    if (!isAuthed) { setEvents(null); setError("NO_AUTH"); return; }
    load();
    const id = setInterval(load, refreshMin * 60 * 1000);
    return () => clearInterval(id);
    // authEpoch bumps after every successful auth so a fresh consent re-triggers the fetch.
    // calendarId is captured via `load`'s dependency so swapping calendars in tile config re-fetches.
  }, [isAuthed, authEpoch, refreshMin, load]);

  // #41 — look up the bound calendar's native color from the cached calendar list
  React.useEffect(() => {
    if (!isAuthed) return;
    let alive = true;
    fetchCalendarList()
      .then(list => {
        if (!alive) return;
        const match = list.find(c => c.id === calendarId) || list.find(c => c.primary);
        if (match?.backgroundColor) setAccentColor(match.backgroundColor);
      })
      .catch(() => { /* swallow — accent stays at default */ });
    return () => { alive = false; };
  }, [isAuthed, authEpoch, calendarId]);

  const accent = accentColor;

  let body;
  if (!isAuthed || error === "NO_AUTH") {
    body = React.createElement("div", { style:{padding:"10px 2px",color:"var(--text-faint)",fontSize:"11px",lineHeight:1.6} },
      "Sign in with Google to see today's events.",
      onReauth && React.createElement("div", { style:{marginTop:"8px"} },
        React.createElement("button", { onClick:onReauth, style:{
          background:"var(--bg-hover)", border:"1px solid var(--border)",
          color:"var(--text-dim)", padding:"5px 10px", borderRadius:"4px",
          cursor:"pointer", fontFamily:"'DM Mono',monospace", fontSize:"10px"
        } }, "Connect Google Calendar")
      )
    );
  } else if (error === "REAUTH") {
    body = React.createElement("div", { style:{padding:"10px 2px",color:"#c8a020",fontSize:"11px",lineHeight:1.6} },
      "Calendar access needs re-authorization.",
      onReauth && React.createElement("div", { style:{marginTop:"8px"} },
        React.createElement("button", { onClick:onReauth, style:{
          background:"var(--bg-hover)", border:"1px solid #c8a02055",
          color:"#c8a020", padding:"5px 10px", borderRadius:"4px",
          cursor:"pointer", fontFamily:"'DM Mono',monospace", fontSize:"10px"
        } }, "Re-authorize")
      )
    );
  } else if (error === "FETCH") {
    body = React.createElement("div", { style:{padding:"10px 2px",color:"#a04040",fontSize:"11px"} },
      "Couldn't load calendar. ",
      React.createElement("button", { onClick:load, style:{
        background:"transparent",border:"none",color:"var(--accent)",cursor:"pointer",fontSize:"11px",
        textDecoration:"underline",padding:0,fontFamily:"'DM Mono',monospace"
      } }, "Retry")
    );
  } else if (loading && !events) {
    body = React.createElement("div", { style:{padding:"10px 2px",color:"var(--text-faint)",fontSize:"11px",letterSpacing:"0.5px"} }, "Loading events…");
  } else if (events && events.length === 0) {
    body = React.createElement("div", { style:{padding:"10px 2px",color:"var(--text-faint)",fontSize:"11px",fontStyle:"italic"} }, "No events today.");
  } else if (events) {
    body = React.createElement("div", { style:{display:"flex",flexDirection:"column",gap:"6px",padding:"2px 0"} },
      events.map(ev => {
        const isOpen = expandedId === ev.id;
        const timeLabel = ev.allDay ? "all day" : fmtEventTime(ev.start, false);
        const endLabel = !ev.allDay && ev.end ? fmtEventTime(ev.end, false) : "";
        return React.createElement("div", { key: ev.id,
          onClick: () => setExpandedId(isOpen ? null : ev.id),
          style:{
            cursor:"pointer",
            borderLeft:`2px solid ${accent}`,
            background: isOpen ? "var(--bg-hover)" : "transparent",
            padding:"6px 8px",
            borderRadius:"3px",
            transition:"background 0.15s"
          }
        },
          React.createElement("div", { style:{display:"flex",gap:"10px",alignItems:"baseline",fontSize:"12px"} },
            React.createElement("span", { style:{
              color:"var(--text-muted)",
              fontFamily:"'DM Mono',monospace",
              fontSize:"10px",
              minWidth:"60px",
              flexShrink:0,
              letterSpacing:"0.3px"
            } }, timeLabel),
            React.createElement("span", { style:{color:"var(--text)",lineHeight:1.4,flex:1} }, ev.title)
          ),
          isOpen && React.createElement("div", { style:{marginTop:"6px",paddingLeft:"70px",fontSize:"11px",color:"var(--text-dim)",lineHeight:1.5} },
            endLabel && React.createElement("div", null, `${timeLabel} – ${endLabel}`),
            ev.location && React.createElement("div", { style:{marginTop:"3px"} }, "📍 ", ev.location),
            ev.description && React.createElement("div", { style:{marginTop:"4px",whiteSpace:"pre-wrap",color:"var(--text-muted)",maxHeight:"120px",overflow:"auto"} }, ev.description),
            ev.htmlLink && React.createElement("a", { href:ev.htmlLink, target:"_blank", rel:"noopener noreferrer",
              style:{display:"inline-block",marginTop:"6px",fontSize:"10px",color:"var(--accent)",textDecoration:"none"} }, "Open in Google Calendar →")
          )
        );
      })
    );
  } else {
    body = React.createElement("div", { style:{padding:"10px 2px",color:"var(--text-faint)",fontSize:"11px"} }, "—");
  }

  // Title row with subtle refresh control
  const titleRow = React.createElement("div", { style:{display:"flex",alignItems:"center",gap:"6px"} },
    React.createElement("span", null, config.title || "Today's Calendar"),
    isAuthed && !error && React.createElement("button", {
      onClick:(e)=>{e.stopPropagation(); load();},
      title:"Refresh",
      style:{background:"transparent",border:"none",color:"var(--text-faint)",cursor:"pointer",fontSize:"11px",padding:"0 4px",lineHeight:1}
    }, loading ? "…" : "↻")
  );

  return React.createElement(CardShell, { title: titleRow, accent, editMode, onRemove, onConfig },
    body
  );
}

function TileCounter({ config, data={}, onChange, editMode, onRemove, onConfig }) {
  const val = data.count||0;
  return React.createElement(CardShell, { title:config.title||"Counter", accent:"#7a6a9a", editMode, onRemove, onConfig },
    React.createElement("div", { style:{display:"flex",alignItems:"center",justifyContent:"center",gap:"16px",padding:"8px 0"} },
      React.createElement("button", { onClick:()=>onChange({...data,count:Math.max(0,val-1)}),
        style:{...iconBtnStyle("var(--bg-hover)"),width:"32px",height:"32px",fontSize:"20px",color:"var(--text-dim)",lineHeight:"32px"} }, "−"),
      React.createElement("span", { style:{fontFamily:"'Archivo Black',sans-serif",fontSize:"40px",color:"var(--accent)",minWidth:"60px",textAlign:"center"} }, val),
      React.createElement("button", { onClick:()=>onChange({...data,count:val+1}),
        style:{...iconBtnStyle("var(--bg-hover)"),width:"32px",height:"32px",fontSize:"20px",color:"var(--text-dim)",lineHeight:"32px"} }, "+")
    ),
    config.target && React.createElement("div", null,
      React.createElement("div", { style:{background:"var(--border-dim)",borderRadius:"2px",height:"3px",overflow:"hidden"} },
        React.createElement("div", { style:{background:"#7a6a9a",height:"100%",width:`${Math.min(100,(val/(config.target))*100)}%`,transition:"width 0.3s"} })
      ),
      React.createElement("div", { style:{color:"var(--text-faint)",fontSize:"9px",marginTop:"3px",textAlign:"right"} }, `${val}/${config.target}`)
    )
  );
}

// ─── TILE DISPATCH ────────────────────────────────────────────────────────────

function RenderTile({ tile, data, onChange, editMode, onRemove, onConfig, allDayData, isAuthed, authEpoch, onReauth }) {
  const wrapped = d => onChange({ ...d, _type: tile.type });
  const props = { config:tile.config, data, onChange:wrapped, editMode, onRemove, onConfig, allDayData };
  switch(tile.type) {
    case "checklist":  return React.createElement(TileChecklist, {...props, allDayData});
    case "textprompt": return React.createElement(TileTextPrompt, props);
    case "priorities": return React.createElement(TilePriorities, props);
    case "project":    return React.createElement(TileProject, props);
    case "freelist":   return React.createElement(TileFreeList, props);
    case "twoprompt":  return React.createElement(TileTwoPrompt, props);
    case "checkin":    return React.createElement(TileCheckIn, props);
    case "twolists":   return React.createElement(TileTwoLists, props);
    case "pushups":    return React.createElement(TilePushups, props);
    case "planks":     return React.createElement(TilePlanks, props);
    case "numbers":    return React.createElement(TileNumbers, props);
    case "notes":      return React.createElement(TileNotes, props);
    case "foodlog":    return React.createElement(TileFoodLog, props);
    case "dangles":    return React.createElement(TileDangles, props);
    case "quote":      return React.createElement(TileQuote, props);
    case "counter":    return React.createElement(TileCounter, props);
    case "gcal":       return React.createElement(TileGcal, {...props, isAuthed, authEpoch, onReauth});
    default: return React.createElement("div", { style:{color:"var(--text-muted)",padding:"12px",fontSize:"11px"} }, `Unknown: ${tile.type}`);
  }
}

// ─── TILE LIBRARY PANEL ───────────────────────────────────────────────────────

function TileLibrary({ onAdd, columns }) {
  // #32 — default destination to the column with the fewest tiles (shortest by tile count).
  // Ties broken by current order (i.e. leftmost shortest wins).
  const shortestColId = React.useMemo(() => {
    if (!columns?.length) return "";
    let best = columns[0];
    for (const c of columns) {
      if ((c.tiles?.length||0) < (best.tiles?.length||0)) best = c;
    }
    return best.id;
  }, [columns]);
  const [col, setCol] = useState(shortestColId);
  // Re-pick the shortest column whenever columns rebalance (e.g. after adding/removing/moving tiles)
  React.useEffect(() => { setCol(shortestColId); }, [shortestColId]);
  return React.createElement("div", { style:{background:"var(--bg-hover)",border:"1px solid var(--border)",borderRadius:"6px",padding:"14px",marginBottom:"14px"} },
    React.createElement("div", { style:{display:"flex",alignItems:"center",gap:"10px",marginBottom:"10px",flexWrap:"wrap"} },
      React.createElement("span", { style:{fontFamily:"'Archivo Black',sans-serif",fontSize:"9px",letterSpacing:"2px",textTransform:"uppercase",color:"var(--text-muted)"} }, "Add to column:"),
      columns.map(c => React.createElement("button", { key:c.id, onClick:()=>setCol(c.id),
        style:{background:col===c.id?"var(--accent-dim)":"var(--bg-card)",border:`1px solid ${col===c.id?"var(--accent)":"var(--border)"}`,
          color:col===c.id?"var(--accent)":"var(--text-dim)",fontSize:"10px",padding:"3px 10px",borderRadius:"3px",cursor:"pointer",fontFamily:"'DM Mono',monospace"} },
        c.id
      ))
    ),
    React.createElement("div", { style:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(90px,1fr))",gap:"6px"} },
      Object.entries(TILE_TYPES).map(([type,{label,icon}]) =>
        React.createElement("button", { key:type, onClick:()=>onAdd(col,type),
          style:{background:"var(--bg-card)",border:"1px solid var(--border)",color:"var(--text-dim)",fontFamily:"'DM Mono',monospace",
            fontSize:"10px",padding:"8px 6px",borderRadius:"4px",cursor:"pointer",textAlign:"center",
            display:"flex",flexDirection:"column",alignItems:"center",gap:"3px"} },
          React.createElement("span", { style:{fontSize:"16px"} }, icon),
          label
        )
      )
    )
  );
}

// ─── CONFIG MODAL ─────────────────────────────────────────────────────────────

function ConfigModal({ tile, onSave, onClose }) {
  const [cfg, setCfg] = useState({...tile.config});
  // #41 — when configuring a gcal tile, pull the user's calendar list so calendarId can render as a dropdown.
  const [calendarList, setCalendarList] = useState(null);
  React.useEffect(() => {
    if (tile.type !== "gcal") return;
    let alive = true;
    fetchCalendarList()
      .then(list => { if (alive) setCalendarList(list); })
      .catch(() => { if (alive) setCalendarList([]); });
    return () => { alive = false; };
  }, [tile.type]);
  return React.createElement("div", {
    style:{position:"fixed",inset:0,background:"#000b",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}
  },
    React.createElement("div", { style:{background:"var(--bg-hover)",border:"1px solid var(--border)",borderRadius:"8px",padding:"22px",width:"360px",maxHeight:"80vh",overflow:"auto"} },
      React.createElement("div", { style:{fontFamily:"'Archivo Black',sans-serif",fontSize:"12px",color:"var(--accent)",marginBottom:"16px",letterSpacing:"1px"} },
        `Configure: ${TILE_TYPES[tile.type]?.label||tile.type}`
      ),
      Object.entries(cfg).map(([k,v]) => {
        if (k.startsWith("_")) return null;
        const label = React.createElement("div", { style:{fontSize:"9px",color:"var(--text-muted)",letterSpacing:"1px",textTransform:"uppercase",marginBottom:"3px"} }, k);
        const inputStyle = {width:"100%",background:"var(--bg)",border:"1px solid var(--border)",borderRadius:"3px",color:"var(--text)",fontFamily:"'DM Mono',monospace",fontSize:"11px",padding:"6px 8px"};
        // #41 — special-case the gcal calendarId field as a dropdown of the user's calendars
        if (k === "calendarId" && tile.type === "gcal") {
          if (calendarList === null) return React.createElement("div", { key:k, style:{marginBottom:"10px"} },
            label,
            React.createElement("div", { style:{fontSize:"10px",color:"var(--text-faint)",padding:"6px 0"} }, "Loading calendars…"));
          if (calendarList.length === 0) return React.createElement("div", { key:k, style:{marginBottom:"10px"} },
            label,
            React.createElement("input", { value:v, onChange:e=>setCfg({...cfg,[k]:e.target.value}), style:inputStyle }),
            React.createElement("div", { style:{fontSize:"9px",color:"var(--text-faint)",marginTop:"3px"} }, "Couldn't load calendar list — enter ID manually."));
          return React.createElement("div", { key:k, style:{marginBottom:"10px"} },
            label,
            React.createElement("select", {
              value: v,
              onChange: e => setCfg({...cfg, [k]: e.target.value}),
              style: inputStyle
            },
              calendarList.map(c => React.createElement("option", { key:c.id, value:c.id },
                `${c.name}${c.primary ? " (primary)" : ""}`
              ))
            )
          );
        }
        if (typeof v === "string") return React.createElement("div", { key:k, style:{marginBottom:"10px"} },
          label, React.createElement("input", { value:v, onChange:e=>setCfg({...cfg,[k]:e.target.value}), style:inputStyle }));
        if (typeof v === "number") return React.createElement("div", { key:k, style:{marginBottom:"10px"} },
          label, React.createElement("input", { type:"number", value:v, onChange:e=>setCfg({...cfg,[k]:+e.target.value}), style:inputStyle }));
        if (Array.isArray(v)) return React.createElement("div", { key:k, style:{marginBottom:"10px"} },
          label,
          React.createElement("div", { style:{fontSize:"9px",color:"var(--text-faint)",marginBottom:"3px"} }, "one item per line"),
          React.createElement("textarea", { value:v.join("\n"), rows:Math.max(3,v.length+1),
            onChange: e => { setCfg({...cfg,[k]:e.target.value.split("\n")}); e.target.style.height="auto"; e.target.style.height=e.target.scrollHeight+"px"; },
            onFocus: e => { e.target.style.height="auto"; e.target.style.height=e.target.scrollHeight+"px"; },
            style:{...inputStyle,resize:"none",overflow:"hidden"} }));
        return null;
      }),
      React.createElement("div", { style:{display:"flex",gap:"8px",marginTop:"16px"} },
        React.createElement("button", { onClick:()=>onSave(cfg),
          style:{flex:1,background:"var(--accent-dim)",border:"1px solid var(--accent)",color:"var(--accent)",fontFamily:"'DM Mono',monospace",fontSize:"11px",padding:"8px",borderRadius:"4px",cursor:"pointer"} },
          "Save"),
        React.createElement("button", { onClick:onClose,
          style:{flex:1,background:"var(--bg-card)",border:"1px solid var(--border)",color:"var(--text-dim)",fontFamily:"'DM Mono',monospace",fontSize:"11px",padding:"8px",borderRadius:"4px",cursor:"pointer"} },
          "Cancel")
      )
    )
  );
}

// ─── HISTORY VIEW ─────────────────────────────────────────────────────────────

function HistoryView({ store }) {
  const days = Object.entries(store.days).sort((a,b)=>b[0].localeCompare(a[0]));
  const [sel, setSel] = useState(null);
  const layout = store.layouts[store.activeLayout||"default"];

  if (!days.length) return React.createElement("div", {
    style:{textAlign:"center",padding:"80px",color:"var(--text-faint)",fontFamily:"'DM Mono',monospace",fontSize:"12px"}
  }, "No history yet — your completed days will appear here.");

  const selData = sel ? store.days[sel] : null;
  const allTiles = layout?.columns.flatMap(c=>c.tiles)||[];

  return React.createElement("div", { style:{maxWidth:"960px",margin:"0 auto",padding:"24px",display:"grid",gridTemplateColumns:"200px 1fr",gap:"16px"} },
    React.createElement("div", null,
      React.createElement("div", { style:{fontFamily:"'Archivo Black',sans-serif",fontSize:"9px",letterSpacing:"2px",textTransform:"uppercase",color:"var(--text-faint)",marginBottom:"10px"} }, "Past Days"),
      days.map(([key]) => React.createElement("button", { key, onClick:()=>setSel(key),
        style:{display:"block",width:"100%",textAlign:"left",background:sel===key?"var(--accent-dim)":"transparent",
          border:`1px solid ${sel===key?"var(--accent)":"var(--border-dim)"}`,borderRadius:"4px",padding:"8px 10px",
          marginBottom:"4px",color:sel===key?"var(--accent)":"var(--text-dim)",fontFamily:"'DM Mono',monospace",
          fontSize:"10px",cursor:"pointer"} },
        fmtDate(key)
      ))
    ),
    React.createElement("div", null,
      selData ? React.createElement("div", null,
        React.createElement("div", { style:{fontFamily:"'Archivo Black',sans-serif",fontSize:"16px",color:"var(--accent)",marginBottom:"16px"} }, fmtDate(sel)),
        allTiles.map(tile => {
          const td = selData[tile.id];
          if (!td) return null;
          return React.createElement("div", { key:tile.id, style:{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"5px",padding:"13px",marginBottom:"10px"} },
            React.createElement("div", { style:{fontFamily:"'Archivo Black',sans-serif",fontSize:"9px",letterSpacing:"2px",textTransform:"uppercase",color:"var(--text-muted)",marginBottom:"8px"} }, tile.config?.title||tile.id),
            // Render a readable summary based on tile type
            tile.type === "priorities" && React.createElement("div", null,
              (td.priorities||[]).filter(p=>p.text).map((p,i) =>
                React.createElement("div", { key:i, style:{color:p.done?"#4a7a4a":"#aaa",fontSize:"12px",marginBottom:"3px",textDecoration:p.done?"line-through":"none"} },
                  `${p.done?"✓":"○"} ${p.text}`)
              )
            ),
            tile.type === "textprompt" && td.text && React.createElement("div", { style:{color:"var(--text-dim)",fontSize:"12px",lineHeight:1.6} }, td.text),
            tile.type === "twoprompt" && React.createElement("div", null,
              td.textA && React.createElement("div", { style:{color:"var(--text-dim)",fontSize:"12px",marginBottom:"6px"} }, React.createElement("span", { style:{color:"var(--text-muted)"} }, `${tile.config.titleA}: `), td.textA),
              td.textB && React.createElement("div", { style:{color:"var(--text-dim)",fontSize:"12px"} }, React.createElement("span", { style:{color:"var(--text-muted)"} }, `${tile.config.titleB}: `), td.textB)
            ),
            (tile.type === "freelist" || tile.type === "project") && React.createElement("div", null,
              (td.items||[]).filter(x=>x).map((item,i) => React.createElement("div", { key:i, style:{color:"var(--text-dim)",fontSize:"12px",marginBottom:"2px"} }, `○ ${item}`))
            ),
            tile.type === "checkin" && React.createElement("div", null,
              React.createElement("div", { style:{color:"var(--text-dim)",fontSize:"12px",marginBottom:"4px"} },
                [td.planks&&"Planks ✓", td.food&&"Food ✓", td.priorities&&"Priorities ✓"].filter(Boolean).join("  ·  ")
              ),
              // #37 — emoji + paired text note side-by-side
              (td.feeling || td.feelingNote) && React.createElement("div", {
                style:{display:"flex",alignItems:"flex-start",gap:"8px",color:"var(--text-dim)",fontSize:"11px",fontStyle:"italic"}
              },
                td.feeling && React.createElement("span", { style:{fontSize:"16px",fontStyle:"normal",flexShrink:0,lineHeight:1.3} }, td.feeling),
                td.feelingNote && React.createElement("span", { style:{lineHeight:1.5} }, `"${td.feelingNote}"`)
              )
            ),
            ["checklist"].includes(tile.type) && React.createElement("div", null,
              tile.config.items?.map((item,i) =>
                React.createElement("div", { key:i, style:{color:(td.checks||[])[i]?"#4a7a4a":"#555",fontSize:"12px",marginBottom:"2px"} },
                  `${(td.checks||[])[i]?"✓":"○"} ${item}`)
              )
            )
          );
        })
      ) : React.createElement("div", { style:{color:"var(--text-faint)",fontFamily:"'DM Mono',monospace",fontSize:"12px",padding:"60px",textAlign:"center"} }, "← Select a day")
    )
  );
}

// ─── SYNC STATUS INDICATOR ────────────────────────────────────────────────────

function SyncDot({ status }) {
  const colors = { idle:"var(--text-faint)", saving:"#c8a96e", saved:"#4a7a4a", error:"#a04040", offline:"var(--text-muted)" };
  const labels = { idle:"", saving:"saving...", saved:"saved to Drive", error:"save failed", offline:"offline" };
  return React.createElement("div", { style:{display:"flex",alignItems:"center",gap:"5px",fontSize:"9px",color:"var(--text-muted)",letterSpacing:"0.5px"} },
    React.createElement("div", { style:{width:"6px",height:"6px",borderRadius:"50%",background:colors[status]||"var(--text-faint)",transition:"background 0.3s"} }),
    labels[status]
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

function App() {
  const [store, setStore]         = useState(null);
  const [authState, setAuthState] = useState("idle"); // idle | authing | authed | error
  const [authEpoch, setAuthEpoch] = useState(0); // bumps after each successful auth; calendar tile etc. watch this to re-fetch
  const [syncStatus, setSyncStatus] = useState("idle"); // idle | saving | saved | error | offline
  const [view, setView]           = useState("today");
  const [editMode, setEditMode]   = useState(false);
  const [configTile, setConfigTile] = useState(null);
  const [dragState, setDragState] = useState(null);
  const [theme, setTheme]         = useState(() => localStorage.getItem(THEME_KEY) || "dark");
  const saveTimer = useRef(null);
  const isAuthed = authState === "authed";

  // ── Theme ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);
  const toggleTheme = () => setTheme(t => t === "dark" ? "light" : "dark");

  // ── Auth ──────────────────────────────────────────────────────────────────

  // `force` = true means we want the consent dialog to actually appear
  // (e.g. user clicked "Re-authorize" because a needed scope is missing).
  // Without `prompt: "consent"`, Google will silently return whatever scopes
  // it already has on file, even if that's an incomplete subset of what we asked for.
  function initGoogleAuth(force = false) {
    if (!CLIENT_ID || CLIENT_ID === "YOUR_GOOGLE_CLIENT_ID_HERE") {
      setAuthState("no-config");
      return;
    }
    setAuthState("authing");
    try {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: async (resp) => {
          if (resp.error) {
            console.error("Google auth error:", resp.error, resp.error_description);
            setAuthState("error");
            return;
          }
          _token = resp.access_token;
          // Surface any missing scopes so the calendar tile can show a real error
          // instead of silently looping on 403.
          const granted = (resp.scope || "").split(" ").filter(Boolean);
          const requested = SCOPES.split(" ").filter(Boolean);
          const missing = requested.filter(s => !granted.includes(s));
          if (missing.length) {
            console.warn("OAuth token issued without requested scopes:", missing,
              "— check Google Cloud Console: enable the API and add the scope to your OAuth consent screen.");
          }
          window.__daymasterGrantedScopes = granted;
          setAuthState("authed");
          setAuthEpoch(e => e + 1);
          await syncDown();
        }
      });
      client.requestAccessToken({ prompt: force ? "consent" : "" });
    } catch(e) {
      console.error("Auth error", e);
      setAuthState("error");
    }
  }

  // ── Load ──────────────────────────────────────────────────────────────────

  async function syncDown() {
    // Try Drive first, fall back to localStorage
    try {
      const driveData = await loadFromDrive();
      if (driveData) {
        applyStore(driveData);
        return;
      }
    } catch(e) {
      console.warn("Drive load failed, using local", e);
    }
    // Fall back to localStorage
    const local = localStorage.getItem(LOCAL_KEY);
    applyStore(local ? JSON.parse(local) : emptyStore());
  }

  function applyStore(s) {
    // Run layout migrations (idempotent) for any features that reshape the default layout
    s = migrateLayout(s);
    // Day rollover
    const today = todayKey();
    if (!s.days) s.days = {};
    if (!s.days[today]) {
      s.days[today] = {};
      const keys = Object.keys(s.days).filter(k=>k!==today).sort().reverse();
      const yesterday = keys[0];
      if (yesterday) {
        const layout = s.layouts[s.activeLayout||"default"];
        const priTile = layout?.columns.flatMap(c=>c.tiles).find(t=>t.type==="priorities");
        if (priTile) {
          const yd = s.days[yesterday]?.[priTile.id];
          const carried = (yd?.priorities||[]).filter(p=>p.text&&!p.done);
          if (carried.length) s.days[today][priTile.id] = { priorities:carried.map(p=>({...p})), added:["","","",""], _type:"priorities", _carried:true };
        }
      }
    }
    setStore(s);
    if (window.__daymasterReady) window.__daymasterReady();
  }

  // On mount — load from localStorage immediately, then auth + sync Drive
  useEffect(() => {
    const local = localStorage.getItem(LOCAL_KEY);
    applyStore(local ? JSON.parse(local) : emptyStore());
    // Auto-init auth if Google API loaded
    const tryAuth = () => {
      if (window.google?.accounts?.oauth2 && CLIENT_ID && CLIENT_ID !== "YOUR_GOOGLE_CLIENT_ID_HERE") {
        initGoogleAuth();
      } else {
        setAuthState("no-config");
        if (window.__daymasterReady) window.__daymasterReady();
      }
    };
    // Give Google script a moment to load
    setTimeout(tryAuth, 1200);
  }, []);

  // ── Save (debounced) ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!store) return;
    // Always save to localStorage immediately
    localStorage.setItem(LOCAL_KEY, JSON.stringify(store));
    // Debounce Drive save by 2s
    if (!isAuthed) return;
    setSyncStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await saveToDrive(store);
        setSyncStatus("saved");
        setTimeout(()=>setSyncStatus("idle"), 3000);
      } catch(e) {
        console.error("Drive save failed", e);
        setSyncStatus("error");
      }
    }, 2000);
  }, [store, isAuthed]);

  // ── Store mutations ───────────────────────────────────────────────────────

  const updateTileData = useCallback((tileId, data) => {
    setStore(s => ({ ...s, days: { ...s.days, [todayKey()]: { ...s.days[todayKey()], [tileId]: data } } }));
  }, []);

  const mutateLayout = useCallback(fn => {
    setStore(s => {
      const layoutKey = s.activeLayout||"default";
      return { ...s, layouts: { ...s.layouts, [layoutKey]: fn(s.layouts[layoutKey]) } };
    });
  }, []);

  const removeTile = useCallback((colId, tileId) =>
    mutateLayout(l => ({ ...l, columns: l.columns.map(c => c.id===colId ? {...c, tiles:c.tiles.filter(t=>t.id!==tileId)} : c) })), []);

  const addTile = useCallback((colId, type) =>
    mutateLayout(l => ({ ...l, columns: l.columns.map(c => c.id===colId ? {...c, tiles:[...c.tiles, {id:uid(),type,config:defaultConfig(type)}]} : c) })), []);

  const saveTileConfig = useCallback((colId, tileId, cfg) =>
    mutateLayout(l => ({ ...l, columns: l.columns.map(c => c.id===colId ? {...c, tiles:c.tiles.map(t=>t.id===tileId?{...t,config:cfg}:t)} : c) })), []);

  const moveTile = useCallback((colId, from, to) =>
    mutateLayout(l => ({ ...l, columns: l.columns.map(c => {
      if (c.id!==colId) return c;
      const tiles=[...c.tiles]; const [t]=tiles.splice(from,1); tiles.splice(to,0,t); return {...c,tiles};
    })})), []);

  const moveTileAcross = useCallback((fromColId, tileId, toColId) =>
    mutateLayout(l => {
      let tile = null;
      const cols = l.columns.map(c => {
        if (c.id !== fromColId) return c;
        tile = c.tiles.find(t => t.id === tileId);
        return { ...c, tiles: c.tiles.filter(t => t.id !== tileId) };
      });
      return { ...l, columns: cols.map(c => {
        if (c.id !== toColId || !tile) return c;
        return { ...c, tiles: [...c.tiles, tile] };
      })};
    }), []);

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(store,null,2)],{type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=`daymaster-${todayKey()}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const importBackup = e => {
    const f = e.target.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = ev => { try { applyStore(JSON.parse(ev.target.result)); } catch { alert("Invalid backup file"); } };
    r.readAsText(f);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (!store) return React.createElement("div", { style:{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"var(--bg)",color:"var(--text-muted)",fontFamily:"monospace"} }, "Loading...");

  const layout = store.layouts[store.activeLayout||"default"];
  const todayData = store.days[todayKey()]||{};
  const d = new Date();

  const headerBtn = (label, onClick, active=false, extra={}) => React.createElement("button", {
    onClick,
    style:{background:active?"var(--accent-dim)":"var(--bg-hover)",border:`1px solid ${active?"var(--accent)":"var(--border)"}`,
      color:active?"var(--accent)":"var(--text-dim)",padding:"5px 12px",borderRadius:"4px",cursor:"pointer",
      fontFamily:"'DM Mono',monospace",fontSize:"10px",letterSpacing:"0.5px",...extra}
  }, label);

  return React.createElement("div", { style:{minHeight:"100vh",background:"var(--bg)",color:"var(--text)",fontFamily:"'DM Mono',monospace",fontSize:"12px"} },

    // GLOBAL STYLES — CSS variables drive both dark and light themes
    React.createElement("style", null, `
      @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Archivo+Black&family=Instrument+Serif:ital@0;1&display=swap');

      /* ── Dark theme (default) ── */
      :root, [data-theme="dark"] {
        --bg:           #0f0f0f;
        --bg-card:      #161616;
        --bg-header:    #0c0c0c;
        --bg-input:     transparent;
        --bg-hover:     #1a1a1a;
        --border:       #252525;
        --border-dim:   #1e1e1e;
        --border-head:  #1e1e1e;
        --text:         #e8e4dc;
        --text-dim:     #888;
        --text-muted:   #555;
        --text-faint:   #444;
        --text-xfaint:  #333;
        --accent:       #c8a96e;
        --accent-dim:   #c8a96e22;
        --scrollbar-track: #111;
        --scrollbar-thumb: #2a2a2a;
        --input-border: #222;
        --sep:          #222;
      }

      /* ── Light theme ── */
      [data-theme="light"] {
        --bg:           #f5f0e8;
        --bg-card:      #faf7f2;
        --bg-header:    #ede8de;
        --bg-input:     transparent;
        --bg-hover:     #f0ebe0;
        --border:       #d8cfc0;
        --border-dim:   #e0d8cc;
        --border-head:  #ccc4b4;
        --text:         #2a2520;
        --text-dim:     #6a5f50;
        --text-muted:   #8a7f70;
        --text-faint:   #a09080;
        --text-xfaint:  #b0a090;
        --accent:       #b08040;
        --accent-dim:   #b0804022;
        --scrollbar-track: #e8e0d0;
        --scrollbar-thumb: #c0b8a8;
        --input-border: #ccc4b4;
        --sep:          #d8d0c0;
      }

      *{box-sizing:border-box;margin:0;padding:0;}
      input,textarea,button{font-family:inherit;}
      input:focus,textarea:focus{outline:none;}
      textarea{display:block;overflow:hidden;resize:none;field-sizing:content;}
      ::-webkit-scrollbar{width:4px;height:4px;}
      ::-webkit-scrollbar-track{background:var(--scrollbar-track);}
      ::-webkit-scrollbar-thumb{background:var(--scrollbar-thumb);border-radius:2px;}
      .tile-hover{outline:2px dashed var(--accent)55!important;}

      /* ── Mobile layout ── */
      @media (max-width: 768px) {
        .dm-header {
          flex-wrap: wrap;
          padding: 10px 12px !important;
          gap: 8px;
        }
        .dm-header-date { display: none !important; }
        .dm-header-btns {
          flex-wrap: wrap;
          gap: 4px !important;
          width: 100%;
        }
        .dm-header-btns button,
        .dm-header-btns label {
          font-size: 9px !important;
          padding: 4px 8px !important;
        }
        .dm-grid {
          display: flex !important;
          flex-direction: column !important;
          gap: 12px !important;
        }
        .dm-col-left   { order: 2; }
        .dm-col-center { order: 1; }
        .dm-col-right  { order: 3; }
        .dm-main { padding: 10px !important; }
      }
    `),

    // HEADER
    React.createElement("div", { className:"dm-header", style:{background:"var(--bg-header)",borderBottom:"1px solid var(--border-head)",padding:"12px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:50} },
      React.createElement("div", { style:{display:"flex",alignItems:"center",gap:"12px"} },
        React.createElement("div", { style:{fontFamily:"'Archivo Black',sans-serif",fontSize:"20px",letterSpacing:"-0.5px"} },
          "Day", React.createElement("span", { style:{color:"var(--accent)"} }, "master")
        ),
        React.createElement(SyncDot, { status: isAuthed ? syncStatus : (authState==="no-config"?"offline":"idle") })
      ),
      React.createElement("div", { className:"dm-header-date", style:{fontFamily:"'Instrument Serif',serif",fontStyle:"italic",fontSize:"13px",color:"var(--text-muted)"} },
        `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
      ),
      React.createElement("div", { className:"dm-header-btns", style:{display:"flex",gap:"6px",alignItems:"center",flexWrap:"wrap"} },
        headerBtn("Today", ()=>setView("today"), view==="today"),
        headerBtn("History", ()=>setView("history"), view==="history"),
        React.createElement("div", { style:{width:"1px",height:"18px",background:"var(--sep)",margin:"0 2px"} }),
        headerBtn(editMode?"✓ Done":"✎ Layout", ()=>setEditMode(e=>!e), editMode,
          editMode?{background:"var(--accent)",color:"var(--bg)",border:"1px solid var(--accent)"}:{}),
        React.createElement("div", { style:{width:"1px",height:"18px",background:"var(--sep)",margin:"0 2px"} }),
        headerBtn(theme==="dark"?"☀ Light":"☾ Dark", toggleTheme),
        React.createElement("div", { style:{width:"1px",height:"18px",background:"var(--sep)",margin:"0 2px"} }),
        !isAuthed && authState!=="authing" && React.createElement("button", {
          onClick:initGoogleAuth,
          style:{background:"#1a2a1a",border:"1px solid #3a6a3a",color:"#7ac97a",padding:"5px 12px",borderRadius:"4px",cursor:"pointer",fontFamily:"'DM Mono',monospace",fontSize:"10px"}
        }, authState==="no-config"?"⚙ Add Client ID":"↻ Connect Drive"),
        authState==="authing" && React.createElement("span", { style:{color:"var(--text-muted)",fontSize:"10px"} }, "Connecting..."),
        headerBtn("⬇ Backup", exportBackup),
        React.createElement("label", { style:{background:"var(--bg-hover)",border:"1px solid var(--border)",color:"var(--text-dim)",padding:"5px 12px",borderRadius:"4px",cursor:"pointer",fontFamily:"'DM Mono',monospace",fontSize:"10px"} },
          "⬆ Restore",
          React.createElement("input", { type:"file", accept:".json", style:{display:"none"}, onChange:importBackup })
        )
      )
    ),

    // VIEWS
    view==="history" && React.createElement(HistoryView, { store }),

    view==="today" && React.createElement("div", { className:"dm-main", style:{padding:"16px"} },
      editMode && React.createElement(TileLibrary, { onAdd:addTile, columns:layout.columns }),

      React.createElement("div", { className:"dm-grid", style:{display:"grid",gridTemplateColumns:layout.columns.map(c=>`${c.width}fr`).join(" "),gap:"14px"} },
        layout.columns.map((col, colIdx) =>
          React.createElement("div", { key:col.id, className:`dm-col-${col.id.replace("col-","")}`,
            style:{display:"flex",flexDirection:"column",gap:"12px"},
            onDragOver: e => e.preventDefault(),
            onDrop: e => {
              e.preventDefault();
              if (!dragState) return;
              if (dragState.colId === col.id) {
                // same-column reorder — drop on column bg means move to end
                setDragState(null);
              } else {
                // cross-column drop
                moveTileAcross(dragState.colId, dragState.tileId, col.id);
                setDragState(null);
              }
            }
          },
            editMode && React.createElement("div", { style:{fontFamily:"'Archivo Black',sans-serif",fontSize:"8px",letterSpacing:"3px",textTransform:"uppercase",color:"var(--text-xfaint)",textAlign:"center",padding:"4px",border:"1px dashed var(--border-dim)",borderRadius:"4px"} }, col.id),
            col.tiles.map((tile, tileIdx) => {
              const isDragging = dragState?.colId===col.id && dragState?.tileIdx===tileIdx;
              const prevCol = colIdx > 0 ? layout.columns[colIdx-1] : null;
              const nextCol = colIdx < layout.columns.length-1 ? layout.columns[colIdx+1] : null;
              return React.createElement("div", { key:tile.id,
                draggable:editMode,
                onDragStart: () => setDragState({colId:col.id, tileIdx, tileId:tile.id}),
                onDragOver: e => e.preventDefault(),
                onDrop: e => {
                  e.stopPropagation();
                  if (!dragState) return;
                  if (dragState.colId === col.id && dragState.tileIdx !== tileIdx) {
                    moveTile(col.id, dragState.tileIdx, tileIdx);
                  } else if (dragState.colId !== col.id) {
                    moveTileAcross(dragState.colId, dragState.tileId, col.id);
                  }
                  setDragState(null);
                },
                style:{cursor:editMode?"grab":"default", opacity:isDragging?0.4:1, transition:"opacity 0.15s", position:"relative"} },
                // Cross-column arrow buttons in edit mode
                editMode && React.createElement("div", {
                  style:{position:"absolute",top:"7px",left:"7px",display:"flex",gap:"3px",zIndex:20}
                },
                  prevCol && React.createElement("button", {
                    onClick: e => { e.stopPropagation(); moveTileAcross(col.id, tile.id, prevCol.id); },
                    title: `Move to ${prevCol.id}`,
                    style:{background:"var(--bg-hover)",border:"1px solid var(--border)",color:"var(--text-dim)",
                      width:"20px",height:"20px",borderRadius:"3px",cursor:"pointer",fontSize:"11px",
                      lineHeight:"20px",textAlign:"center",padding:0}
                  }, "←"),
                  nextCol && React.createElement("button", {
                    onClick: e => { e.stopPropagation(); moveTileAcross(col.id, tile.id, nextCol.id); },
                    title: `Move to ${nextCol.id}`,
                    style:{background:"var(--bg-hover)",border:"1px solid var(--border)",color:"var(--text-dim)",
                      width:"20px",height:"20px",borderRadius:"3px",cursor:"pointer",fontSize:"11px",
                      lineHeight:"20px",textAlign:"center",padding:0}
                  }, "→")
                ),
                React.createElement(RenderTile, {
                  tile,
                  data: todayData[tile.id]||{},
                  onChange: data => updateTileData(tile.id, data),
                  editMode,
                  onRemove: () => removeTile(col.id, tile.id),
                  onConfig: () => setConfigTile({tile, colId:col.id}),
                  allDayData: todayData,
                  isAuthed,
                  authEpoch,
                  onReauth: () => initGoogleAuth(true),
                })
              );
            }),
            col.id === "col-left" && !editMode &&
              React.createElement(AddProjectButton, { colId: col.id, onAdd: addTile })
          )
        )
      )
    ),

    // CONFIG MODAL
    configTile && React.createElement(ConfigModal, {
      tile: configTile.tile,
      onSave: cfg => { saveTileConfig(configTile.colId, configTile.tile.id, cfg); setConfigTile(null); },
      onClose: () => setConfigTile(null)
    })
  );
}

// Mount
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(React.createElement(App));
