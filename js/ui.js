/**
 * DOM rendering functions for all UI components.
 */

import { formatCountdown, formatTime, minutesUntil, getLineBadgeClass, transportIcon } from './utils.js';

// DOM element references
const $ = (id) => document.getElementById(id);

const els = {
  stationSubtitle: $('station-subtitle'),
  searchResults: $('search-results'),
  recentSection: $('recent-section'),
  recentChips: $('recent-chips'),
  controlsSection: $('controls-section'),
  deviationsSection: $('deviations-section'),
  deviationsList: $('deviations-list'),
  loading: $('loading'),
  errorMessage: $('error-message'),
  emptyState: $('empty-state'),
  departureList: $('departure-list'),
  footer: $('footer'),
  refreshCountdown: $('refresh-countdown'),
};

/**
 * Show/hide an element via the .hidden class.
 */
function toggle(el, show) {
  el.classList.toggle('hidden', !show);
}

/**
 * Render station subtitle in header.
 */
export function renderStationName(name) {
  els.stationSubtitle.textContent = name || '';
  toggle(els.stationSubtitle, !!name);
}

/**
 * Render search autocomplete results.
 * @param {Array} results - Array of { id, name, gid }
 * @param {Function} onSelect - Callback when a result is clicked.
 */
export function renderSearchResults(results, onSelect) {
  if (!results || results.length === 0) {
    toggle(els.searchResults, false);
    return;
  }
  els.searchResults.innerHTML = results
    .map((r, i) => {
      const parts = r.name.split(' (');
      const name = parts[0];
      const area = parts.length > 1 ? parts[1].replace(')', '') : '';
      return `<li data-index="${i}">
        <span class="station-name">${escapeHtml(name)}</span>
        ${area ? `<span class="station-area">(${escapeHtml(area)})</span>` : ''}
      </li>`;
    })
    .join('');

  els.searchResults.querySelectorAll('li').forEach((li) => {
    li.addEventListener('click', () => {
      const idx = parseInt(li.dataset.index, 10);
      onSelect(results[idx]);
    });
  });

  toggle(els.searchResults, true);
}

/**
 * Hide search results dropdown.
 */
export function hideSearchResults() {
  toggle(els.searchResults, false);
}

/**
 * Render recent station chips.
 * @param {Array} stations - Array of { id, name }
 * @param {number|null} activeId - Currently selected station ID
 * @param {Function} onSelect - Callback when a chip is clicked.
 */
export function renderRecentChips(stations, activeId, onSelect) {
  if (!stations || stations.length === 0) {
    toggle(els.recentSection, false);
    return;
  }

  els.recentChips.innerHTML = stations
    .map(
      (s) =>
        `<button class="recent-chip${s.id === activeId ? ' active' : ''}" data-id="${s.id}">${escapeHtml(s.name)}</button>`
    )
    .join('');

  els.recentChips.querySelectorAll('.recent-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const station = stations.find((s) => s.id === parseInt(btn.dataset.id, 10));
      if (station) onSelect(station);
    });
  });

  toggle(els.recentSection, true);
}

/**
 * Show controls section.
 */
export function showControls() {
  toggle(els.controlsSection, true);
}

/**
 * Render deviation messages.
 * @param {Array} messages - Array of deviation strings.
 */
export function renderDeviations(messages) {
  if (!messages || messages.length === 0) {
    toggle(els.deviationsSection, false);
    return;
  }

  const unique = [...new Set(messages)];
  els.deviationsList.innerHTML = unique
    .map(
      (msg) => `<div class="deviation-item">
      <span class="deviation-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" color="var(--warning)">
          <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
        </svg>
      </span>
      <span>${escapeHtml(msg)}</span>
    </div>`
    )
    .join('');

  toggle(els.deviationsSection, true);
}

/**
 * Show loading state.
 */
export function showLoading() {
  toggle(els.loading, true);
  toggle(els.errorMessage, false);
  toggle(els.emptyState, false);
  toggle(els.departureList, false);
}

/**
 * Show error message.
 */
export function showError(message) {
  toggle(els.loading, false);
  toggle(els.emptyState, false);
  toggle(els.departureList, false);
  els.errorMessage.textContent = message;
  toggle(els.errorMessage, true);
}

/**
 * Show empty state (no departures).
 */
export function showEmpty(message = 'No departures found') {
  toggle(els.loading, false);
  toggle(els.errorMessage, false);
  toggle(els.departureList, false);
  els.emptyState.querySelector('p').textContent = message;
  toggle(els.emptyState, true);
}

/**
 * Render departure list.
 * @param {Array} departures - Flat array of departure objects from all transport modes.
 * @param {string} filter - Transport filter ("all" or mode name).
 */
export function renderDepartures(departures, filter = 'all') {
  toggle(els.loading, false);
  toggle(els.errorMessage, false);
  toggle(els.emptyState, false);

  let filtered = departures;
  if (filter !== 'all') {
    filtered = departures.filter((d) => d.line.transport_mode === filter);
  }

  if (filtered.length === 0) {
    showEmpty(filter !== 'all' ? `No ${filter.toLowerCase()} departures` : 'No departures found');
    return;
  }

  // Sort by expected time
  filtered.sort((a, b) => {
    const timeA = a.expected || a.scheduled;
    const timeB = b.expected || b.scheduled;
    return new Date(timeA) - new Date(timeB);
  });

  els.departureList.innerHTML = filtered
    .map((dep) => {
      const mode = dep.line.transport_mode;
      const lineNum = dep.line.designation;
      const badgeClass = getLineBadgeClass(mode, lineNum);
      const dest = dep.destination;
      const expected = dep.expected || dep.scheduled;
      const isCancelled = dep.state === 'CANCELLED';
      const isAtStop = dep.state === 'ATSTOP';
      const minutes = minutesUntil(expected);
      const countdown = isAtStop ? 'Nu' : formatCountdown(minutes);
      const absTime = formatTime(expected);
      const platform = dep.stop_point?.designation;
      const deviationMsg = dep.deviations?.[0]?.message;

      return `<li class="departure-row${isCancelled ? ' cancelled' : ''}" data-expected="${expected}">
        <span class="line-badge ${badgeClass}">${escapeHtml(lineNum)}</span>
        <div class="departure-info">
          <div class="departure-destination">${escapeHtml(dest)}</div>
          ${platform ? `<div class="departure-platform">Platform ${escapeHtml(platform)}</div>` : ''}
          ${isCancelled && deviationMsg ? `<div class="cancelled-label">${escapeHtml(deviationMsg)}</div>` : ''}
          ${isCancelled && !deviationMsg ? '<div class="cancelled-label">Cancelled</div>' : ''}
        </div>
        <div class="departure-time-col">
          <div class="departure-time${isAtStop ? ' at-stop' : ''}">${countdown}</div>
          <div class="departure-abs-time">${absTime}</div>
        </div>
      </li>`;
    })
    .join('');

  toggle(els.departureList, true);
  toggle(els.footer, true);
}

/**
 * Update countdown times in existing departure rows without full re-render.
 */
export function updateCountdowns() {
  els.departureList.querySelectorAll('.departure-row').forEach((row) => {
    const expected = row.dataset.expected;
    if (!expected) return;
    const minutes = minutesUntil(expected);
    const timeEl = row.querySelector('.departure-time');
    if (!timeEl || row.classList.contains('cancelled')) return;
    const isAtStop = timeEl.classList.contains('at-stop');
    if (!isAtStop) {
      timeEl.textContent = formatCountdown(minutes);
    }
  });
}

/**
 * Update refresh countdown display.
 */
export function updateRefreshCountdown(seconds) {
  els.refreshCountdown.textContent = seconds;
}

/**
 * Escape HTML to prevent XSS.
 */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
