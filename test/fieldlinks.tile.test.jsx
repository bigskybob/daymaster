// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { TileChecklist } from "../src/tiles.jsx";

// Phase B integration: a checkbox tile must reflect a field-link as auto-on
// (checked + locked + ⚡), while still honoring the user's own manual check.
describe("field-links Phase B — checkbox tile reflects a link", () => {
  let container;
  beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); });

  const tilesById = {
    pri1: { id: "pri1", type: "priorities", config: { count: 3 } },
    cl1:  { id: "cl1",  type: "checklist",  config: { items: ["Set top 3"] } },
  };
  const links = [{ source: { tileId: "pri1", fieldId: "priorities[0].done" }, target: { tileId: "cl1", fieldId: "checks[0]" } }];

  async function mountChecklist({ data = {}, day }) {
    await act(async () => {
      createRoot(container).render(React.createElement(TileChecklist, {
        config: { title: "M", items: ["Set top 3"], accent: "#c8a96e" },
        data, onChange: () => {}, tileId: "cl1", links, allDayData: day, tilesById,
      }));
    });
    return container.querySelector('input[type="checkbox"]');
  }

  it("auto-checks (checked + locked + ⚡) when the source field is complete", async () => {
    const box = await mountChecklist({ day: { pri1: { priorities: [{ text: "frog", done: true }] } } });
    expect(box.checked).toBe(true);
    expect(box.disabled).toBe(true);                 // auto-only → locked
    expect(container.innerHTML).toContain("⚡");
  });

  it("stays unchecked + interactive when the source is incomplete", async () => {
    const box = await mountChecklist({ day: { pri1: { priorities: [{ text: "frog", done: false }] } } });
    expect(box.checked).toBe(false);
    expect(box.disabled).toBe(false);
  });

  it("a manual check stays interactive even while a link also drives it", async () => {
    const box = await mountChecklist({ data: { checks: [true] }, day: { pri1: { priorities: [{ done: true }] } } });
    expect(box.checked).toBe(true);
    expect(box.disabled).toBe(false);                // manual present → user can still toggle
  });
});
