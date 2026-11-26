import type { Current, RouteFile, StationFile } from "./timetable";

/** Served beside the app; in development Vite proxies it to the live site. */
const BASE = "/tt";
/** A new version is published every night: look for it now and then. */
const CURRENT_MAX_AGE_MS = 30 * 60_000;

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, { signal });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

let current: { at: number; value: Promise<Current> } | null = null;

/** Which version is published, and which services run on which day. */
export function loadCurrent(): Promise<Current> {
  if (!current || Date.now() - current.at > CURRENT_MAX_AGE_MS) {
    const value = getJson<Current>("current.json");
    const mine = { at: Date.now(), value };
    current = mine;
    value.catch(() => {
      if (current === mine) current = null;
    });
  }
  return current.value;
}

/** A station's departures. Rejects for a station nothing leaves from, like any other failure. */
export function loadStation(
  version: string,
  stationId: number,
  signal?: AbortSignal,
): Promise<StationFile> {
  return getJson<StationFile>(`v/${version}/s/${stationId}.json`, signal);
}

const routes = new Map<string, Promise<RouteFile>>();

/** A line's stops and running times; small, and asked for again on every sheet, so kept. */
export function loadRoute(version: string, route: number): Promise<RouteFile> {
  const key = `${version}/${route}`;
  let file = routes.get(key);
  if (!file) {
    file = getJson<RouteFile>(`v/${version}/r/${route}.json`);
    routes.set(key, file);
    file.catch(() => routes.delete(key));
  }
  return file;
}
