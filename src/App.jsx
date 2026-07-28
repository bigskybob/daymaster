// App shell: the App component — auth, store/sync, layout editing, and the
// header/grid render. Presentational pieces (modals, history, library, sync dot)
// live in ./ui/*; pure helpers in ./lib/*.
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { CLIENT_ID, LOCAL_KEY, THEME_KEY, FONT_KEY, BG_KEY, REMIND_KEY } from "./config.js";
import { useGoogleAuth } from "./lib/useGoogleAuth.js";
import { loadFromDrive, saveToDrive } from "./lib/drive.js";
import { emptyStore, migrateLayout, buildOnboardingLayout } from "./lib/store.js";
import { mergeStores } from "./lib/sync.js";
import { checkinIsDone, checkinFullyDone, checkinScheduleMin } from "./lib/rules.js";
import { DAYS, MONTHS, todayKey, uid } from "./lib/helpers.js";
import { THEMES, FONTS } from "./lib/themes.js";
import { tileComplete, tileTitle } from "./lib/tileStatus.js";
import { TILE_TYPES, defaultConfig, RenderTile } from "./tiles/registry.js";
import { AddProjectButton } from "./tiles.jsx";
import { Onboarding } from "./ui/Onboarding.jsx";
import { SyncDot } from "./ui/SyncDot.jsx";
import { IdeaCaptureModal } from "./ui/IdeaCaptureModal.jsx";
import { TileLibrary } from "./ui/TileLibrary.jsx";
import { LayoutPreview } from "./ui/LayoutPreview.jsx";
import { ConfigModal } from "./ui/ConfigModal.jsx";
import { HistoryView } from "./ui/HistoryView.jsx";
import { LinksModal } from "./ui/LinksModal.jsx";
import { TabsModal } from "./ui/TabsModal.jsx";
import { InstallHint } from "./ui/InstallHint.jsx";
import { ALL_TAB, visibleColumnsForTab, tabExists, withoutTab,
         activeTimeTab, hasTimeWindows, minutesNow, suggestTimeTabs } from "./lib/tabs.js";
import { workerConfigured } from "./lib/notion.js";
import { APP_VERSION, BUILD_DATE } from "./version.js";

// Stable empty array so tiles don't re-render on every parent render when a layout
// has no field-links defined.
const EMPTY_LINKS = [];


// ─── MAIN APP ─────────────────────────────────────────────────────────────────

function App() {
  const [store, setStore]         = useState(null);
  // Google OAuth lifecycle lives in useGoogleAuth; the post-auth load (syncDown,
  // hoisted below) is injected so the hook stays free of store/sync concerns.
  const { authState, authEpoch, isAuthed, setAuthState, initGoogleAuth, signOut } =
    useGoogleAuth({ onAuthed: () => syncDown() });
  const [syncStatus, setSyncStatus] = useState("idle"); // idle | saving | saved | error | offline
  const [view, setView]           = useState("today");
  const [editMode, setEditMode]   = useState(false);
  const [configTile, setConfigTile] = useState(null);
  const [showLinks, setShowLinks] = useState(false); // field-links manager (Phase C)
  const [showTabs, setShowTabs]   = useState(false); // #84 — header-tabs manager
  // #84/#87 — header tabs. `activeTab` is the *manual* selection only: null means
  // "follow the clock", so a time-windowed tab (#87) can drive the view until the
  // user taps something. `tabNow` is the current minute, re-read on a ticker.
  const [activeTab, setActiveTab] = useState(null);
  const [tabNow, setTabNow]       = useState(() => minutesNow());
  const [dragState, setDragState] = useState(null);
  const [theme, setTheme]         = useState(() => localStorage.getItem(THEME_KEY) || "dark");
  const [font, setFont]           = useState(() => localStorage.getItem(FONT_KEY) || "mono"); // #60
  const [bg, setBgState]          = useState(() => localStorage.getItem(BG_KEY) || ""); // #25
  const setBg = (url) => {
    const v = (url || "").trim();
    setBgState(v);
    if (v) localStorage.setItem(BG_KEY, v); else localStorage.removeItem(BG_KEY);
  };
  // #35 — per-column reveal of past-due check-in blocks, plus a minute ticker so
  // staleness re-evaluates as the day rolls on without needing a user interaction.
  const [showStale, setShowStale] = useState({});
  const [clock, setClock]         = useState(0);
  const [ideaCapture, setIdeaCapture] = useState(false); // #40 — Notion idea capture modal
  const [focusMode, setFocusMode] = useState(false);     // #2/#54 — collapse completed tiles
  const [focusExpanded, setFocusExpanded] = useState({}); // per-tile manual expand override
  const [remind, setRemind]       = useState(() => localStorage.getItem(REMIND_KEY) === "1"); // #14
  const firedRef = useRef(new Set());                    // #14 — reminders already fired today
  const saveTimer = useRef(null);
  // #61 — first-run onboarding (Phase 2). `onboarding` overlays the guided interview;
  // `firstRunRef` remembers whether localStorage was pristine at mount (captured before
  // the save effect writes the store), so syncDown can tell a brand-new profile from a
  // returning Drive user whose local cache is empty.
  const [onboarding, setOnboarding] = useState(false);
  const firstRunRef = useRef(false);
  // #53 — gate the debounced Drive save until the first post-auth load (syncDown)
  // has merged in the remote. Without it, a fresh/cleared local cache writes an
  // empty store that can overwrite good Drive data in the window between auth
  // completing and that first load finishing (cross-device "went blank" bug).
  const syncedDownRef = useRef(false);
  // #61 — edit-mode "add tile" feedback: the just-added tile lands at the bottom of
  // a column (far down on stacked mobile) with no visible cue. Track it to scroll +
  // highlight + toast. And a one-time post-onboarding banner orienting to layout edit.
  const [justAdded, setJustAdded]         = useState(null); // { id, label, colId }
  const [showLayoutTip, setShowLayoutTip] = useState(false);

  // #35 — re-render every minute so check-in blocks become stale on schedule.
  useEffect(() => {
    const id = setInterval(() => setClock(c => c + 1), 60000);
    return () => clearInterval(id);
  }, []);

  // #14 — opt-in reminders: ~10 min before each not-yet-done check-in's scheduled
  // (delay-adjusted) time, fire a browser notification once. Runs on the minute tick.
  useEffect(() => {
    if (!remind || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const lay = store.layouts[store.activeLayout || "default"];
    if (!lay) return;
    const today = todayKey();
    const data = store.days[today] || {};
    const d = new Date();
    const nowMin = d.getHours() * 60 + d.getMinutes();
    for (const col of lay.columns) for (const t of (col.tiles || [])) {
      if (t.type !== "checkin") continue;
      // #61 — per-check-in opt-in: onboarding-seeded tiles carry notify:true|false.
      // Legacy tiles have no flag → keep the pre-#61 behavior (fire when remind is on).
      if (t.config?.notify === false) continue;
      const sched = checkinScheduleMin(t.config);
      if (sched == null) continue;
      const eff = sched + ((data[t.id]?._delayMin) || 0);
      const key = `${today}:${t.id}`;
      const due = nowMin >= eff - 10 && nowMin <= eff;
      if (due && !firedRef.current.has(key) && !checkinIsDone(t.config, data[t.id] || {}, data)) {
        firedRef.current.add(key);
        try { new Notification(`Daymaster — ${t.config.title} check-in`, { body: "Coming up in ~10 minutes.", tag: key }); } catch {}
      }
    }
  }, [clock, remind, store]);

  const toggleRemind = async () => {
    if (remind) { setRemind(false); localStorage.removeItem(REMIND_KEY); return; }
    if (typeof Notification === "undefined") return;
    let perm = Notification.permission;
    if (perm !== "granted") { try { perm = await Notification.requestPermission(); } catch { return; } }
    if (perm === "granted") { setRemind(true); localStorage.setItem(REMIND_KEY, "1"); }
  };

  // ── Theme ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);
  // #60 — apply selected font style to documentElement (drives --font-* vars).
  useEffect(() => {
    document.documentElement.setAttribute("data-font", font);
    localStorage.setItem(FONT_KEY, font);
  }, [font]);

  // ── Load ──────────────────────────────────────────────────────────────────

  async function syncDown() {
    // #53 Phase 1 — merge Drive with any locally-cached store rather than letting
    // Drive blindly overwrite unsynced local edits made before auth completed.
    let localStore = null;
    try { const raw = localStorage.getItem(LOCAL_KEY); if (raw) localStore = JSON.parse(raw); } catch {}
    try {
      const driveData = await loadFromDrive();
      if (driveData) {
        applyStore(localStore ? mergeStores(localStore, driveData) : driveData);
        return;
      }
    } catch(e) {
      console.warn("Drive load failed, using local", e);
    } finally {
      // Remote has now been loaded+merged (or its load failed and we fall back to
      // local) — either way it's safe to let the debounced Drive save run. This runs
      // in the same synchronous turn as the applyStore() calls (before React flushes
      // the resulting save effect), so that effect already sees the gate open.
      syncedDownRef.current = true;
    }
    // #61 — true first run: no Drive store AND the profile was pristine at mount.
    // Route to the onboarding interview instead of silently seeding the default
    // layout. (firstRunRef, not a fresh localStorage read — the mount save effect
    // has already written LOCAL_KEY by now.)
    if (firstRunRef.current && !localStore) setOnboarding(true);
    // Fall back to localStorage
    applyStore(localStore || emptyStore());
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
        // ── SHELVED 2026-05-20 — Both carry-forwards (priorities + #27 check-in items) ──
        // Each new day starts clear. Pull-forward semantics are awaiting revision per owner.
        // To restore the prior behavior verbatim, remove the /* */ around the block below.
        // Tickets: pre-existing priorities carry-forward (no ticket) + #27 check-in items.
        /*
        // #33 — carry-forward should work regardless of which preset is active.
        // Union tiles across all layouts (deduped by id, first wins) so switching
        // between Daily / AM Focus / etc. doesn't break the rollover.
        const tilesById = {};
        for (const lk of Object.keys(s.layouts || {})) {
          for (const col of s.layouts[lk]?.columns || []) {
            for (const t of col.tiles || []) if (!tilesById[t.id]) tilesById[t.id] = t;
          }
        }

        // Priorities carry-forward (pre-existing behaviour, now layout-agnostic).
        const priTile = Object.values(tilesById).find(t => t.type === "priorities");
        if (priTile) {
          const yd = s.days[yesterday]?.[priTile.id];
          const carried = (yd?.priorities||[]).filter(p=>p.text&&!p.done);
          if (carried.length) s.days[today][priTile.id] = { priorities:carried.map(p=>({...p})), added:["","","",""], _type:"priorities", _carried:true };
        }

        // #27 — check-in next-priorities items get the same _carried treatment as
        // the priorities tile. Each check-in's undone {text,done} items from yesterday
        // pre-fill today's same-id check-in. Items get done:false on carry. Items
        // with empty text are dropped. Legacy string items are upgraded to {text,done}.
        for (const tile of Object.values(tilesById)) {
          if (tile.type !== "checkin") continue;
          if (s.days[today][tile.id]) continue; // user already touched / something else seeded it
          const yd = s.days[yesterday]?.[tile.id];
          const ydItems = yd?.items || [];
          const carriedItems = ydItems
            .map(it => typeof it === "string" ? { text: it, done: false } : (it || { text: "", done: false }))
            .filter(it => it.text?.trim() && !it.done)
            .map(it => ({ text: it.text, done: false }));
          if (carriedItems.length) {
            s.days[today][tile.id] = { items: carriedItems, _type: "checkin", _carried: true };
          }
        }
        */
      }
    }
    setStore(s);
    if (window.__daymasterReady) window.__daymasterReady();
  }

  // On mount — load from localStorage immediately, then auth + sync Drive
  useEffect(() => {
    const local = localStorage.getItem(LOCAL_KEY);
    // #61 — remember the pristine state BEFORE applyStore triggers the save effect
    // (which writes LOCAL_KEY). Used by syncDown to detect a true first run.
    firstRunRef.current = !local;
    // #61 — ?onboarding=1 forces/replays the guided interview anytime, for internal
    // testing, regardless of stored state. We still apply the underlying store so a
    // skip/finish reveals the real layout and the splash dismisses.
    if (new URLSearchParams(window.location.search).get("onboarding") === "1") setOnboarding(true);
    // Guard the parse: a corrupt/partial local cache must not throw here, which
    // would abort the effect before applyStore dismisses the loading splash —
    // bricking the app at "Loading…". Fall back to a fresh store; the Drive
    // resync on auth restores the real data.
    let localStore = null;
    if (local) {
      try { localStore = JSON.parse(local); }
      catch (e) { console.warn("Local store cache is corrupt — ignoring it", e); }
    }
    applyStore(localStore || emptyStore());
    // Auto-init auth if Google API loaded
    const tryAuth = () => {
      if (window.google?.accounts?.oauth2 && CLIENT_ID && CLIENT_ID !== "YOUR_GOOGLE_CLIENT_ID_HERE") {
        initGoogleAuth();
      } else {
        // No Google config → can't check Drive; a pristine profile still onboards.
        if (firstRunRef.current) setOnboarding(true);
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
    // Debounce Drive save by 2s — but only once the first post-auth load has merged
    // in the remote (#53). Saving before that can push an empty/stale local store
    // over good Drive data. localStorage above is unconditional, so nothing is lost.
    if (!isAuthed || !syncedDownRef.current) return;
    setSyncStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        // #53 Phase 1 — if the save reconciled a concurrent edit from another
        // device, adopt the merged result so this device shows the union too.
        const merged = await saveToDrive(store);
        if (merged) setStore(merged);
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
    // #53 Phase 1 — stamp the day's __mtime so cross-device merges can pick the
    // freshest copy of a contested day.
    const k = todayKey();
    setStore(s => ({ ...s, days: { ...s.days, [k]: { ...s.days[k], [tileId]: data, __mtime: Date.now() } } }));
  }, []);

  const mutateLayout = useCallback(fn => {
    setStore(s => {
      const layoutKey = s.activeLayout||"default";
      return { ...s, layouts: { ...s.layouts, [layoutKey]: fn(s.layouts[layoutKey]) } };
    });
  }, []);

  const removeTile = useCallback((colId, tileId) =>
    mutateLayout(l => ({ ...l, columns: l.columns.map(c => c.id===colId ? {...c, tiles:c.tiles.filter(t=>t.id!==tileId)} : c) })), []);

  const addTile = useCallback((colId, type) => {
    const id = uid();
    mutateLayout(l => ({ ...l, columns: l.columns.map(c => c.id===colId ? {...c, tiles:[...c.tiles, {id,type,config:defaultConfig(type)}]} : c) }));
    // #61 — signal the new tile so the render can scroll/highlight it + toast.
    setJustAdded({ id, label: TILE_TYPES[type]?.label || type, colId });
  }, []);

  const saveTileConfig = useCallback((colId, tileId, cfg) =>
    mutateLayout(l => ({ ...l, columns: l.columns.map(c => c.id===colId ? {...c, tiles:c.tiles.map(t=>t.id===tileId?{...t,config:cfg}:t)} : c) })), []);

  // Field-links (Phase C) — auto-check links live on the active layout.
  const addLink    = useCallback(link => mutateLayout(l => ({ ...l, links: [...(l.links||[]), link] })), []);
  const removeLink = useCallback(idx  => mutateLayout(l => ({ ...l, links: (l.links||[]).filter((_, i) => i !== idx) })), []);

  // #84 — header tabs (named module sets) live on the active layout (layout.tabs);
  // a tile's tab is stored in its config.tab. Removing a tab also clears it off any
  // tile (withoutTab) and resets the view to All if it was the one showing.
  const addTab    = useCallback(name => mutateLayout(l => ({ ...l, tabs: [...(l.tabs||[]), { id: "tab-"+uid().slice(0,6), name }] })), []);
  const renameTab = useCallback((id, name) => mutateLayout(l => ({ ...l, tabs: (l.tabs||[]).map(t => t.id===id ? { ...t, name } : t) })), []);
  const removeTab = useCallback(id => { mutateLayout(l => withoutTab(l, id)); setActiveTab(a => a===id ? null : a); }, []);
  // #87 — a tab's optional time window ({start,end} as "HH:MM"); "" on either
  // clears it back to a manual-only tab.
  const setTabWindow = useCallback((id, patch) =>
    mutateLayout(l => ({ ...l, tabs: (l.tabs||[]).map(t => t.id===id ? { ...t, ...patch } : t) })), []);
  // #87 — seed Morning/Midday/Evening and sort every tile into one, as a starting
  // point to tune. No-ops on a layout that already has tabs.
  const suggestTabs = useCallback(() => mutateLayout(l => suggestTimeTabs(l)), []);
  const assignTileTab = useCallback((colId, tileId, tabId) =>
    mutateLayout(l => ({ ...l, columns: l.columns.map(c => c.id===colId ? { ...c, tiles: c.tiles.map(t => t.id===tileId ? { ...t, config: { ...t.config, tab: tabId } } : t) } : c) })), []);

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

  // #33 — layout management. Presets live in store.layouts; activeLayout selects one.
  // Switch / Duplicate / Rename / Delete / New. Keys are derived from names but
  // stay stable thereafter (rename only changes display name). At least one
  // layout must remain; deleting the last falls back to seeding `default`.
  const switchLayout = useCallback((key) => {
    setStore(s => {
      if (!s.layouts?.[key]) return s;
      return { ...s, activeLayout: key };
    });
  }, []);

  const keyFromName = (name) => {
    const base = (name||"").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return (base || "layout") + "-" + uid().slice(0, 4);
  };

  const duplicateLayout = useCallback(() => {
    setStore(s => {
      const srcKey = s.activeLayout || "default";
      const src = s.layouts?.[srcKey];
      if (!src) return s;
      const proposed = window.prompt("Name for the duplicate:", `${src.name || srcKey} copy`);
      if (!proposed) return s;
      const newKey = keyFromName(proposed);
      const clone = JSON.parse(JSON.stringify(src));
      clone.name = proposed;
      return { ...s, layouts: { ...s.layouts, [newKey]: clone }, activeLayout: newKey };
    });
  }, []);

  const renameLayout = useCallback(() => {
    setStore(s => {
      const key = s.activeLayout || "default";
      const cur = s.layouts?.[key];
      if (!cur) return s;
      const proposed = window.prompt("Rename layout:", cur.name || key);
      if (!proposed || proposed === cur.name) return s;
      return { ...s, layouts: { ...s.layouts, [key]: { ...cur, name: proposed } } };
    });
  }, []);

  const deleteLayout = useCallback(() => {
    setStore(s => {
      const key = s.activeLayout || "default";
      const keys = Object.keys(s.layouts || {});
      if (keys.length <= 1) { alert("Can't delete the last layout — create another one first."); return s; }
      const cur = s.layouts[key];
      if (!window.confirm(`Delete layout "${cur?.name || key}"?\n\nYour per-day data stays. The tiles in this layout disappear from your sidebar; switch back to another layout to see them.`)) return s;
      const nextLayouts = { ...s.layouts };
      delete nextLayouts[key];
      const nextActive = Object.keys(nextLayouts)[0];
      return { ...s, layouts: nextLayouts, activeLayout: nextActive };
    });
  }, []);

  const newLayout = useCallback(() => {
    setStore(s => {
      const proposed = window.prompt("New layout name:", "Untitled");
      if (!proposed) return s;
      const newKey = keyFromName(proposed);
      const empty = { name: proposed, columns: [
        { id: "col-left",   width: 22, tiles: [] },
        { id: "col-center", width: 44, tiles: [] },
        { id: "col-right",  width: 24, tiles: [] },
      ]};
      return { ...s, layouts: { ...s.layouts, [newKey]: empty }, activeLayout: newKey };
    });
  }, []);

  // #61 — once a tile is added, scroll it into view + flash a highlight, then clear
  // (also drops the confirmation toast). The brief delay lets React commit the new tile.
  useEffect(() => {
    if (!justAdded) return;
    const scroll = setTimeout(() => {
      try {
        const el = document.querySelector(`[data-tile-id="${justAdded.id}"]`);
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {}
    }, 60);
    const clear = setTimeout(() => setJustAdded(null), 2400);
    return () => { clearTimeout(scroll); clearTimeout(clear); };
  }, [justAdded]);

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(store,null,2)],{type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=`daymaster-${todayKey()}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const importBackup = e => {
    const f = e.target.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = ev => {
      try {
        const imported = JSON.parse(ev.target.result);
        // A Restore is a deliberate, authoritative action: stamp it as the newest
        // write so the cross-device merge (mergeStores picks layouts by __savedAt)
        // can't let an older-but-wrong store — e.g. a layout from a more recent bad
        // save — win on the next sync. Without this, restoring a backup older than
        // the bad save brings history back (days union) but not the layout.
        imported.__savedAt = Date.now();
        applyStore(imported);
      } catch { alert("Invalid backup file"); }
    };
    r.readAsText(f);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  // #49 — tilesById is the lookup the tile-event rule type uses to resolve a
  // source tile's CURRENT type. Must be declared BEFORE the early-return below
  // (Rules of Hooks: hook count must be stable across renders).
  // Uses optional-chaining so it's safe to call when store is still null on
  // first render; on later renders the proper layout object flows in.
  const layoutKey = store?.activeLayout || "default";
  const layout    = store?.layouts?.[layoutKey] || (store && store.layouts ? store.layouts[Object.keys(store.layouts)[0]] : null);
  const tilesById = React.useMemo(() => {
    const map = {};
    for (const col of layout?.columns || []) for (const t of col.tiles || []) map[t.id] = t;
    return map;
  }, [layout]);

  // #87 — time-relevant tabs. A tab carrying a start/end window is auto-selected
  // while the clock sits inside it, condensing the board to just what's relevant
  // now. Declared here (with tilesById) so the hook count stays stable across the
  // early returns below.
  const timeTabbed = hasTimeWindows(layout?.tabs);

  // Re-read the clock on a 30s ticker while any tab is windowed. Deliberately an
  // interval rather than a timeout aimed at the next boundary: a phone that sleeps
  // through a boundary never fires the timeout on time, but the next tick after
  // wake still lands on the right window. Layouts with no windows never tick.
  useEffect(() => {
    if (!timeTabbed) return;
    const id = setInterval(() => setTabNow(minutesNow()), 30000);
    return () => clearInterval(id);
  }, [timeTabbed]);

  const autoTabId = useMemo(
    () => activeTimeTab(layout?.tabs, tabNow)?.id || null, [layout?.tabs, tabNow]);

  // Manual selection wins *until the next window boundary* — when the clock's
  // answer changes, the override is dropped and time takes back over. That's what
  // keeps an app left open all day from getting stuck on a stale tab.
  const prevAutoTabRef = useRef(autoTabId);
  useEffect(() => {
    if (prevAutoTabRef.current === autoTabId) return;
    prevAutoTabRef.current = autoTabId;
    setActiveTab(null);
  }, [autoTabId]);

  // #61 — Beta Onboarding (Phase 2). Overlays the guided interview for a true first
  // run, when forced via ?onboarding=1, or from the in-app "Re-run setup" entry.
  // Commit-on-finish: only Finish seeds + persists (applyStore → save effect). Skip
  // and Back never write. On a RETURNING user (localStorage wasn't pristine at mount)
  // Finish is non-destructive — buildOnboardingLayout preserves all history + layouts
  // and adds a seeded "setup" layout. Only a true first run seeds straight to default.
  if (onboarding) return React.createElement(Onboarding, {
    onComplete: (answers) => {
      const base = firstRunRef.current ? null : store;
      applyStore(buildOnboardingLayout(answers, base));
      setOnboarding(false); setShowLayoutTip(true);
    },
    onSkip: () => setOnboarding(false),
    // #61 — the optional Connect step wires to the app's existing Google auth.
    onConnect: () => initGoogleAuth(),
    connected: isAuthed,
    authState,
  });

  if (!store) return React.createElement("div", { style:{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"var(--bg)",color:"var(--text-muted)",fontFamily:"monospace"} }, "Loading...");

  const todayData = store.days[todayKey()]||{};
  const allLayoutEntries = Object.entries(store.layouts || {});
  const d = new Date();

  // #84 — header tabs filter the grid in view mode. Fall back to "All" when the
  // active tab was deleted or belongs to a different layout preset. Edit mode always
  // shows every tile (tabs are assigned per tile via the ⊞ Tabs modal).
  const layoutTabs   = layout.tabs || [];
  // #87 — a manual tap wins, but only while it still points at a tab on THIS
  // layout; a tab that was deleted or belongs to another preset hands control
  // back to the clock rather than pinning the view to a dead id.
  const manualTab    = activeTab !== null && (activeTab === ALL_TAB || tabExists(layout, activeTab)) ? activeTab : null;
  const desiredTab   = manualTab !== null ? manualTab : (autoTabId || ALL_TAB);
  const effectiveTab = tabExists(layout, desiredTab) ? desiredTab : ALL_TAB;
  const renderColumns = !editMode ? visibleColumnsForTab(layout.columns, effectiveTab) : layout.columns;

  // #72 — pull `title` out of extra so it lands on the button as a real tooltip
  // attribute (it was being spread into `style`, so hover tooltips never showed).
  const headerBtn = (label, onClick, active=false, extra={}) => {
    const { title, ...styleExtra } = extra;
    return React.createElement("button", {
      onClick, title,
      style:{background:active?"var(--accent-dim)":"var(--bg-hover)",border:`1px solid ${active?"var(--accent)":"var(--border)"}`,
        color:active?"var(--accent)":"var(--text-dim)",padding:"5px 12px",borderRadius:"4px",cursor:"pointer",
        fontFamily:"var(--font-body)",fontSize:"10px",letterSpacing:"0.5px",...styleExtra}
    }, label);
  };

  return React.createElement("div", { style:{minHeight:"100vh",
      // #25 — optional background image (dimmed scrim keeps tiles readable).
      background: bg ? `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url("${bg}") center / cover fixed` : "var(--bg)",
      color:"var(--text)",fontFamily:"var(--font-body)",fontSize:"12px"} },

    // GLOBAL STYLES — CSS variables drive both dark and light themes
    React.createElement("style", null, `
      @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Archivo+Black&family=Instrument+Serif:ital@0;1&family=Inter:wght@400;700&family=Lora:wght@400;600&family=Playfair+Display:wght@600&family=Quicksand:wght@400;600&family=Roboto+Slab:wght@400;700&display=swap');

      /* ── Fonts (#60): --font-body / --font-display default to Mono; [data-font] overrides ── */
      :root {
        --font-body:    'DM Mono', monospace;
        --font-display: 'Archivo Black', sans-serif;
      }
      [data-font="sans"]    { --font-body: 'Inter', sans-serif;        --font-display: 'Inter', sans-serif; }
      [data-font="serif"]   { --font-body: 'Lora', Georgia, serif;     --font-display: 'Playfair Display', serif; }
      [data-font="rounded"] { --font-body: 'Quicksand', sans-serif;    --font-display: 'Quicksand', sans-serif; }
      [data-font="slab"]    { --font-body: 'Roboto Slab', serif;       --font-display: 'Roboto Slab', serif; }

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

      /* ── Forest theme (#59) ── */
      [data-theme="forest"] {
        --bg:           #0d130d;
        --bg-card:      #141a13;
        --bg-header:    #0a0f0a;
        --bg-input:     transparent;
        --bg-hover:     #182018;
        --border:       #243024;
        --border-dim:   #1c261c;
        --border-head:  #1c261c;
        --text:         #dde8d8;
        --text-dim:     #84927e;
        --text-muted:   #5a6a55;
        --text-faint:   #455444;
        --text-xfaint:  #344433;
        --accent:       #8fc46e;
        --accent-dim:   #8fc46e22;
        --scrollbar-track: #101610;
        --scrollbar-thumb: #2a342a;
        --input-border: #223022;
        --sep:          #223022;
      }

      /* ── Desert theme (#59) ── */
      [data-theme="desert"] {
        --bg:           #f2e9d8;
        --bg-card:      #f8f1e3;
        --bg-header:    #ebe0cb;
        --bg-input:     transparent;
        --bg-hover:     #ede2cf;
        --border:       #d8c6a4;
        --border-dim:   #e2d4ba;
        --border-head:  #ccb892;
        --text:         #3a2f1e;
        --text-dim:     #7a6648;
        --text-muted:   #9a8868;
        --text-faint:   #b09a78;
        --text-xfaint:  #c4b090;
        --accent:       #c2682a;
        --accent-dim:   #c2682a22;
        --scrollbar-track: #e8dcc4;
        --scrollbar-thumb: #cbb894;
        --input-border: #ccb892;
        --sep:          #d8c8a8;
      }

      /* ── Ocean theme (#59) ── */
      [data-theme="ocean"] {
        --bg:           #0a1018;
        --bg-card:      #0f1722;
        --bg-header:    #070d14;
        --bg-input:     transparent;
        --bg-hover:     #131e2b;
        --border:       #1f2e3f;
        --border-dim:   #16212d;
        --border-head:  #16212d;
        --text:         #dbe7f0;
        --text-dim:     #7a8a9a;
        --text-muted:   #56697a;
        --text-faint:   #445566;
        --text-xfaint:  #344452;
        --accent:       #54b0d6;
        --accent-dim:   #54b0d622;
        --scrollbar-track: #0c141c;
        --scrollbar-thumb: #243444;
        --input-border: #1c2c3c;
        --sep:          #1c2c3c;
      }

      /* ── #74 throwback / novelty palettes ── */

      /* Cherry Blossom — soft sakura pink (light) */
      [data-theme="cherry"] {
        --bg:#fbeef3; --bg-card:#fff6fa; --bg-header:#f4dde7; --bg-input:transparent; --bg-hover:#f7e7ee;
        --border:#e6c4d3; --border-dim:#f0d6e1; --border-head:#dfb9c9;
        --text:#48283a; --text-dim:#8a6577; --text-muted:#a98598; --text-faint:#c6a8b6; --text-xfaint:#dbc2cd;
        --accent:#d96a92; --accent-dim:#d96a9222;
        --scrollbar-track:#f1dbe4; --scrollbar-thumb:#dcb2c5; --input-border:#dfb9c9; --sep:#eed2dd;
      }

      /* Sky Blue — airy daytime blue (light) */
      [data-theme="skyblue"] {
        --bg:#e7f2fb; --bg-card:#f3f9ff; --bg-header:#d6e8f6; --bg-input:transparent; --bg-hover:#e0eef8;
        --border:#a8cce8; --border-dim:#c9e0f1; --border-head:#97c0e0;
        --text:#152f3f; --text-dim:#4a6f88; --text-muted:#6a90a8; --text-faint:#92b4cc; --text-xfaint:#b1cce0;
        --accent:#2b8fd6; --accent-dim:#2b8fd622;
        --scrollbar-track:#d8eaf6; --scrollbar-thumb:#a8cce8; --input-border:#97c0e0; --sep:#cce2f2;
      }

      /* Luck of the Irish — deep emerald + shamrock (dark) */
      [data-theme="irish"] {
        --bg:#0a160c; --bg-card:#122014; --bg-header:#07110a; --bg-input:transparent; --bg-hover:#16281a;
        --border:#1f3a26; --border-dim:#182e1e; --border-head:#182e1e;
        --text:#dbeede; --text-dim:#7ea286; --text-muted:#54705a; --text-faint:#3e5444; --text-xfaint:#2e3e33;
        --accent:#3fb950; --accent-dim:#3fb95022;
        --scrollbar-track:#0c160e; --scrollbar-thumb:#1f3a26; --input-border:#1d3624; --sep:#182e1e;
      }

      /* Eagle Eye — dark slate with a sharp amber gaze */
      [data-theme="eagle"] {
        --bg:#14110c; --bg-card:#1d1810; --bg-header:#0f0c08; --bg-input:transparent; --bg-hover:#241d12;
        --border:#3a2e1a; --border-dim:#2a2212; --border-head:#2a2212;
        --text:#ece4d2; --text-dim:#a89272; --text-muted:#786448; --text-faint:#564732; --text-xfaint:#3c3122;
        --accent:#d9a528; --accent-dim:#d9a52822;
        --scrollbar-track:#100d09; --scrollbar-thumb:#3a2e1a; --input-border:#34291a; --sep:#2a2212;
      }

      /* Lumberjack — flannel red on near-black (dark) */
      [data-theme="lumber"] {
        --bg:#1a1212; --bg-card:#241818; --bg-header:#140d0d; --bg-input:transparent; --bg-hover:#2a1c1c;
        --border:#5a2424; --border-dim:#3a1e1e; --border-head:#3a1e1e;
        --text:#e8ddd2; --text-dim:#b08878; --text-muted:#7a5a50; --text-faint:#564038; --text-xfaint:#3e2e28;
        --accent:#c0392b; --accent-dim:#c0392b22;
        --scrollbar-track:#160f0f; --scrollbar-thumb:#3a2424; --input-border:#4a2020; --sep:#3a1e1e;
      }

      /* Ketchup / Mustard — bun-cream with ketchup-red accent */
      [data-theme="ketchup"] {
        --bg:#f3e9d2; --bg-card:#faf2e0; --bg-header:#ecdfc2; --bg-input:transparent; --bg-hover:#efe6cf;
        --border:#c9a35a; --border-dim:#ddc890; --border-head:#bf9748;
        --text:#3a2410; --text-dim:#7a5a30; --text-muted:#9a7a50; --text-faint:#b89a6a; --text-xfaint:#ccb488;
        --accent:#c0392b; --accent-dim:#c0392b22;
        --scrollbar-track:#e8dcc0; --scrollbar-thumb:#d4a017; --input-border:#bf9748; --sep:#ddc890;
      }

      /* Hot Dog Stand — the authentic Windows 3.1 scheme: bright red + yellow + black */
      [data-theme="hotdog"] {
        --bg:#c20000; --bg-card:#e00000; --bg-header:#9c0000; --bg-input:transparent; --bg-hover:#d41414;
        --border:#ffe000; --border-dim:#a83030; --border-head:#ffd000;
        --text:#ffffff; --text-dim:#ffe45a; --text-muted:#ffd23c; --text-faint:#ffb4a4; --text-xfaint:#e08a78;
        --accent:#ffe000; --accent-dim:#ffe00033;
        --scrollbar-track:#9c0000; --scrollbar-thumb:#ffd000; --input-border:#ffe000; --sep:#ffd000;
      }

      /* ── #76 authentic Windows 3.1 stock schemes ── */

      /* Windows Default — the signature teal desktop + silver window + navy highlight */
      [data-theme="win31"] {
        --bg:#008080; --bg-card:#d6d6d6; --bg-header:#bfbfbf; --bg-input:transparent; --bg-hover:#cacaca;
        --border:#808080; --border-dim:#a4a4a4; --border-head:#808080;
        --text:#0a0a0a; --text-dim:#3a3a4a; --text-muted:#5a5a6a; --text-faint:#7a7a8a; --text-xfaint:#9a9aaa;
        --accent:#000080; --accent-dim:#00008022;
        --scrollbar-track:#c0c0c0; --scrollbar-thumb:#808080; --input-border:#808080; --sep:#a8a8a8;
      }

      /* Bordeaux — deep wine desktop with magenta/pink (dark) */
      [data-theme="bordeaux"] {
        --bg:#2a0a24; --bg-card:#3a1234; --bg-header:#220a1e; --bg-input:transparent; --bg-hover:#46183e;
        --border:#5e2452; --border-dim:#42183a; --border-head:#42183a;
        --text:#f0dceb; --text-dim:#c08fb4; --text-muted:#8e6384; --text-faint:#6a4860; --text-xfaint:#4c3346;
        --accent:#d65a9e; --accent-dim:#d65a9e22;
        --scrollbar-track:#220a1e; --scrollbar-thumb:#5e2452; --input-border:#56204a; --sep:#42183a;
      }

      /* Pastel — soft lavender/periwinkle (light) */
      [data-theme="pastel"] {
        --bg:#eef0f8; --bg-card:#f8f6fc; --bg-header:#e2e6f2; --bg-input:transparent; --bg-hover:#eceef8;
        --border:#cdd2e6; --border-dim:#dfe3f0; --border-head:#bfc6de;
        --text:#3a3550; --text-dim:#6f6a8a; --text-muted:#9692ac; --text-faint:#b8b5c8; --text-xfaint:#d0cede;
        --accent:#8a7fd6; --accent-dim:#8a7fd622;
        --scrollbar-track:#e2e2ee; --scrollbar-thumb:#c4c2dc; --input-border:#bfc6de; --sep:#d8dae8;
      }

      /* Fluorescent — neon lime on near-black (dark) */
      [data-theme="fluorescent"] {
        --bg:#0a0f0a; --bg-card:#12160f; --bg-header:#080c08; --bg-input:transparent; --bg-hover:#1a2014;
        --border:#2f7a1f; --border-dim:#1f3a16; --border-head:#1f3a16;
        --text:#eaffd8; --text-dim:#7fdc4f; --text-muted:#56a030; --text-faint:#3e6e26; --text-xfaint:#2c4a1c;
        --accent:#a6ff00; --accent-dim:#a6ff0022;
        --scrollbar-track:#080c08; --scrollbar-thumb:#2f7a1f; --input-border:#2a6a1c; --sep:#1f3a16;
      }

      /* Tweed — warm gray desktop with cream windows (light) */
      [data-theme="tweed"] {
        --bg:#9a9488; --bg-card:#e8e4da; --bg-header:#b0aa9e; --bg-input:transparent; --bg-hover:#ddd8cc;
        --border:#b8b2a4; --border-dim:#cfc9bc; --border-head:#a8a294;
        --text:#2e2a22; --text-dim:#6a6458; --text-muted:#8a8478; --text-faint:#a8a294; --text-xfaint:#bdb7a8;
        --accent:#7a5c3a; --accent-dim:#7a5c3a22;
        --scrollbar-track:#cfc9bc; --scrollbar-thumb:#a8a294; --input-border:#a8a294; --sep:#c4beb0;
      }

      /* Monochrome — pure grayscale: gray desktop, white window, black text */
      [data-theme="monochrome"] {
        --bg:#808080; --bg-card:#ffffff; --bg-header:#c0c0c0; --bg-input:transparent; --bg-hover:#ededed;
        --border:#808080; --border-dim:#b0b0b0; --border-head:#808080;
        --text:#000000; --text-dim:#404040; --text-muted:#707070; --text-faint:#969696; --text-xfaint:#b8b8b8;
        --accent:#000000; --accent-dim:#00000018;
        --scrollbar-track:#c0c0c0; --scrollbar-thumb:#808080; --input-border:#808080; --sep:#b0b0b0;
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
    React.createElement("div", { className:"dm-header", style:{background:"var(--bg-header)",borderBottom:"1px solid var(--border-head)",padding:"7px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:50} },
      React.createElement("div", { style:{display:"flex",alignItems:"center",gap:"12px",flexShrink:0} },
        React.createElement("div", { style:{fontFamily:"var(--font-display)",fontSize:"17px",letterSpacing:"-0.5px"} },
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
        // #2/#54 — Focus mode: collapse completed sections to one-liners (today view).
        view==="today" && !editMode && headerBtn(focusMode?"◉ Focus":"◎ Focus", ()=>setFocusMode(f=>!f), focusMode),
        // #40 — idea capture → Notion. Needs the Worker configured and a signed-in Google token.
        workerConfigured() && isAuthed && headerBtn("💡 Idea", ()=>setIdeaCapture(true)),
        React.createElement("div", { style:{width:"1px",height:"18px",background:"var(--sep)",margin:"0 2px"} }),
        // #33 — layout switcher. Always visible; in edit mode the manage actions appear next to it.
        React.createElement("select", {
          value: layoutKey,
          onChange: e => switchLayout(e.target.value),
          title: "Switch layout preset",
          style:{background:"var(--bg-hover)",border:"1px solid var(--border)",color:"var(--text-dim)",
            fontFamily:"var(--font-body)",fontSize:"10px",padding:"4px 8px",borderRadius:"4px",
            cursor:"pointer",letterSpacing:"0.5px"}
        },
          allLayoutEntries.map(([k, l]) => React.createElement("option", { key:k, value:k }, l?.name || k))
        ),
        editMode && headerBtn("➕ New",      newLayout,       false, {fontSize:"9px",padding:"4px 8px"}),
        editMode && headerBtn("⎘ Duplicate", duplicateLayout, false, {fontSize:"9px",padding:"4px 8px"}),
        editMode && headerBtn("✎ Rename",    renameLayout,    false, {fontSize:"9px",padding:"4px 8px"}),
        editMode && allLayoutEntries.length > 1 && headerBtn("🗑 Delete", deleteLayout, false, {fontSize:"9px",padding:"4px 8px",color:"#a08070"}),
        // field-links (Phase C) — manage auto-check links for the active layout
        editMode && headerBtn("🔗 Links", ()=>setShowLinks(true), (layout.links||[]).length>0, {fontSize:"9px",padding:"4px 8px"}),
        // #84 — manage header tabs (named module sets) for the active layout
        editMode && headerBtn("⊞ Tabs", ()=>setShowTabs(true), (layout.tabs||[]).length>0, {fontSize:"9px",padding:"4px 8px"}),
        React.createElement("div", { style:{width:"1px",height:"18px",background:"var(--sep)",margin:"0 2px"} }),
        headerBtn(editMode?"✓ Done":"✎ Layout", ()=>setEditMode(e=>!e), editMode,
          editMode?{background:"var(--accent)",color:"var(--bg)",border:"1px solid var(--accent)"}:{}),
        React.createElement("div", { style:{width:"1px",height:"18px",background:"var(--sep)",margin:"0 2px"} }),
        // #59 — theme picker (replaces the dark/light toggle).
        React.createElement("select", {
          value: theme,
          onChange: e => setTheme(e.target.value),
          title: "Theme",
          style:{background:"var(--bg-hover)",border:"1px solid var(--border)",color:"var(--text-dim)",
            fontFamily:"var(--font-body)",fontSize:"10px",padding:"4px 8px",borderRadius:"4px",
            cursor:"pointer",letterSpacing:"0.5px"}
        }, THEMES.map(t => React.createElement("option", { key:t.key, value:t.key }, t.name))),
        // #60 — font-style picker (mirrors the theme picker).
        React.createElement("select", {
          value: font,
          onChange: e => setFont(e.target.value),
          title: "Font style",
          style:{background:"var(--bg-hover)",border:"1px solid var(--border)",color:"var(--text-dim)",
            fontFamily:"var(--font-body)",fontSize:"10px",padding:"4px 8px",borderRadius:"4px",
            cursor:"pointer",letterSpacing:"0.5px"}
        }, FONTS.map(f => React.createElement("option", { key:f.key, value:f.key }, f.name))),
        // #25 — set/clear a background image (per-device). #72 — clearer label,
        // tooltip, and prompt copy so it's obvious what the control does.
        headerBtn(bg ? "🖼 Background ✓" : "🖼 Background", () => {
          const u = window.prompt(
            "Background image\n\nPaste an image URL to show it behind your tiles (a dark scrim keeps text readable). Saved on this device only.\n\nLeave blank and press OK to remove it.",
            bg
          );
          if (u !== null) setBg(u);
        }, !!bg, { fontSize:"9px", padding:"4px 8px",
          title: bg ? "Background image is set — click to change the URL or clear it (this device only)"
                    : "Set a background image from a URL (this device only)" }),
        // #14 — opt-in check-in reminders (browser notifications).
        headerBtn(remind ? "🔔 On" : "🔔 Off", toggleRemind, remind, { fontSize:"9px", padding:"4px 8px" }),
        React.createElement("div", { style:{width:"1px",height:"18px",background:"var(--sep)",margin:"0 2px"} }),
        !isAuthed && authState!=="authing" && React.createElement("button", {
          onClick:initGoogleAuth,
          style:{background:"#1a2a1a",border:"1px solid #3a6a3a",color:"#7ac97a",padding:"5px 12px",borderRadius:"4px",cursor:"pointer",fontFamily:"var(--font-body)",fontSize:"10px"}
        }, authState==="no-config"?"⚙ Add Client ID":"↻ Connect Drive"),
        authState==="authing" && React.createElement("span", { style:{color:"var(--text-muted)",fontSize:"10px"} }, "Connecting..."),
        // Sign out of Drive sync; revokes the token so the next connect re-consents (#62).
        isAuthed && headerBtn("⎋ Sign out", signOut, false, { title:"Disconnect Google / Drive sync" }),
        // #61 — re-run the onboarding interview (Phase 2). Skip/Back leave the
        // current layout untouched; Finish replaces it with a fresh seeded one.
        headerBtn("✨ Setup", () => setOnboarding(true), false, { title:"Re-run the guided setup" }),
        headerBtn("⬇ Backup", exportBackup),
        React.createElement("label", { style:{background:"var(--bg-hover)",border:"1px solid var(--border)",color:"var(--text-dim)",padding:"5px 12px",borderRadius:"4px",cursor:"pointer",fontFamily:"var(--font-body)",fontSize:"10px"} },
          "⬆ Restore",
          React.createElement("input", { type:"file", accept:".json", style:{display:"none"}, onChange:importBackup })
        )
      )
    ),

    // VIEWS
    view==="history" && React.createElement(HistoryView, { store }),

    view==="today" && React.createElement("div", { className:"dm-main", style:{padding:"16px"} },
      // #84 — header tab strip (view mode). Quick-switch between named module sets;
      // horizontally scrollable so it works with many tabs on mobile.
      !editMode && layoutTabs.length > 0 && React.createElement("div", {
        className:"dm-tabstrip",
        style:{display:"flex",gap:"6px",marginBottom:"14px",overflowX:"auto",paddingBottom:"2px"}
      },
        [{ id:ALL_TAB, name:"All" }, ...layoutTabs].map(tab => {
          const on = effectiveTab === tab.id;
          // #87 — mark tabs the clock can select, and show the 🕐 filled-in on the
          // one it's currently driving (i.e. no manual override is in play).
          const timed   = tab.id === autoTabId || (tab.start && tab.end);
          const driving = on && manualTab === null && tab.id === autoTabId;
          return React.createElement("button", { key:tab.id, onClick:()=>setActiveTab(tab.id),
            title: timed && tab.start && tab.end
              ? `${tab.name} · ${tab.start}–${tab.end}${driving ? " (showing now)" : ""}`
              : tab.name,
            style:{flexShrink:0,background:on?"var(--accent)":"var(--bg-hover)",
              color:on?"var(--bg)":"var(--text-dim)",border:`1px solid ${on?"var(--accent)":"var(--border)"}`,
              fontFamily:"var(--font-display)",fontSize:"10px",letterSpacing:"1px",textTransform:"uppercase",
              padding:"5px 12px",borderRadius:"5px",cursor:"pointer",whiteSpace:"nowrap",
              display:"flex",alignItems:"center",gap:"5px"} },
            timed && React.createElement("span", {
              style:{fontSize:"9px",opacity:driving?1:0.45,letterSpacing:0} }, "🕐"),
            tab.name);
        })
      ),
      // #61 — one-time post-onboarding orientation: point new users at layout editing.
      showLayoutTip && !editMode && React.createElement("div", {
        style:{display:"flex",alignItems:"center",gap:"12px",flexWrap:"wrap",background:"var(--accent-dim)",
          border:"1px solid var(--accent)",borderRadius:"8px",padding:"12px 16px",marginBottom:"14px"}
      },
        React.createElement("span", { style:{fontSize:"18px"} }, "✨"),
        React.createElement("span", { style:{flex:1,minWidth:"200px",fontSize:"12px",color:"var(--text)",lineHeight:1.5} },
          "Your dashboard is ready. Tap ",
          React.createElement("b", { style:{color:"var(--accent)"} }, "✎ Layout"),
          " (top-right) anytime to add, remove, drag, or rearrange tiles."),
        headerBtn("Show me", () => { setShowLayoutTip(false); setEditMode(true); }, true),
        React.createElement("button", { onClick:()=>setShowLayoutTip(false), title:"Dismiss",
          style:{background:"transparent",border:"none",color:"var(--text-dim)",cursor:"pointer",fontSize:"16px",lineHeight:1,padding:"2px 4px"} }, "✕")
      ),
      // #61 — edit-mode helper: orient to how adding/arranging works (the add lands at
      // the bottom of the chosen column; we scroll to it). Pairs with the add toast.
      editMode && React.createElement("div", {
        style:{background:"var(--bg-hover)",border:"1px dashed var(--accent)",borderRadius:"8px",
          padding:"10px 14px",marginBottom:"12px",fontSize:"11px",color:"var(--text-dim)",lineHeight:1.6}
      },
        React.createElement("b", { style:{color:"var(--accent)"} }, "Editing layout. "),
        "Click any tile below to add it — it lands at the bottom of the chosen column, and we'll scroll you to it. Drag to reorder, ←/→ to move across columns, ✕ to remove. Click ",
        React.createElement("b", { style:{color:"var(--accent)"} }, "✓ Done"),
        " up top when you're happy."),
      // #73 — schematic preview of the current layout + a phone-stack ("Mobile") view.
      editMode && React.createElement(LayoutPreview, { columns:layout.columns }),
      editMode && React.createElement(TileLibrary, { onAdd:addTile, columns:layout.columns }),

      // #84 — a named tab with nothing assigned yet renders an empty-state hint.
      !editMode && renderColumns.length === 0 && React.createElement("div", {
        style:{textAlign:"center",color:"var(--text-faint)",fontSize:"12px",fontStyle:"italic",padding:"40px 16px"}
      }, "No modules on this tab yet — add some in ✎ Layout → ⊞ Tabs."),

      React.createElement("div", { className:"dm-grid", style:{display:"grid",gridTemplateColumns:renderColumns.map(c=>`${c.width}fr`).join(" "),gap:"14px"} },
        renderColumns.map((col, colIdx) => {
          // #35 — view-mode reorder/hide of check-in tiles. Completed blocks sink to
          // the bottom of their group; incomplete blocks more than an hour past their
          // scheduled time are pulled out behind a reveal toggle so the morning's
          // missed check-ins don't clutter the active flow. Edit mode is left intact
          // so drag/index logic keeps operating on the real layout order.
          const nowMin = (() => { const d = new Date(); return d.getHours()*60 + d.getMinutes(); })();
          const checkinIds = col.tiles.filter(t => t.type === "checkin");
          let orderedTiles = col.tiles, staleTiles = [];
          if (!editMode && checkinIds.length) {
            const meta = new Map(checkinIds.map(t => {
              const td = todayData[t.id] || {};
              // #81 — only a FULLY-complete (or manually marked) check-in sinks to the
              // bottom; filling one section no longer dismisses the whole block.
              const done = checkinFullyDone(t.config, td, todayData);
              const sched = checkinScheduleMin(t.config);
              // #6 — delay pushes the effective scheduled time; dismiss hides outright.
              const eff = sched != null ? sched + (td._delayMin || 0) : null;
              const stale = !done && eff != null && nowMin > eff + 60;
              const hidden = !!td._dismissed || stale;
              return [t.id, { done, hidden }];
            }));
            staleTiles = checkinIds.filter(t => meta.get(t.id).hidden);
            const grouped = [
              ...checkinIds.filter(t => !meta.get(t.id).hidden && !meta.get(t.id).done),
              ...checkinIds.filter(t => !meta.get(t.id).hidden &&  meta.get(t.id).done),
            ];
            let placed = false;
            orderedTiles = [];
            for (const t of col.tiles) {
              if (t.type === "checkin") { if (!placed) { orderedTiles.push(...grouped); placed = true; } }
              else orderedTiles.push(t);
            }
          }
          return React.createElement("div", { key:col.id, className:`dm-col-${col.id.replace("col-","")}`,
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
            editMode && React.createElement("div", { style:{fontFamily:"var(--font-display)",fontSize:"8px",letterSpacing:"3px",textTransform:"uppercase",color:"var(--text-xfaint)",textAlign:"center",padding:"4px",border:"1px dashed var(--border-dim)",borderRadius:"4px"} }, col.id),
            orderedTiles.map((tile, tileIdx) => {
              const isDragging = dragState?.colId===col.id && dragState?.tileIdx===tileIdx;
              const prevCol = colIdx > 0 ? layout.columns[colIdx-1] : null;
              const nextCol = colIdx < layout.columns.length-1 ? layout.columns[colIdx+1] : null;
              // #2/#54 — in Focus mode, completed tiles collapse to a one-liner (click to expand).
              const collapsed = !editMode && focusMode
                && tileComplete(tile, todayData[tile.id]||{}, todayData)
                && !focusExpanded[tile.id];
              const justHighlighted = justAdded?.id === tile.id;
              return React.createElement("div", { key:tile.id,
                "data-tile-id": tile.id,
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
                style:{cursor:editMode?"grab":"default", opacity:isDragging?0.4:1,
                  transition:"opacity 0.15s, box-shadow 0.3s", position:"relative",
                  // #61 — flash the freshly-added tile so the add is visible.
                  borderRadius: justHighlighted ? "8px" : undefined,
                  outline: justHighlighted ? "2px solid var(--accent)" : "none",
                  outlineOffset: justHighlighted ? "2px" : 0,
                  boxShadow: justHighlighted ? "0 0 0 5px var(--accent-dim)" : "none"} },
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
                collapsed
                  ? React.createElement("div", {
                      onClick: () => setFocusExpanded(s => ({ ...s, [tile.id]: true })),
                      title: "Completed — click to expand",
                      style:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"8px",
                        padding:"9px 12px",background:"var(--bg-card)",border:"1px solid var(--border-dim)",
                        borderLeft:"3px solid #4a7a4a",borderRadius:"6px",cursor:"pointer",opacity:0.7}
                    },
                      React.createElement("span", { style:{display:"flex",alignItems:"center",gap:"8px",fontSize:"10px",color:"var(--text-dim)",letterSpacing:"1px",textTransform:"uppercase"} },
                        React.createElement("span", { style:{color:"#4a7a4a"} }, "✓"),
                        tileTitle(tile)),
                      React.createElement("span", { style:{color:"var(--text-xfaint)",fontSize:"11px"} }, "▸"))
                  : React.createElement(RenderTile, {
                  tile,
                  data: todayData[tile.id]||{},
                  onChange: data => updateTileData(tile.id, data),
                  editMode,
                  onRemove: () => removeTile(col.id, tile.id),
                  onConfig: () => setConfigTile({tile, colId:col.id}),
                  onConfigPatch: patch => saveTileConfig(col.id, tile.id, {...tile.config, ...patch}),
                  allDayData: todayData,
                  tilesById,
                  links: layout.links || EMPTY_LINKS,
                  isAuthed,
                  authEpoch,
                  onReauth: () => initGoogleAuth(true),
                })
              );
            }),
            // #35 — past-due, still-incomplete check-ins, tucked behind a reveal toggle.
            (!editMode && staleTiles.length > 0) && React.createElement("div", { key:`stale-${col.id}` },
              React.createElement("button", {
                onClick: () => setShowStale(s => ({ ...s, [col.id]: !s[col.id] })),
                style:{ width:"100%", background:"transparent", border:"1px dashed var(--border-dim)",
                  color:"var(--text-faint)", fontFamily:"var(--font-body)", fontSize:"10px",
                  letterSpacing:"1px", textTransform:"uppercase", padding:"6px", borderRadius:"4px", cursor:"pointer" }
              }, `${showStale[col.id] ? "▾ Hide" : "▸ Show"} ${staleTiles.length} hidden check-in${staleTiles.length>1?"s":""}`),
              showStale[col.id] && React.createElement("div", {
                style:{ display:"flex", flexDirection:"column", gap:"12px", marginTop:"12px", opacity:0.65 }
              },
                staleTiles.map(tile =>
                  React.createElement("div", { key:tile.id, style:{position:"relative"} },
                    React.createElement(RenderTile, {
                      tile, data: todayData[tile.id]||{},
                      onChange: data => updateTileData(tile.id, data),
                      editMode: false,
                      onRemove: () => removeTile(col.id, tile.id),
                      onConfig: () => setConfigTile({tile, colId:col.id}),
                      onConfigPatch: patch => saveTileConfig(col.id, tile.id, {...tile.config, ...patch}),
                      allDayData: todayData, tilesById, links: layout.links || EMPTY_LINKS, isAuthed, authEpoch,
                      onReauth: () => initGoogleAuth(true),
                    })
                  )
                )
              )
            ),
            col.id === "col-left" && !editMode &&
              React.createElement(AddProjectButton, { colId: col.id, onAdd: addTile })
          )
        })
      ),

      // #61 — sticky wrap-up: a prominent way to finish editing and get back to the
      // day. The header "✓ Done" can scroll out of reach after adding/arranging tiles,
      // so this bar stays pinned to the bottom while editing. (Changes are already
      // saved continuously, so "done" just leaves edit mode.)
      editMode && React.createElement("div", {
        style:{position:"sticky",bottom:0,marginTop:"18px",padding:"14px 12px 16px",zIndex:40,
          display:"flex",justifyContent:"center",
          background:"linear-gradient(to top, var(--bg) 55%, transparent)"}
      },
        React.createElement("button", {
          onClick: () => setEditMode(false),
          style:{background:"var(--accent)",color:"var(--bg)",border:"1px solid var(--accent)",
            padding:"12px 26px",borderRadius:"10px",cursor:"pointer",fontFamily:"var(--font-display)",
            fontSize:"12px",letterSpacing:"0.5px",boxShadow:"0 6px 20px rgba(0,0,0,0.45)"}
        }, "✓ Done — back to mastering your day")
      )
    ),

    // #58 — build stamp footer (version + build date, injected by Vite at build time).
    React.createElement("div", {
      style:{textAlign:"center",padding:"20px 12px 30px",color:"var(--text-xfaint)",fontSize:"9px",letterSpacing:"1px"}
    }, `Daymaster v${APP_VERSION}${BUILD_DATE ? " · " + BUILD_DATE : ""}`),

    // #82 — PWA install nudge (iOS Share instructions / Chromium Install button).
    React.createElement(InstallHint),

    // CONFIG MODAL
    ideaCapture && React.createElement(IdeaCaptureModal, { onClose: () => setIdeaCapture(false) }),

    configTile && React.createElement(ConfigModal, {
      tile: configTile.tile,
      // #49 — supply the full list of tiles in the current layout so the rules editor
      // can populate its source-tile dropdown.
      tiles: layout.columns.flatMap(c => c.tiles),
      onSave: cfg => { saveTileConfig(configTile.colId, configTile.tile.id, cfg); setConfigTile(null); },
      onClose: () => setConfigTile(null)
    }),

    // field-links (Phase C) — auto-check links manager for the active layout.
    showLinks && React.createElement(LinksModal, {
      tiles: layout.columns.flatMap(c => c.tiles),
      links: layout.links || EMPTY_LINKS,
      onAdd: addLink,
      onRemove: removeLink,
      onClose: () => setShowLinks(false),
    }),

    // #84 — header-tabs manager: create/rename/delete tabs + assign tiles to them.
    // #87 adds the per-tab time window (onSetWindow).
    showTabs && React.createElement(TabsModal, {
      tiles: layout.columns.flatMap(c => c.tiles.map(t => ({ ...t, _colId: c.id }))),
      tabs: layout.tabs || [],
      onAdd: addTab,
      onRename: renameTab,
      onRemove: removeTab,
      onAssign: assignTileTab,
      onSetWindow: setTabWindow,
      onSuggest: suggestTabs,
      onClose: () => setShowTabs(false),
    }),

    // #61 — "added" confirmation toast (auto-dismisses with justAdded). Reassures
    // that the click worked even when the new tile lands off-screen at a column's end.
    justAdded && React.createElement("div", {
      style:{position:"fixed",bottom:"24px",left:"50%",transform:"translateX(-50%)",zIndex:200,
        background:"var(--bg-hover)",border:"1px solid var(--accent)",color:"var(--text)",
        padding:"10px 18px",borderRadius:"8px",fontSize:"11px",letterSpacing:"0.5px",
        boxShadow:"0 4px 18px rgba(0,0,0,0.45)",display:"flex",alignItems:"center",gap:"8px"}
    },
      React.createElement("span", { style:{color:"var(--accent)",fontSize:"13px"} }, "✓"),
      `Added ${justAdded.label} to ${justAdded.colId.replace("col-","")} — scrolled into view`)
  );
}

export { App };
