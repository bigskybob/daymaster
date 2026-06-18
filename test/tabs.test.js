import { describe, it, expect } from "vitest";
import { ALL_TAB, visibleColumnsForTab, tabExists, withoutTab } from "../src/lib/tabs.js";

const cols = () => [
  { id: "col-a", width: 1, tiles: [
    { id: "t1", type: "notes", config: { tab: "work" } },
    { id: "t2", type: "notes", config: { tab: "home" } },
    { id: "t3", type: "notes", config: {} },            // unassigned
  ] },
  { id: "col-b", width: 1, tiles: [
    { id: "t4", type: "notes", config: { tab: "work" } },
  ] },
];

describe("visibleColumnsForTab (#84)", () => {
  it("returns all columns untouched for the All tab (same ref)", () => {
    const c = cols();
    expect(visibleColumnsForTab(c, ALL_TAB)).toBe(c);
    expect(visibleColumnsForTab(c)).toBe(c);
  });
  it("keeps only a named tab's tiles and drops emptied columns", () => {
    const out = visibleColumnsForTab(cols(), "home");
    expect(out).toHaveLength(1);                 // col-b had no 'home' tile → dropped
    expect(out[0].id).toBe("col-a");
    expect(out[0].tiles.map(t => t.id)).toEqual(["t2"]);
  });
  it("never shows unassigned tiles under a named tab", () => {
    const ids = visibleColumnsForTab(cols(), "work").flatMap(c => c.tiles.map(t => t.id));
    expect(ids).toEqual(["t1", "t4"]);           // t3 (unassigned) excluded
  });
  it("does not mutate the input columns", () => {
    const c = cols();
    visibleColumnsForTab(c, "work");
    expect(c[0].tiles).toHaveLength(3);
  });
});

describe("tabExists (#84)", () => {
  const layout = { tabs: [{ id: "work", name: "Work" }], columns: [] };
  it("is true for a known tab, false otherwise", () => {
    expect(tabExists(layout, "work")).toBe(true);
    expect(tabExists(layout, "gone")).toBe(false);
    expect(tabExists({ columns: [] }, "work")).toBe(false);
    expect(tabExists(null, "work")).toBe(false);
  });
});

describe("withoutTab (#84)", () => {
  it("removes the tab and clears it off assigned tiles, leaving others intact", () => {
    const layout = { tabs: [{ id: "work", name: "Work" }, { id: "home", name: "Home" }], columns: cols() };
    const out = withoutTab(layout, "work");
    expect(out.tabs).toEqual([{ id: "home", name: "Home" }]);
    const stillWork = out.columns.flatMap(c => c.tiles).filter(t => t.config?.tab === "work");
    expect(stillWork).toHaveLength(0);
    expect(out.columns[0].tiles.find(t => t.id === "t2").config.tab).toBe("home"); // untouched
    expect(out.columns[0].tiles.find(t => t.id === "t3").config.tab).toBeUndefined();
  });
});
