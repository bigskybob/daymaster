import { describe, it, expect } from "vitest";
import { getPath, fieldComplete, sourceComplete, isLinkAutoOn, autoOnFieldIds } from "../src/lib/fieldlinks.js";
import { tileFields } from "../src/tiles/registry.js";

describe("fieldlinks — path resolver", () => {
  it("resolves dot + bracket paths", () => {
    const d = { checks: [false, true], priorities: [{ text: "a", done: true }], planks: { am: true }, textA: "hi", logs: [{ done: true, text: "x" }] };
    expect(getPath(d, "checks[1]")).toBe(true);
    expect(getPath(d, "priorities[0].done")).toBe(true);
    expect(getPath(d, "priorities[0].text")).toBe("a");
    expect(getPath(d, "planks.am")).toBe(true);
    expect(getPath(d, "textA")).toBe("hi");
    expect(getPath(d, "logs[0].text")).toBe("x");
  });
  it("returns undefined for missing paths / null input", () => {
    expect(getPath({}, "checks[3]")).toBeUndefined();
    expect(getPath({ a: {} }, "a.b.c")).toBeUndefined();
    expect(getPath(null, "x")).toBeUndefined();
    expect(getPath({}, "")).toBeUndefined();
  });
});

describe("fieldlinks — field completion", () => {
  it("text is complete only when non-empty (trimmed)", () => {
    expect(fieldComplete({ path: "text", kind: "text" }, { text: "hi" })).toBe(true);
    expect(fieldComplete({ path: "text", kind: "text" }, { text: "   " })).toBe(false);
    expect(fieldComplete({ path: "text", kind: "text" }, {})).toBe(false);
  });
  it("checkbox is complete when truthy", () => {
    expect(fieldComplete({ path: "done", kind: "checkbox" }, { done: true })).toBe(true);
    expect(fieldComplete({ path: "done", kind: "checkbox" }, { done: false })).toBe(false);
    expect(fieldComplete({ path: "done", kind: "checkbox" }, {})).toBe(false);
  });
  it("derive fields are computed", () => {
    const f = { kind: "checkbox", derive: d => Object.values(d.pushups || {}).some(Boolean) };
    expect(fieldComplete(f, { pushups: { 10: true } })).toBe(true);
    expect(fieldComplete(f, { pushups: {} })).toBe(false);
    expect(fieldComplete(f, {})).toBe(false);
  });
});

describe("fieldlinks — registry field schema", () => {
  it("checklist enumerates one checkbox per item, labeled by item text", () => {
    const fs = tileFields("checklist", { items: ["A", "B", "C"] });
    expect(fs).toHaveLength(3);
    expect(fs[0]).toMatchObject({ id: "checks[0]", path: "checks[0]", kind: "checkbox", label: "A" });
  });
  it("priorities yields text + done per row", () => {
    const fs = tileFields("priorities", { count: 2 });
    expect(fs.map(f => f.id)).toEqual([
      "priorities[0].text", "priorities[0].done", "priorities[1].text", "priorities[1].done",
    ]);
  });
  it("pushups/counter expose derive-only sources (no path)", () => {
    const pu = tileFields("pushups", {});
    expect(pu).toHaveLength(1);
    expect(pu[0].path).toBeUndefined();
    expect(typeof pu[0].derive).toBe("function");
  });
  it("external / derive tiles have no addressable fields", () => {
    for (const t of ["gcal", "mstodo", "notionlinks", "embed", "numbers", "ideas", "quote"]) {
      expect(tileFields(t, {})).toEqual([]);
    }
  });
});

describe("fieldlinks — link evaluation", () => {
  const tilesById = {
    pri1: { id: "pri1", type: "priorities", config: { count: 3 } },
    cl1:  { id: "cl1",  type: "checklist",  config: { items: ["Set top 3", "Move"] } },
    pl1:  { id: "pl1",  type: "planks",     config: {} },
  };
  const links = [
    { source: { tileId: "pri1", fieldId: "priorities[0].done" }, target: { tileId: "cl1", fieldId: "checks[0]" } },
  ];

  it("target is auto-on when the source field is complete", () => {
    const day = { pri1: { priorities: [{ text: "frog", done: true }] } };
    expect(isLinkAutoOn("cl1", "checks[0]", links, day, tilesById)).toBe(true);
  });
  it("target is auto-off when the source field is incomplete", () => {
    const day = { pri1: { priorities: [{ text: "frog", done: false }] } };
    expect(isLinkAutoOn("cl1", "checks[0]", links, day, tilesById)).toBe(false);
  });
  it("an unlinked target is unaffected", () => {
    const day = { pri1: { priorities: [{ text: "frog", done: true }] } };
    expect(isLinkAutoOn("cl1", "checks[1]", links, day, tilesById)).toBe(false);
  });
  it("OR semantics across multiple sources to one target", () => {
    const multi = [
      { source: { tileId: "pri1", fieldId: "priorities[0].done" }, target: { tileId: "cl1", fieldId: "checks[0]" } },
      { source: { tileId: "pl1",  fieldId: "planks.am" },          target: { tileId: "cl1", fieldId: "checks[0]" } },
    ];
    const day = { pri1: { priorities: [{ done: false }] }, pl1: { planks: { am: true } } };
    expect(isLinkAutoOn("cl1", "checks[0]", multi, day, tilesById)).toBe(true);
  });
  it("a text source counts as complete when filled", () => {
    const tb = { ...tilesById, tp: { id: "tp", type: "textprompt", config: { title: "DON'T" } } };
    const l = [{ source: { tileId: "tp", fieldId: "text" }, target: { tileId: "cl1", fieldId: "checks[1]" } }];
    expect(isLinkAutoOn("cl1", "checks[1]", l, { tp: { text: "no doomscroll" } }, tb)).toBe(true);
    expect(isLinkAutoOn("cl1", "checks[1]", l, { tp: { text: "" } }, tb)).toBe(false);
  });
  it("autoOnFieldIds collects all driven targets on a tile", () => {
    const day = { pri1: { priorities: [{ done: true }] } };
    const on = autoOnFieldIds("cl1", links, day, tilesById);
    expect([...on]).toEqual(["checks[0]"]);
  });
  it("missing source tile / field resolves to not-complete", () => {
    expect(sourceComplete({ tileId: "ghost", fieldId: "x" }, {}, tilesById)).toBe(false);
    expect(sourceComplete({ tileId: "pri1", fieldId: "nope" }, {}, tilesById)).toBe(false);
  });
});
