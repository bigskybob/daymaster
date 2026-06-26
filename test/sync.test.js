import { describe, it, expect } from "vitest";
import { mergeStores, mergeDay, touchDay } from "../src/lib/sync.js";

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

  // ── #data-loss — a contested day must union its TILES, not clobber the whole day ──
  // The exact production failure: a fresh second machine opens Daymaster, the Quote
  // tile auto-writes on an empty day (stamping a *newer* __mtime), and the post-auth
  // sync merges it against the rich copy already on Drive. Day-level last-write-wins
  // wiped donts/priorities/check-ins/pushups. Tile-level union must keep them all.
  it("a near-empty NEWER local day does not wipe a rich OLDER remote day", () => {
    const local = base({
      "2026-6-26": { sxzhbum: { quote: "auto-fetched" }, __mtime: 2000 }, // fresh machine: quote only
    }, 2000);
    const remote = base({
      "2026-6-26": {
        donts: { text: "no drinking" },
        priorities: { priorities: [{ text: "Montana packing", done: false }] },
        checkin1: { items: [{ text: "build vantage", done: false }] },
        pushups: { pushups: { 5: true, 10: true } },
        sxzhbum: { quote: "the real one" },
        __mtime: 1000, // OLDER — but it holds the real day's work
      },
    }, 1000);
    const day = mergeStores(local, remote).days["2026-6-26"];
    // Every rich tile from the older remote survives…
    expect(day.donts.text).toBe("no drinking");
    expect(day.priorities.priorities[0].text).toBe("Montana packing");
    expect(day.checkin1.items[0].text).toBe("build vantage");
    expect(day.pushups.pushups[10]).toBe(true);
    // …and the contested tile (present on both) resolves to the newer __mtime.
    expect(day.sxzhbum.quote).toBe("auto-fetched");
    expect(day.__mtime).toBe(2000);
  });

  it("is symmetric: rich older remote survives regardless of argument order", () => {
    const rich = base({ d: { a: { v: 1 }, b: { v: 2 }, __mtime: 100 } }, 100);
    const sparse = base({ d: { c: { v: 3 }, __mtime: 500 } }, 500);
    for (const day of [mergeStores(rich, sparse).days.d, mergeStores(sparse, rich).days.d]) {
      expect(day.a.v).toBe(1);
      expect(day.b.v).toBe(2);
      expect(day.c.v).toBe(3);
    }
  });

  it("contested tile honors the newer __mtime, and a tie resolves to local", () => {
    const local = base({ d: { t: { note: "L" }, __mtime: 50 } }, 1);
    const remoteNewer = base({ d: { t: { note: "R" }, __mtime: 60 } }, 1);
    expect(mergeStores(local, remoteNewer).days.d.t.note).toBe("R");
    const remoteTie = base({ d: { t: { note: "R" }, __mtime: 50 } }, 1);
    expect(mergeStores(local, remoteTie).days.d.t.note).toBe("L");
  });

  it("does not resurrect a cleared tile value (clear writes empty, not delete)", () => {
    // Device cleared `donts` (wrote {text:""}) AFTER the remote still held text.
    const cleared = base({ d: { donts: { text: "" }, __mtime: 200 } }, 200);
    const remote  = base({ d: { donts: { text: "old stuff" }, __mtime: 100 } }, 100);
    expect(mergeStores(cleared, remote).days.d.donts.text).toBe("");
  });
});

describe("mergeDay", () => {
  it("unions tile keys from both sides", () => {
    const merged = mergeDay({ a: 1, __mtime: 2 }, { b: 2, __mtime: 1 });
    expect(merged).toEqual({ a: 1, b: 2, __mtime: 2 });
  });
  it("newer side wins a contested tile; __mtime is the max", () => {
    expect(mergeDay({ t: "new", __mtime: 9 }, { t: "old", __mtime: 1 }))
      .toEqual({ t: "new", __mtime: 9 });
  });
  it("missing __mtime is treated as 0", () => {
    const merged = mergeDay({ a: 1 }, { b: 2, __mtime: 5 });
    expect(merged).toEqual({ a: 1, b: 2, __mtime: 5 });
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
