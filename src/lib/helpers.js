// Pure date/id helpers extracted from app.js (Phase 0 of #53).
// Canonical home for these — app.js keeps its own copies until Phase 2 cutover.

export const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
export const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}

export function fmtDate(key) {
  const [y,m,d] = key.split("-");
  const dt = new Date(+y, +m-1, +d);
  return `${DAYS[dt.getDay()]}, ${MONTHS[dt.getMonth()]} ${d}, ${y}`;
}

export function uid() { return Math.random().toString(36).slice(2,9); }
