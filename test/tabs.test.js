import { describe, it, expect } from "vitest";
import {
  ALL_TAB, visibleColumnsForTab, tabExists, withoutTab,
  parseTime, minutesNow, tabWindowActive, activeTimeTab, hasTimeWindows,
  suggestTimeTabs, SUGGESTED_TABS,
} from "../src/lib/tabs.js";

const at = (h, m = 0) => h * 60 + m;

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

// ─── #87 time-relevant tabs ───────────────────────────────────────────────────

describe("parseTime (#87)", () => {
  it("reads HH:MM into minutes since midnight", () => {
    expect(parseTime("00:00")).toBe(0);
    expect(parseTime("05:30")).toBe(at(5, 30));
    expect(parseTime("9:05")).toBe(at(9, 5));      // single-digit hour
    expect(parseTime("23:59")).toBe(1439);
    expect(parseTime(" 11:00 ")).toBe(at(11));      // tolerates padding
  });
  it("returns null for unset or malformed input instead of guessing", () => {
    for (const bad of [undefined, null, "", "  ", "abc", "11", "11:5", "24:00", "12:60", "-1:00"])
      expect(parseTime(bad)).toBeNull();
  });
});

describe("minutesNow (#87)", () => {
  it("converts a Date to minutes since midnight", () => {
    expect(minutesNow(new Date(2026, 6, 27, 0, 0))).toBe(0);
    expect(minutesNow(new Date(2026, 6, 27, 17, 45))).toBe(at(17, 45));
  });
});

describe("tabWindowActive (#87)", () => {
  const morning = { id: "m", start: "05:00", end: "11:00" };
  it("is active inside the window and inactive outside it", () => {
    expect(tabWindowActive(morning, at(7))).toBe(true);
    expect(tabWindowActive(morning, at(4, 59))).toBe(false);
    expect(tabWindowActive(morning, at(14))).toBe(false);
  });
  it("is half-open [start, end) so adjacent tabs never share a minute", () => {
    const midday = { id: "d", start: "11:00", end: "17:00" };
    expect(tabWindowActive(morning, at(5))).toBe(true);   // start is inclusive
    expect(tabWindowActive(morning, at(11))).toBe(false); // end is exclusive
    expect(tabWindowActive(midday, at(11))).toBe(true);   // …and midday takes it
  });
  it("wraps past midnight when start is after end", () => {
    const night = { id: "n", start: "22:00", end: "05:00" };
    expect(tabWindowActive(night, at(23))).toBe(true);
    expect(tabWindowActive(night, at(2))).toBe(true);
    expect(tabWindowActive(night, at(0))).toBe(true);
    expect(tabWindowActive(night, at(5))).toBe(false);    // end still exclusive
    expect(tabWindowActive(night, at(12))).toBe(false);
  });
  it("is never active without a usable window", () => {
    expect(tabWindowActive({ id: "x" }, at(9))).toBe(false);
    expect(tabWindowActive({ id: "x", start: "09:00" }, at(9))).toBe(false); // half set
    expect(tabWindowActive({ id: "x", start: "09:00", end: "nope" }, at(9))).toBe(false);
    expect(tabWindowActive({ id: "x", start: "09:00", end: "09:00" }, at(9))).toBe(false); // zero-length
    expect(tabWindowActive(null, at(9))).toBe(false);
  });
});

describe("activeTimeTab (#87)", () => {
  const tabs = [
    { id: "morning", name: "Morning", start: "05:00", end: "11:00" },
    { id: "midday",  name: "Midday",  start: "11:00", end: "17:00" },
    { id: "evening", name: "Evening", start: "17:00", end: "22:00" },
    { id: "ref",     name: "Reference" },                              // manual-only
  ];
  it("picks the tab whose window holds the minute", () => {
    expect(activeTimeTab(tabs, at(7)).id).toBe("morning");
    expect(activeTimeTab(tabs, at(12, 30)).id).toBe("midday");
    expect(activeTimeTab(tabs, at(21, 59)).id).toBe("evening");
  });
  it("returns null when no window covers the minute", () => {
    expect(activeTimeTab(tabs, at(3))).toBeNull();          // 22:00–05:00 gap
    expect(activeTimeTab(tabs, at(23))).toBeNull();
  });
  it("resolves overlaps first-match-wins, in strip order", () => {
    const overlapping = [
      { id: "wide",   start: "06:00", end: "20:00" },
      { id: "narrow", start: "09:00", end: "10:00" },
    ];
    expect(activeTimeTab(overlapping, at(9, 30)).id).toBe("wide");
    expect(activeTimeTab([...overlapping].reverse(), at(9, 30)).id).toBe("narrow");
  });
  it("never returns a windowless tab, and tolerates empty input", () => {
    expect(activeTimeTab([{ id: "ref", name: "Reference" }], at(9))).toBeNull();
    expect(activeTimeTab([], at(9))).toBeNull();
    expect(activeTimeTab(undefined, at(9))).toBeNull();
  });
});

describe("hasTimeWindows (#87)", () => {
  it("is true only when at least one tab carries a complete window", () => {
    expect(hasTimeWindows([{ id: "a" }, { id: "b", start: "05:00", end: "11:00" }])).toBe(true);
    expect(hasTimeWindows([{ id: "a" }, { id: "b", start: "05:00" }])).toBe(false);
    expect(hasTimeWindows([])).toBe(false);
    expect(hasTimeWindows(undefined)).toBe(false);
  });
});

describe("suggestTimeTabs (#87)", () => {
  const layout = () => ({
    name: "L",
    columns: [
      { id: "c1", tiles: [
        { id: "a", type: "guidedam", config: { title: "AM" } },
        { id: "b", type: "project",  config: {} },
        { id: "c", type: "numbers",  config: {} },
      ] },
      { id: "c2", tiles: [{ id: "d", type: "somefuturetile", config: {} }] },
    ],
  });

  it("seeds three windowed tabs and sorts every tile into one", () => {
    const out = suggestTimeTabs(layout());
    expect(out.tabs.map(t => t.name)).toEqual(["Morning", "Midday", "Evening"]);
    expect(out.tabs.every(t => parseTime(t.start) != null && parseTime(t.end) != null)).toBe(true);
    const byId = Object.fromEntries(out.columns.flatMap(c => c.tiles).map(t => [t.id, t.config.tab]));
    expect(byId.a).toBe("tab-morning");
    expect(byId.b).toBe("tab-midday");
    expect(byId.c).toBe("tab-evening");
    expect(byId.d).toBe("tab-midday");        // unknown type falls to the catch-all
  });

  it("seeds windows that tile the day without overlapping", () => {
    for (let m = 5 * 60; m < 22 * 60; m += 17)
      expect(activeTimeTab(SUGGESTED_TABS, m)).not.toBeNull();
    for (const t of SUGGESTED_TABS)
      expect(SUGGESTED_TABS.filter(x => tabWindowActive(x, parseTime(t.start))).length).toBe(1);
  });

  it("refuses to trample a layout that already has tabs", () => {
    const withTabs = { ...layout(), tabs: [{ id: "mine", name: "Mine" }] };
    expect(suggestTimeTabs(withTabs)).toBe(withTabs);
  });

  it("does not mutate the input layout, and tolerates junk", () => {
    const l = layout();
    suggestTimeTabs(l);
    expect(l.columns[0].tiles[0].config.tab).toBeUndefined();
    expect(suggestTimeTabs(null)).toBeNull();
    expect(suggestTimeTabs({ tabs: [] }).columns).toEqual([]);
  });
});
