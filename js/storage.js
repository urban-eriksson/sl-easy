/**
 * localStorage wrapper for recent stations and user preferences.
 */

const RECENT_KEY = 'sl-easy-recent';
const PREFS_KEY = 'sl-easy-prefs';
const MAX_RECENT = 5;

/**
 * Get array of recent stations. Each entry: { id, name }
 */
export function getRecentStations() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY)) || [];
  } catch {
    return [];
  }
}

/**
 * Add a station to recents (most recent first, deduplicated, max 5).
 */
export function addRecentStation(station) {
  const recents = getRecentStations().filter((s) => s.id !== station.id);
  recents.unshift({ id: station.id, name: station.name });
  if (recents.length > MAX_RECENT) recents.length = MAX_RECENT;
  localStorage.setItem(RECENT_KEY, JSON.stringify(recents));
}

/**
 * Get user preferences object.
 */
export function getPreferences() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
  } catch {
    return {};
  }
}

/**
 * Save user preferences (merges with existing).
 */
export function savePreferences(prefs) {
  const current = getPreferences();
  localStorage.setItem(PREFS_KEY, JSON.stringify({ ...current, ...prefs }));
}
