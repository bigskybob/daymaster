// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
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
