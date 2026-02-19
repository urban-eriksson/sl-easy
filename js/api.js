/**
 * SL API calls: station search, departures, deviations, nearby stations.
 */

const SEARCH_URL = 'https://journeyplanner.integration.sl.se/v2/stop-finder';
const DEPARTURES_URL = 'https://transport.integration.sl.se/v1/sites';
const SITES_URL = 'https://transport.integration.sl.se/v1/sites?expand=true';
const DEVIATIONS_URL = 'https://deviations.integration.sl.se/v1/messages';

/** In-memory cache for all sites (used by nearby feature). */
let sitesCache = null;

/**
 * Search for stations by name.
 * Returns array of { id, name, gid }.
 */
export async function searchStations(query) {
  const params = new URLSearchParams({
    name_sf: query,
    type_sf: 'any',
    any_obj_filter_sf: '2',
  });
  const res = await fetch(`${SEARCH_URL}?${params}`);
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  const data = await res.json();

  const locations = data?.locations || [];
  return locations.map((loc) => ({
    gid: loc.id,
    name: loc.name,
    id: parseInt(loc.id.substring(10), 10),
  }));
}

/**
 * Fetch departures for a site ID.
 * Optional `forecast` param: minutes into the future (5–1200).
 * Returns the raw API response object.
 */
export async function fetchDepartures(siteId, forecast = 0) {
  let url = `${DEPARTURES_URL}/${siteId}/departures`;
  if (forecast >= 5) {
    url += `?forecast=${forecast}`;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Departures failed: ${res.status}`);
  return res.json();
}

/**
 * Fetch deviation messages for a site ID.
 * Returns array of message objects.
 */
export async function fetchDeviations(siteId) {
  const res = await fetch(`${DEVIATIONS_URL}?site=${siteId}`);
  if (!res.ok) throw new Error(`Deviations failed: ${res.status}`);
  return res.json();
}

/**
 * Get all sites (cached in memory after first fetch).
 * Returns array of { id, name, lat, lon }.
 */
export async function getAllSites() {
  if (sitesCache) return sitesCache;
  const res = await fetch(SITES_URL);
  if (!res.ok) throw new Error(`Sites failed: ${res.status}`);
  const data = await res.json();
  sitesCache = data
    .filter((s) => s.lat && s.lon)
    .map((s) => ({
      id: s.id,
      name: s.name,
      lat: s.lat,
      lon: s.lon,
    }));
  return sitesCache;
}
