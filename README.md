# Daymaster

A modular, tile-based daily planner (PWA) that syncs through your own Google Drive.
React + Vite frontend on GitHub Pages, with a small Cloudflare Worker for Notion and
client-side MSAL for Microsoft To Do. Each user's data lives in their own Drive file
(`drive.file` scope).

**Live:** https://bigskybob.github.io/daymaster/

## Highlights
- **Tile system** — checklists, check-ins, trackers (planks/pushups/dangles with
  timers), priorities, projects, food log, quote, inline Google Calendar, AI ideas
  & AI planner, Notion links, Microsoft To Do, and more. Add/move/configure tiles in
  edit mode; save layout presets.
- **Auto-rule engine** — a tile's checkbox can auto-complete from another tile's
  state (e.g. check-in "Planks or Pushups" ticks from the tracker).
- **Drive sync** — every change saves locally, then to Drive; concurrent edits from
  multiple devices are merged **per tile within each day**, so a sparse copy on one
  device (e.g. a fresh session that's only auto-loaded a quote) can't blank a fuller
  day saved from another. The first post-auth load also gates the first Drive write,
  so an empty local cache never overwrites good remote data.
- **Integrations** — Notion idea capture (`💡 Idea` → inbox page) and dynamic Notion
  quick-links via the Worker; **Microsoft To Do** (read filtered tasks + quick-capture)
  via client-side MSAL + Graph; inline Google Calendar.
- **Focus mode & themes** — collapse completed sections to one-liners; 5 color themes
  (dark / light / forest / desert / ocean). Build version + date shown in the footer.
- **Auth & owner gate** — connect or disconnect Drive sync from the header (**⎋ Sign
  out** revokes the token, forcing a fresh consent on reconnect). Sign-in requests the
  `email` scope so the Worker can gate Notion features to the owner's account (#62).

## Develop
```bash
npm install
npm test          # Vitest
npm run build     # → docs/
npm run dev       # local dev server
```

## Docs
- [`DEPLOY.md`](DEPLOY.md) — architecture, module map, build & deploy (frontend + Worker)
- [`worker/README.md`](worker/README.md) — Cloudflare Worker setup + Notion runbook

Pushing to `main` auto-builds and deploys to GitHub Pages (GitHub Actions).
