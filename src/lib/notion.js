// Client for the Daymaster API proxy Worker (Notion features). All calls carry
// the current Google access token; the Worker verifies it before touching Notion.
// No-ops gracefully when WORKER_URL isn't configured yet, so the UI can ship
// before the Worker is deployed.
import { WORKER_URL } from "../config.js";
import { getToken } from "./token.js";

export function workerConfigured() {
  return !!WORKER_URL;
}

// #40 — append a free-text idea to the Incoming Ideas Notion page.
export async function sendIdea(text) {
  if (!WORKER_URL) throw new Error("Idea inbox isn't configured (no WORKER_URL).");
  const res = await fetch(`${WORKER_URL}/ideas`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Idea send failed (${res.status})`);
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
