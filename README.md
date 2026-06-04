# Daymaster

A modular, tile-based daily planner (PWA) that syncs through your own Google Drive.
React + Vite frontend on GitHub Pages, with a small Cloudflare Worker for Notion
integration. Each user's data lives in their own Drive file (`drive.file` scope).

**Live:** https://bigskybob.github.io/daymaster/

## Highlights
- **Tile system** — checklists, check-ins, trackers (planks/pushups/dangles with
  timers), priorities, projects, food log, quote, inline Google Calendar, AI ideas,
  Notion links, and more. Add/move/configure tiles in edit mode; save layout presets.
- **Auto-rule engine** — a tile's checkbox can auto-complete from another tile's
  state (e.g. check-in "Planks or Pushups" ticks from the tracker).
- **Drive sync** — every change saves locally, then to Drive; concurrent edits from
  multiple devices are merged per-day (no last-write-wins data loss).
- **Notion idea capture** — `💡 Idea` in the header appends a thought straight to a
  Notion inbox page via the Worker.

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
