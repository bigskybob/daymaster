// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { LinksModal } from "../src/ui/LinksModal.jsx";

const tiles = [
  { id: "cl1",  type: "checklist",  config: { title: "Mise", items: ["Set top 3"] } },
  { id: "pri1", type: "priorities", config: { title: "Top 3", count: 3 } },
];

async function setSelect(sel, val) {
  await act(async () => { sel.value = val; sel.dispatchEvent(new Event("change", { bubbles: true })); });
}

describe("LinksModal (field-links Phase C)", () => {
  let container;
  beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); });

  it("builds a {target, sources, mode} link and calls onAdd", async () => {
    const onAdd = vi.fn();
    await act(async () => {
      createRoot(container).render(React.createElement(LinksModal, { tiles, links: [], onAdd, onRemove: () => {}, onClose: () => {} }));
    });
    // selects[0] = source picker (adds on change), selects[1] = target picker
    await setSelect(container.querySelectorAll("select")[0], "pri1::priorities[0].done");
    await setSelect(container.querySelectorAll("select")[1], "cl1::checks[0]");
    const addBtn = [...container.querySelectorAll("button")].find(b => b.textContent.includes("Add link"));
    await act(async () => { addBtn.click(); });

    expect(onAdd).toHaveBeenCalledTimes(1);
    const link = onAdd.mock.calls[0][0];
    expect(link.target).toEqual({ tileId: "cl1", fieldId: "checks[0]" });
    expect(link.sources).toEqual([{ tileId: "pri1", fieldId: "priorities[0].done" }]);
  });

  it("renders an existing link and removes it by index", async () => {
    const onRemove = vi.fn();
    const links = [{ target: { tileId: "cl1", fieldId: "checks[0]" }, sources: [{ tileId: "pri1", fieldId: "priorities[0].done" }], mode: "any" }];
    await act(async () => {
      createRoot(container).render(React.createElement(LinksModal, { tiles, links, onAdd: () => {}, onRemove, onClose: () => {} }));
    });
    expect(container.innerHTML).toContain("Set top 3");      // target label resolved from the schema
    const rm = [...container.querySelectorAll("button")].find(b => b.textContent === "✕");
    await act(async () => { rm.click(); });
    expect(onRemove).toHaveBeenCalledWith(0);
  });
});
