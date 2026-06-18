// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { InstallHint } from "../src/ui/InstallHint.jsx";

// #82 — the nudge must stay invisible unless there's a real install affordance (so it
// never interferes with the app or the smoke tests), and must surface a real Install
// button once the browser offers one.
describe("InstallHint (#82)", () => {
  let container;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    try { localStorage.removeItem("daymaster-install-hint-dismissed"); } catch {}
  });

  it("renders nothing when there's no install affordance", async () => {
    await act(async () => { createRoot(container).render(React.createElement(InstallHint)); });
    expect(container.innerHTML).toBe("");
  });

  it("surfaces an Install button after a beforeinstallprompt event", async () => {
    await act(async () => { createRoot(container).render(React.createElement(InstallHint)); });
    expect(container.innerHTML).toBe("");
    await act(async () => {
      const ev = new Event("beforeinstallprompt");
      ev.prompt = () => {};
      ev.userChoice = Promise.resolve({ outcome: "dismissed" });
      window.dispatchEvent(ev);
    });
    expect(container.textContent).toContain("Install");
  });
});
