# Daymaster — build & deploy

Daymaster is a React SPA (bundled with Vite) served from **GitHub Pages**, plus a
thin **Cloudflare Worker** API proxy for integrations that browsers can't call
directly (Notion). The legacy single-file / in-browser-Babel app has been retired.

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
    token.js             OAuth access-token holder
    notion.js            client for the Worker (sendIdea / fetchFavorites)
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

- `POST /ideas` → append to the Incoming Ideas Notion page (**#40**, live)
- `GET /links` → query a favorites DB → `[{label,url}]` (**#50**, endpoint ready)

Deployed from a terminal (not Git-connected): `cd worker && npx wrangler deploy`.
Secrets: `npx wrangler secret put NOTION_TOKEN`. Full runbook + troubleshooting in
[`worker/README.md`](worker/README.md). The frontend points at it via
`WORKER_URL` in `index.html`.
