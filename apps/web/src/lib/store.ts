/** What the app remembers on the device. Every read tolerates missing or broken data. */
import type { Station } from "./model";

const KEY = "sl-easy";
const MAX_RECENT = 6;

type Saved = {
  last?: Station;
  recent?: Station[];
  /** Per station id: the station the list is narrowed to ("till Hornstull"). */
  towards?: Record<string, Station>;
  /** Set once the user has asked for their position: from then on it is used at start. */
  useLocation?: boolean;
};

function read(): Saved {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function write(change: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), ...change }));
  } catch {
    // Private mode or full storage: the app works without memory.
  }
}

const isStation = (s: unknown): s is Station =>
  typeof s === "object" &&
  s !== null &&
  Number.isFinite((s as Station).id) &&
  typeof (s as Station).name === "string";

export const store = {
  last(): Station | undefined {
    const s = read().last;
    return isStation(s) ? s : undefined;
  },
  recent(): Station[] {
    const list = read().recent;
    return Array.isArray(list) ? list.filter(isStation) : [];
  },
  /** Remember a station as the current one and move it to the front of the recents. */
  visit(station: Station) {
    const s = { id: station.id, name: station.name };
    const recent = [s, ...store.recent().filter((r) => r.id !== s.id)].slice(0, MAX_RECENT);
    write({ last: s, recent });
  },
  towards(stationId: number): Station | null {
    const s = read().towards?.[stationId];
    return isStation(s) ? s : null;
  },
  setTowards(stationId: number, destination: Station | null) {
    const all = { ...read().towards };
    if (destination) all[stationId] = { id: destination.id, name: destination.name };
    else delete all[stationId];
    write({ towards: all });
  },
  /** Forget every narrowing: a newly chosen station starts with its full list. */
  clearTowards() {
    write({ towards: {} });
  },
  followsLocation(): boolean {
    return read().useLocation === true;
  },
  setFollowsLocation(value: boolean) {
    write({ useLocation: value });
  },
};
