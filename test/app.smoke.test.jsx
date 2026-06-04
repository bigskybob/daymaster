// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../src/App.jsx";
import { emptyStore } from "../src/lib/store.js";

// Runtime safety net for the Phase 2 module port (#53): mount the real App from
// the bundled module graph and confirm it renders the default layout — plus a
// freshly-added AI Ideas tile — without throwing or logging a React error.
describe("App (module port) — runtime smoke", () => {
  beforeEach(() => {
    // Keep quote/calendar fetches offline and quiet.
    global.fetch = () => new Promise(() => {});
    window.fetch = global.fetch;
    // jsdom/Node don't reliably expose localStorage here — provide a tiny in-memory one.
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

  it("mounts the full app and renders tiles without runtime errors", async () => {
    const store = emptyStore();
    store.layouts.default.columns[0].tiles.unshift({
      id: "ideas1", type: "ideas",
      config: { title: "Build With AI", accent: "#7a6abf", ideas: [{ id: "a", text: "RAG over my notes", done: false }] },
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

    spy.mockRestore();
    const html = container.innerHTML;

    expect(html.length).toBeGreaterThan(1000);          // rendered a real tree
    expect(html).toContain("Build With AI");            // the new ideas tile rendered
    expect(html).toContain("Mise-en-place");            // a default-layout tile rendered
    expect(html).toContain("Daymaster v");              // #58 version footer rendered
    const realErrors = errors.filter(e => !/not wrapped in act|Warning:/.test(e));
    expect(realErrors).toEqual([]);                     // no React runtime errors
  });
});
