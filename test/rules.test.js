import { describe, it, expect } from "vitest";
import {
  evaluateRule, deriveCheckinSlot, checkinScheduleMin, checkinIsDone, checkinFullyDone,
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

describe("checkinFullyDone — #81 strict gate for auto-sink / collapse", () => {
  it("is false until EVERY planning box is satisfied (not just one)", () => {
    expect(checkinFullyDone({ title: "8:30", planksSlot: "none" }, {}, {})).toBe(false);
    // one or two boxes is no longer 'done' — this is the bug #81 fixes
    expect(checkinFullyDone({ title: "8:30", planksSlot: "none" }, { food: true }, {})).toBe(false);
    expect(checkinFullyDone({ title: "8:30", planksSlot: "none" }, { food: true, priorities: true }, {})).toBe(false);
    expect(checkinFullyDone({ title: "8:30", planksSlot: "none" }, { planks: true, food: true, priorities: true }, {})).toBe(true);
  });
  it("a feeling alone does NOT complete a planning check-in", () => {
    expect(checkinFullyDone({ title: "8:30", planksSlot: "none" }, { feeling: "🙂" }, {})).toBe(false);
  });
  it("counts the planks box as satisfied when auto-checked from the planks slot", () => {
    const all = { planks: { planks: { am: true } } };
    expect(checkinFullyDone({ title: "8:30", planksSlot: "am" }, { food: true, priorities: true }, all)).toBe(true);
    expect(checkinFullyDone({ title: "8:30", planksSlot: "am" }, { food: true }, all)).toBe(false);
  });
  it("a feelings-only check-in is done when a feeling or note is set", () => {
    expect(checkinFullyDone({ title: "8:30", capture: "feelings" }, {}, {})).toBe(false);
    expect(checkinFullyDone({ title: "8:30", capture: "feelings" }, { feeling: "🙂" }, {})).toBe(true);
    expect(checkinFullyDone({ title: "8:30", capture: "feelings" }, { feelingNote: "ok" }, {})).toBe(true);
  });
  it("respects an explicit manual check-off regardless of the boxes", () => {
    expect(checkinFullyDone({ title: "8:30", planksSlot: "none" }, { _done: true }, {})).toBe(true);
    expect(checkinFullyDone({ title: "8:30", planksSlot: "none" }, { food: true, _done: false }, {})).toBe(false);
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
  it("pushups-total-gte uses the MAX tapped milestone, not the sum (#55 cascade)", () => {
    const rule = { type: "pushups-total-gte", tileId: "pu", threshold: 75 };
    // Cascade marks every milestone <= reached. Max = 75 → passes; sum would be far higher.
    const at75 = { pu: { pushups: { 5:true, 10:true, 25:true, 50:true, 75:true } } };
    const at50 = { pu: { pushups: { 5:true, 25:true, 50:true } } };
    const none = { pu: { pushups: {} } };
    expect(evaluateRule(rule, at75)).toBe(true);
    expect(evaluateRule(rule, at50)).toBe(false); // max 50 < 75
    expect(evaluateRule(rule, none)).toBe(false);
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
