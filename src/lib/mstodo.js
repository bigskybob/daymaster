// #34 — Microsoft To Do via Microsoft Graph. Browser calls Graph directly with
// the MSAL-issued delegated token (Graph supports CORS for SPA-registered apps).
import { msGetToken } from "./msauth.js";

const GRAPH = "https://graph.microsoft.com/v1.0";

async function graph(path, opts = {}) {
  const token = await msGetToken();
  if (!token) throw new Error("Not signed in to Microsoft");
  const res = await fetch(GRAPH + path, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (!res.ok) {
    let msg = `Graph ${res.status}`;
    try { const e = await res.json(); msg = e.error?.message || msg; } catch {}
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

export async function listLists() {
  const data = await graph("/me/todo/lists");
  return (data.value || []).map(l => ({
    id: l.id,
    name: l.displayName,
    isDefault: l.wellknownListName === "defaultList",
  }));
}

// Returns up to 50 tasks for a list (newest first). Caller filters completed.
export async function listTasks(listId) {
  const data = await graph(`/me/todo/lists/${encodeURIComponent(listId)}/tasks?$top=50`);
  return (data.value || []).map(t => ({ id: t.id, title: t.title, status: t.status }));
}

export async function addTask(listId, title) {
  return graph(`/me/todo/lists/${encodeURIComponent(listId)}/tasks`, {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export async function completeTask(listId, taskId) {
  return graph(`/me/todo/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "completed" }),
  });
}
