import { describe, it, expect } from "vitest";
import { mergeStores, touchDay } from "../src/lib/sync.js";

const base = (days, savedAt, layouts = { default: { columns: [] } }, activeLayout = "default") =>
  ({ version: 6, activeLayout, layouts, days, __savedAt: savedAt });

describe("mergeStores", () => {
  it("returns the other side when one is missing", () => {
    const s = base({}, 1);
    expect(mergeStores(s, null)).toBe(s);
    expect(mergeStores(null, s)).toBe(s);
  });

  it("keeps days that exist on only one side (no data loss)", () => {
    const local = base({ "2026-6-1": { t: { food: true }, __mtime: 10 } }, 5);
    const remote = base({ "2026-6-2": { t: { food: true }, __mtime: 20 } }, 6);
    const merged = mergeStores(local, remote);
    expect(Object.keys(merged.days).sort()).toEqual(["2026-6-1", "2026-6-2"]);
  });

  it("for a contested day, the newer __mtime wins", () => {
    const local = base({ d: { t: { note: "local" }, __mtime: 100 } }, 5);
    const remote = base({ d: { t: { note: "remote" }, __mtime: 200 } }, 5);
    expect(mergeStores(local, remote).days.d.t.note).toBe("remote");
    expect(mergeStores(remote, local).days.d.t.note).toBe("remote");
  });

  it("ties on a contested day resolve to local", () => {
    const local = base({ d: { t: { note: "local" }, __mtime: 100 } }, 5);
    const remote = base({ d: { t: { note: "remote" }, __mtime: 100 } }, 5);
    expect(mergeStores(local, remote).days.d.t.note).toBe("local");
  });

  it("takes layouts from the more-recently-saved store", () => {
    const local = base({}, 5, { default: { columns: [{ id: "L" }] } });
    const remote = base({}, 9, { default: { columns: [{ id: "R" }] } }, "default");
    expect(mergeStores(local, remote).layouts.default.columns[0].id).toBe("R");
    // and the reverse
    const local2 = base({}, 9, { default: { columns: [{ id: "L" }] } });
    const remote2 = base({}, 5, { default: { columns: [{ id: "R" }] } });
    expect(mergeStores(local2, remote2).layouts.default.columns[0].id).toBe("L");
  });

  it("carries the max version and savedAt forward", () => {
    const local = { version: 6, days: {}, __savedAt: 5, layouts: {}, activeLayout: "default" };
    const remote = { version: 7, days: {}, __savedAt: 9, layouts: {}, activeLayout: "default" };
    const merged = mergeStores(local, remote);
    expect(merged.version).toBe(7);
    expect(merged.__savedAt).toBe(9);
  });

  it("simulates a real two-device round: different days both survive", () => {
    const phone = base({ "2026-6-1": { mood: { feeling: "🙂" }, __mtime: 1000 } }, 1000);
    const ipad = base({ "2026-6-2": { mood: { feeling: "😴" }, __mtime: 2000 } }, 2000);
    const merged = mergeStores(phone, ipad);
    expect(merged.days["2026-6-1"].mood.feeling).toBe("🙂");
    expect(merged.days["2026-6-2"].mood.feeling).toBe("😴");
  });
});

describe("touchDay", () => {
  it("stamps __mtime on an existing day", () => {
    const s = { days: { d: { t: {} } } };
    touchDay(s, "d", 123);
    expect(s.days.d.__mtime).toBe(123);
  });
  it("is a safe no-op for an unknown day", () => {
    const s = { days: {} };
    expect(() => touchDay(s, "nope", 1)).not.toThrow();
  });
});
