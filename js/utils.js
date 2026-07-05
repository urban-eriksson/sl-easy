/**
 * Utility functions: debounce, time formatting, Haversine, ID extraction, transport icons.
 */

/**
 * Debounce a function by `ms` milliseconds.
 */
export function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Extract numeric site ID from SL GID string.
 * GID format: "9091001000009117" → 9117
 */
export function extractSiteId(gid) {
  return parseInt(gid.substring(10), 10);
}

/**
 * Haversine distance in meters between two lat/lon points.
 */
export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Format minutes-until-departure for display.
 * Returns "Nu" for 0 or at-stop, "X min" otherwise.
 */
export function formatCountdown(minutes) {
  if (minutes <= 0) return 'Nu';
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h} h` : `${h} h ${m} min`;
  }
  return `${minutes} min`;
}

/**
 * Format a Date or time string to "HH:MM".
 */
export function formatTime(dateOrStr) {
  const d = typeof dateOrStr === 'string' ? new Date(dateOrStr) : dateOrStr;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Compute minutes from now until a given ISO time string.
 */
export function minutesUntil(isoStr) {
  const target = new Date(isoStr);
  const diff = (target - Date.now()) / 60000;
  return Math.round(diff);
}

/**
 * Get CSS class for a line badge based on transport type and line designation.
 */
export function getLineBadgeClass(transportMode, lineDesignation) {
  const line = parseInt(lineDesignation, 10);
  switch (transportMode) {
    case 'METRO':
      if (line === 13 || line === 14) return 'metro-red';
      if (line >= 17 && line <= 19) return 'metro-green';
      if (line === 10 || line === 11) return 'metro-blue';
      return 'metro-blue';
    case 'BUS':
      if (line >= 1 && line <= 4) return 'bus-blue';
      return 'bus';
    case 'TRAIN':
      return 'train';
    case 'TRAM':
      return 'tram';
    case 'FERRY':
    case 'SHIP':
      return 'ferry';
    default:
      return 'bus';
  }
}

/**
 * Get inline SVG icon for a transport mode (small, 16x16).
 */
export function transportIcon(mode) {
  switch (mode) {
    case 'METRO':
      return '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8 2 4 3.5 4 7v9.5C4 18.4 5.6 20 7.5 20L6 21.5v.5h2l2-2h4l2 2h2v-.5L16.5 20c1.9 0 3.5-1.6 3.5-3.5V7c0-3.5-4-5-8-5zM7.5 17c-.8 0-1.5-.7-1.5-1.5S6.7 14 7.5 14s1.5.7 1.5 1.5S8.3 17 7.5 17zm3.5-6H6V7h5v4zm2 0V7h5v4h-5zm3.5 6c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5z"/></svg>';
    case 'BUS':
      return '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4 16c0 .9.4 1.7 1 2.2V20c0 .6.4 1 1 1h1c.6 0 1-.4 1-1v-1h8v1c0 .6.4 1 1 1h1c.6 0 1-.4 1-1v-1.8c.6-.5 1-1.3 1-2.2V6c0-3.5-3.6-4-8-4S4 2.5 4 6v10zm3.5 1c-.8 0-1.5-.7-1.5-1.5S6.7 14 7.5 14s1.5.7 1.5 1.5S8.3 17 7.5 17zm9 0c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5zm1.5-6H6V6h12v5z"/></svg>';
    case 'TRAIN':
      return '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c-4 0-8 .5-8 4v9.5C4 17.4 5.6 19 7.5 19L6 20.5v.5h2l2-2h4l2 2h2v-.5L16.5 19c1.9 0 3.5-1.6 3.5-3.5V6c0-3.5-4-4-8-4zM7.5 17c-.8 0-1.5-.7-1.5-1.5S6.7 14 7.5 14s1.5.7 1.5 1.5S8.3 17 7.5 17zm3.5-6H6V7h5v4zm2 0V7h5v4h-5zm3.5 6c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5z"/></svg>';
    case 'TRAM':
      return '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 16.9V7c0-2.8-2.2-3-5-3.2V2h-4v1.8C7.2 4 5 4.2 5 7v9.9c0 1.3.8 2.4 2 2.8L5.5 21.5v.5H8l1.5-1.5h5L16 22h2.5v-.5L17 19.7c1.2-.4 2-1.5 2-2.8zM7.5 18c-.8 0-1.5-.7-1.5-1.5S6.7 15 7.5 15s1.5.7 1.5 1.5S8.3 18 7.5 18zm3.5-6H6V8h5v4zm2 0V8h5v4h-5zm3.5 6c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5z"/></svg>';
    case 'FERRY':
    case 'SHIP':
      return '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 21c-1.4 0-2.8-.7-3.5-1-.7.3-2.1 1-3.5 1s-2.8-.7-3.5-1c-.7.3-2.1 1-3.5 1v-2c1.4 0 2.3-.5 2.8-.8.7.3 2 1 3.7.8.6-.1 1.2-.3 1.5-.5.7.3 1.8.5 2.5.5s1.8-.2 2.5-.5c.3.2.9.4 1.5.5v2zM3.5 14.4l-1.4-.7L12 5l4 2v-1h2v2.5l2.5 1.3-1.3.7L12 6.5 3.5 14.4zM6 11.5l6-3.2 6 3.2v3l-1.3.5c-.7-.3-2.1-1-3.5-1-.7 0-1.4.2-2.2.5-.3.1-.6.2-.8.3-.7.3-2 1-3.5 1L6 14.5v-3z"/></svg>';
    default:
      return '';
  }
}
