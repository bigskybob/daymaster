// Tile type registry + default per-type config.

// ─── TILE TYPES REGISTRY ──────────────────────────────────────────────────────

export const TILE_TYPES = {
  checklist:  { label: "Checklist",      icon: "☑" },
  textprompt: { label: "Text Prompt",    icon: "✍" },
  priorities: { label: "Priorities",     icon: "①" },
  project:    { label: "Project Block",  icon: "▤" },
  freelist:   { label: "Free List",      icon: "≡" },
  twoprompt:  { label: "Two Prompts",    icon: "◫" },
  guidedam:   { label: "Guided AM",      icon: "➤" },
  checkin:    { label: "Check-In",       icon: "⏱" },
  twolists:   { label: "Two Lists",      icon: "⊞" },
  planks:     { label: "Planks",         icon: "▬" },
  pushups:    { label: "Pushups",        icon: "◉" },
  numbers:    { label: "Daily Numbers",  icon: "▲" },
  counter:    { label: "Counter",        icon: "+" },
  notes:      { label: "Notes",          icon: "✎" },
  foodlog:    { label: "Food Log",       icon: "⬡" },
  dangles:    { label: "Dangles",         icon: "↕" },
  musiclog:   { label: "Music Log",       icon: "♪" },
  quote:      { label: "Daily Quote",      icon: "✦" },
  gcal:       { label: "Google Calendar", icon: "🗓" },
  notionlinks:{ label: "Notion Links",    icon: "⌘" },
  ideas:      { label: "AI Ideas",        icon: "✲" },
};

export function defaultConfig(type) {
  const map = {
    checklist:  { title: "Checklist", accent: "#c8a96e", items: ["Item 1","Item 2","Item 3"] },
    textprompt: { title: "Prompt", accent: "#c8a96e", placeholder: "Write here..." },
    priorities: { title: "My Top Priorities", count: 3 },
    project:    { title: "Project", count: 4 },
    freelist:   { title: "List", count: 5, placeholder: "..." },
    twoprompt:  { titleA: "Prompt A", titleB: "Prompt B", placeholderA: "...", placeholderB: "...", accent: "#c8a96e" },
    // #3 — three-prompt guided flow tile (Gratitude → Intention → Priority by default).
    guidedam:   { titleA: "Gratitude", titleB: "Intention", titleC: "Today's Priority",
                  placeholderA: "What are you grateful for?",
                  placeholderB: "What do you intend to accomplish?",
                  placeholderC: "The one thing that matters most today...",
                  accent: "#c8a96e", mode: "all" },
    // #45 — planksSlot defaults to "am" for newly added check-ins; existing tiles get it via migration.
    checkin:    { title: "Check-In", color: "#8B4513", planksSlot: "am" },
    twolists:   { titleA: "List A", titleB: "List B", countA: 5, countB: 5 },
    planks:     { title: "Planks" },
    pushups:    { title: "Pushup Tracker" },
    numbers:    { title: "Daily Numbers" },
    notes:      { title: "Notes" },
    foodlog:    { title: "Food Log", meals: ["Breakfast","Lunch","Dinner","Snack"] },
    dangles:    { title: "Dangles" },
    // #11 — single-checkbox + free-text-note daily log for music sessions.
    musiclog:   { title: "Music Today", accent: "#8a6abf" },
    quote:      { title: "Today's Inspiration" },
    counter:    { title: "Counter", target: 10 },
    gcal:       { title: "Today's Calendar", refreshMinutes: 10, calendarId: "primary" },
    // #46 — static list of clickable Notion (or any) links. Pure UI, no API.
    // Dynamic version (live database queries) deferred to #50.
    notionlinks:{ title: "Notion Quick Links", accent: "#7a6abf",
                  links: [
                    { label: "Project Enhancement Hub", url: "https://www.notion.so/Project-Enhancement-Hub-35ed876ed61e8176b89acca7984123ca" },
                    { label: "Projects Home",           url: "https://www.notion.so/Projects-Home-e482841b692440fc9afcef8ad6f5caf8" },
                    { label: "Applications (Job Lab)",  url: "https://www.notion.so/d16c804a265b4834b7af42ab91bb0c1d?v=4faf230febe3461a91bd4905723d077e" },
                  ] },
    // #15 — "Build With AI" running idea log. Ideas live in config (layout-level),
    // not per-day data, so the list persists and accumulates across every day.
    ideas:      { title: "Build With AI", accent: "#7a6abf", ideas: [] },
  };
  return map[type] || { title: type };
}

