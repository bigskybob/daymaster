# Daymaster API proxy (Cloudflare Worker)

A tiny Worker that lets the static Daymaster SPA use the Notion API. It holds the
Notion token server-side, adds CORS, and only answers requests carrying a valid
Google access token minted by the Daymaster OAuth client.

**Endpoints** (all need `Authorization: Bearer <google_access_token>`):
- `POST /ideas` `{ "text": "..." }` → adds a paragraph **under the "Ideas" heading** on
  the Incoming Ideas page (falls back to the page end if the heading is missing) (**#40**)
- `GET /links` → queries the configured Notion favorites DB → `{ "links": [{label,url}] }` (**#50**)

---

## One-time setup (~10 min)

### 1. Cloudflare account
1. Sign up free at **dash.cloudflare.com/sign-up**.
2. Install the CLI and log in:
   ```bash
   cd worker
   npm install
   npx wrangler login      # opens a browser to authorize
   ```

### 2. Notion integration token
1. Go to **notion.so/my-integrations** → **New integration** (internal). Name it `Daymaster`.
2. Copy the **Internal Integration Secret** (starts `ntn_…` / `secret_…`).
3. **Share the pages with it:** open the **Daymaster — Incoming Ideas** page in Notion →
   `•••` menu → **Connections** → add `Daymaster`. (Do the same for the favorites
   database later, for `/links`.)

### 3. Configure + deploy
```bash
cd worker
npx wrangler secret put NOTION_TOKEN     # paste the Notion secret when prompted
npx wrangler deploy
```
`wrangler deploy` prints the URL, e.g. `https://daymaster-api.<your-subdomain>.workers.dev`.

The non-secret config (client id, owner email, allowed origin, Incoming Ideas page id)
is already in `wrangler.toml` — adjust if needed.

### 4. Point the app at the Worker
In the repo root `index.html`, set:
```js
WORKER_URL: "https://daymaster-api.<your-subdomain>.workers.dev",
```
Commit + push to `main` → it auto-deploys. The in-app "send idea → Notion" capture
(and dynamic links) light up once this is set.

### 5. Quick test
```bash
# expect 401 (no token) — proves the Worker is up and gating:
curl -i https://daymaster-api.<your-subdomain>.workers.dev/links
```
Then try the in-app capture once `WORKER_URL` is live.

---

## Notes
- **Access control (owner-only, #62):** the app requests `openid email` in `SCOPES`
  (`src/config.js`), so access tokens carry the signed-in email and the Worker enforces
  `OWNER_EMAIL` — any other Google account gets a `401`. That 401 (visible in
  `npx wrangler tail` or the Cloudflare dashboard) is also the "someone else tried"
  signal. The audience check (token minted by the Daymaster OAuth client) and the locked
  `ALLOWED_ORIGIN` still apply. Safe fallback: a token without an email gates on audience
  alone, so there's no lockout window during a scope change.
  - **Activating it after a scope change:** redeploy the Worker, then in the live app use
    **⎋ Sign out → ↻ Connect Drive** to re-consent and mint an email-bearing token.
    Deploy the Worker *before* re-consenting (a new token is harmless against the old
    Worker; the gate just won't enforce until the redeploy lands).
- **Favorites DB (#50):** uncomment `FAVORITES_DB_ID` (+ optional `FAVORITES_FILTER`)
  in `wrangler.toml`, share that DB with the integration, redeploy.
- **Local dev:** `npm run dev` runs the Worker locally via miniflare.
- Tests for the Worker live in the repo root: `npm test` (see `test/worker.test.js`).
