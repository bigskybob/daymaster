// Daymaster API proxy — Cloudflare Worker.
//
// Why this exists: Daymaster is a static GitHub Pages SPA. Browsers block direct
// calls to the Notion API (CORS) and we must not ship the Notion token in
// client-side JS. This Worker holds the secret server-side, adds CORS, and only
// answers requests that carry a valid Google access token minted by the app.
//
// Endpoints (all require `Authorization: Bearer <google_access_token>`):
//   POST /ideas   { text }   → add a paragraph under the Incoming Ideas page's
//                              "Ideas" heading (falls back to page end)          (#40)
//   GET  /links              → query a Notion DB → [{label,url}]                (#50)
//   GET  /projects           → Mission Control feed rows                        (#88)
//
// Env (set via wrangler.toml [vars] and `wrangler secret put`):
//   NOTION_TOKEN           (secret)  Notion internal integration token
//   GOOGLE_CLIENT_ID       (var)     app OAuth client id — token audience must match
//   OWNER_EMAIL            (var,opt)  if set AND the token carries an email, restrict to it
//   ALLOWED_ORIGIN         (var)     e.g. https://bigskybob.github.io
//   INCOMING_IDEAS_PAGE_ID (var)     Notion page id appended to by /ideas
//   FAVORITES_DB_ID        (var,opt)  Notion database id queried by /links
//   FAVORITES_FILTER       (var,opt)  JSON Notion filter applied to /links
//   PROJECTS_DB_ID         (var,opt)  Mission Control Projects db queried by /projects

const NOTION_VERSION = "2022-06-28";

// #88 — /projects. The Worker stays deliberately dumb: it maps and normalizes every
// row and sorts by Last Worked, but does NOT apply the tile's count / sortBy /
// statusFilter. Those are per-tile config (and multiple tiles may differ), so doing
// them client-side keeps ONE cache entry serving every configuration.
const PROJECTS_MAX = 20;          // sanity bound; the board holds ~13
const NEXT_STEP_MAX = 90;         // Next Step runs to 1,400+ chars — never render raw
const PROJECTS_CACHE_TTL = 300;   // seconds; the board changes a few times a day
const PROJECTS_CACHE_KEY = "https://daymaster-api.internal/projects";

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

// Find the id of the "Ideas" heading on the inbox page so new ideas land under it
// rather than at the very end of the page (after the processing log) — #40 follow-up.
// Returns null if the page can't be read or has no such heading, in which case the
// caller appends to the end (legacy behavior).
async function findIdeasAnchor(env) {
  const r = await notion(env, `/blocks/${env.INCOMING_IDEAS_PAGE_ID}/children`, "GET");
  if (!r.ok) return null;
  for (const block of r.data.results || []) {
    const h = block.type === "heading_2" && block.heading_2;
    if (!h) continue;
    const text = (h.rich_text || []).map(t => t.plain_text).join("").trim().toLowerCase();
    if (text === "ideas") return block.id;
  }
  return null;
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

// --- #88 Mission Control feed helpers -------------------------------------

// The Projects db stores Progress on TWO scales — Vocal Inbox holds 94 while
// Mission Control holds 0.95. Notion's percent format displays both correctly, so
// the inconsistency is invisible in the UI and only bites API consumers: raw, a
// `width: ${p}%` bar renders 0.95 as a 1% sliver next to 94. Normalize to 0–100.
// Ambiguous only at a true 1% (0.01 vs 1), which does not occur in this dataset —
// and a project sitting at exactly 1% reads fine either way.
export function normalizeProgress(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const pct = n > 0 && n <= 1 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

// Priority values carry their emoji ("🟠 High"). Strip it for logic, the caller
// keeps the raw value for display.
export function stripPriorityEmoji(value) {
  return (value || "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
}

// Next Step is a paragraph, not a line (Chronocheck: 1,430 chars). Prefer the first
// sentence when one fits, else cut on a word boundary. Full text is returned
// separately for hover/tap.
export function firstSentence(text, max = NEXT_STEP_MAX) {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  // Cut to the first sentence wherever it ends — one clause reads better on a tile
  // row than two that merely happen to fit under the cap. Requiring whitespace-or-end
  // after the punctuation keeps decimals and ids like "19cffcf2" intact.
  const stop = t.search(/[.!?](\s|$)/);
  const sentence = stop > 0 ? t.slice(0, stop + 1) : t;
  if (sentence.length <= max) return sentence;
  const cut = sentence.lastIndexOf(" ", max);
  return sentence.slice(0, cut > max / 2 ? cut : max).trimEnd() + "…";
}

function plain(prop) {
  const rt = (prop && (prop.rich_text || prop.title)) || [];
  return rt.map(t => t.plain_text).join("").trim();
}

// Map a Notion Projects row → one feed row. Returns null for untitled rows.
export function pageToProject(page) {
  const props = page.properties || {};
  const name = plain(props.Project);
  if (!name) return null;
  const nextStepFull = plain(props["Next Step"]);
  const priorityRaw = (props.Priority && props.Priority.select && props.Priority.select.name) || "";
  return {
    name,
    // The page icon is not a property — it rides on the response as page.icon.emoji,
    // and is what makes the feed scannable. Non-emoji icons (uploaded files) → null.
    icon: (page.icon && page.icon.emoji) || null,
    status: (props.Status && props.Status.select && props.Status.select.name) || null,
    progress: normalizeProgress(props.Progress && props.Progress.number),
    priority: priorityRaw || null,
    priorityLabel: stripPriorityEmoji(priorityRaw) || null,
    lastWorked: (props["Last Worked"] && props["Last Worked"].date && props["Last Worked"].date.start) || null,
    owner: (props["Owner of Next"] && props["Owner of Next"].select && props["Owner of Next"].select.name) || null,
    oneLiner: plain(props["One-Liner"]) || null,
    nextStep: firstSentence(nextStepFull) || null,
    nextStepFull: nextStepFull || null,
    url: (props["Repo / Spec"] && props["Repo / Spec"].url) || page.url || null,
  };
}

// Cache the mapped payload so a phone reload doesn't cost a Notion call. Only ever
// reached AFTER verifyCaller passes, and the Worker is single-owner (OWNER_EMAIL),
// so there is no cross-user leak in a shared entry. Errors are never cached.
async function cachedProjects(produce) {
  const store = typeof caches !== "undefined" && caches.default;
  if (!store) return produce();
  const key = new Request(PROJECTS_CACHE_KEY);
  const hit = await store.match(key);
  if (hit) return hit.json();
  const data = await produce();
  if (data && !data.error) {
    await store.put(key, new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${PROJECTS_CACHE_TTL}` },
    }));
  }
  return data;
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
        const anchor = await findIdeasAnchor(env);
        const payload = {
          children: [{
            object: "block",
            type: "paragraph",
            paragraph: { rich_text: [{ type: "text", text: { content: text } }] },
          }],
        };
        if (anchor) payload.after = anchor; // land under "## Ideas", not after the processing log
        const r = await notion(env, `/blocks/${env.INCOMING_IDEAS_PAGE_ID}/children`, "PATCH", payload);
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

      if (request.method === "GET" && url.pathname === "/projects") {
        // Unconfigured behaves like /links: an empty feed, not an error, so the tile
        // degrades quietly instead of showing a failure on every load.
        if (!env.PROJECTS_DB_ID) return json(env, 200, { projects: [] });
        const payload = await cachedProjects(async () => {
          const r = await notion(env, `/databases/${env.PROJECTS_DB_ID}/query`, "POST", {
            sorts: [{ property: "Last Worked", direction: "descending" }],
            page_size: PROJECTS_MAX,
          });
          if (!r.ok) return { error: "notion", status: r.status, detail: r.data };
          const projects = (r.data.results || []).map(pageToProject).filter(Boolean);
          return { projects: projects.slice(0, PROJECTS_MAX) };
        });
        if (payload.error) {
          return json(env, payload.status || 502, { error: payload.error, detail: payload.detail });
        }
        return json(env, 200, payload);
      }

      return json(env, 404, { error: "not found" });
    } catch (e) {
      return json(env, 500, { error: String((e && e.message) || e) });
    }
  },
};
