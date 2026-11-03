// Persistent per-browser settings (localStorage, wrapped for private modes).
const KEY = 'midlane.settings.v1';
const DEFAULTS = {
  name: '',
  master: 0.8, sfx: 0.9, music: 0.55, voice: 0.9,
  quality: 'high',
  announcer: true,
  cpuLevel: 1,
  roundsToWin: 2,
  runes: true,
  shop: true,
  bindings: null,
  delay: 1,
  showFps: false,
};
let cache = null;
export function loadSettings() {
  if (cache) return cache;
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { s = {}; }
  cache = Object.assign({}, DEFAULTS, s);
  return cache;
}
export function saveSettings(s) {
  cache = Object.assign({}, cache || DEFAULTS, s);
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* storage unavailable */ }
  return cache;
}
