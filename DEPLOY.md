# Daymaster — build & deploy

Daymaster is a React SPA (bundled with Vite) served from **GitHub Pages**. Backend
integrations: a thin **Cloudflare Worker** proxy for Notion (browsers can't call it
directly), and **client-side MSAL** for Microsoft To Do (no server). The legacy
single-file / in-browser-Babel app has been retired.

## Frontend (`src/`)

```
src/
  config.js              window.DAYMASTER_CONFIG → constants (CLIENT_ID, WORKER_URL, …)
  main.jsx               entry: mounts <App>
  App.jsx                app shell: TileLibrary, ConfigModal, HistoryView, IdeaCaptureModal, App
  ui.jsx                 shared primitives: CardShell, AutoTA, BulletList, CB, EmojiPicker
  ui/FullscreenTimer.jsx countdown timer (planks/dangles)
  tiles.jsx              all Tile* renderers + RenderTile dispatch + AddProjectButton
  tiles/registry.js      TILE_TYPES + defaultConfig
  lib/
    helpers.js           DAYS/MONTHS/todayKey/fmtDate/uid
    rules.js             TILE_EVENTS + evaluateRule + check-in time helpers
    store.js             buildDefaultLayout/emptyStore/migrateLayout
    sync.js              mergeStores (conflict-safe Drive merge)  ← unit-tested
    drive.js             Google Drive persistence (revision check + merge)
    calendar.js          read-only Google Calendar
    token.js             Google OAuth access-token holder
    notion.js            client for the Worker (sendIdea #40 / fetchFavorites #50)
    msauth.js            Microsoft sign-in via MSAL (redirect flow) — #34
    mstodo.js            Microsoft To Do via Graph (list/add/complete) — #34
    version.js           build version + date (Vite-stamped) — #58
    audio.js             WebAudio beeps
test/                    Vitest specs (store, rules, sync, worker, App mount smoke)
```

### Commands
```bash
npm install        # once
npm test           # Vitest suite
npm run build      # Vite production build → docs/ (gitignored)
npm run dev        # local dev server
```

### Deploy (automatic)
`index.html` is the Vite entry. **Pushing to `main` auto-deploys** via
`.github/workflows/deploy.yml` (build → tests → publish `docs/` to Pages).
CI (`.github/workflows/ci.yml`) also runs tests + build on every push/PR.
GitHub Pages Source is set to **"GitHub Actions"**. Cutover from the legacy build
is complete — the root `app.js` / CDN-Babel `index.html` are gone.

## Backend — Cloudflare Worker (`worker/`)

A tiny API proxy that holds the Notion token server-side, adds CORS, and only
answers requests carrying a Google access token minted by the Daymaster OAuth
client. Live at `https://daymaster-api.robkillian.workers.dev`.

- `POST /ideas` → add to the Incoming Ideas Notion page, **under the "Ideas"
  heading** (falls back to page end) (**#40**, live)
- `GET /links` → query a favorites DB → `[{label,url}]` (**#50**, endpoint ready)

**Owner-only gate (#62):** `SCOPES` includes `openid email`, so tokens carry the
signed-in email and the Worker enforces `OWNER_EMAIL` (`wrangler.toml`) — any other
account gets a `401`, which doubles as the "someone else tried" signal (watch
`npx wrangler tail`). After changing the scope set, **redeploy the Worker, then use
the in-app ⎋ Sign out → ↻ Connect Drive to re-consent** and mint an email-bearing
token (deploy the Worker before re-consenting).

Tooling: the Worker uses **wrangler v4**. Deployed from a terminal (not
Git-connected): `cd worker && npx wrangler deploy`.
Secrets: `npx wrangler secret put NOTION_TOKEN`. Non-secret config (incl.
`FAVORITES_DB_ID` for #50) in `worker/wrangler.toml`. Full runbook + troubleshooting
in [`worker/README.md`](worker/README.md). The frontend points at it via
`WORKER_URL` in `index.html`.

## Microsoft To Do (#34) — no Worker

Client-side **MSAL** (`@azure/msal-browser`, dynamically imported so it code-splits).
`src/lib/msauth.js` signs in via the **redirect** flow (`common` authority, supports
personal accounts); `src/lib/mstodo.js` calls Microsoft Graph (`/me/todo/…`, scope
`Tasks.ReadWrite`) directly from the browser. Setup = a one-time Microsoft Entra
**SPA app registration** (redirect URI `https://bigskybob.github.io/daymaster/`),
whose Application (client) ID goes in `MS_CLIENT_ID` in `index.html`.
