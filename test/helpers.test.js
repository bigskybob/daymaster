import { describe, it, expect } from "vitest";
import { dayKeyVal, todayKey } from "../src/lib/helpers.js";

describe("dayKeyVal — calendar-ordered sort key for day keys (#78)", () => {
  it("orders unpadded keys by real date, not string (11 after 9)", () => {
    // The bug: localeCompare ranked '2026-6-11' before '2026-6-9' because '1' < '9'.
    expect(dayKeyVal("2026-6-11")).toBeGreaterThan(dayKeyVal("2026-6-9"));
  });

  it("sorts a month's worth of unpadded keys newest-first correctly", () => {
    const keys = ["2026-6-9", "2026-6-10", "2026-6-2", "2026-6-11", "2026-5-30"];
    const desc = [...keys].sort((a, b) => dayKeyVal(b) - dayKeyVal(a));
    expect(desc).toEqual(["2026-6-11", "2026-6-10", "2026-6-9", "2026-6-2", "2026-5-30"]);
  });

  it("crosses month and year boundaries", () => {
    expect(dayKeyVal("2026-1-5")).toBeGreaterThan(dayKeyVal("2025-12-31"));
    expect(dayKeyVal("2026-7-1")).toBeGreaterThan(dayKeyVal("2026-6-30"));
  });

  it("matches for padded and unpadded forms of the same day", () => {
    expect(dayKeyVal("2026-06-09")).toBe(dayKeyVal("2026-6-9"));
  });

  it("ranks the key produced by todayKey() as the largest of recent days", () => {
    const tk = todayKey();
    expect(dayKeyVal(tk)).toBeGreaterThan(dayKeyVal("2000-1-1"));
  });
});
