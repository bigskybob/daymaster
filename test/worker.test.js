import { describe, it, expect, beforeEach, vi } from "vitest";
import worker, { pageToLink, pageToProject, normalizeProgress, stripPriorityEmoji, firstSentence } from "../worker/src/index.js";

// Exercise the Worker's fetch handler with a stubbed `fetch` so we never hit
// Google or Notion. Node 20 provides global Request/Response.
const ENV = {
  NOTION_TOKEN: "secret-ntn",
  GOOGLE_CLIENT_ID: "client-123",
  OWNER_EMAIL: "owner@example.com",
  ALLOWED_ORIGIN: "https://bigskybob.github.io",
  INCOMING_IDEAS_PAGE_ID: "page-abc",
  FAVORITES_DB_ID: "db-xyz",
  PROJECTS_DB_ID: "db-proj",
  SLACK_USER_TOKEN: "xoxp-secret",
  SLACK_CAPTURE_CHANNEL: "C0CJINBOX",
};

function mockFetch(routes) {
  return vi.fn(async (url, opts = {}) => {
    const u = String(url);
    for (const [match, handler] of routes) {
      if (u.includes(match)) return handler(u, opts);
    }
    return new Response("unmatched", { status: 500 });
  });
}
const ok = (body) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

const goodToken = () => ["tokeninfo", () => ok({ aud: "client-123", email: "owner@example.com" })];

beforeEach(() => { vi.restoreAllMocks(); });

describe("worker: CORS + auth", () => {
  it("answers OPTIONS preflight with CORS, no auth needed", async () => {
    const res = await worker.fetch(new Request("https://w/ideas", { method: "OPTIONS" }), ENV);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ENV.ALLOWED_ORIGIN);
  });

  it("401s without a token", async () => {
    global.fetch = mockFetch([]);
    const res = await worker.fetch(new Request("https://w/links"), ENV);
    expect(res.status).toBe(401);
  });

  it("401s when the token audience is a different OAuth client", async () => {
    global.fetch = mockFetch([["tokeninfo", () => ok({ aud: "someone-else", email: "owner@example.com" })]]);
    const res = await worker.fetch(new Request("https://w/links", { headers: { Authorization: "Bearer t" } }), ENV);
    expect(res.status).toBe(401);
  });

  it("401s when OWNER_EMAIL is enforced and the email differs", async () => {
    global.fetch = mockFetch([["tokeninfo", () => ok({ aud: "client-123", email: "intruder@example.com" })]]);
    const res = await worker.fetch(new Request("https://w/links", { headers: { Authorization: "Bearer t" } }), ENV);
    expect(res.status).toBe(401);
  });
});

describe("worker: /ideas (#40)", () => {
  it("adds a paragraph under the Ideas heading", async () => {
    let notionBody = null;
    global.fetch = mockFetch([
      goodToken(),
      ["api.notion.com/v1/blocks/page-abc/children", (_u, opts) => {
        if ((opts.method || "GET") === "GET") return ok({ results: [
          { id: "b-intro", type: "paragraph", paragraph: { rich_text: [] } },
          { id: "b-ideas", type: "heading_2", heading_2: { rich_text: [{ plain_text: "Ideas" }] } },
        ] });
        notionBody = JSON.parse(opts.body); return ok({ object: "list" });
      }],
    ]);
    const res = await worker.fetch(new Request("https://w/ideas", {
      method: "POST", headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
      body: JSON.stringify({ text: "  ship the worker  " }),
    }), ENV);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(notionBody.children[0].paragraph.rich_text[0].text.content).toBe("ship the worker"); // trimmed
    expect(notionBody.after).toBe("b-ideas"); // lands under the Ideas heading, not page end
  });

  it("falls back to the page end when there is no Ideas heading", async () => {
    let notionBody = null;
    global.fetch = mockFetch([
      goodToken(),
      ["api.notion.com/v1/blocks/page-abc/children", (_u, opts) => {
        if ((opts.method || "GET") === "GET") return ok({ results: [
          { id: "b-intro", type: "paragraph", paragraph: { rich_text: [] } },
        ] });
        notionBody = JSON.parse(opts.body); return ok({ object: "list" });
      }],
    ]);
    const res = await worker.fetch(new Request("https://w/ideas", {
      method: "POST", headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
      body: JSON.stringify({ text: "no heading here" }),
    }), ENV);
    expect(res.status).toBe(200);
    expect(notionBody.after).toBeUndefined();
  });

  it("400s on empty text", async () => {
    global.fetch = mockFetch([goodToken()]);
    const res = await worker.fetch(new Request("https://w/ideas", {
      method: "POST", headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
      body: JSON.stringify({ text: "   " }),
    }), ENV);
    expect(res.status).toBe(400);
  });
});

describe("worker: /capture (#112) — the ClipJob Slack door", () => {
  const post = (body = { text: "a thought" }) => new Request("https://w/capture", {
    method: "POST",
    headers: { Authorization: "Bearer good", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  it("posts the text to Slack as the owner and reports the message ts", async () => {
    let sent = null;
    global.fetch = mockFetch([
      goodToken(),
      ["slack.com/api/chat.postMessage", (u, opts) => { sent = opts; return ok({ ok: true, ts: "1724.5" }); }],
    ]);
    const res = await worker.fetch(post(), ENV);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ts: "1724.5" });

    // A USER token, not a bot one — ClipJob's door drops anything with a bot_id.
    expect(sent.headers.Authorization).toBe("Bearer xoxp-secret");
    expect(JSON.parse(sent.body)).toEqual({ channel: "C0CJINBOX", text: "a thought" });
  });

  it("treats Slack's 200-with-ok:false as a failure, not a success", async () => {
    // The trap: chat.postMessage answers HTTP 200 for application errors, so a
    // naive res.ok check would report a dropped capture as delivered.
    global.fetch = mockFetch([
      goodToken(),
      ["slack.com/api/chat.postMessage", () => ok({ ok: false, error: "not_in_channel" })],
    ]);
    const res = await worker.fetch(post(), ENV);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "slack", detail: "not_in_channel" });
  });

  it("400s on empty text without calling Slack", async () => {
    let called = false;
    global.fetch = mockFetch([
      goodToken(),
      ["slack.com", () => { called = true; return ok({ ok: true }); }],
    ]);
    const res = await worker.fetch(post({ text: "   " }), ENV);
    expect(res.status).toBe(400);
    expect(called).toBe(false);
  });

  it("500s clearly when the Slack token or channel isn't configured yet", async () => {
    global.fetch = mockFetch([goodToken()]);
    const res = await worker.fetch(post(), { ...ENV, SLACK_USER_TOKEN: "" });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("capture not configured");
  });

  it("401s before reaching Slack when the caller isn't the owner", async () => {
    let called = false;
    global.fetch = mockFetch([
      ["tokeninfo", () => ok({ aud: "client-123", email: "intruder@example.com" })],
      ["slack.com", () => { called = true; return ok({ ok: true }); }],
    ]);
    const res = await worker.fetch(post(), ENV);
    expect(res.status).toBe(401);
    expect(called).toBe(false);
  });
});

describe("worker: /links (#50)", () => {
  it("maps Notion pages to {label,url}", async () => {
    global.fetch = mockFetch([
      goodToken(),
      ["api.notion.com/v1/databases/db-xyz/query", () => ok({ results: [
        { url: "https://notion.so/p1", properties: { Name: { type: "title", title: [{ plain_text: "Projects Home" }] } } },
        { url: "https://notion.so/p2", properties: { Name: { type: "title", title: [{ plain_text: "Daily" }] }, Link: { type: "url", url: "https://example.com" } } },
        { url: "https://notion.so/p3", properties: { Name: { type: "title", title: [] } } }, // no label → dropped
      ] })],
    ]);
    const res = await worker.fetch(new Request("https://w/links", { headers: { Authorization: "Bearer t" } }), ENV);
    expect(res.status).toBe(200);
    const { links } = await res.json();
    expect(links).toEqual([
      { label: "Projects Home", url: "https://notion.so/p1" },
      { label: "Daily", url: "https://example.com" },
    ]);
  });

  it("returns [] when no favorites DB is configured", async () => {
    global.fetch = mockFetch([goodToken()]);
    const res = await worker.fetch(new Request("https://w/links", { headers: { Authorization: "Bearer t" } }), { ...ENV, FAVORITES_DB_ID: undefined });
    expect((await res.json()).links).toEqual([]);
  });
});

describe("pageToLink", () => {
  it("prefers a url property over the page url", () => {
    expect(pageToLink({ url: "https://notion.so/x", properties: {
      T: { type: "title", title: [{ plain_text: "X" }] }, U: { type: "url", url: "https://x.com" },
    } })).toEqual({ label: "X", url: "https://x.com" });
  });
});

// --- #88 Mission Control feed ---------------------------------------------

describe("normalizeProgress (#88) — the dual-scale trap", () => {
  it("passes through values already on the 0-100 scale", () => {
    expect(normalizeProgress(94)).toBe(94);
    expect(normalizeProgress(72)).toBe(72);
  });

  it("scales up fractional values so 0.95 is not rendered as a 1% bar", () => {
    // Both are live in the Projects db today: Vocal Inbox 94, Mission Control 0.95.
    expect(normalizeProgress(0.95)).toBe(95);
    expect(normalizeProgress(0.8)).toBe(80);
    expect(normalizeProgress(0.4)).toBe(40);
  });

  it("treats a stored 1 as 100%, the documented ambiguity", () => {
    expect(normalizeProgress(1)).toBe(100);
  });

  it("keeps 0 at 0 and clamps out-of-range values", () => {
    expect(normalizeProgress(0)).toBe(0);
    expect(normalizeProgress(140)).toBe(100);
    expect(normalizeProgress(-5)).toBe(0);
  });

  it("returns null for a missing or non-numeric Progress", () => {
    expect(normalizeProgress(undefined)).toBeNull();
    expect(normalizeProgress(null)).toBeNull();
    expect(normalizeProgress("80")).toBeNull();
    expect(normalizeProgress(NaN)).toBeNull();
  });
});

describe("stripPriorityEmoji (#88)", () => {
  it("strips the leading emoji but leaves the label", () => {
    expect(stripPriorityEmoji("🟠 High")).toBe("High");
    expect(stripPriorityEmoji("🔴 Urgent")).toBe("Urgent");
  });

  it("is a no-op on a bare label and safe on empty", () => {
    expect(stripPriorityEmoji("Medium")).toBe("Medium");
    expect(stripPriorityEmoji("")).toBe("");
    expect(stripPriorityEmoji(undefined)).toBe("");
  });
});

describe("firstSentence (#88) — Next Step is a paragraph, not a line", () => {
  it("returns a short Next Step untouched", () => {
    const s = "Re-auth the DE org (BP-1, fired).";
    expect(firstSentence(s)).toBe(s);
  });

  it("cuts at the first sentence when one fits", () => {
    expect(firstSentence("Cook CC-29 and CC-30. Then re-run the bench across all 55 frames and compare."))
      .toBe("Cook CC-29 and CC-30.");
  });

  it("hard-cuts a long first sentence on a word boundary with an ellipsis", () => {
    // Vantage's real entry: 785 chars, no sentence break for far longer than the cap.
    const vantage = "Device leg 39 = L3 on build 77 (uploaded to TestFlight 2026-07-26, Delivery 19cffcf2 — Update button appears after ~10–20 min processing)";
    const out = firstSentence(vantage);
    expect(out.length).toBeLessThanOrEqual(91);
    expect(out.endsWith("…")).toBe(true);
    expect(vantage.startsWith(out.slice(0, -1))).toBe(true); // never invents text
  });

  it("collapses newlines and whitespace so the tile gets one line", () => {
    expect(firstSentence("Taste the\n\n  modular   wireframe")).toBe("Taste the modular wireframe");
  });

  it("is safe on empty input", () => {
    expect(firstSentence("")).toBe("");
    expect(firstSentence(undefined)).toBe("");
  });
});

describe("pageToProject (#88)", () => {
  const page = {
    url: "https://notion.so/vantage",
    icon: { type: "emoji", emoji: "📷" },
    properties: {
      Project: { type: "title", title: [{ plain_text: "Vantage" }] },
      Status: { type: "select", select: { name: "In Testing" } },
      Progress: { type: "number", number: 0.8 },
      Priority: { type: "select", select: { name: "🟠 High" } },
      "Last Worked": { type: "date", date: { start: "2026-07-26" } },
      "Owner of Next": { type: "select", select: { name: "Me" } },
      "One-Liner": { type: "rich_text", rich_text: [{ plain_text: "iOS rephotography app." }] },
      "Next Step": { type: "rich_text", rich_text: [{ plain_text: "Score walkthrough b77-leg39. Then merge PR #7." }] },
      "Repo / Spec": { type: "url", url: "https://app.notion.com/p/37ed" },
    },
  };

  it("maps a row, normalizing progress and truncating the next step", () => {
    expect(pageToProject(page)).toEqual({
      name: "Vantage",
      icon: "📷",
      status: "In Testing",
      progress: 80,
      priority: "🟠 High",
      priorityLabel: "High",
      lastWorked: "2026-07-26",
      owner: "Me",
      oneLiner: "iOS rephotography app.",
      nextStep: "Score walkthrough b77-leg39.",
      nextStepFull: "Score walkthrough b77-leg39. Then merge PR #7.",
      url: "https://app.notion.com/p/37ed",
    });
  });

  it("drops an untitled row", () => {
    expect(pageToProject({ properties: { Project: { type: "title", title: [] } } })).toBeNull();
  });

  it("falls back to the page url and nulls a non-emoji icon", () => {
    const p = pageToProject({ ...page, icon: { type: "external", external: { url: "x" } },
      properties: { ...page.properties, "Repo / Spec": { type: "url", url: null } } });
    expect(p.icon).toBeNull();
    expect(p.url).toBe("https://notion.so/vantage");
  });

  it("survives a row with every optional property missing", () => {
    const p = pageToProject({ url: "https://notion.so/bare", properties: { Project: { type: "title", title: [{ plain_text: "Bare" }] } } });
    expect(p.name).toBe("Bare");
    expect(p.progress).toBeNull();
    expect(p.status).toBeNull();
    expect(p.nextStep).toBeNull();
  });
});

describe("worker: /projects (#88)", () => {
  it("returns mapped rows sorted by Last Worked descending", async () => {
    let sentBody = null;
    global.fetch = mockFetch([
      goodToken(),
      ["api.notion.com/v1/databases/db-proj/query", (_u, opts) => {
        sentBody = JSON.parse(opts.body);
        return ok({ results: [
          { url: "https://notion.so/vi", icon: { emoji: "📥" }, properties: {
            Project: { type: "title", title: [{ plain_text: "Vocal Inbox" }] },
            Progress: { type: "number", number: 94 },
            Status: { type: "select", select: { name: "In Testing" } },
          } },
          { url: "https://notion.so/mc", icon: { emoji: "🎛" }, properties: {
            Project: { type: "title", title: [{ plain_text: "Mission Control" }] },
            Progress: { type: "number", number: 0.95 },
            Status: { type: "select", select: { name: "Building" } },
          } },
          { url: "https://notion.so/x", properties: { Project: { type: "title", title: [] } } }, // untitled → dropped
        ] });
      }],
    ]);
    const res = await worker.fetch(new Request("https://w/projects", { headers: { Authorization: "Bearer t" } }), ENV);
    expect(res.status).toBe(200);
    const { projects } = await res.json();
    expect(projects.map(p => p.name)).toEqual(["Vocal Inbox", "Mission Control"]);
    // The whole point: both bars are comparable after normalization.
    expect(projects.map(p => p.progress)).toEqual([94, 95]);
    expect(sentBody.sorts).toEqual([{ property: "Last Worked", direction: "descending" }]);
  });

  it("returns [] when no projects DB is configured", async () => {
    global.fetch = mockFetch([goodToken()]);
    const res = await worker.fetch(new Request("https://w/projects", { headers: { Authorization: "Bearer t" } }), { ...ENV, PROJECTS_DB_ID: undefined });
    expect(res.status).toBe(200);
    expect((await res.json()).projects).toEqual([]);
  });

  it("surfaces a Notion 404 — the integration has not been granted the database", async () => {
    global.fetch = mockFetch([
      goodToken(),
      ["api.notion.com/v1/databases/db-proj/query", () => new Response(JSON.stringify({ code: "object_not_found" }), { status: 404 })],
    ]);
    const res = await worker.fetch(new Request("https://w/projects", { headers: { Authorization: "Bearer t" } }), ENV);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("notion");
  });

  it("401s without a valid token, like every other route", async () => {
    global.fetch = mockFetch([]);
    const res = await worker.fetch(new Request("https://w/projects"), ENV);
    expect(res.status).toBe(401);
  });
});
