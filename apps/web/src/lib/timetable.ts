/**
 * The timetable files: every departure from a station for the coming week.
 *
 * SL's departure board (see sl.ts) gives three departures per line and nothing
 * later, so the list's substance comes from here instead: SL's GTFS timetable,
 * cut into one small file per station every night by `timetable/build_timetable.py`
 * (the file layouts are documented there). The board is laid on top as the live
 * add-on, by `mergeLive`.
 *
 * This file is pure; `timetable-source.ts` does the fetching.
 */
import type { Departure, Journey, Mode, TripRef } from "./model";
import type { Stations } from "./stations";
import { parseStockholm } from "./time";

/** `dates`: service day ("20261126") to the ids of the services that run on it. */
export type Current = { version: string; dates: Record<string, number[]> };

export type StationFile = {
  /** [route index, line, mode, group] */
  routes: [number, string, Mode, string][];
  signs: string[];
  /** [index into routes, pattern, position, stop area, platform, index into signs] */
  calls: [number, number, number, number, string, number][];
  /** Flat [seconds into the service day, call, service id, profile] per departure, by time. */
  departures: number[];
};

export type RouteFile = {
  areas: [number, string][];
  patterns: number[][];
  /** [arrival offsets, departure offsets or null when equal], seconds from the trip's start. */
  profiles: [number[], number[] | null][];
};

/**
 * Where a service day's clock starts. GTFS counts from "noon minus 12 hours",
 * which is midnight except on the two days the clocks change. Times run past
 * 24:00 for trips that began before midnight.
 */
export function serviceDayStart(date: string): number {
  const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  return parseStockholm(`${iso}T12:00:00`) - 12 * 3600_000;
}

/** One service day's departures from a station, in time order. */
export function expandDay(file: StationFile, current: Current, date: string): Departure[] {
  const services = new Set(current.dates[date]);
  const start = serviceDayStart(date);
  const out: Departure[] = [];
  const d = file.departures;
  for (let i = 0; i < d.length; i += 4) {
    if (!services.has(d[i + 2])) continue;
    const [routeAt, pattern, position, stopAreaId, platform, signAt] = file.calls[d[i + 1]];
    const [route, designation, mode, group] = file.routes[routeAt];
    const scheduled = start + d[i] * 1000;
    out.push({
      key: `t-${date}-${d[i]}-${d[i + 1]}-${d[i + 2]}-${d[i + 3]}`,
      line: { designation, mode, group: group || undefined },
      // The board says "Hornsberg" where the timetable says "Hornsberg via Centralen".
      destination: file.signs[signAt].split(" via ")[0],
      scheduled,
      expected: scheduled,
      state: "expected",
      platform: platform || undefined,
      stopAreaId,
      trip: { version: current.version, route, pattern, position, profile: d[i + 3] },
    });
  }
  return out;
}

/** The service days in a `Current`, oldest first. */
export function serviceDays(current: Current): string[] {
  return Object.keys(current.dates).sort();
}

/** A board departure and a timetable one this close in timetable time are the same. */
const SAME_DEPARTURE_MS = 45_000;

/**
 * Lay the live board over the timetable: a board departure that is in the
 * timetable gives that row its live time, state and sign; one that is not
 * (an extra train, a cancelled run the timetable never had) becomes a row of
 * its own, so nothing the board says is lost.
 *
 * The match is stop area and timetable time, then line and platform. On the
 * metro the line number may differ (the board and the timetable disagree on
 * 10/11 and 17/18/19 now and then), so there the platform stands in for it.
 */
export function mergeLive(timetable: Departure[], live: Departure[]): Departure[] {
  if (live.length === 0) return timetable;
  const out = timetable.slice();
  const taken = new Set<number>();
  const extra: Departure[] = [];
  for (const d of live) {
    let lo = 0;
    let hi = timetable.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (timetable[mid].scheduled < d.scheduled - SAME_DEPARTURE_MS) lo = mid + 1;
      else hi = mid;
    }
    let best = -1;
    let bestScore = -1;
    for (let i = lo; i < timetable.length; i++) {
      const row = timetable[i];
      const gap = Math.abs(row.scheduled - d.scheduled);
      if (row.scheduled > d.scheduled + SAME_DEPARTURE_MS) break;
      if (taken.has(i) || row.stopAreaId !== d.stopAreaId) continue;
      const sameLine = row.line.designation === d.line.designation;
      const samePlatform = !!d.platform && row.platform === d.platform;
      const metro = row.line.mode === "METRO" && d.line.mode === "METRO";
      if (!sameLine && !(metro && samePlatform)) continue;
      const score = (sameLine ? 4 : 0) + (samePlatform ? 2 : 0) + (1 - gap / SAME_DEPARTURE_MS);
      if (score > bestScore) {
        best = i;
        bestScore = score;
      }
    }
    if (best < 0) {
      extra.push(d);
      continue;
    }
    taken.add(best);
    const row = timetable[best];
    out[best] = {
      ...row,
      line: { ...row.line, designation: d.line.designation },
      destination: d.destination,
      expected: d.expected,
      state: d.state,
      platform: d.platform ?? row.platform,
      message: d.message,
    };
  }
  if (extra.length === 0) return out;
  return [...out, ...extra].sort((a, b) => a.scheduled - b.scheduled || (a.key < b.key ? -1 : 1));
}

/** The stops of a timetable departure, from the station it leaves to the end of the line. */
export function tripJourney(
  file: RouteFile,
  departure: { scheduled: number; trip: TripRef },
  stations: Stations,
): Journey | null {
  const { pattern, position, profile } = departure.trip;
  const stops = file.patterns[pattern];
  const times = file.profiles[profile];
  if (!stops || !times || position >= stops.length) return null;
  const [arrive, depart] = times;
  const leaves = (depart ?? arrive)[position];
  return {
    stops: stops.slice(position).map((areaAt, k) => {
      const [areaId, name] = file.areas[areaAt];
      return {
        name,
        siteId: stations.ofArea(areaId, name)?.id,
        planned: departure.scheduled + (k === 0 ? 0 : (arrive[position + k] - leaves) * 1000),
      };
    }),
    approximate: false,
  };
}
