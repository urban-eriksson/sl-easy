import stationsUrl from "@/data/stations.json?url";
import type { Station } from "./model";

/** One row of data/stations.json: [id, name, lat, lon, stop area ids]. */
type Row = [number, string, number, number, number[]];

export type Place = Station & { lat: number; lon: number; areas: number[] };

export class Stations {
  readonly all: Place[];
  private byId = new Map<number, Place>();
  private byArea = new Map<number, Place>();
  private folded: string[];

  constructor(rows: Row[]) {
    this.all = rows.map(([id, name, lat, lon, areas]) => ({ id, name, lat, lon, areas }));
    for (const p of this.all) {
      this.byId.set(p.id, p);
      for (const a of p.areas) if (!this.byArea.has(a)) this.byArea.set(a, p);
    }
    this.folded = this.all.map((p) => fold(p.name));
  }

  get(id: number): Place | undefined {
    return this.byId.get(id);
  }

  /** The station a stop area belongs to. */
  ofArea(areaId: number): Place | undefined {
    return this.byArea.get(areaId);
  }

  /** The `count` stations closest to a position, nearest first. */
  nearest(lat: number, lon: number, count: number): (Place & { distance: number })[] {
    return this.all
      .map((p) => ({ ...p, distance: distance(lat, lon, p.lat, p.lon) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, count);
  }

  /**
   * Name search: names starting with the query first, then a word starting with it,
   * then any match. Ties go to the station nearest `near` when a position is known
   * (there are four hundred duplicated names), else alphabetically.
   */
  search(query: string, limit: number, near?: { lat: number; lon: number }): Place[] {
    const q = fold(query);
    if (!q) return [];
    const hits: { p: Place; rank: number; d: number }[] = [];
    for (let i = 0; i < this.all.length; i++) {
      const name = this.folded[i];
      const at = name.indexOf(q);
      if (at < 0) continue;
      const p = this.all[i];
      const rank = at === 0 ? (name.length === q.length ? 0 : 1) : name[at - 1] === " " ? 2 : 3;
      hits.push({ p, rank, d: near ? distance(near.lat, near.lon, p.lat, p.lon) : 0 });
    }
    hits.sort((a, b) => a.rank - b.rank || a.d - b.d || a.p.name.localeCompare(b.p.name, "sv"));
    return hits.slice(0, limit).map((h) => h.p);
  }

  /**
   * Stations a destination sign ("Björknäs", "Älta") may mean, best guess first:
   * exact names, then names that begin with it, each nearest-first from `from`.
   */
  destinationCandidates(destination: string, from: Place | undefined, limit: number): Place[] {
    const q = fold(destination);
    const exact: Place[] = [];
    const prefix: Place[] = [];
    for (let i = 0; i < this.all.length; i++) {
      const name = this.folded[i];
      if (name === q) exact.push(this.all[i]);
      else if (name.startsWith(`${q} `)) prefix.push(this.all[i]);
    }
    const byDistance = (list: Place[]) =>
      from
        ? list.sort(
            (a, b) =>
              distance(from.lat, from.lon, a.lat, a.lon) -
              distance(from.lat, from.lon, b.lat, b.lon),
          )
        : list;
    // Leave room for a prefix match: the right "Björknäs" may be "Björknäs centrum".
    const half = Math.ceil(limit / 2);
    const picked = byDistance(exact).slice(0, prefix.length ? half : limit);
    return [...picked, ...byDistance(prefix).slice(0, limit - picked.length)];
  }
}

/** Lower-case; å/ä/ö kept, other accents ("é") left as typed. */
function fold(s: string): string {
  return s.toLocaleLowerCase("sv").trim();
}

/** Haversine distance in metres. */
export function distance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371e3 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

let loading: Promise<Stations> | undefined;

/** The station list ships with the app as a fingerprinted file; loaded once. */
export function loadStations(): Promise<Stations> {
  loading ??= fetch(stationsUrl)
    .then((res) => {
      if (!res.ok) throw new Error(`stations: HTTP ${res.status}`);
      return res.json();
    })
    .then((rows: Row[]) => new Stations(rows))
    .catch((err) => {
      loading = undefined;
      throw err;
    });
  return loading;
}
