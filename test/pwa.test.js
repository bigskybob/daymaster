import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";

// #82 — PWA scaffolding lives in static files (public/ + index.html + main.jsx), so
// these guards assert the installability contract directly against those files.
const root = p => fileURLToPath(new URL("../" + p, import.meta.url));
const read = p => readFileSync(root(p), "utf8");

describe("PWA manifest (#82)", () => {
  const manifest = JSON.parse(read("public/manifest.json"));

  it("has the core installability fields", () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.display).toBe("standalone");
    expect(manifest.background_color).toMatch(/^#/);
    expect(manifest.theme_color).toMatch(/^#/);
  });

  it("ships PNG icons at 192 and 512 plus a maskable icon, all present on disk", () => {
    const png = manifest.icons.filter(i => i.type === "image/png");
    expect(png.some(i => i.sizes === "192x192")).toBe(true);
    expect(png.some(i => i.sizes === "512x512")).toBe(true);
    expect(manifest.icons.some(i => /maskable/.test(i.purpose || ""))).toBe(true);
    for (const i of manifest.icons) expect(existsSync(root("public/" + i.src))).toBe(true);
  });

  it("never marks a non-maskable icon as maskable (the corner-badge tile would clip)", () => {
    expect(manifest.icons.find(i => i.src === "icon-512.png").purpose).toBe("any");
  });
});

describe("PWA wiring (#82)", () => {
  it("index.html links a PNG apple-touch-icon, the manifest, and a theme-color", () => {
    const html = read("index.html");
    expect(html).toMatch(/apple-touch-icon[^>]*\.png/);
    expect(html).toMatch(/rel="manifest"/);
    expect(html).toMatch(/name="theme-color"/);
    expect(html).toMatch(/apple-mobile-web-app-capable/);
  });

  it("registers the service worker, gated to production", () => {
    const main = read("src/main.jsx");
    expect(main).toMatch(/register\([^)]*sw\.js/);
    expect(main).toMatch(/import\.meta\.env\.PROD/);
  });

  it("the service worker bypasses cross-origin and is network-first for navigations", () => {
    expect(existsSync(root("public/sw.js"))).toBe(true);
    const sw = read("public/sw.js");
    expect(sw).toMatch(/url\.origin !== self\.location\.origin/); // cross-origin (auth/sync) bypassed
    expect(sw).toMatch(/req\.mode === "navigate"/);               // nav handling present
    expect(sw).toMatch(/skipWaiting/);                            // new SW activates immediately
  });
});
