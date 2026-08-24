// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../src/App.jsx";
import { emptyStore } from "../src/lib/store.js";
import { todayKey } from "../src/lib/helpers.js";

// #113 — mount the real App with one tile of each done-behavior, all three
// finished, and confirm what the board actually does with them: the "stay" tile
// holds its place, the "shelf" tile collapses onto the Done rail, and the "hide"
// tile leaves the grid but stays reachable behind the reveal toggle.
describe("App — done states (#113) integration", () => {
  const seedStore = () => {
    const store = emptyStore();
    store.layouts.default = {
      name: "Test",
      columns: [{ id: "col-1", width: 1, tiles: [
        { id: "s1", type: "textprompt", config: { title: "STAYPUT" } },
        { id: "s2", type: "textprompt", config: { title: "SHELFME", doneBehavior: "shelf" } },
        { id: "s3", type: "textprompt", config: { title: "HIDEME",  doneBehavior: "hide"  } },
        { id: "s4", type: "textprompt", config: { title: "UNFINISHED", doneBehavior: "shelf" } },
      ] }],
    };
    store.activeLayout = "default";
    // Every tile but s4 is finished for today.
    store.days[todayKey()] = { s1: { text: "done" }, s2: { text: "done" }, s3: { text: "done" } };
    localStorage.setItem("daymaster-v2-local", JSON.stringify(store));
  };

  const mount = async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    await act(async () => { createRoot(container).render(React.createElement(App)); });
    return container;
  };

  const btn = (container, text) =>
    [...container.querySelectorAll("button")].find(b => b.textContent.includes(text));

  beforeEach(() => {
    global.fetch = () => new Promise(() => {});
    window.fetch = global.fetch;
    const mem = new Map();
    const ls = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), clear: () => mem.clear() };
    globalThis.localStorage = ls; window.localStorage = ls;
    seedStore();
  });

  it("keeps a finished 'stay' tile exactly where it was", async () => {
    const container = await mount();
    // Its editable field is still on the board, not a collapsed summary.
    expect(container.innerHTML).toContain("STAYPUT");
    expect(container.querySelector('[data-tile-id="s1"] textarea, [data-tile-id="s1"] input')).toBeTruthy();
  });

  it("collapses a finished 'shelf' tile onto a Done rail, and expands it on click", async () => {
    const container = await mount();

    // The rail exists and counts one tile (s4 is unfinished, so it isn't on it).
    expect(container.innerHTML).toContain("Done · 1");
    expect(container.innerHTML).toContain("SHELFME");

    // It is a one-line summary now — no editable field until it's opened.
    const shelved = container.querySelector('[data-tile-id="s2"]');
    expect(shelved.querySelector("textarea, input")).toBeFalsy();
    expect(shelved.textContent).toContain("✓");

    // Click expands it back into a usable tile.
    await act(async () => { shelved.querySelector("div").click(); });
    expect(container.querySelector('[data-tile-id="s2"]').querySelector("textarea, input")).toBeTruthy();
  });

  it("leaves an unfinished tile off the rail and fully on the board", async () => {
    const container = await mount();
    expect(container.innerHTML).toContain("UNFINISHED");
    expect(container.querySelector('[data-tile-id="s4"] textarea, [data-tile-id="s4"] input')).toBeTruthy();
  });

  it("takes a finished 'hide' tile off the board, but keeps it one tap away", async () => {
    const container = await mount();
    expect(container.innerHTML).not.toContain("HIDEME");

    const reveal = btn(container, "1 finished");
    expect(reveal).toBeTruthy();
    await act(async () => { reveal.click(); });
    expect(container.innerHTML).toContain("HIDEME");

    await act(async () => { btn(container, "1 finished").click(); });
    expect(container.innerHTML).not.toContain("HIDEME");
  });

  it("shows every tile in edit mode, so the layout you arrange is the layout you see", async () => {
    const container = await mount();
    await act(async () => { btn(container, "Layout").click(); });
    expect(container.innerHTML).toContain("STAYPUT");
    expect(container.innerHTML).toContain("SHELFME");
    expect(container.innerHTML).toContain("HIDEME");
    expect(container.innerHTML).not.toContain("Done · ");
  });

  it("never writes the day's data — hiding is a filter, not an edit", async () => {
    await mount();
    const saved = JSON.parse(localStorage.getItem("daymaster-v2-local"));
    expect(saved.days[todayKey()].s3).toEqual({ text: "done" });
  });
});
