// Phase 1 of #53 — conflict-safe merge for the single Drive JSON store.
//
// The legacy saveToDrive overwrote the whole file (last-write-wins → cross-device
// data loss: edit on phone, then iPad, and the last writer clobbers a whole day
// while the "saved" dot still shows success). mergeStores reconciles a local and a
// remote store without losing either side's work, at DAY granularity:
//
//   - a day present on only one side is kept as-is
//   - a day present on both: the copy with the newer `__mtime` wins (tie → local)
//   - layouts / activeLayout / version: taken from whichever store has the newer
//     top-level `__savedAt` (tie → local), since layout edits are deliberate and rare
//
// `__mtime` is stamped per-day whenever a tile in that day is edited; `__savedAt`
// is stamped per-store on each save. Both are plain millisecond timestamps.
//
// This is pure and deterministic given its inputs — the unit tests pass timestamps
// explicitly rather than relying on the clock.

export function mergeStores(local, remote) {
  if (!remote) return local;
  if (!local) return remote;

  const localSaved = local.__savedAt || 0;
  const remoteSaved = remote.__savedAt || 0;
  // Layout section is taken wholesale from the more-recently-saved store.
  const layoutWinner = remoteSaved > localSaved ? remote : local;

  const days = {};
  const allDates = new Set([
    ...Object.keys(local.days || {}),
    ...Object.keys(remote.days || {}),
  ]);
  for (const date of allDates) {
    const l = local.days?.[date];
    const r = remote.days?.[date];
    if (l && !r) days[date] = l;
    else if (r && !l) days[date] = r;
    else {
      const lm = l.__mtime || 0;
      const rm = r.__mtime || 0;
      days[date] = rm > lm ? r : l; // tie → local (the device that initiated the save)
    }
  }

  return {
    version: Math.max(local.version || 0, remote.version || 0),
    activeLayout: layoutWinner.activeLayout,
    layouts: layoutWinner.layouts,
    days,
    __savedAt: Math.max(localSaved, remoteSaved),
  };
}

// Stamp a day's modified time. Call whenever a tile's per-day data changes so
// mergeStores can pick the freshest copy of a contested day.
export function touchDay(store, dateKey, now) {
  if (!store?.days?.[dateKey]) return store;
  store.days[dateKey].__mtime = now;
  return store;
}
