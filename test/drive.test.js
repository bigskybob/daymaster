// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadFromDrive, saveToDrive, findDataFiles } from "../src/lib/drive.js";
import { setToken } from "../src/lib/token.js";

// Drive persistence runs against a stubbed global `fetch` so we never hit Google.
// The focus is the duplicate-file fix: when a folder holds more than one
// `daymaster-data.json`, loadFromDrive must (a) treat the NEWEST as canonical and
// (b) MERGE every copy so an older duplicate can't shadow newer work (the
// "my work disappeared after a refresh" bug).

const FOLDER = { files: [{ id: "folder1", name: "Daymaster" }] };

// Two diverged copies: the newer file is missing a day the older one still has,
// and they disagree on a shared day (newest __mtime should win).
const NEW_FILE = {
  version: 6, activeLayout: "default", layouts: { default: { name: "Daily", columns: [] } },
  __savedAt: 2000,
  days: { "2026-6-11": { __mtime: 200, note: "today-from-new" } },
};
const OLD_FILE = {
  version: 6, activeLayout: "default", layouts: { default: { name: "Daily", columns: [] } },
  __savedAt: 1000,
  days: {
    "2026-6-11": { __mtime: 100, note: "today-from-old" }, // older → must lose
    "2026-6-04": { __mtime: 100, note: "only-in-old" },    // unique → must survive
  },
};

function mockFetch(routes) {
  return vi.fn(async (url) => {
    const u = String(url);
    for (const [match, body] of routes) {
      if (u.includes(match)) {
        return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
      }
    }
    return new Response("unmatched: " + u, { status: 500 });
  });
}

beforeEach(() => { vi.restoreAllMocks(); setToken("fake-token"); });

describe("drive: duplicate data files", () => {
  it("sorts duplicate data files newest-first", async () => {
    global.fetch = mockFetch([
      ["daymaster-data.json", { files: [
        { id: "old", modifiedTime: "2026-06-04T20:00:00Z" },
        { id: "new", modifiedTime: "2026-06-11T16:30:00Z" },
        { id: "mid", modifiedTime: "2026-06-08T12:00:00Z" },
      ] }],
    ]);
    const files = await findDataFiles("folder1");
    expect(files.map(f => f.id)).toEqual(["new", "mid", "old"]);
  });

  it("merges every duplicate so an older copy can't drop newer work", async () => {
    global.fetch = mockFetch([
      // ensureFolder (folder query) — matched before the data-file query below.
      ["mimeType%3D", FOLDER],
      ["application%2Fvnd.google-apps.folder", FOLDER],
      // findDataFiles: two copies, newest first after sort.
      ["daymaster-data.json", { files: [
        { id: "new", modifiedTime: "2026-06-11T16:30:00Z" },
        { id: "old", modifiedTime: "2026-06-04T20:00:00Z" },
      ] }],
      ["files/new?fields=headRevisionId", { headRevisionId: "rev-new" }],
      ["files/new?alt=media", NEW_FILE],
      ["files/old?alt=media", OLD_FILE],
    ]);

    const merged = await loadFromDrive();

    // Day unique to the older copy survived the merge.
    expect(merged.days["2026-6-04"]).toEqual({ __mtime: 100, note: "only-in-old" });
    // Contested day resolved to the newer __mtime (the new file), not the old one.
    expect(merged.days["2026-6-11"].note).toBe("today-from-new");
  });

  it("trashes stale duplicates after a consolidating save (#63)", async () => {
    const trashed = [];
    const j = (body) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    global.fetch = vi.fn(async (url, opts = {}) => {
      const u = String(url);
      if (u.includes("mimeType%3D")) return j(FOLDER);                                  // ensureFolder
      if (u.includes("daymaster-data.json")) return j({ files: [                         // findDataFiles
        { id: "new", modifiedTime: "2026-06-11T16:30:00Z" },
        { id: "old", modifiedTime: "2026-06-04T20:00:00Z" },
      ] });
      if (u.includes("upload/drive/v3/files/new")) return j({ headRevisionId: "rev2" }); // save PATCH upload
      if (u.includes("files/new?fields=headRevisionId")) return j({ headRevisionId: "rev-new" });
      if (u.includes("files/new?alt=media")) return j(NEW_FILE);
      if (u.includes("files/old?alt=media")) return j(OLD_FILE);
      if (u.includes("files/old?fields=id")) {                                           // trash the duplicate
        trashed.push({ id: "old", method: opts.method, body: JSON.parse(opts.body) });
        return j({ id: "old" });
      }
      return new Response("unmatched: " + u, { status: 500 });
    });

    await loadFromDrive();           // canonical = new, stale = [old]
    await saveToDrive({ days: {} }); // consolidating save → retires the duplicate

    expect(trashed).toHaveLength(1);
    expect(trashed[0].method).toBe("PATCH");
    expect(trashed[0].body).toEqual({ trashed: true }); // reversible trash, not delete
  });

  it("uploads a COMPACT payload that round-trips losslessly (#102 Phase 1)", async () => {
    let uploaded = null;
    const j = (body) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    global.fetch = vi.fn(async (url, opts = {}) => {
      const u = String(url);
      if (u.includes("mimeType%3D")) return j(FOLDER);
      if (u.includes("daymaster-data.json")) return j({ files: [{ id: "new", modifiedTime: "2026-06-11T16:30:00Z" }] });
      if (u.includes("upload/drive/v3/files/new")) { uploaded = opts.body; return j({ headRevisionId: "rev2" }); }
      if (u.includes("files/new?fields=headRevisionId")) return j({ headRevisionId: "rev-new" });
      if (u.includes("files/new?alt=media")) return j(NEW_FILE);
      return new Response("unmatched: " + u, { status: 500 });
    });

    await loadFromDrive();
    const store = { days: { "2026-6-11": { note: "hello", __mtime: 5 } }, layouts: { default: { name: "Default" } } };
    await saveToDrive(store);

    const text = await new Promise((res, rej) => {
      const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsText(uploaded);
    });
    expect(text).not.toMatch(/\n\s{2}/);            // no pretty-print indentation
    const parsed = JSON.parse(text);                 // loads identically
    expect(parsed.days["2026-6-11"].note).toBe("hello");
    expect(parsed.layouts.default.name).toBe("Default");
    expect(typeof parsed.__savedAt).toBe("number");
  });
});
