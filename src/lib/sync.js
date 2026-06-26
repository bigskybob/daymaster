// Phase 1 of #53 — conflict-safe merge for the single Drive JSON store.
//
// The legacy saveToDrive overwrote the whole file (last-write-wins → cross-device
// data loss: edit on phone, then iPad, and the last writer clobbers a whole day
// while the "saved" dot still shows success). mergeStores reconciles a local and a
// remote store without losing either side's work:
//
//   - a day present on only one side is kept as-is
//   - a day present on both: reconciled at TILE granularity by mergeDay() — the
//     union of both sides' tiles, with a tile present on BOTH resolved by the day's
//     newer `__mtime` (tie → local). See mergeDay for why day-level last-write-wins
//     was a data-loss bug.
//   - layouts / activeLayout / version: taken from whichever store has the newer
//     top-level `__savedAt` (tie → local), since layout edits are deliberate and rare
//
// `__mtime` is stamped per-day whenever a tile in that day is edited; `__savedAt`
// is stamped per-store on each save. Both are plain millisecond timestamps.
//
// This is pure and deterministic given its inputs — the unit tests pass timestamps
// explicitly rather than relying on the clock.

// Reconcile a single day present on BOTH sides, at TILE granularity.
//
// A day object's keys are individual tile-ids (donts, priorities, gratint, checkin1,
// sxzhbum, …) plus the `__mtime` stamp. The previous logic discarded the ENTIRE
// losing day based on one `__mtime` comparison — a cross-device data-loss bug:
//
//   Open Daymaster fresh on a second machine. localStorage is empty, so today starts
//   blank; the Quote tile then auto-fetches and writes its tile, stamping a *fresh*
//   `__mtime` on an otherwise-empty day. When the post-auth sync merges that day
//   against the rich copy already on Drive (donts, priorities, check-ins, pushups…),
//   the near-empty local day had the NEWER `__mtime` and clobbered the whole day.
//
// Unioning the tiles fixes this generally — for the Quote tile and any other tile
// that writes on load (calendar cache, etc.). Only a tile present on BOTH sides is
// contested, and there the day with the newer `__mtime` wins (tie → local). This is
// safe against resurrecting cleared data because clearing a field WRITES an empty
// tile value (it never deletes the tile key), so the cleared value still wins the
// contested key on the device that cleared it.
export function mergeDay(local, remote) {
  const lm = local.__mtime || 0;
  const rm = remote.__mtime || 0;
  const newer = rm > lm ? remote : local; // wins contested tiles; tie → local
  const older = rm > lm ? local : remote;
  // Shallow tile-level union: `older` supplies tiles the newer side never wrote,
  // `newer` overwrites any shared tile. `__mtime` carries the surviving (max) stamp.
  return { ...older, ...newer, __mtime: Math.max(lm, rm) };
}

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
    else days[date] = mergeDay(l, r); // both sides have the day → tile-level union
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
