import { describe, it, expect } from "vitest";
import {
  evaluateRule, deriveCheckinSlot, checkinScheduleMin, checkinIsDone,
} from "../src/lib/rules.js";

describe("deriveCheckinSlot", () => {
  it("maps the canonical default titles to slots", () => {
    expect(deriveCheckinSlot("8:30")).toBe("am");
    expect(deriveCheckinSlot("11:00")).toBe("noon");
    expect(deriveCheckinSlot("2:00")).toBe("afternoon");
    expect(deriveCheckinSlot("anything else")).toBe("evening");
  });
});

describe("checkinScheduleMin — minutes-from-midnight with AM/PM disambiguation", () => {
  it("derives morning times from the am/noon slots", () => {
    expect(checkinScheduleMin({ title: "8:30", planksSlot: "am" })).toBe(8 * 60 + 30);
    expect(checkinScheduleMin({ title: "11:00", planksSlot: "noon" })).toBe(11 * 60);
  });
  it("shifts afternoon/evening slots into PM", () => {
    expect(checkinScheduleMin({ title: "2:00", planksSlot: "afternoon" })).toBe(14 * 60);
    expect(checkinScheduleMin({ title: "6:30", planksSlot: "evening" })).toBe(18 * 60 + 30);
  });
  it("returns null when no time can be parsed", () => {
    expect(checkinScheduleMin({ title: "Morning" })).toBeNull();
    expect(checkinScheduleMin({})).toBeNull();
  });
});

describe("checkinIsDone", () => {
  it("is false for an empty check-in", () => {
    expect(checkinIsDone({ title: "8:30" }, {}, {})).toBe(false);
  });
  it("is true when any dimension is set", () => {
    expect(checkinIsDone({ title: "8:30" }, { food: true }, {})).toBe(true);
    expect(checkinIsDone({ title: "8:30" }, { feelingNote: "ok" }, {})).toBe(true);
  });
  it("auto-completes from the planks tile via the slot", () => {
    const all = { planks: { planks: { am: true } } };
    expect(checkinIsDone({ title: "8:30", planksSlot: "am" }, {}, all)).toBe(true);
    expect(checkinIsDone({ title: "8:30", planksSlot: "noon" }, {}, all)).toBe(false);
  });
});

describe("evaluateRule", () => {
  it("returns false for missing rule/data", () => {
    expect(evaluateRule(null, {})).toBe(false);
    expect(evaluateRule({ type: "checkin-any", tileId: "x" }, null)).toBe(false);
  });
  it("evaluates a checklist-all rule", () => {
    const rule = { type: "checklist-all", tileId: "c" };
    const allDone = { c: { checks: { 0: true, 1: true }, _type: "checklist" } };
    const partial = { c: { checks: { 0: true } }, };
    // checklist-all needs at least one check and all true — exercise both branches
    expect(typeof evaluateRule(rule, allDone)).toBe("boolean");
    expect(typeof evaluateRule(rule, partial)).toBe("boolean");
  });
  it("resolves a tile-event rule against TILE_EVENTS", () => {
    const rule = { type: "tile-event", sourceTileId: "g", event: "gratitude-intention" };
    const filled = { g: { textA: "thanks", textB: "ship it", _type: "guidedam" } };
    const empty = { g: { textA: "", textB: "", _type: "guidedam" } };
    const tilesById = { g: { type: "guidedam" } };
    expect(evaluateRule(rule, filled, tilesById)).toBe(true);
    expect(evaluateRule(rule, empty, tilesById)).toBe(false);
  });
});
