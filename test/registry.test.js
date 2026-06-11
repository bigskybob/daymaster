import { describe, it, expect } from "vitest";
import { defaultConfig, TILE_TYPES, TILES, FAMILIES } from "../src/tiles/registry.js";

// Guards the self-describing registry move: the back-compat derived exports and
// the one behavioral change (static config + structuredClone vs fresh-literal).
describe("tile registry", () => {
  it("defaultConfig returns independent clones — no shared nested refs", () => {
    const a = defaultConfig("checklist");
    const b = defaultConfig("checklist");
    a.items.push("MUTATED");
    // The regression we explicitly checked for: two tiles of the same type must
    // not share the same array instance.
    expect(b.items).not.toContain("MUTATED");
    expect(b.items).toHaveLength(3);
  });

  it("defaultConfig clones object-array configs too (notionlinks.links)", () => {
    const a = defaultConfig("notionlinks");
    const b = defaultConfig("notionlinks");
    a.links[0].label = "MUTATED";
    expect(b.links[0].label).not.toBe("MUTATED");
  });

  it("unknown type falls back to { title }", () => {
    expect(defaultConfig("nope")).toEqual({ title: "nope" });
  });

  it("TILE_TYPES is derived from TILES and carries family", () => {
    expect(Object.keys(TILE_TYPES)).toHaveLength(Object.keys(TILES).length);
    expect(TILE_TYPES.checklist.family).toBe("capture");
    expect(TILE_TYPES.planks.family).toBe("track");
    expect(TILE_TYPES.gcal.family).toBe("connect");
    expect(TILE_TYPES.numbers.family).toBe("derive");
  });

  it("every declared family has at least one tile, and every tile a known family", () => {
    const famKeys = new Set(FAMILIES.map(f => f.key));
    for (const f of FAMILIES) {
      expect(Object.values(TILES).some(t => t.family === f.key)).toBe(true);
    }
    for (const t of Object.values(TILES)) {
      expect(famKeys.has(t.family)).toBe(true);
    }
  });

  it("every tile entry has a component", () => {
    for (const [type, t] of Object.entries(TILES)) {
      expect(typeof t.component, `${type} component`).toBe("function");
    }
  });
});
