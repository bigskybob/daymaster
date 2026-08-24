import { describe, it, expect } from "vitest";
import { tileComplete, doneBehavior, DONE_BEHAVIORS, COMPLETABLE_TYPES } from "../src/lib/tileStatus.js";

describe("done states (#113) — doneBehavior", () => {
  it("defaults to stay when unset", () => {
    expect(doneBehavior({ type: "textprompt", config: {} })).toBe("stay");
    expect(doneBehavior({ type: "textprompt" })).toBe("stay");
    expect(doneBehavior(null)).toBe("stay");
  });

  it("returns the configured behavior on a completable tile", () => {
    for (const b of DONE_BEHAVIORS) {
      expect(doneBehavior({ type: "textprompt", config: { doneBehavior: b } })).toBe(b);
    }
  });

  it("refuses a behavior on a type whose completion isn't modelled", () => {
    // A gcal tile can never report done, so honouring "hide" here would make the
    // calendar vanish on a rule that never fires — or never come back.
    expect(doneBehavior({ type: "gcal", config: { doneBehavior: "hide" } })).toBe("stay");
    expect(doneBehavior({ type: "quote", config: { doneBehavior: "shelf" } })).toBe("stay");
  });

  it("falls back to stay on a value it doesn't recognize", () => {
    expect(doneBehavior({ type: "textprompt", config: { doneBehavior: "vanish" } })).toBe("stay");
    expect(doneBehavior({ type: "textprompt", config: { doneBehavior: true } })).toBe("stay");
  });

  it("only lists types tileComplete actually models", () => {
    for (const type of COMPLETABLE_TYPES) {
      // Every listed type must be able to answer true for SOME data, else the
      // setting is dead UI. A representative complete payload per type:
      const samples = {
        checkin:    [{ type:"checkin", config:{} }, { planks:true, food:true, priorities:true }],
        textprompt: [{ type:"textprompt", config:{} }, { text:"x" }],
        twoprompt:  [{ type:"twoprompt", config:{} }, { textA:"a", textB:"b" }],
        guidedam:   [{ type:"guidedam", config:{} }, { textA:"a", textB:"b", textC:"c" }],
        priorities: [{ type:"priorities", config:{} }, { priorities:[{text:"a",done:true}] }],
        project:    [{ type:"project", config:{} }, { items:[{text:"a",done:true}] }],
        foodlog:    [{ type:"foodlog", config:{ meals:["B"] } }, { logs:[{done:true}] }],
        planner:    [{ type:"planner", config:{} }, { steps:[{done:true}] }],
        checklist:  [{ type:"checklist", config:{ items:["a"] } }, { checks:[true] }],
        musiclog:   [{ type:"musiclog", config:{} }, { done:true }],
      };
      const [tile, data] = samples[type];
      expect(tileComplete(tile, data), `${type} should be completable`).toBe(true);
    }
  });
});

describe("done states (#113) — extended tileComplete coverage", () => {
  const checklist = (items, rules) => ({ type: "checklist", config: { items, rules } });

  it("completes a checklist only when every item is ticked", () => {
    expect(tileComplete(checklist(["a","b"]), { checks: [true, true] })).toBe(true);
    expect(tileComplete(checklist(["a","b"]), { checks: [true, false] })).toBe(false);
    expect(tileComplete(checklist(["a","b"]), { checks: [true] })).toBe(false);
    expect(tileComplete(checklist(["a","b"]), {})).toBe(false);
  });

  it("never completes an empty checklist", () => {
    expect(tileComplete(checklist([]), { checks: [] })).toBe(false);
  });

  it("counts an item satisfied by a legacy auto-rule, matching what the tile renders", () => {
    // Mise-en-place's real shape: item 1 auto-ticks when any priority is filled.
    const tile = checklist(["hydrate", "set top 3"], { 1: { type: "priorities-any", tileId: "prio" } });
    const day = { prio: { priorities: [{ text: "ship it" }] } };

    // Manually ticked item 0 + rule-satisfied item 1 = done, even though
    // data.checks[1] is false — this is exactly the case that made checklists
    // ineligible for completion before #113.
    expect(tileComplete(tile, { checks: [true] }, day)).toBe(true);

    // …and with no priority filled, the rule doesn't fire, so it isn't done.
    expect(tileComplete(tile, { checks: [true] }, { prio: { priorities: [] } })).toBe(false);
  });

  it("counts a field-link auto-check, which arrives pre-overlaid in the day data (#92)", () => {
    // effectiveDayData writes the resolved value into `checks`, so tileComplete
    // sees it as a normal tick — no special casing needed here.
    expect(tileComplete(checklist(["a","b"]), { checks: [true, true] })).toBe(true);
  });

  it("completes a music log when the box is ticked", () => {
    expect(tileComplete({ type: "musiclog", config: {} }, { done: true })).toBe(true);
    expect(tileComplete({ type: "musiclog", config: {} }, { note: "played" })).toBe(false);
    expect(tileComplete({ type: "musiclog", config: {} }, {})).toBe(false);
  });

  it("still refuses to call unmodelled types complete", () => {
    for (const type of ["gcal", "quote", "embed", "notionlinks", "numbers", "freelist", "notes", "twolists", "counter"]) {
      expect(tileComplete({ type, config: {} }, { text: "x", done: true, checks: [true] })).toBe(false);
    }
  });
});
