// Google Drive persistence layer (Phase 2 split of #53).
import { DRIVE_FOLDER } from "../config.js";
import { getToken } from "./token.js";
import { mergeStores } from "./sync.js";

export let _folderId = null;
export let _fileId = null;
// #53 Phase 1 — last-known Drive revision, used to detect concurrent writes from
// another device before we overwrite (see saveToDrive / mergeStores below).
export let _remoteRevision = null;
export const FILENAME = "daymaster-data.json";


export async function driveRequest(url, opts = {}) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");
  const res = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts.headers||{}) }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive error ${res.status}: ${err}`);
  }
  return res;
}

export async function ensureFolder() {
  if (_folderId) return _folderId;
  // Search for existing folder
  const q = encodeURIComponent(`name='${DRIVE_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await driveRequest(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`);
  const data = await res.json();
  if (data.files && data.files.length > 0) {
    _folderId = data.files[0].id;
    return _folderId;
  }
  // Create folder
  const create = await driveRequest("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: DRIVE_FOLDER, mimeType: "application/vnd.google-apps.folder" })
  });
  const folder = await create.json();
  _folderId = folder.id;
  return _folderId;
}

export async function findDataFile(folderId) {
  if (_fileId) return _fileId;
  const q = encodeURIComponent(`name='${FILENAME}' and '${folderId}' in parents and trashed=false`);
  const res = await driveRequest(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`);
  const data = await res.json();
  if (data.files && data.files.length > 0) {
    _fileId = data.files[0].id;
    return _fileId;
  }
  return null;
}

export async function loadFromDrive() {
  const folderId = await ensureFolder();
  const fileId = await findDataFile(folderId);
  if (!fileId) return null;
  // #53 Phase 1 — record the revision we're loading so a later save can detect
  // whether another device wrote in the meantime.
  try {
    const meta = await driveRequest(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=headRevisionId`);
    _remoteRevision = (await meta.json()).headRevisionId || null;
  } catch { _remoteRevision = null; }
  const res = await driveRequest(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  const text = await res.text();
  return JSON.parse(text);
}

// #53 Phase 1 — returns a merged store when a remote conflict was reconciled in
// (so the caller can adopt it), otherwise null. Stamps __savedAt on the payload
// and tracks the resulting Drive revision.
export async function saveToDrive(store) {
  const folderId = await ensureFolder();
  let payload = { ...store, __savedAt: Date.now() };
  let merged = null;

  if (_fileId) {
    // Detect a concurrent write from another device before clobbering it.
    try {
      const cur = await driveRequest(`https://www.googleapis.com/drive/v3/files/${_fileId}?fields=headRevisionId`);
      const curRev = (await cur.json()).headRevisionId || null;
      if (_remoteRevision && curRev && curRev !== _remoteRevision) {
        const res = await driveRequest(`https://www.googleapis.com/drive/v3/files/${_fileId}?alt=media`);
        const remote = JSON.parse(await res.text());
        payload = mergeStores(payload, remote);
        merged = payload;
      }
    } catch (e) {
      // If the revision check fails, fall through to a plain save rather than
      // block persistence entirely — losing the merge is better than losing data.
      console.warn("Drive revision check failed; saving without merge", e);
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const patched = await driveRequest(`https://www.googleapis.com/upload/drive/v3/files/${_fileId}?uploadType=media&fields=headRevisionId`, {
      method: "PATCH",
      body: blob,
      headers: { "Content-Type": "application/json" }
    });
    try { _remoteRevision = (await patched.json()).headRevisionId || _remoteRevision; } catch {}
  } else {
    // Create new file with metadata
    const meta = { name: FILENAME, parents: [folderId] };
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(meta)], { type: "application/json" }));
    form.append("file", new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const res = await driveRequest("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,headRevisionId", {
      method: "POST",
      body: form
    });
    const created = await res.json();
    _fileId = created.id;
    _remoteRevision = created.headRevisionId || null;
  }
  return merged;
}
