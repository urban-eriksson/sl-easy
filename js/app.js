/**
 * Main orchestrator: wires event listeners, manages state, auto-refresh, countdown timer.
 */

import { searchStations, fetchDepartures, fetchDeviations, getAllSites } from './api.js';
import {
  getRecentStations,
  addRecentStation,
  getPreferences,
  savePreferences,
  getStationFilter,
  saveStationFilter,
} from './storage.js';
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
  renderFilterBar,
  showFilterHint,
  setLoadMore,
  updateCountdowns,
  updateRefreshCountdown,
} from './ui.js';
import { debounce, haversine, computeForecast } from './utils.js';

// ===== State =====
let currentStation = null;   // { id, name }
let departures = [];         // flat array of all departures
let activeFilter = 'all';    // transport filter
let fineFilter = { lines: [], destinations: [] }; // per-station line/destination filter
let useNowTime = true;       // time picker mode
let extensionMinutes = 0;    // extra forecast window added by "load more" (doubles per step)
let loadingMore = false;     // guard against concurrent load-more requests
let refreshTimer = null;     // auto-refresh setInterval
let countdownTimer = null;   // per-second countdown setInterval
let refreshSeconds = 30;     // seconds until next refresh
const REFRESH_INTERVAL = 30; // seconds
const DEFAULT_FORECAST = 60; // API default window in minutes
const MAX_FORECAST = 1200;   // API maximum window in minutes

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
  setupFineFilterListeners();
  setupTimeListeners();
  setupNearbyListener();
  setupPullToRefresh();
  setupLoadMoreListeners();
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
  extensionMinutes = 0;
  fineFilter = getStationFilter(station.id);
  renderFilterBar(fineFilter);
  showFilterHint(!getPreferences().usedFineFilter);
  savePreferences({ lastStation: station });
  await loadDepartures();
}

// ===== Departures =====
function effectiveForecast() {
  const base = useNowTime ? DEFAULT_FORECAST : Math.max(computeForecast(timeInput.value), DEFAULT_FORECAST);
  return Math.min(base + extensionMinutes, MAX_FORECAST);
}

async function loadDepartures({ silent = false } = {}) {
  if (!currentStation) return;

  if (!silent) showLoading();
  stopAutoRefresh();

  try {
    // With no extension in "now" mode, pass 0 so the API default window applies
    const forecast = useNowTime && extensionMinutes === 0 ? 0 : effectiveForecast();
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
    rerenderDepartures();
    startAutoRefresh();
  } catch (err) {
    showError(`Failed to load departures. ${err.message || 'Please try again.'}`);
  }
}

function rerenderDepartures() {
  renderDepartures(departures, activeFilter, fineFilter, {
    canLoadMore: effectiveForecast() < MAX_FORECAST,
  });
}

// ===== Load More (extend the forecast window) =====
async function loadMore() {
  if (loadingMore || !currentStation || effectiveForecast() >= MAX_FORECAST) return false;
  loadingMore = true;
  setLoadMore('loading');
  extensionMinutes = extensionMinutes === 0 ? DEFAULT_FORECAST : extensionMinutes * 2;
  try {
    await loadDepartures({ silent: true });
  } finally {
    loadingMore = false;
  }
  return true;
}

function setupLoadMoreListeners() {
  // "Load later departures" button below the list
  document.getElementById('load-more-btn').addEventListener('click', () => {
    loadMore();
  });

  // "Look further ahead" button shown in the empty state when the window can grow
  document.getElementById('empty-state').addEventListener('click', (e) => {
    const btn = e.target.closest('#extend-search-btn');
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = 'Searching...';
    loadMore();
  });
}

// ===== Filters =====
function setupFilterListeners() {
  filterChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      filterChips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.dataset.filter;
      if (departures.length > 0) {
        rerenderDepartures();
      }
    });
  });
}

// ===== Fine Filter (tap line badge / destination) =====
function applyFineFilterChange() {
  if (currentStation) saveStationFilter(currentStation.id, fineFilter);
  if (!getPreferences().usedFineFilter) {
    savePreferences({ usedFineFilter: true });
  }
  showFilterHint(false);
  renderFilterBar(fineFilter);
  rerenderDepartures();
}

function toggleLineFilter(mode, designation) {
  const idx = fineFilter.lines.findIndex((l) => l.mode === mode && l.designation === designation);
  if (idx >= 0) {
    fineFilter.lines.splice(idx, 1);
  } else {
    fineFilter.lines.push({ mode, designation });
  }
  applyFineFilterChange();
}

function toggleDestFilter(dest) {
  const idx = fineFilter.destinations.indexOf(dest);
  if (idx >= 0) {
    fineFilter.destinations.splice(idx, 1);
  } else {
    fineFilter.destinations.push(dest);
  }
  applyFineFilterChange();
}

function setupFineFilterListeners() {
  // Tap a line badge or destination in the departure list to toggle its filter
  document.getElementById('departure-list').addEventListener('click', (e) => {
    const badge = e.target.closest('.line-badge');
    if (badge) {
      toggleLineFilter(badge.dataset.mode, badge.textContent.trim());
      return;
    }
    const dest = e.target.closest('.departure-destination');
    if (dest) {
      toggleDestFilter(dest.textContent.trim());
    }
  });

  // Remove individual chips or clear all from the filter bar
  document.getElementById('active-filter-bar').addEventListener('click', (e) => {
    if (e.target.closest('#clear-filter-btn')) {
      fineFilter = { lines: [], destinations: [] };
      applyFineFilterChange();
      return;
    }
    const chip = e.target.closest('.filter-bar-chip');
    if (!chip) return;
    if (chip.dataset.type === 'line') {
      toggleLineFilter(chip.dataset.mode, chip.dataset.line);
    } else {
      toggleDestFilter(chip.querySelector('.chip-text').textContent.trim());
    }
  });
}

// ===== Time Picker =====
function setupTimeListeners() {
  timeNowBtn.addEventListener('click', () => {
    useNowTime = true;
    extensionMinutes = 0;
    timeNowBtn.classList.add('active');
    timeInput.value = '';
    if (currentStation) loadDepartures();
  });

  timeInput.addEventListener('change', () => {
    if (timeInput.value) {
      useNowTime = false;
      extensionMinutes = 0;
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

// ===== Pull to Refresh =====
function setupPullToRefresh() {
  const indicator = document.getElementById('ptr-indicator');
  const READY_DIST = 60;   // damped px needed to trigger a refresh
  const MAX_DIST = 90;
  let startY = 0;
  let tracking = false;
  let ready = false;
  let refreshing = false;

  document.addEventListener(
    'touchstart',
    (e) => {
      tracking = window.scrollY <= 0 && !!currentStation && !refreshing;
      ready = false;
      if (tracking) startY = e.touches[0].clientY;
    },
    { passive: true }
  );

  document.addEventListener(
    'touchmove',
    (e) => {
      if (!tracking) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0 || window.scrollY > 0) {
        ready = false;
        indicator.classList.remove('visible', 'ready');
        indicator.style.transform = '';
        return;
      }
      const dist = Math.min(dy * 0.4, MAX_DIST);
      ready = dist >= READY_DIST;
      indicator.classList.add('visible');
      indicator.classList.toggle('ready', ready);
      indicator.style.transform = `translateX(-50%) translateY(${dist}px)`;
    },
    { passive: true }
  );

  document.addEventListener(
    'touchend',
    async () => {
      if (!tracking) return;
      tracking = false;
      if (ready && !refreshing) {
        refreshing = true;
        indicator.classList.add('refreshing');
        indicator.style.transform = `translateX(-50%) translateY(${READY_DIST}px)`;
        try {
          await loadDepartures({ silent: true });
        } finally {
          refreshing = false;
        }
      }
      indicator.classList.remove('visible', 'ready', 'refreshing');
      indicator.style.transform = '';
    },
    { passive: true }
  );
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
      loadDepartures({ silent: true });
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
