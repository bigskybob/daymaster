// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../src/App.jsx";
import { emptyStore } from "../src/lib/store.js";

// #99 — undo for destructive edit actions: removing a tile offers an Undo toast,
// and Undo restores the layout (config) plus keeps day data addressable.
describe("Undo (#99) — remove tile → Undo restores", () => {
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
  });

  const clickButton = async (container, match) => {
    const btn = [...container.querySelectorAll("button")].find(b =>
      match instanceof RegExp ? match.test(b.textContent) : (b.title === match || b.textContent === match));
    expect(btn, `button ${match} should exist`).toBeTruthy();
    await act(async () => { btn.click(); });
  };

  it("removes a uniquely-titled tile, then Undo brings it back", async () => {
    const store = emptyStore();
    store.layouts.default.columns[0].tiles.unshift({
      id: "victim1", type: "textprompt",
      config: { title: "UNDO VICTIM TILE", accent: "#c8a96e", placeholder: "..." },
    });
    localStorage.setItem("daymaster-v2-local", JSON.stringify(store));

    const container = document.createElement("div");
    container.id = "root";
    document.body.appendChild(container);

    const errors = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...a) => errors.push(a.map(String).join(" ")));

    await act(async () => {
      createRoot(container).render(React.createElement(App));
    });

    expect(container.innerHTML).toContain("UNDO VICTIM TILE");

    // Enter edit mode, then hit the victim tile's ✕ (title="Remove").
    await clickButton(container, /✎ Layout/);
    const victimCard = [...container.querySelectorAll("[data-tile-id]")]
      .find(el => el.getAttribute("data-tile-id") === "victim1");
    expect(victimCard).toBeTruthy();
    const removeBtn = [...victimCard.querySelectorAll("button")].find(b => b.title === "Remove");
    await act(async () => { removeBtn.click(); });

    const tilePresent = () => !!container.querySelector('[data-tile-id="victim1"]');
    expect(tilePresent()).toBe(false);                                   // tile gone
    expect(container.innerHTML).toContain("Removed UNDO VICTIM TILE");   // toast up

    // Undo → tile is back, toast gone.
    await clickButton(container, "Undo");
    expect(tilePresent()).toBe(true);
    expect(container.innerHTML).not.toContain("Removed UNDO VICTIM TILE");

    // The undone store is what will hit the next save: localStorage already has it.
    const persisted = JSON.parse(localStorage.getItem("daymaster-v2-local"));
    const ids = persisted.layouts.default.columns.flatMap(c => c.tiles).map(t => t.id);
    expect(ids).toContain("victim1");
    // ...and the undo is stamped newest so it wins the next cross-device merge.
    expect(persisted.__savedAt).toBeTypeOf("number");

    spy.mockRestore();
    const realErrors = errors.filter(e => !/not wrapped in act|Warning:/.test(e));
    expect(realErrors).toEqual([]);
  });
});
