import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { THEMES, FONTS } from "../src/lib/themes.js";

// The theme/font pickers are data-driven (THEMES/FONTS), but each option only
// works if a matching [data-theme="key"] / [data-font="key"] CSS-variable block
// exists in App.jsx. Guard the pairing so adding an option without its CSS (or
// vice-versa) fails loudly instead of rendering an unstyled theme. (#76)
const appSrc = readFileSync(fileURLToPath(new URL("../src/App.jsx", import.meta.url)), "utf8");

describe("theme/font registry ↔ CSS blocks stay in sync", () => {
  it("every THEMES key has a [data-theme] CSS block", () => {
    const missing = THEMES.map(t => t.key).filter(k => !appSrc.includes(`[data-theme="${k}"]`));
    expect(missing).toEqual([]);
  });

  it("includes the #76 Windows 3.1 stock schemes", () => {
    const keys = THEMES.map(t => t.key);
    for (const k of ["win31", "bordeaux", "pastel", "fluorescent", "tweed", "monochrome"]) {
      expect(keys).toContain(k);
    }
  });

  it("theme keys are unique", () => {
    const keys = THEMES.map(t => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every FONTS key (except the default 'mono') has a [data-font] CSS block", () => {
    const missing = FONTS.map(f => f.key).filter(k => k !== "mono" && !appSrc.includes(`[data-font="${k}"]`));
    expect(missing).toEqual([]);
  });
});
