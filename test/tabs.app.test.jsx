// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../src/App.jsx";
import { emptyStore } from "../src/lib/store.js";

// #84 — mount the real App with a layout that defines a header tab and one tile
// assigned to it, and confirm the tab strip renders and switching tabs filters the
// grid (assigned tile stays, unassigned tile hides under the named tab).
describe("App — header tabs (#84) integration", () => {
  beforeEach(() => {
    global.fetch = () => new Promise(() => {});
    window.fetch = global.fetch;
    const mem = new Map();
    const ls = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), clear: () => mem.clear() };
    globalThis.localStorage = ls; window.localStorage = ls;
  });

  it("renders a tab strip and filters tiles to the active tab", async () => {
    const store = emptyStore();
    store.layouts.default = {
      name: "Test",
      tabs: [{ id: "work", name: "Work" }],
      columns: [{ id: "col-1", width: 1, tiles: [
        { id: "p1", type: "textprompt", config: { title: "ALPHA", tab: "work" } },
        { id: "p2", type: "textprompt", config: { title: "BETA" } }, // unassigned
      ] }],
    };
    store.activeLayout = "default";
    localStorage.setItem("daymaster-v2-local", JSON.stringify(store));

    const container = document.createElement("div");
    document.body.appendChild(container);
    await act(async () => { createRoot(container).render(React.createElement(App)); });

    const tabBtn = name => [...container.querySelectorAll("button")].find(b => b.textContent.trim() === name);

    // tab strip present; "All" is active by default → both tiles visible
    expect(tabBtn("All")).toBeTruthy();
    expect(tabBtn("Work")).toBeTruthy();
    expect(container.innerHTML).toContain("ALPHA");
    expect(container.innerHTML).toContain("BETA");

    // switch to Work → only the assigned tile shows
    await act(async () => { tabBtn("Work").click(); });
    expect(container.innerHTML).toContain("ALPHA");
    expect(container.innerHTML).not.toContain("BETA");

    // back to All → the unassigned tile returns
    await act(async () => { tabBtn("All").click(); });
    expect(container.innerHTML).toContain("BETA");
  });
});

// #87 — mount the real App with time-windowed tabs and drive the clock. Covers the
// three behaviors that aren't provable from the pure logic alone: auto-select on
// load, a manual tap overriding it, and the override releasing at the next boundary.
describe("App — time-relevant tabs (#87) integration", () => {
  const MORNING = { id: "morning", name: "Morning", start: "05:00", end: "11:00" };
  const MIDDAY  = { id: "midday",  name: "Midday",  start: "11:00", end: "17:00" };
  const REF     = { id: "ref",     name: "Reference" };            // manual-only

  const seedStore = () => {
    const store = emptyStore();
    store.layouts.default = {
      name: "Test",
      tabs: [MORNING, MIDDAY, REF],
      columns: [{ id: "col-1", width: 1, tiles: [
        { id: "t1", type: "textprompt", config: { title: "SUNRISE",   tab: "morning" } },
        { id: "t2", type: "textprompt", config: { title: "NOONISH",   tab: "midday"  } },
        { id: "t3", type: "textprompt", config: { title: "HANDBOOK",  tab: "ref"     } },
      ] }],
    };
    store.activeLayout = "default";
    localStorage.setItem("daymaster-v2-local", JSON.stringify(store));
  };

  const mount = async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    await act(async () => { createRoot(container).render(React.createElement(App)); });
    return container;
  };

  // The strip prefixes windowed tabs with a 🕐, so match on inclusion, not equality.
  const tabBtn = (container, name) =>
    [...container.querySelectorAll("button")].find(b => b.textContent.includes(name));

  beforeEach(() => {
    global.fetch = () => new Promise(() => {});
    window.fetch = global.fetch;
    const mem = new Map();
    const ls = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), clear: () => mem.clear() };
    globalThis.localStorage = ls; window.localStorage = ls;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    seedStore();
  });
  afterEach(() => { vi.useRealTimers(); });

  it("auto-selects the tab whose window covers the current time", async () => {
    vi.setSystemTime(new Date(2026, 6, 27, 7, 0));       // 7:00am → Morning
    const container = await mount();
    expect(container.innerHTML).toContain("SUNRISE");
    expect(container.innerHTML).not.toContain("NOONISH");
    expect(container.innerHTML).not.toContain("HANDBOOK");
  });

  it("falls back to All when no window covers the current time", async () => {
    vi.setSystemTime(new Date(2026, 6, 27, 23, 30));     // outside every window
    const container = await mount();
    expect(container.innerHTML).toContain("SUNRISE");
    expect(container.innerHTML).toContain("NOONISH");
    expect(container.innerHTML).toContain("HANDBOOK");
  });

  it("lets a manual tap override the clock", async () => {
    vi.setSystemTime(new Date(2026, 6, 27, 7, 0));       // Morning is showing
    const container = await mount();
    await act(async () => { tabBtn(container, "Reference").click(); });
    expect(container.innerHTML).toContain("HANDBOOK");
    expect(container.innerHTML).not.toContain("SUNRISE");
  });

  it("releases a manual override at the next window boundary", async () => {
    vi.setSystemTime(new Date(2026, 6, 27, 7, 0));
    const container = await mount();

    await act(async () => { tabBtn(container, "Reference").click(); });
    expect(container.innerHTML).toContain("HANDBOOK");

    // still inside the Morning window → the override holds
    vi.setSystemTime(new Date(2026, 6, 27, 10, 30));
    await act(async () => { vi.advanceTimersByTime(30000); });
    expect(container.innerHTML).toContain("HANDBOOK");

    // cross into Midday → the clock takes back over
    vi.setSystemTime(new Date(2026, 6, 27, 11, 30));
    await act(async () => { vi.advanceTimersByTime(30000); });
    expect(container.innerHTML).toContain("NOONISH");
    expect(container.innerHTML).not.toContain("HANDBOOK");
  });

  it("never auto-switches a windowless layout, however far the clock runs (#84 back-compat)", async () => {
    const store = emptyStore();
    store.layouts.default = {
      name: "Test", tabs: [REF, { id: "other", name: "Other" }],
      columns: [{ id: "col-1", width: 1, tiles: [
        { id: "t3", type: "textprompt", config: { title: "HANDBOOK", tab: "ref"   } },
        { id: "t4", type: "textprompt", config: { title: "ELSEWHERE", tab: "other" } },
      ] }],
    };
    store.activeLayout = "default";
    localStorage.setItem("daymaster-v2-local", JSON.stringify(store));

    vi.setSystemTime(new Date(2026, 6, 27, 7, 0));
    const container = await mount();

    // manual pick sticks across hours, because no window ever claims the clock
    await act(async () => { tabBtn(container, "Reference").click(); });
    expect(container.innerHTML).not.toContain("ELSEWHERE");
    for (const hour of [11, 17, 23]) {
      vi.setSystemTime(new Date(2026, 6, 27, hour, 30));
      await act(async () => { vi.advanceTimersByTime(60000); });
      expect(container.innerHTML).toContain("HANDBOOK");
      expect(container.innerHTML).not.toContain("ELSEWHERE");
    }
  });
});

// #91 — a tile assigned to several tabs must actually render under each of them.
describe("App — multi-tab membership (#91) integration", () => {
  beforeEach(() => {
    global.fetch = () => new Promise(() => {});
    window.fetch = global.fetch;
    const mem = new Map();
    const ls = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), clear: () => mem.clear() };
    globalThis.localStorage = ls; window.localStorage = ls;
  });

  it("renders a tile under every tab it belongs to, and hides it elsewhere", async () => {
    const store = emptyStore();
    store.layouts.default = {
      name: "Test",
      tabs: [{ id: "am", name: "Morning" }, { id: "pm", name: "Evening" }],
      columns: [{ id: "col-1", width: 1, tiles: [
        { id: "t1", type: "textprompt", config: { title: "ALLDAY", tabs: ["am", "pm"] } },
        { id: "t2", type: "textprompt", config: { title: "AMONLY", tabs: ["am"] } },
        { id: "t3", type: "textprompt", config: { title: "LEGACY", tab: "pm" } },  // pre-#91 shape
      ] }],
    };
    store.activeLayout = "default";
    localStorage.setItem("daymaster-v2-local", JSON.stringify(store));

    const container = document.createElement("div");
    document.body.appendChild(container);
    await act(async () => { createRoot(container).render(React.createElement(App)); });
    const tabBtn = name => [...container.querySelectorAll("button")].find(b => b.textContent.includes(name));

    await act(async () => { tabBtn("Morning").click(); });
    expect(container.innerHTML).toContain("ALLDAY");
    expect(container.innerHTML).toContain("AMONLY");
    expect(container.innerHTML).not.toContain("LEGACY");

    // the shared tile follows into the second tab; the morning-only one does not
    await act(async () => { tabBtn("Evening").click(); });
    expect(container.innerHTML).toContain("ALLDAY");
    expect(container.innerHTML).not.toContain("AMONLY");
    expect(container.innerHTML).toContain("LEGACY");   // legacy single-tab still resolves
  });
});
