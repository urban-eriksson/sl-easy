/**
 * The network side of journeys: working out which stop a destination sign means,
 * then asking the planner for the ride there.
 */
import {
  areaGid,
  directDepartures,
  endsAtTerminus,
  type Picked,
  pickLeg,
  siteGid,
  toJourney,
} from "./journey";
import type { Departure, Journey, Mode } from "./model";
import { fetchTrips, findStopId } from "./sl";
import type { Stations } from "./stations";

/** How many stations with a matching name to try before asking the stop finder. */
const MAX_CANDIDATES = 4;

type Target = {
  stopAreaId: number;
  line: string;
  mode: Mode;
  destination: string;
  scheduled: number;
  platform?: string;
};

/** Planner id of the destination, once found, per origin area and sign text. */
const destinationIds = new Map<string, string>();
const signKey = (t: { stopAreaId: number; destination: string }) =>
  `${t.stopAreaId}|${t.destination}`;

/**
 * The planner journey for a departure, or null when none can be matched.
 *
 * A departure only names its destination ("Björknäs"), and several stations may
 * carry that name, so candidates are tried nearest-first until one gives a
 * direct ride on the right line.
 */
async function lookup(
  target: Target,
  stations: Stations,
  signal?: AbortSignal,
): Promise<Picked | null> {
  const origin = areaGid(target.stopAreaId);
  const known = destinationIds.get(signKey(target));
  // Bus and metro only: for those the planner's classes are known to line up with SL's modes.
  const mode = target.mode === "BUS" || target.mode === "METRO" ? target.mode : undefined;
  const attempt = async (destination: string) =>
    pickLeg(await fetchTrips({ origin, destination, at: target.scheduled, mode }, signal), target);

  if (known) return attempt(known);

  const from = stations.ofArea(target.stopAreaId);
  const sign = target.destination.toLocaleLowerCase("sv");
  const candidates = stations
    .destinationCandidates(target.destination, from, MAX_CANDIDATES)
    .map((p) => ({ id: siteGid(p.id), named: p.name.toLocaleLowerCase("sv") === sign }));
  const tried = new Set<string>();
  for (let i = 0; i <= candidates.length; i++) {
    // Last resort for signs that are no station name ("Uppsala C"): the planner's reading.
    const finder = i === candidates.length ? await findStopId(target.destination, signal) : null;
    const candidate = finder ? { id: finder, named: false } : candidates[i];
    if (!candidate || tried.has(candidate.id)) continue;
    tried.add(candidate.id);
    const picked = await attempt(candidate.id);
    if (!picked) continue;

    // A station that only begins with the sign may be a stop on the way ("Älta gård"
    // for a bus signed "Älta"): if this is the very departure, follow it to where
    // the planner says it ends.
    const terminus = picked.leg.transportation?.destination?.id;
    if (!candidate.named && picked.shift === 0 && terminus && !endsAtTerminus(picked.leg)) {
      const whole = await attempt(terminus);
      if (whole) {
        destinationIds.set(signKey(target), terminus);
        return whole;
      }
    }
    destinationIds.set(signKey(target), candidate.id);
    return picked;
  }
  return null;
}

/** The stops along a departure, to the end of the line. */
export async function findJourney(
  departure: Departure,
  stations: Stations,
  signal?: AbortSignal,
): Promise<Journey | null> {
  const target: Target = {
    stopAreaId: departure.stopAreaId,
    line: departure.line.designation,
    mode: departure.line.mode,
    destination: departure.destination,
    scheduled: departure.scheduled,
    platform: departure.platform,
  };
  // A planner departure names its terminus by id: no guessing from the sign.
  if (departure.terminusId) destinationIds.set(signKey(target), departure.terminusId);
  const picked = await lookup(target, stations, signal);
  return picked ? toJourney(picked, stations) : null;
}

/**
 * One page of direct departures from a station to another by one mode, later
 * than `after`. `next` is where the following page starts.
 */
export async function fetchDirect(
  query: { from: number; to: number; mode: Mode; after: number },
  stations: Stations,
  signal?: AbortSignal,
): Promise<{ departures: Departure[]; next: number }> {
  const { after } = query;
  // Asking a minute past `after` returns that departure again plus the two after it.
  const journeys = await fetchTrips(
    {
      origin: siteGid(query.from),
      destination: siteGid(query.to),
      at: after + 60_000,
      mode: query.mode,
    },
    signal,
  );
  const departures = directDepartures(journeys, after + 30_000, stations, query);
  const latest = Math.max(after, ...departures.map((d) => d.scheduled));
  // Nothing new (no direct service right now, or it has ended): step ahead anyway.
  const next = latest > after + 60_000 ? latest : after + 30 * 60_000;
  return { departures, next };
}
