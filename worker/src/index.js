// Daymaster API proxy — Cloudflare Worker.
//
// Why this exists: Daymaster is a static GitHub Pages SPA. Browsers block direct
// calls to the Notion API (CORS) and we must not ship the Notion token in
// client-side JS. This Worker holds the secret server-side, adds CORS, and only
// answers requests that carry a valid Google access token minted by the app.
//
// Endpoints (all require `Authorization: Bearer <google_access_token>`):
//   POST /ideas   { text }   → append a paragraph to the Incoming Ideas page   (#40)
//   GET  /links              → query a Notion DB → [{label,url}]                (#50)
//
// Env (set via wrangler.toml [vars] and `wrangler secret put`):
//   NOTION_TOKEN           (secret)  Notion internal integration token
//   GOOGLE_CLIENT_ID       (var)     app OAuth client id — token audience must match
//   OWNER_EMAIL            (var,opt)  if set AND the token carries an email, restrict to it
//   ALLOWED_ORIGIN         (var)     e.g. https://bigskybob.github.io
//   INCOMING_IDEAS_PAGE_ID (var)     Notion page id appended to by /ideas
//   FAVORITES_DB_ID        (var,opt)  Notion database id queried by /links
//   FAVORITES_FILTER       (var,opt)  JSON Notion filter applied to /links

const NOTION_VERSION = "2022-06-28";

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(env, status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(env) },
  });
}

// Verify the caller's Google access token via Google's tokeninfo endpoint.
// Returns the token info on success, or null when the token is missing/invalid,
// was not minted by our OAuth client, or (when OWNER_EMAIL is enforced) belongs
// to someone else. The email check only applies once the app requests the email
// scope — until then tokens carry no email and we gate on audience alone.
async function verifyCaller(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const res = await fetch("https://oauth2.googleapis.com/tokeninfo?access_token=" + encodeURIComponent(token));
  if (!res.ok) return null;
  const info = await res.json();
  const audience = info.aud || info.azp;
  if (env.GOOGLE_CLIENT_ID && audience !== env.GOOGLE_CLIENT_ID) return null;
  if (env.OWNER_EMAIL && info.email && info.email !== env.OWNER_EMAIL) return null;
  return info;
}

async function notion(env, path, method, body) {
  const res = await fetch("https://api.notion.com/v1" + path, {
    method,
    headers: {
      Authorization: `Bearer ${env.NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// Map a Notion page → {label, url}: label from the title property, url from a
// "url"-typed property if present, else the page's own Notion URL.
export function pageToLink(page) {
  const props = page.properties || {};
  let label = "";
  let url = page.url || "";
  for (const key of Object.keys(props)) {
    const p = props[key];
    if (p.type === "title" && Array.isArray(p.title)) {
      label = p.title.map(t => t.plain_text).join("").trim() || label;
    }
    if (p.type === "url" && p.url) url = p.url;
  }
  if (!label) return null;
  return { label, url };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    const caller = await verifyCaller(request, env);
    if (!caller) return json(env, 401, { error: "unauthorized" });

    try {
      if (request.method === "POST" && url.pathname === "/ideas") {
        const body = await request.json().catch(() => ({}));
        const text = (body && body.text || "").trim();
        if (!text) return json(env, 400, { error: "text required" });
        if (!env.INCOMING_IDEAS_PAGE_ID) return json(env, 500, { error: "INCOMING_IDEAS_PAGE_ID not set" });
        const r = await notion(env, `/blocks/${env.INCOMING_IDEAS_PAGE_ID}/children`, "PATCH", {
          children: [{
            object: "block",
            type: "paragraph",
            paragraph: { rich_text: [{ type: "text", text: { content: text } }] },
          }],
        });
        return json(env, r.ok ? 200 : r.status, r.ok ? { ok: true } : { error: "notion", detail: r.data });
      }

      if (request.method === "GET" && url.pathname === "/links") {
        if (!env.FAVORITES_DB_ID) return json(env, 200, { links: [] });
        const query = env.FAVORITES_FILTER ? { filter: JSON.parse(env.FAVORITES_FILTER) } : {};
        const r = await notion(env, `/databases/${env.FAVORITES_DB_ID}/query`, "POST", query);
        if (!r.ok) return json(env, r.status, { error: "notion", detail: r.data });
        const links = (r.data.results || []).map(pageToLink).filter(Boolean);
        return json(env, 200, { links });
      }

      return json(env, 404, { error: "not found" });
    } catch (e) {
      return json(env, 500, { error: String((e && e.message) || e) });
    }
  },
};
