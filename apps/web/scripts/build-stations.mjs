/**
 * Fetches SL's full site list (1.6 MB) and writes the slim copy the app ships:
 * [id, name, lat, lon, [stop area ids]] per station. The app uses it for
 * nearest-station lookup, search, and mapping a journey's stops back to stations.
 * Run `npm run stations`; the deploy script runs it so each release is current.
 */
import { writeFile } from "node:fs/promises";

const res = await fetch("https://transport.integration.sl.se/v1/sites?expand=true");
if (!res.ok) throw new Error(`sites: HTTP ${res.status}`);
const sites = await res.json();

const round = (n) => Math.round(n * 1e5) / 1e5;
const rows = sites
  .filter((s) => s.lat && s.lon && s.name)
  .sort((a, b) => a.id - b.id)
  .map((s) => [s.id, s.name, round(s.lat), round(s.lon), s.stop_areas ?? []]);
if (rows.length < 5000) throw new Error(`sites: only ${rows.length} rows, refusing to write`);

const out = new URL("../src/data/stations.json", import.meta.url);
await writeFile(out, `${JSON.stringify(rows)}\n`);
console.log(`wrote ${rows.length} stations`);
