# Daymaster — build & deploy

## Architecture (post #53 module migration)

The app is being migrated from a single in-browser-Babel file to a bundled Vite build.

```
src/
  config.js              window.DAYMASTER_CONFIG → constants
  main.jsx               entry: mounts <App>
  App.jsx                app shell: TileLibrary, ConfigModal, HistoryView, SyncDot, App
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
    audio.js             WebAudio beeps
test/                    Vitest specs (store, rules, sync, App mount smoke)
```

## Commands

```bash
npm install        # once
npm test           # Vitest suite (27 tests)
npm run build      # Vite production build → docs/ (gitignored)
npm run dev        # local dev server (uses app.build.html)
```

## Current state

- **LIVE site** is still served from the repo-root `index.html` + `app.js`
  (in-browser Babel, React via CDN). These are FROZEN — make new changes in `src/`.
- The `src/` build is verified (build green, 27 tests green) but **not yet deployed**.

## Cutover (one-time, owner action required)

1. Decide deploy mechanism — recommended: **GitHub Actions**.
2. Repo **Settings → Pages → Source → "GitHub Actions"**.
3. Actions tab → **"Deploy to GitHub Pages" → Run workflow** (it builds, runs tests,
   renames `app.build.html` → `index.html`, and deploys `docs/`).
4. Verify the new site at `https://bigskybob.github.io/daymaster/`.
5. Once confirmed, delete the legacy root `app.js` and replace the root `index.html`
   with the built shell (or keep Pages on Actions and ignore the legacy files).
6. After cutover, change `.github/workflows/deploy.yml` trigger to
   `on: push: branches: [main]` for automatic deploys.

> Cutover is also what finally ships the **#53 Phase 1 sync data-loss fix** to the
> live app (it currently lives in `src/lib/sync.js` + the frozen `app.js`, but the
> deployed bundle is what users run).
