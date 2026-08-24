import { describe, it, expect } from "vitest";
import {
  layoutDays, layoutClaimsDay, hasDayTypes, layoutForDay, resolveLayoutKey, daysLabel,
} from "../src/lib/daytypes.js";
import { emptyStore, migrateLayout } from "../src/lib/store.js";

describe("day-type layouts (#105) — pure helpers", () => {
  it("normalizes days: sorts, de-dupes, drops anything out of range or malformed", () => {
    expect(layoutDays({ days: [2, 1, 1] })).toEqual([1, 2]);
    expect(layoutDays({ days: [7, -1, 3, "x", null, 2.5] })).toEqual([3]);
    // Strings that ARE valid indices coerce, matching how a hand-edited store reads.
    expect(layoutDays({ days: ["0", "6"] })).toEqual([0, 6]);
  });

  it("treats a missing or non-array days field as claiming nothing", () => {
    expect(layoutDays({})).toEqual([]);
    expect(layoutDays({ days: "weekend" })).toEqual([]);
    expect(layoutDays(null)).toEqual([]);
    expect(layoutClaimsDay({}, 3)).toBe(false);
  });

  it("detects whether any layout in the set declares a day-type", () => {
    expect(hasDayTypes({ a: { days: [1] }, b: {} })).toBe(true);
    expect(hasDayTypes({ a: {}, b: { days: [] } })).toBe(false);
    expect(hasDayTypes({})).toBe(false);
    expect(hasDayTypes()).toBe(false);
  });

  it("finds the layout owning a weekday, and returns null when none claims it", () => {
    const layouts = { work: { days: [1, 2, 3, 4, 5] }, rest: { days: [0, 6] }, manual: {} };
    expect(layoutForDay(layouts, 3)).toBe("work");
    expect(layoutForDay(layouts, 6)).toBe("rest");
    expect(layoutForDay({ manual: {} }, 3)).toBe(null);
  });

  it("resolves overlapping claims first-match-wins in key order", () => {
    const layouts = { first: { days: [1] }, second: { days: [1] } };
    expect(layoutForDay(layouts, 1)).toBe("first");
  });

  describe("resolveLayoutKey — manual beats calendar beats stored", () => {
    const layouts = { a: {}, b: {}, c: {} };

    it("prefers a live manual pick", () => {
      expect(resolveLayoutKey(layouts, { manual: "c", auto: "b", stored: "a" })).toBe("c");
    });

    it("falls to the calendar's pick when there is no manual override", () => {
      expect(resolveLayoutKey(layouts, { manual: null, auto: "b", stored: "a" })).toBe("b");
    });

    it("falls to the stored activeLayout when the calendar claims nothing", () => {
      expect(resolveLayoutKey(layouts, { manual: null, auto: null, stored: "a" })).toBe("a");
    });

    it("ignores a manual or auto key naming a layout that no longer exists", () => {
      expect(resolveLayoutKey(layouts, { manual: "gone", auto: "b", stored: "a" })).toBe("b");
      expect(resolveLayoutKey(layouts, { manual: null, auto: "gone", stored: "a" })).toBe("a");
    });

    it("falls back to the first layout present rather than a dead key", () => {
      expect(resolveLayoutKey(layouts, { manual: null, auto: null, stored: "gone" })).toBe("a");
      expect(resolveLayoutKey({}, {})).toBe("default");
    });
  });

  it("labels the days a layout owns", () => {
    expect(daysLabel({ days: [1, 2] })).toBe("Mon · Tue");
    expect(daysLabel({ days: [0, 6] })).toBe("Sun · Sat");
    expect(daysLabel({})).toBe("");
  });
});

describe("day-type boards (#105) — seeding", () => {
  const seeded = () => migrateLayout(emptyStore());

  it("seeds the three boards, each owning its weekdays with no overlap or gap", () => {
    const s = seeded();
    expect(s.layouts.together.days).toEqual([1, 2]);
    expect(s.layouts.solo.days).toEqual([3, 4, 5]);
    expect(s.layouts.weekend.days).toEqual([0, 6]);

    // Every weekday is claimed exactly once — no day lands on two boards, and no
    // day falls through to whatever `activeLayout` happens to hold.
    const claims = [0, 1, 2, 3, 4, 5, 6].map(d =>
      Object.values(s.layouts).filter(l => layoutClaimsDay(l, d)).length);
    expect(claims).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });

  it("leaves the #33 presets and Daily as manual-only", () => {
    const s = seeded();
    for (const key of ["default", "am-focus", "pm-wind", "fitness"]) {
      expect(layoutDays(s.layouts[key])).toEqual([]);
    }
  });

  it("does NOT switch day-types on by itself — an existing store keeps its own board", () => {
    // The guard that keeps migration from moving a user off the board they built.
    expect(seeded().dayTypes).toBeFalsy();
  });

  it("gives each board its own tiles, sharing ids so per-day data carries across", () => {
    const s = seeded();
    const idsOf = key => s.layouts[key].columns.flatMap(c => c.tiles.map(t => t.id));

    // Solo is the engine; Together is lighter; the weekend is lighter still.
    expect(idsOf("solo").length).toBeGreaterThan(idsOf("together").length);
    expect(idsOf("together").length).toBeGreaterThan(idsOf("weekend").length);

    // Board-specific tiles land only where they belong…
    expect(idsOf("together")).toContain("household");
    expect(idsOf("weekend")).toContain("familyplans");
    expect(idsOf("weekend")).toContain("carried");
    expect(idsOf("solo")).not.toContain("household");

    // …and a tile on two boards keeps ONE id, so the dinner planned on Tuesday and
    // the dinner shown on Saturday read and write the same per-day record.
    expect(idsOf("together")).toContain("dinner");
    expect(idsOf("weekend")).toContain("dinner");

    // Shared continuity: the trackers and priorities keep their default ids.
    for (const key of ["together", "solo", "weekend"]) {
      expect(idsOf(key)).toContain("priorities");
      expect(idsOf(key)).toContain("numbers");
    }
  });

  it("is idempotent — a second migration neither duplicates nor rewrites a board", () => {
    const s = seeded();
    s.layouts.together.name = "Renamed";
    s.layouts.together.days = [1];
    const again = migrateLayout(s);
    expect(again.layouts.together.name).toBe("Renamed");
    expect(again.layouts.together.days).toEqual([1]);
    expect(Object.keys(again.layouts).filter(k => k === "together")).toHaveLength(1);
  });
});
