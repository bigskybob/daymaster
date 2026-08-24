// Client for the Daymaster API proxy Worker (Notion features). All calls carry
// the current Google access token; the Worker verifies it before touching Notion.
// No-ops gracefully when WORKER_URL isn't configured yet, so the UI can ship
// before the Worker is deployed.
import { WORKER_URL } from "../config.js";
import { getToken } from "./token.js";

export function workerConfigured() {
  return !!WORKER_URL;
}

// #112 — send a capture to ClipJob for triage (was #40's direct write to the
// Daymaster Incoming Ideas page, which is what broke). The Worker holds the Slack
// token and posts as the owner into ClipJob's Socket Mode door; ClipJob's Claude
// triage then decides where the thought actually belongs. The /ideas route it
// replaces still exists on the Worker for callers that want the Notion page.
export async function sendCapture(text) {
  if (!WORKER_URL) throw new Error("Capture isn't configured (no WORKER_URL).");
  const res = await fetch(`${WORKER_URL}/capture`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    let why = `${res.status}`;
    try {
      const j = await res.json();
      if (j.error === "unauthorized") why = "not authorized (re-connect Drive)";
      // Slack's own error strings are the useful ones: invalid_auth means the
      // token needs rotating, not_in_channel means the bot isn't in #cj-inbox.
      else if (j.error === "slack") why = `Slack: ${j.detail || "rejected"}`;
      else if (j.error) why = j.error;
    } catch {}
    throw new Error(why);
  }
  return res.json();
}

// #50 — fetch dynamic quick-links from the configured Notion favorites query.
export async function fetchFavorites() {
  if (!WORKER_URL) return [];
  const res = await fetch(`${WORKER_URL}/links`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data.links) ? data.links : [];
}
