// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ConfigModal } from "../src/ui/ConfigModal.jsx";
import { HistoryView } from "../src/ui/HistoryView.jsx";

// Smoke coverage for the two components extracted verbatim out of App.jsx in the
// registry/App-split refactor — nothing else mounts them, so this guards the move
// (import wiring + render) and the heavier ConfigModal branches (rules editor).
describe("extracted UI components — runtime smoke", () => {
  let container;
  beforeEach(() => {
    global.fetch = () => new Promise(() => {}); // keep any fetch offline + quiet
    window.fetch = global.fetch;
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  async function mount(el) {
    const errors = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...a) => errors.push(a.map(String).join(" ")));
    await act(async () => { createRoot(container).render(el); });
    spy.mockRestore();
    const real = errors.filter(e => !/not wrapped in act|Warning:/.test(e));
    expect(real).toEqual([]);
    return container.innerHTML;
  }

  it("ConfigModal renders generic fields + the checklist auto-tick rules editor", async () => {
    const tile = { id: "cl1", type: "checklist", config: {
      title: "Mise", accent: "#c8a96e", items: ["Hydrate", "Stretch"], rules: {},
    } };
    // a second tile so the rules editor's candidate-source dropdown is populated
    const tiles = [tile, { id: "pri1", type: "priorities", config: { title: "Top 3", count: 3 } }];
    const html = await mount(React.createElement(ConfigModal, {
      tile, tiles, onSave: () => {}, onClose: () => {},
    }));
    expect(html).toContain("Configure: Checklist");
    expect(html).toContain("AUTO-TICK RULES"); // the moved rules-editor branch rendered
    expect(html).toContain("Hydrate");          // per-item label rendered
  });

  it("HistoryView renders the day list for a store with logged days", async () => {
    const store = {
      layouts: { default: { name: "Daily", columns: [
        { id: "c", tiles: [{ id: "t1", type: "textprompt", config: { title: "DON'T" } }] },
      ] } },
      days: { "2026-06-10": { t1: { _type: "textprompt", text: "no doomscrolling" } } },
    };
    const html = await mount(React.createElement(HistoryView, { store }));
    expect(html).toContain("Past Days");
    expect(html).toContain("LATEST"); // newest-day badge
  });

  it("HistoryView shows the empty state when there are no days", async () => {
    const store = { layouts: { default: { name: "Daily", columns: [] } }, days: {} };
    const html = await mount(React.createElement(HistoryView, { store }));
    expect(html).toContain("No history yet");
  });
});
