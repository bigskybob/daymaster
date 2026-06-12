// #59 — selectable color themes. Each key has a matching [data-theme="<key>"]
// CSS-variable block in the global <style>. The header theme picker writes the
// key to state → persisted to localStorage (THEME_KEY) and set on documentElement.
export const THEMES = [
  { key: "dark",    name: "🌙 Dark" },
  { key: "light",   name: "☀️ Light" },
  { key: "forest",  name: "🌲 Forest" },
  { key: "desert",  name: "🏜️ Desert" },
  { key: "ocean",   name: "🌊 Ocean" },
  // #74 — novelty / throwback palettes (Hot Dog Stand is the authentic Windows 3.1 scheme).
  { key: "cherry",  name: "🌸 Cherry Blossom" },
  { key: "skyblue", name: "🌤 Sky Blue" },
  { key: "irish",   name: "☘️ Luck of the Irish" },
  { key: "eagle",   name: "🦅 Eagle Eye" },
  { key: "lumber",  name: "🪵 Lumberjack" },
  { key: "ketchup", name: "🍔 Ketchup / Mustard" },
  { key: "hotdog",  name: "🌭 Hot Dog Stand" },
];

// #60 — selectable font styles. Each key (except "mono") has a [data-font="<key>"]
// CSS block swapping --font-body / --font-display. Same pattern as THEMES.
export const FONTS = [
  { key: "mono",    name: "Aa Mono" },
  { key: "sans",    name: "Aa Sans" },
  { key: "serif",   name: "Aa Serif" },
  { key: "rounded", name: "Aa Rounded" },
  { key: "slab",    name: "Aa Slab" },
];
