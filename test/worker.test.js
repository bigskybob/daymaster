import { describe, it, expect, beforeEach, vi } from "vitest";
import worker, { pageToLink } from "../worker/src/index.js";

// Exercise the Worker's fetch handler with a stubbed `fetch` so we never hit
// Google or Notion. Node 20 provides global Request/Response.
const ENV = {
  NOTION_TOKEN: "secret-ntn",
  GOOGLE_CLIENT_ID: "client-123",
  OWNER_EMAIL: "owner@example.com",
  ALLOWED_ORIGIN: "https://bigskybob.github.io",
  INCOMING_IDEAS_PAGE_ID: "page-abc",
  FAVORITES_DB_ID: "db-xyz",
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
