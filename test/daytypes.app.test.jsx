// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../src/App.jsx";
import { emptyStore, migrateLayout } from "../src/lib/store.js";

// #105 — mount the real App against the REAL seeded boards and drive the calendar.
// Covers what the pure helpers can't prove: that the right board is up on load,
// that a manual pick from the header select overrides it, that the override
// releases at the day roll, and that a store which never opted in is untouched.
describe("App — day-type boards (#105) integration", () => {
  // Tiles unique to one board each, so an assertion names exactly one of them.
  const ONLY_WEEKEND  = "Family Plans";
  const ONLY_TOGETHER = "Household &amp; Errands";  // rendered HTML-escaped
  const ONLY_SOLO     = "PM Routine";
  const ONLY_DAILY    = "Delayed Google / Amazon";

  const seedStore = ({ dayTypes }) => {
    const store = migrateLayout(emptyStore());
    store.activeLayout = "default";
    if (dayTypes) store.dayTypes = true;
    localStorage.setItem("daymaster-v2-local", JSON.stringify(store));
  };

  const mount = async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    await act(async () => { createRoot(container).render(React.createElement(App)); });
    return container;
  };

  // The layout switcher is the only <select> in the header chrome.
  const pickLayout = async (container, optionText) => {
    const select = [...container.querySelectorAll("select")]
      .find(s => [...s.options].some(o => o.textContent.includes(optionText)));
    const option = [...select.options].find(o => o.textContent.includes(optionText));
    await act(async () => {
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };

  beforeEach(() => {
    global.fetch = () => new Promise(() => {});
    window.fetch = global.fetch;
    const mem = new Map();
    const ls = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), clear: () => mem.clear() };
    globalThis.localStorage = ls; window.localStorage = ls;
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => { vi.useRealTimers(); });

  it("opens Saturday on the Family Weekend board", async () => {
    vi.setSystemTime(new Date(2026, 7, 22, 9, 0));      // Sat 2026-08-22
    seedStore({ dayTypes: true });
    const html = (await mount()).innerHTML;
    expect(html).toContain(ONLY_WEEKEND);
    expect(html).not.toContain(ONLY_TOGETHER);
    expect(html).not.toContain(ONLY_SOLO);
  });

  it("opens Monday on Together and Wednesday on Solo", async () => {
    vi.setSystemTime(new Date(2026, 7, 24, 9, 0));      // Mon
    seedStore({ dayTypes: true });
    expect((await mount()).innerHTML).toContain(ONLY_TOGETHER);

    vi.setSystemTime(new Date(2026, 7, 26, 9, 0));      // Wed
    seedStore({ dayTypes: true });
    expect((await mount()).innerHTML).toContain(ONLY_SOLO);
  });

  it("lets a manual pick override the calendar, and releases it at the day roll", async () => {
    vi.setSystemTime(new Date(2026, 7, 22, 9, 0));      // Sat → Family Weekend
    seedStore({ dayTypes: true });
    const container = await mount();
    expect(container.innerHTML).toContain(ONLY_WEEKEND);

    // Pick Daily by hand — it wins immediately.
    await pickLayout(container, "Daily");
    expect(container.innerHTML).toContain(ONLY_DAILY);
    expect(container.innerHTML).not.toContain(ONLY_WEEKEND);

    // Still Saturday → the override holds across a tick.
    vi.setSystemTime(new Date(2026, 7, 22, 21, 0));
    await act(async () => { vi.advanceTimersByTime(60000); });
    expect(container.innerHTML).toContain(ONLY_DAILY);

    // Sunday is still the weekend board's day, so the calendar's ANSWER hasn't
    // changed — the override must survive a mere date change.
    vi.setSystemTime(new Date(2026, 7, 23, 9, 0));
    await act(async () => { vi.advanceTimersByTime(60000); });
    expect(container.innerHTML).toContain(ONLY_DAILY);

    // Monday hands the day to Together — a new answer, so the override releases.
    vi.setSystemTime(new Date(2026, 7, 24, 9, 0));
    await act(async () => { vi.advanceTimersByTime(60000); });
    expect(container.innerHTML).toContain(ONLY_TOGETHER);
    expect(container.innerHTML).not.toContain(ONLY_DAILY);
  });

  it("never auto-switches a store that hasn't opted in (back-compat)", async () => {
    vi.setSystemTime(new Date(2026, 7, 22, 9, 0));      // Saturday
    seedStore({ dayTypes: false });                      // boards seeded, feature off
    const container = await mount();
    // Stays on the stored activeLayout, however weekend-ish the calendar is.
    expect(container.innerHTML).toContain(ONLY_DAILY);
    expect(container.innerHTML).not.toContain(ONLY_WEEKEND);

    vi.setSystemTime(new Date(2026, 7, 24, 9, 0));      // roll to Monday
    await act(async () => { vi.advanceTimersByTime(60000); });
    expect(container.innerHTML).toContain(ONLY_DAILY);
    expect(container.innerHTML).not.toContain(ONLY_TOGETHER);
  });
});
