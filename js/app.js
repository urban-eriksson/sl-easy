/**
 * Main orchestrator: wires event listeners, manages state, auto-refresh, countdown timer.
 */

import { searchStations, fetchDepartures, fetchDeviations, getAllSites } from './api.js';
import { getRecentStations, addRecentStation, getPreferences, savePreferences } from './storage.js';
import {
  renderStationName,
  renderSearchResults,
  hideSearchResults,
  renderRecentChips,
  showControls,
  renderDeviations,
  showLoading,
  showError,
  showEmpty,
  renderDepartures,
  updateCountdowns,
  updateRefreshCountdown,
} from './ui.js';
import { debounce, haversine, computeForecast } from './utils.js';

// ===== State =====
let currentStation = null;   // { id, name }
let departures = [];         // flat array of all departures
let activeFilter = 'all';    // transport filter
let useNowTime = true;       // time picker mode
let refreshTimer = null;     // auto-refresh setInterval
let countdownTimer = null;   // per-second countdown setInterval
let refreshSeconds = 30;     // seconds until next refresh
const REFRESH_INTERVAL = 30; // seconds

// ===== DOM Elements =====
const searchInput = document.getElementById('search-input');
const nearbyBtn = document.getElementById('nearby-btn');
const filterChips = document.querySelectorAll('.filter-chip');
const timeInput = document.getElementById('time-input');
const timeNowBtn = document.getElementById('time-now-btn');

// ===== Init =====
function init() {
  renderRecentChipsFromStorage();
  restorePreferences();
  setupSearchListeners();
  setupFilterListeners();
  setupTimeListeners();
  setupNearbyListener();
  setupVisibilityListener();
  registerServiceWorker();
}

// ===== Search =====
const debouncedSearch = debounce(async (query) => {
  if (query.length < 2) {
    hideSearchResults();
    return;
  }
  try {
    const results = await searchStations(query);
    renderSearchResults(results, selectStation);
  } catch {
    hideSearchResults();
  }
}, 300);

function setupSearchListeners() {
  searchInput.addEventListener('input', () => {
    debouncedSearch(searchInput.value.trim());
  });

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#search-section')) {
      hideSearchResults();
    }
  });

  // Keyboard navigation in search results
  searchInput.addEventListener('keydown', (e) => {
    const results = document.getElementById('search-results');
    const items = results.querySelectorAll('li');
    if (items.length === 0) return;

    const current = results.querySelector('.highlighted');
    let idx = current ? parseInt(current.dataset.index, 10) : -1;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      idx = Math.min(idx + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      idx = Math.max(idx - 1, 0);
    } else if (e.key === 'Enter' && current) {
      e.preventDefault();
      current.click();
      return;
    } else if (e.key === 'Escape') {
      hideSearchResults();
      searchInput.blur();
      return;
    } else {
      return;
    }

    items.forEach((li) => li.classList.remove('highlighted'));
    if (items[idx]) {
      items[idx].classList.add('highlighted');
      items[idx].scrollIntoView({ block: 'nearest' });
    }
  });
}

// ===== Station Selection =====
async function selectStation(station) {
  currentStation = station;
  searchInput.value = '';
  hideSearchResults();
  renderStationName(station.name);
  addRecentStation(station);
  renderRecentChipsFromStorage();
  showControls();
  savePreferences({ lastStation: station });
  await loadDepartures();
}

// ===== Departures =====
async function loadDepartures() {
  if (!currentStation) return;

  showLoading();
  stopAutoRefresh();

  try {
    const forecast = useNowTime ? 0 : computeForecast(timeInput.value);
    const [deptData, deviationData] = await Promise.all([
      fetchDepartures(currentStation.id, forecast),
      fetchDeviations(currentStation.id).catch(() => []),
    ]);

    // Departures come as a flat array
    departures = deptData.departures || [];

    // Collect deviations from both sources
    const deviationMessages = [];

    // From departures data
    if (deptData.stop_deviations) {
      for (const sd of deptData.stop_deviations) {
        if (sd.message) deviationMessages.push(sd.message);
      }
    }

    // From deviations API
    if (Array.isArray(deviationData)) {
      for (const d of deviationData) {
        if (d.message) deviationMessages.push(d.message);
      }
    }

    renderDeviations(deviationMessages);
    renderDepartures(departures, activeFilter);
    startAutoRefresh();
  } catch (err) {
    showError(`Failed to load departures. ${err.message || 'Please try again.'}`);
  }
}

// ===== Filters =====
function setupFilterListeners() {
  filterChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      filterChips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.dataset.filter;
      if (departures.length > 0) {
        renderDepartures(departures, activeFilter);
      }
    });
  });
}

// ===== Time Picker =====
function setupTimeListeners() {
  timeNowBtn.addEventListener('click', () => {
    useNowTime = true;
    timeNowBtn.classList.add('active');
    timeInput.value = '';
    if (currentStation) loadDepartures();
  });

  timeInput.addEventListener('change', () => {
    if (timeInput.value) {
      useNowTime = false;
      timeNowBtn.classList.remove('active');
      if (currentStation) loadDepartures();
    }
  });
}

// ===== Nearby =====
function setupNearbyListener() {
  nearbyBtn.addEventListener('click', async () => {
    if (!navigator.geolocation) {
      showError('Geolocation is not supported by your browser.');
      return;
    }

    nearbyBtn.disabled = true;
    nearbyBtn.style.opacity = '0.5';

    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });

      const { latitude, longitude } = pos.coords;
      const sites = await getAllSites();

      // Sort by distance and pick top 5
      const withDist = sites.map((s) => ({
        ...s,
        dist: haversine(latitude, longitude, s.lat, s.lon),
      }));
      withDist.sort((a, b) => a.dist - b.dist);
      const nearest = withDist.slice(0, 5);

      renderSearchResults(
        nearest.map((s) => ({
          id: s.id,
          name: `${s.name} (${Math.round(s.dist)}m)`,
          gid: '',
        })),
        (selected) => {
          // Strip distance suffix from name
          const cleanName = selected.name.replace(/\s*\(\d+m\)$/, '');
          selectStation({ id: selected.id, name: cleanName });
        }
      );
    } catch (err) {
      if (err.code === 1) {
        showError('Location access denied. Please enable location services.');
      } else {
        showError('Could not determine your location.');
      }
    } finally {
      nearbyBtn.disabled = false;
      nearbyBtn.style.opacity = '';
    }
  });
}

// ===== Auto-Refresh =====
function startAutoRefresh() {
  stopAutoRefresh();
  refreshSeconds = REFRESH_INTERVAL;
  updateRefreshCountdown(refreshSeconds);

  // Per-second countdown + live time updates
  countdownTimer = setInterval(() => {
    refreshSeconds--;
    updateRefreshCountdown(Math.max(0, refreshSeconds));
    updateCountdowns();

    if (refreshSeconds <= 0) {
      loadDepartures();
    }
  }, 1000);
}

function stopAutoRefresh() {
  clearInterval(refreshTimer);
  clearInterval(countdownTimer);
  refreshTimer = null;
  countdownTimer = null;
}

// ===== Visibility =====
function setupVisibilityListener() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopAutoRefresh();
    } else if (currentStation) {
      loadDepartures();
    }
  });
}

// ===== Recent Stations =====
function renderRecentChipsFromStorage() {
  const recents = getRecentStations();
  renderRecentChips(recents, currentStation?.id, selectStation);
}

// ===== Restore Preferences =====
function restorePreferences() {
  const prefs = getPreferences();
  if (prefs.lastStation) {
    selectStation(prefs.lastStation);
  }
}

// ===== Service Worker =====
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// ===== Start =====
init();
