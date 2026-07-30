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

// All non-trashed `daymaster-data.json` files in the folder, **newest first**.
//
// Historically the app could end up with DUPLICATE data files in one folder (a
// create racing a slow find, or two devices both creating before either had
// synced). The old findDataFile grabbed an arbitrary `files[0]`, so a refresh
// could land on a stale copy and appear to "lose" recent work, and saves could
// diverge across copies. We now sort by modifiedTime and let loadFromDrive merge
// every copy, so no duplicate can shadow another's data.
export let _dataFileIds = [];
// #63 — non-canonical duplicate copies seen at load, retired (trashed) after the
// next successful consolidating save. Empty in the normal single-file case.
export let _staleDuplicateIds = [];

export async function findDataFiles(folderId) {
  const q = encodeURIComponent(`name='${FILENAME}' and '${folderId}' in parents and trashed=false`);
  const res = await driveRequest(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)`);
  const data = await res.json();
  const files = (data.files || []).slice().sort((a, b) =>
    String(b.modifiedTime || "").localeCompare(String(a.modifiedTime || "")));
  _dataFileIds = files.map(f => f.id);
  return files;
}

export async function findDataFile(folderId) {
  if (_fileId) return _fileId;
  const files = await findDataFiles(folderId);
  _fileId = files.length ? files[0].id : null; // newest
  return _fileId;
}

export async function loadFromDrive() {
  const folderId = await ensureFolder();
  const files = await findDataFiles(folderId);
  if (!files.length) { _fileId = null; _staleDuplicateIds = []; return null; }
  // The newest copy is canonical — the next save writes here, consolidating the
  // merge back into one file. Track its revision for concurrent-write detection.
  _fileId = files[0].id;
  // #63 — the other copies' data is folded into the merge below, so queue them to
  // be trashed after the next consolidating save (collapsing the folder to one file).
  _staleDuplicateIds = files.slice(1).map(f => f.id);
  try {
    const meta = await driveRequest(`https://www.googleapis.com/drive/v3/files/${_fileId}?fields=headRevisionId`);
    _remoteRevision = (await meta.json()).headRevisionId || null;
  } catch { _remoteRevision = null; }
  // Read + merge every copy (newest preferred on ties) so a historical duplicate
  // can't drop recent work. Single file is the common case — one read, no merge.
  const stores = [];
  for (const f of files) {
    try {
      const res = await driveRequest(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`);
      stores.push(JSON.parse(await res.text()));
    } catch (e) {
      console.warn("Drive: skipping unreadable data-file copy", f.id, e);
    }
  }
  if (!stores.length) return null;
  return stores.reduce((acc, s) => mergeStores(acc, s));
}

// #63 — move a file to Drive trash (reversible ~30 days). Used to retire duplicate
// data files once their contents have been merged into the canonical copy.
export async function trashFile(fileId) {
  await driveRequest(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
}

// #63 — after a consolidating save, retire the duplicate copies whose data is now
// folded into the canonical file. Best-effort and reversible: failures are re-queued
// for a later save and never block persistence. Runs only when duplicates exist.
export async function trashStaleDuplicates() {
  if (!_staleDuplicateIds.length) return;
  const ids = _staleDuplicateIds;
  _staleDuplicateIds = [];
  const results = await Promise.allSettled(ids.map(id => trashFile(id)));
  const ok = results.filter(r => r.status === "fulfilled").length;
  if (ok) console.info(`Drive: retired ${ok} duplicate data file(s) after consolidation`);
  results.forEach((r, i) => { if (r.status === "rejected") _staleDuplicateIds.push(ids[i]); });
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
    // #102 Phase 1 — compact serialization: the whole store re-uploads on every
    // 2s debounce, and pretty-printing roughly doubles the bytes for a file no
    // human reads in place. (Backups from the app stay pretty — this is only the
    // sync payload.)
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    const patched = await driveRequest(`https://www.googleapis.com/upload/drive/v3/files/${_fileId}?uploadType=media&fields=headRevisionId`, {
      method: "PATCH",
      body: blob,
      headers: { "Content-Type": "application/json" }
    });
    try { _remoteRevision = (await patched.json()).headRevisionId || _remoteRevision; } catch {}
    // #63 — the union is now safely on the canonical file; collapse the duplicates.
    await trashStaleDuplicates();
  } else {
    // Create new file with metadata
    const meta = { name: FILENAME, parents: [folderId] };
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(meta)], { type: "application/json" }));
    form.append("file", new Blob([JSON.stringify(payload)], { type: "application/json" })); // #102 Phase 1 — compact
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
