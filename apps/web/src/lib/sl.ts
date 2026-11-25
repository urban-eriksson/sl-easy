/**
 * SL's public integration APIs (no key), called straight from the browser.
 *
 * Two facts shape the whole app:
 * - The departures API returns at most three departures per line and direction,
 *   however long the forecast. It is "what leaves next", not a timetable.
 * - The journey planner returns at most three journeys per call but takes any
 *   start time, so it is the only way to page further ahead, and it carries the
 *   stops along each journey.
 */
import type { Alert, Departure, Mode } from "./model";
import { parseStockholm, stockholmDateTime } from "./time";

const TRANSPORT = "https://transport.integration.sl.se/v1";
const PLANNER = "https://journeyplanner.integration.sl.se/v2";
const DEVIATIONS = "https://deviations.integration.sl.se/v1";

/** The API's maximum (it answers 400 above): 20 hours. */
const FORECAST_MINUTES = 1200;

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

/** SL answers 429 in short bursts that clear within a second or two: try once more. */
const RETRY_AFTER_MS = 1200;

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  let res = await fetch(url, { signal });
  if (res.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, RETRY_AFTER_MS));
    signal?.throwIfAborted();
    res = await fetch(url, { signal });
  }
  if (!res.ok) throw new HttpError(res.status);
  return res.json();
}

type ApiDeparture = {
  destination: string;
  state: string;
  scheduled?: string;
  expected?: string;
  journey?: { id?: number };
  stop_area: { id: number };
  stop_point?: { id?: number; designation?: string };
  line: { designation: string | number; transport_mode: Mode; group_of_lines?: string };
  deviations?: { consequence?: string; message?: string }[];
};
type ApiStopDeviation = { message?: string };

export function toDeparture(d: ApiDeparture): Departure | null {
  const scheduledText = d.scheduled ?? d.expected;
  if (!scheduledText) return null;
  const scheduled = parseStockholm(scheduledText);
  const cancelled = d.state === "CANCELLED";
  return {
    key: `${d.journey?.id ?? scheduledText}-${d.stop_point?.id ?? d.stop_area.id}-${d.line.designation}`,
    line: {
      designation: String(d.line.designation),
      mode: d.line.transport_mode,
      group: d.line.group_of_lines,
    },
    destination: d.destination,
    scheduled,
    expected: d.expected ? parseStockholm(d.expected) : scheduled,
    state: cancelled ? "cancelled" : d.state === "ATSTOP" ? "atStop" : "expected",
    platform: d.stop_point?.designation || undefined,
    stopAreaId: d.stop_area.id,
    // "Inställd" is already what a cancelled row says.
    message: d.deviations?.find((x) => x.message && x.consequence !== "CANCELLED")?.message,
  };
}

/** Next departures of every line at a station, in timetable order, plus stop notices. */
export async function fetchDepartures(
  siteId: number,
  signal?: AbortSignal,
): Promise<{ departures: Departure[]; alerts: Alert[] }> {
  const data = await getJson<{ departures?: ApiDeparture[]; stop_deviations?: ApiStopDeviation[] }>(
    `${TRANSPORT}/sites/${siteId}/departures?forecast=${FORECAST_MINUTES}`,
    signal,
  );
  const departures = (data.departures ?? [])
    .map(toDeparture)
    .filter((d): d is Departure => d !== null)
    .sort((a, b) => a.scheduled - b.scheduled);
  const alerts = (data.stop_deviations ?? []).flatMap((d) =>
    d.message ? [{ text: d.message }] : [],
  );
  return { departures, alerts };
}

type ApiDeviation = {
  message_variants?: { header?: string; details?: string; language?: string }[];
};

/** Published disruption notices for a station. */
export async function fetchAlerts(siteId: number, signal?: AbortSignal): Promise<Alert[]> {
  const data = await getJson<ApiDeviation[]>(
    `${DEVIATIONS}/messages?site=${siteId}&future=false`,
    signal,
  );
  return data.flatMap((d) => {
    const v = d.message_variants?.find((m) => m.language === "sv") ?? d.message_variants?.[0];
    const text = v?.details ?? v?.header;
    return text ? [{ title: v?.details ? v.header : undefined, text }] : [];
  });
}

export type ApiPoint = {
  id?: string;
  name?: string;
  disassembledName?: string;
  parent?: { id?: string; name?: string; disassembledName?: string };
  properties?: { platformName?: string };
  departureTimePlanned?: string;
  departureTimeEstimated?: string;
  arrivalTimePlanned?: string;
  arrivalTimeEstimated?: string;
};
export type ApiLeg = {
  origin: ApiPoint;
  destination: ApiPoint;
  transportation?: {
    /** The line number; absent on walking legs. */
    disassembledName?: string;
    product?: { class?: number };
    destination?: { id?: string; name?: string };
    properties?: { RealtimeTripId?: string };
  };
  stopSequence?: ApiPoint[];
};
export type ApiJourney = { legs: ApiLeg[] };

/** The planner's product classes for a transport mode (10 and 19 are bus variants). */
const PLANNER_CLASSES: Partial<Record<Mode, number[]>> = {
  TRAIN: [0],
  METRO: [2],
  TRAM: [4],
  BUS: [5, 10, 19],
  SHIP: [9],
  FERRY: [9],
};

/** The transport mode of a planner product class. */
export function modeOfClass(productClass: number | undefined): Mode {
  for (const [mode, classes] of Object.entries(PLANNER_CLASSES)) {
    if (productClass !== undefined && classes.includes(productClass)) return mode as Mode;
  }
  return "BUS";
}

/**
 * Direct journeys (no changes) between two stops around a time: the planner
 * answers with one leaving just before `at` and two after.
 *
 * With `mode` only that mode is considered. That matters: the planner drops
 * journeys it finds worse, so without it a bus is hidden by the faster metro.
 */
export async function fetchTrips(
  query: { origin: string; destination: string; at: number; mode?: Mode },
  signal?: AbortSignal,
): Promise<ApiJourney[]> {
  const { date, time } = stockholmDateTime(query.at);
  const params = new URLSearchParams({
    type_origin: "any",
    name_origin: query.origin,
    type_destination: "any",
    name_destination: query.destination,
    calc_number_of_trips: "3",
    max_changes: "0",
    itd_date: date,
    itd_time: time,
    // No route geometry: a quarter of the response size.
    gen_c: "false",
  });
  for (const c of (query.mode && PLANNER_CLASSES[query.mode]) ?? []) {
    params.set(`incl_mot_${c}`, "true");
  }
  const data = await getJson<{ journeys?: ApiJourney[] }>(`${PLANNER}/trips?${params}`, signal);
  return data.journeys ?? [];
}

/** Below this the stop finder is guessing: "Hornsberg" comes back as Örnsberg at 750. */
const GOOD_MATCH = 850;

/** The stop a name means, if the planner is confident; its id works as a trip endpoint. */
export async function findStopId(name: string, signal?: AbortSignal): Promise<string | undefined> {
  const params = new URLSearchParams({ name_sf: name, type_sf: "any", any_obj_filter_sf: "2" });
  const data = await getJson<{
    locations?: { id?: string; isBest?: boolean; type?: string; matchQuality?: number }[];
  }>(`${PLANNER}/stop-finder?${params}`, signal);
  const stops = (data.locations ?? []).filter(
    (l) => l.type === "stop" && l.id && (l.matchQuality ?? 0) >= GOOD_MATCH,
  );
  return (stops.find((l) => l.isBest) ?? stops[0])?.id;
}
