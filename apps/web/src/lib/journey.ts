/**
 * Turning journey-planner answers into what the app shows: the stops along one
 * departure, and the direct departures from one station to another. Pure functions over API data;
 * the network part is in journey-lookup.ts.
 */
import type { Departure, Journey, Mode, Stop } from "./model";
import { type ApiJourney, type ApiLeg, type ApiPoint, modeOfClass } from "./sl";
import type { Stations } from "./stations";

/** Same vehicle if the two APIs' timetable times are this close. */
const SAME_DEPARTURE_MS = 90_000;

/** Planner id of a stop area: 9117's metro platforms are area 1131 -> 9021001001131000. */
export function areaGid(areaId: number): string {
  return `9021001${String(areaId).padStart(6, "0")}000`;
}

/** Planner id of a station (site): 9117 -> 9091001000009117. */
export function siteGid(siteId: number): string {
  return `9091001${String(siteId).padStart(9, "0")}`;
}

function areaIdOf(point: ApiPoint): number | undefined {
  for (const id of [point.parent?.id, point.id]) {
    const m = id?.match(/^9021001(\d{6})000$/);
    if (m) return Number(m[1]);
  }
  return undefined;
}

function pointName(point: ApiPoint): string {
  return point.parent?.disassembledName ?? point.parent?.name ?? point.name ?? "";
}

function time(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const ms = Date.parse(text);
  return Number.isNaN(ms) ? undefined : ms;
}

/** The one ride of a journey without changes; undefined if it has none or several. */
function ride(journey: ApiJourney): ApiLeg | undefined {
  const rides = journey.legs.filter((l) => l.transportation?.disassembledName);
  return rides.length === 1 && time(rides[0].origin.departureTimePlanned) !== undefined
    ? rides[0]
    : undefined;
}

function plannedDeparture(leg: ApiLeg): number {
  return time(leg.origin.departureTimePlanned) ?? 0;
}

export type Picked = {
  leg: ApiLeg;
  /** Ms to add to the leg's times: 0 when it is the very departure asked for. */
  shift: number;
};

/**
 * Find the planner journey that is a given departure.
 *
 * Same line at the same timetable time is the departure itself. On the metro
 * the two APIs do not always agree on the line number (the green lines swap
 * between 17, 18 and 19), so there the time alone decides. If the planner does
 * not list the departure, another run of the line stands in with its times
 * shifted: same stops, approximate times.
 */
export function pickLeg(
  journeys: ApiJourney[],
  target: { line: string; mode: Mode; scheduled: number; platform?: string },
): Picked | null {
  const legs = journeys
    .map(ride)
    .filter((l): l is ApiLeg => l !== undefined)
    // A different platform is the other direction, or another line altogether.
    .filter((l) => {
      const platform = l.origin.properties?.platformName;
      return !target.platform || !platform || platform === target.platform;
    })
    // Metro lines share their track: any train to the destination has the same stops.
    .filter((l) => target.mode === "METRO" || l.transportation?.disassembledName === target.line);
  if (legs.length === 0) return null;

  const gap = (l: ApiLeg) => Math.abs(plannedDeparture(l) - target.scheduled);
  const sameLine = (l: ApiLeg) => (l.transportation?.disassembledName === target.line ? 0 : 1);
  const best = legs.sort((a, b) => gap(a) - gap(b) || sameLine(a) - sameLine(b))[0];
  if (gap(best) <= SAME_DEPARTURE_MS) return { leg: best, shift: 0 };
  const shift = Math.round((target.scheduled - plannedDeparture(best)) / 60000) * 60000;
  return { leg: best, shift };
}

/** False when the leg stops short of where the vehicle is going (we asked for a stop on the way). */
export function endsAtTerminus(leg: ApiLeg): boolean {
  const terminus = leg.transportation?.destination?.name?.toLocaleLowerCase("sv");
  const last = leg.stopSequence?.at(-1);
  if (!terminus || !last) return true;
  const name = pointName(last).toLocaleLowerCase("sv");
  return name.includes(terminus) || terminus.includes(name);
}

/** The stops of a leg, from the station the user is at to where the leg ends. */
export function toJourney(picked: Picked, stations: Stations): Journey {
  const sequence = picked.leg.stopSequence ?? [];
  const stops: Stop[] = [];
  sequence.forEach((point, i) => {
    const first = i === 0;
    const planned = first
      ? (time(point.departureTimePlanned) ?? time(point.arrivalTimePlanned))
      : (time(point.arrivalTimePlanned) ?? time(point.departureTimePlanned));
    if (planned === undefined) return;
    const estimated = first
      ? (time(point.departureTimeEstimated) ?? time(point.arrivalTimeEstimated))
      : (time(point.arrivalTimeEstimated) ?? time(point.departureTimeEstimated));
    const areaId = areaIdOf(point);
    const delay =
      picked.shift === 0 && estimated !== undefined
        ? Math.round((estimated - planned) / 60000)
        : undefined;
    stops.push({
      name: pointName(point),
      siteId: areaId === undefined ? undefined : stations.ofArea(areaId)?.id,
      planned: planned + picked.shift,
      delay: delay || undefined,
    });
  });
  return { stops, approximate: picked.shift !== 0 };
}

/**
 * The direct departures among planner journeys from one station to another,
 * later than `after`. Each carries its stops as far as that other station.
 */
export function directDepartures(
  journeys: ApiJourney[],
  after: number,
  stations: Stations,
): Departure[] {
  const out: Departure[] = [];
  for (const journey of journeys) {
    const leg = ride(journey);
    if (!leg) continue;
    const scheduled = plannedDeparture(leg);
    if (scheduled <= after) continue;
    const designation = leg.transportation?.disassembledName ?? "";
    const terminus = leg.transportation?.destination;
    out.push({
      key: `p-${leg.transportation?.properties?.RealtimeTripId ?? designation}-${scheduled}`,
      line: { designation, mode: modeOfClass(leg.transportation?.product?.class) },
      destination: terminus?.name ?? pointName(leg.destination),
      scheduled,
      expected: time(leg.origin.departureTimeEstimated) ?? scheduled,
      state: "expected",
      platform: leg.origin.properties?.platformName || undefined,
      stopAreaId: areaIdOf(leg.origin) ?? 0,
      journey: toJourney({ leg, shift: 0 }, stations),
      terminusId: terminus?.id,
    });
  }
  return out.sort((a, b) => a.scheduled - b.scheduled);
}
