// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../src/App.jsx";
import { emptyStore, buildOnboardingLayout } from "../src/lib/store.js";

// #61 — answer→tile seeding (the LOCKED mapping). Pure-function checks, no DOM.
describe("buildOnboardingLayout (#61) — answer→tile seeding", () => {
  const allTiles = (store) =>
    store.layouts.default.columns.flatMap(c => c.tiles);
  const ids = (store) => allTiles(store).map(t => t.id);

  it("always seeds the locked baseline (Mise · Priorities · Quote) and nothing else when Q1 is empty", () => {
    const s = buildOnboardingLayout({ q1: [], checkins: { want: false } });
    expect(ids(s)).toEqual(expect.arrayContaining(["morning", "priorities", "quote"]));
    // No optional tiles when nothing was picked.
    expect(ids(s)).not.toContain("foodlog");
    expect(ids(s)).not.toContain("exercise");
    expect(ids(s).some(id => id.startsWith("checkin"))).toBe(false);
  });

  it("maps Q1 chips + detail steps to the right tiles", () => {
    const s = buildOnboardingLayout({
      q1: ["priorities", "health", "food", "projects", "calendar", "building"],
      fitness: { planks: true, pushups: false, dangles: true },
      calendar: { connect: true },
      project: { name: "Launch the beta" },
      checkins: { want: false },
    });
    const got = ids(s);
    expect(got).toEqual(expect.arrayContaining([
      "gratint", "exercise", "foodlog", "proj1", "calendar", "ideas1", "planner1", "planks", "dangles",
    ]));
    expect(got).not.toContain("pushups"); // fitness toggle was off
    // Q5 project name applied to the seeded project tile.
    const proj = allTiles(s).find(t => t.id === "proj1");
    expect(proj.config.title).toBe("Launch the beta");
  });

  it("omits the calendar tile when the user declines to connect", () => {
    const s = buildOnboardingLayout({ q1: ["calendar"], calendar: { connect: false }, checkins: { want: false } });
    expect(ids(s)).not.toContain("calendar");
  });

  it("seeds one check-in per enabled slot with its time, capture mode, and notify flag", () => {
    const s = buildOnboardingLayout({
      q1: [],
      checkins: { want: true, capture: "feelings", notify: true, slots: [
        { time: "8:30",  planksSlot: "am" },
        { time: "11:00", planksSlot: "noon" },
        { time: "2:00",  planksSlot: "afternoon" },
        { time: "6:00",  planksSlot: "evening" },
      ] },
    });
    const checkinsSeeded = allTiles(s).filter(t => t.type === "checkin");
    expect(checkinsSeeded).toHaveLength(4);
    expect(checkinsSeeded.map(t => t.config.title)).toEqual(["8:30", "11:00", "2:00", "6:00"]);
    expect(checkinsSeeded.map(t => t.config.planksSlot)).toEqual(["am", "noon", "afternoon", "evening"]);
    expect(checkinsSeeded.every(t => t.config.capture === "feelings")).toBe(true);
    expect(checkinsSeeded.every(t => t.config.notify === true)).toBe(true);
  });

  it("balances tiles across columns instead of piling into center", () => {
    const s = buildOnboardingLayout({
      q1: ["priorities", "health", "food", "calendar"],
      fitness: { planks: true, pushups: true, dangles: true },
      checkins: { want: true, capture: "both", notify: false, slots: [
        { time: "8:30", planksSlot: "am" }, { time: "11:00", planksSlot: "noon" }, { time: "2:00", planksSlot: "afternoon" },
      ] },
    });
    const counts = s.layouts.default.columns.map(c => c.tiles.length);
    const total = counts.reduce((a, b) => a + b, 0);
    // No single column hoards the tiles: spread is tight (≤ ~half the average apart).
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(2);
    // Center is no longer the dump — it shouldn't hold a majority of all tiles.
    const center = s.layouts.default.columns.find(c => c.id === "col-center");
    expect(center.tiles.length).toBeLessThan(total / 2);
    // Mise-en-place stays anchored to the top of center.
    expect(center.tiles[0].id).toBe("morning");
  });

  it("supports an evening-only check-in (any subset of slots)", () => {
    const s = buildOnboardingLayout({
      q1: [],
      checkins: { want: true, capture: "both", notify: false, slots: [{ time: "6:00", planksSlot: "evening" }] },
    });
    const seeded = allTiles(s).filter(t => t.type === "checkin");
    expect(seeded).toHaveLength(1);
    expect(seeded[0].config.title).toBe("6:00");
    expect(seeded[0].config.planksSlot).toBe("evening");
  });
});

// #61 Beta Onboarding (Phase 2) — the ?onboarding=1 flag forces the first-run
// interview, and a pristine profile (no local store, no Google config to reach
// Drive) onboards on its own. Stub scope: renders the Q1 "what matters" step and
// is skippable; no tile seeding yet.
describe("Onboarding (#61) — first-run detection + Q1 stub", () => {
  beforeEach(() => {
    global.fetch = () => new Promise(() => {});
    window.fetch = global.fetch;
    const mem = new Map();
    const ls = {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
      clear: () => mem.clear(),
    };
    globalThis.localStorage = ls;
    window.localStorage = ls;
    window.history.replaceState({}, "", "/");
  });

  function mount() {
    const container = document.createElement("div");
    container.id = "root";
    document.body.appendChild(container);
    return container;
  }

  it("forces the Q1 step via ?onboarding=1 even when a store exists", async () => {
    localStorage.setItem("daymaster-v2-local", JSON.stringify(emptyStore()));
    window.history.replaceState({}, "", "/?onboarding=1");
    const container = mount();
    await act(async () => { createRoot(container).render(React.createElement(App)); });

    const html = container.innerHTML;
    expect(html).toContain("What do you want to stay on top of each day?");
    expect(html).toContain("Skip for now");
    // The underlying dashboard is NOT shown while onboarding overlays it.
    expect(html).not.toContain("Mise-en-place");
  });

  it("onboards a pristine profile with no store and no Google config", async () => {
    // No local store + window.google undefined → no-config path flips onboarding on.
    const container = mount();
    await act(async () => { createRoot(container).render(React.createElement(App)); });
    // Let the 1200ms tryAuth (no-config) branch run.
    await act(async () => { await new Promise(r => setTimeout(r, 1300)); });

    expect(container.innerHTML).toContain("What do you want to stay on top of each day?");
  });

  it("does NOT onboard a returning user who has a local store", async () => {
    localStorage.setItem("daymaster-v2-local", JSON.stringify(emptyStore()));
    const container = mount();
    await act(async () => { createRoot(container).render(React.createElement(App)); });
    await act(async () => { await new Promise(r => setTimeout(r, 1300)); });

    const html = container.innerHTML;
    expect(html).not.toContain("What do you want to stay on top of each day?");
    expect(html).toContain("Mise-en-place"); // the real dashboard renders
  });

  it("walks Q1 → check-ins → finish and seeds the dashboard, persisting only on finish", async () => {
    window.history.replaceState({}, "", "/?onboarding=1");
    const container = mount();
    await act(async () => { createRoot(container).render(React.createElement(App)); });

    const click = (pred) => {
      const btn = [...container.querySelectorAll("button")].find(pred);
      if (!btn) throw new Error("button not found");
      return act(async () => { btn.click(); });
    };

    const defaultIds = () =>
      JSON.parse(localStorage.getItem("daymaster-v2-local"))
        .layouts.default.columns.flatMap(c => c.tiles).map(t => t.id);

    // Q1: pick "Food & nutrition", then advance. The seed is NOT committed yet —
    // storage still holds the full default base (proves "don't commit until finish").
    await click(b => b.textContent.includes("Food & nutrition"));
    await click(b => b.textContent.trim() === "Continue");
    expect(defaultIds()).toContain("donts"); // a kitchen-sink-only tile → still the base

    // Check-ins step is shown to everyone — finish straight through.
    expect(container.innerHTML).toContain("Daily check-ins");
    await click(b => b.textContent.trim() === "Continue"); // → connect step
    expect(container.innerHTML).toContain("Connect Google");
    await click(b => b.textContent.trim() === "Continue"); // → done step
    await click(b => b.textContent.includes("Build my dashboard"));

    // Dashboard now renders the seeded layout; the base default was REPLACED on finish.
    const html = container.innerHTML;
    expect(html).toContain("Mise-en-place");          // baseline
    expect(html).toContain("Food Log");               // Q1 food → foodlog
    const seededIds = defaultIds();
    expect(seededIds).toContain("foodlog");           // Q1 food seeded
    expect(seededIds).not.toContain("donts");         // kitchen-sink tile gone → replaced
    expect(seededIds.some(id => id.startsWith("checkin"))).toBe(true); // default check-ins seeded

    // #61 — finishing surfaces the one-time orientation banner pointing at layout edit.
    expect(html).toContain("Your dashboard is ready");
  });

  it("gives visible feedback when a tile is added in edit mode", async () => {
    localStorage.setItem("daymaster-v2-local", JSON.stringify(emptyStore()));
    const container = mount();
    await act(async () => { createRoot(container).render(React.createElement(App)); });
    await act(async () => { await new Promise(r => setTimeout(r, 1300)); });

    const click = (pred) => {
      const btn = [...container.querySelectorAll("button")].find(pred);
      if (!btn) throw new Error("button not found");
      return act(async () => { btn.click(); });
    };

    // Enter edit mode → the helper banner + tile library + sticky wrap-up appear.
    await click(b => b.textContent.includes("Layout") && !b.textContent.includes("Editing"));
    expect(container.innerHTML).toContain("Editing layout");
    expect(container.innerHTML).toContain("back to mastering your day");

    const before = container.querySelectorAll("[data-tile-id]").length;
    // Add a "Notes" tile from the library (button text = icon glyph + label).
    await click(b => b.textContent.includes("Notes"));

    // A new tile node exists and the confirmation toast is shown.
    expect(container.querySelectorAll("[data-tile-id]").length).toBe(before + 1);
    expect(container.innerHTML).toContain("Added Notes to");
  });
});
