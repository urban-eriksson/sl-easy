/**
 * localStorage wrapper for recent stations and user preferences.
 */

const RECENT_KEY = 'sl-easy-recent';
const PREFS_KEY = 'sl-easy-prefs';
const FILTERS_KEY = 'sl-easy-station-filters';
const MAX_RECENT = 5;

/**
 * Get array of recent stations. Each entry: { id, name }
 * Ids are normalized to numbers and duplicates dropped, healing entries
 * written by older app versions (string ids caused duplicate chips).
 */
export function getRecentStations() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY)) || [];
    const seen = new Set();
    const cleaned = [];
    for (const s of raw) {
      const id = Number(s?.id);
      if (!Number.isFinite(id) || seen.has(id) || !s.name) continue;
      seen.add(id);
      cleaned.push({ id, name: s.name });
    }
    return cleaned;
  } catch {
    return [];
  }
}

/**
 * Add a station to recents (most recent first, deduplicated, max 5).
 */
export function addRecentStation(station) {
  const id = Number(station.id);
  const recents = getRecentStations().filter((s) => s.id !== id);
  recents.unshift({ id, name: station.name });
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

/**
 * Get the saved fine-grained filter for a station.
 * Returns { lines: [{ mode, designation }], destinations: [string] }.
 */
export function getStationFilter(siteId) {
  try {
    const all = JSON.parse(localStorage.getItem(FILTERS_KEY)) || {};
    const f = all[siteId] || {};
    return {
      lines: Array.isArray(f.lines) ? f.lines : [],
      destinations: Array.isArray(f.destinations) ? f.destinations : [],
    };
  } catch {
    return { lines: [], destinations: [] };
  }
}

/**
 * Save the fine-grained filter for a station (removed entirely when empty).
 */
export function saveStationFilter(siteId, filter) {
  let all = {};
  try {
    all = JSON.parse(localStorage.getItem(FILTERS_KEY)) || {};
  } catch {
    // corrupt storage: start fresh
  }
  if (filter.lines.length === 0 && filter.destinations.length === 0) {
    delete all[siteId];
  } else {
    all[siteId] = filter;
  }
  localStorage.setItem(FILTERS_KEY, JSON.stringify(all));
}
