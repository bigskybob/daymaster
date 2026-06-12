// Pure date/id helpers extracted from app.js (Phase 0 of #53).
// Canonical home for these — app.js keeps its own copies until Phase 2 cutover.

export const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
export const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}

// #78 — day keys are unpadded "Y-M-D" (e.g. 2026-6-9 / 2026-6-11), so a string
// compare alphabetizes the leading digit and ranks "11" before "9". Sort on the
// real calendar value instead. Works for padded or unpadded keys.
export function dayKeyVal(key) {
  const [y,m,d] = String(key).split("-").map(Number);
  return (y||0)*10000 + (m||0)*100 + (d||0);
}

export function fmtDate(key) {
  const [y,m,d] = key.split("-");
  const dt = new Date(+y, +m-1, +d);
  return `${DAYS[dt.getDay()]}, ${MONTHS[dt.getMonth()]} ${d}, ${y}`;
}

export function uid() { return Math.random().toString(36).slice(2,9); }
