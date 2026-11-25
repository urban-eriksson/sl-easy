import { describe, expect, it } from "vitest";
import { areaGid, directDepartures, endsAtTerminus, pickLeg, siteGid, toJourney } from "./journey";
import type { ApiJourney, ApiLeg, ApiPoint } from "./sl";
import { Stations } from "./stations";

const stations = new Stations([
  [9117, "Odenplan", 59.3429, 18.0491, [1131]],
  [9118, "Rådmansgatan", 59.3405, 18.0588, [1121]],
  [9119, "Hötorget", 59.3355, 18.0639, [1111]],
]);

const point = (area: number, name: string, dep?: string, arr?: string, est?: string): ApiPoint => ({
  id: "9025001000001122",
  name: `${name}, Stockholm`,
  disassembledName: "2",
  parent: { id: areaGid(area), disassembledName: name },
  properties: { platformName: "2" },
  departureTimePlanned: dep,
  arrivalTimePlanned: arr,
  arrivalTimeEstimated: est,
});

function leg(line: string, departs: string, platform = "2"): ApiLeg {
  const origin = point(1131, "Odenplan", departs);
  origin.properties = { platformName: platform };
  const t = Date.parse(departs);
  const at = (min: number) => new Date(t + min * 60000).toISOString();
  return {
    origin,
    destination: point(1111, "Hötorget"),
    transportation: {
      disassembledName: line,
      destination: { id: "18001881", name: "Farsta strand" },
      properties: { RealtimeTripId: `trip-${line}-${departs}` },
    },
    stopSequence: [
      origin,
      point(1121, "Rådmansgatan", at(2), at(2), at(3)),
      point(1111, "Hötorget", undefined, at(4)),
    ],
  };
}
const walk: ApiLeg = { origin: {}, destination: {}, transportation: {} };
const journeys = (...legs: ApiLeg[]): ApiJourney[] => legs.map((l) => ({ legs: [l] }));
const at = (text: string) => Date.parse(text);

describe("ids", () => {
  it("builds planner ids", () => {
    expect(areaGid(1131)).toBe("9021001001131000");
    expect(siteGid(9117)).toBe("9091001000009117");
  });
});

describe("pickLeg", () => {
  const target = { line: "18", mode: "METRO" as const, scheduled: at("2026-11-25T08:07:00Z") };

  it("takes the journey at the departure's own time", () => {
    const picked = pickLeg(
      journeys(leg("18", "2026-11-25T08:02:00Z"), leg("18", "2026-11-25T08:07:30Z")),
      target,
    );
    expect(picked?.shift).toBe(0);
    expect(picked?.leg.origin.departureTimePlanned).toBe("2026-11-25T08:07:30Z");
  });

  it("accepts another metro line number at the same time", () => {
    const picked = pickLeg(journeys(leg("17", "2026-11-25T08:07:00Z")), target);
    expect(picked?.shift).toBe(0);
  });

  it("refuses another bus line even at the same time", () => {
    expect(pickLeg(journeys(leg("4", "2026-11-25T08:07:00Z")), { ...target, mode: "BUS" })).toBe(
      null,
    );
  });

  it("shifts a later run of the line when the departure itself is missing", () => {
    const picked = pickLeg(journeys(leg("18", "2026-11-25T08:17:00Z")), target);
    expect(picked?.shift).toBe(-10 * 60000);
  });

  it("ignores legs from another platform", () => {
    const picked = pickLeg(
      journeys(leg("18", "2026-11-25T08:07:00Z", "1"), leg("18", "2026-11-25T08:12:00Z", "2")),
      { ...target, platform: "2" },
    );
    expect(picked?.shift).toBe(-5 * 60000);
  });

  it("ignores journeys with a change", () => {
    const changed: ApiJourney = {
      legs: [leg("18", "2026-11-25T08:07:00Z"), walk, leg("19", "2026-11-25T08:20:00Z")],
    };
    expect(pickLeg([changed], target)).toBe(null);
  });
});

describe("toJourney", () => {
  it("lists stops with their stations, times and delay", () => {
    const journey = toJourney({ leg: leg("18", "2026-11-25T08:07:00Z"), shift: 0 }, stations);
    expect(journey.approximate).toBe(false);
    expect(journey.stops).toEqual([
      { name: "Odenplan", siteId: 9117, planned: at("2026-11-25T08:07:00Z"), delay: undefined },
      { name: "Rådmansgatan", siteId: 9118, planned: at("2026-11-25T08:09:00Z"), delay: 1 },
      { name: "Hötorget", siteId: 9119, planned: at("2026-11-25T08:11:00Z"), delay: undefined },
    ]);
  });

  it("shifts times and drops live data for a stand-in", () => {
    const journey = toJourney(
      { leg: leg("18", "2026-11-25T08:17:00Z"), shift: -10 * 60000 },
      stations,
    );
    expect(journey.approximate).toBe(true);
    expect(journey.stops[1]).toMatchObject({
      planned: at("2026-11-25T08:09:00Z"),
      delay: undefined,
    });
  });
});

describe("endsAtTerminus", () => {
  it("is false when the leg stops before the vehicle's destination", () => {
    expect(endsAtTerminus(leg("18", "2026-11-25T08:07:00Z"))).toBe(false);
  });
  it("is true when the last stop is the destination", () => {
    const l = leg("18", "2026-11-25T08:07:00Z");
    l.transportation = { ...l.transportation, destination: { name: "Hötorget" } };
    expect(endsAtTerminus(l)).toBe(true);
  });
});

describe("directDepartures", () => {
  it("lists every direct ride after the cursor with its real destination and stops", () => {
    const bus = leg("4", "2026-11-25T08:10:00Z");
    bus.transportation = { ...bus.transportation, product: { class: 5 } };
    const metro = leg("18", "2026-11-25T08:05:00Z");
    metro.transportation = { ...metro.transportation, product: { class: 2 } };
    const out = directDepartures(
      [...journeys(leg("4", "2026-11-25T08:00:00Z"), bus, metro), { legs: [walk] }],
      at("2026-11-25T08:00:30Z"),
      stations,
    );
    expect(out.map((d) => [d.line.designation, d.line.mode])).toEqual([
      ["18", "METRO"],
      ["4", "BUS"],
    ]);
    expect(out[0]).toMatchObject({
      destination: "Farsta strand",
      terminusId: "18001881",
      scheduled: at("2026-11-25T08:05:00Z"),
      platform: "2",
      stopAreaId: 1131,
    });
    expect(out[0].journey?.stops).toHaveLength(3);
  });

  it("drops a ride that only gets near the station asked for", () => {
    const short = leg("4", "2026-11-25T08:10:00Z");
    short.destination = point(1121, "Rådmansgatan");
    const all = journeys(short, leg("18", "2026-11-25T08:05:00Z"));
    const out = directDepartures(all, 0, stations, { from: 9117, to: 9119 });
    expect(out.map((d) => d.line.designation)).toEqual(["18"]);
  });
});
