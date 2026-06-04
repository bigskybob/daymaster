import { describe, it, expect } from "vitest";
import { buildDefaultLayout, emptyStore, migrateLayout } from "../src/lib/store.js";

describe("emptyStore / buildDefaultLayout", () => {
  it("builds a default layout with columns and version 6", () => {
    const s = emptyStore();
    expect(s.version).toBe(6);
    expect(s.activeLayout).toBe("default");
    expect(Array.isArray(s.layouts.default.columns)).toBe(true);
    expect(s.layouts.default.columns.length).toBeGreaterThan(0);
  });
});

describe("migrateLayout — idempotency", () => {
  it("is a no-op fixpoint: running twice equals running once", () => {
    const a = migrateLayout(emptyStore());
    const b = migrateLayout(JSON.parse(JSON.stringify(a)));
    expect(b).toEqual(a);
  });

  it("seeds the AM Focus / PM Wind-down / Fitness presets exactly once", () => {
    const s = migrateLayout(emptyStore());
    expect(Object.keys(s.layouts)).toEqual(
      expect.arrayContaining(["default", "am-focus", "pm-wind", "fitness"])
    );
    const before = Object.keys(s.layouts).length;
    migrateLayout(s);
    expect(Object.keys(s.layouts).length).toBe(before); // no duplicate seeding
  });

  it("handles a null/empty store without throwing", () => {
    expect(() => migrateLayout(null)).not.toThrow();
    expect(() => migrateLayout({})).not.toThrow();
  });
});

describe("migrateLayout — legacy tile upgrades", () => {
  it("renames the legacy 'AM Routine' morning tile to 'Mise-en-place'", () => {
    const s = emptyStore();
    const center = s.layouts.default.columns.find(c => c.id === "col-center");
    const morning = center.tiles.find(t => t.id === "morning");
    morning.config = { ...morning.config, title: "AM Routine" };
    migrateLayout(s);
    const after = s.layouts.default.columns
      .find(c => c.id === "col-center").tiles.find(t => t.id === "morning");
    expect(after.config.title).toBe("Mise-en-place");
  });

  it("converts a legacy freelist 'calendar' tile into a gcal tile", () => {
    const s = emptyStore();
    s.layouts.default.columns[0].tiles.unshift({
      id: "calendar", type: "freelist", config: { title: "Calendar", count: 6 },
    });
    migrateLayout(s);
    const cal = s.layouts.default.columns
      .flatMap(c => c.tiles).find(t => t.id === "calendar");
    expect(cal.type).toBe("gcal");
    expect(cal.config.calendarId).toBe("primary");
  });

  it("backfills calendarId on a gcal tile that is missing it", () => {
    const s = emptyStore();
    s.layouts.default.columns[0].tiles.unshift({
      id: "cal2", type: "gcal", config: { title: "Cal" },
    });
    migrateLayout(s);
    const t = s.layouts.default.columns.flatMap(c => c.tiles).find(t => t.id === "cal2");
    expect(t.config.calendarId).toBe("primary");
  });
});
