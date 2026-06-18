// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { TileProject } from "../src/tiles.jsx";

// #83 — the Project tile can persist its items across days (one shared list in
// config, written via onConfigPatch, like the AI Ideas tile) when config.persist
// is on. Default off keeps the original per-day behavior (data + onChange).
describe("Project tile persist mode (#83)", () => {
  let container;
  beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); });

  async function mount({ config, data = {} }) {
    const calls = { change: [], patch: [] };
    await act(async () => {
      createRoot(container).render(React.createElement(TileProject, {
        config, data,
        onChange: d => calls.change.push(d),
        onConfigPatch: p => calls.patch.push(p),
        tileId: "proj1", allDayData: {}, tilesById: {}, links: [],
      }));
    });
    return calls;
  }

  const firstBox = () => container.querySelector('input[type="checkbox"]');
  const firstTask = () => container.querySelector('textarea[placeholder="Task..."]');

  it("persist OFF: editing an item writes per-day data via onChange (not config)", async () => {
    const calls = await mount({
      config: { title: "P", count: 2, persist: false },
      data: { items: [{ text: "a", done: false }, { text: "b", done: false }] },
    });
    await act(async () => { firstBox().click(); });
    expect(calls.change).toHaveLength(1);
    expect(calls.change[0].items[0].done).toBe(true);
    expect(calls.patch).toHaveLength(0);
  });

  it("persist ON: editing an item writes the shared list to config via onConfigPatch", async () => {
    const calls = await mount({
      config: { title: "P", count: 2, persist: true, items: [{ text: "x", done: false }] },
      data: {},
    });
    await act(async () => { firstBox().click(); });
    expect(calls.patch).toHaveLength(1);
    expect(calls.patch[0].items[0]).toMatchObject({ text: "x", done: true });
    expect(calls.change).toHaveLength(0);
  });

  it("persist ON seeds from the current day's items when config has none yet", async () => {
    const calls = await mount({
      config: { title: "P", count: 3, persist: true }, // no config.items yet
      data: { items: [{ text: "carryme", done: false }] },
    });
    // the existing day's task is shown (seamless carry-in)…
    expect(firstTask().value).toBe("carryme");
    // …and the first edit captures it forward into config, not per-day data.
    await act(async () => { firstBox().click(); });
    expect(calls.patch).toHaveLength(1);
    expect(calls.patch[0].items[0]).toMatchObject({ text: "carryme", done: true });
    expect(calls.change).toHaveLength(0);
  });
});
