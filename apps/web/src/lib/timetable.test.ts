import { describe, expect, it } from "vitest";
import type { Departure } from "./model";
import { Stations } from "./stations";
import {
  type Current,
  expandDay,
  mergeLive,
  type RouteFile,
  type StationFile,
  serviceDayStart,
  tripJourney,
} from "./timetable";

const at = (text: string) => Date.parse(text);

const current: Current = { version: "20261126", dates: { "20261126": [7], "20261127": [8] } };
const file: StationFile = {
  routes: [
    [3, "4", "BUS", "blåbuss"],
    [12, "17", "METRO", "tunnelbanans gröna linje"],
  ],
  signs: ["Gullmarsplan via Hornstull", "Åkeshov"],
  calls: [
    [0, 2, 5, 10151, "A", 0],
    [1, 0, 9, 1051, "1", 1],
  ],
  // 08:00:00 bus, 08:01:30 metro, 24:10:00 bus (after midnight), and a bus of another day's service.
  departures: [28800, 0, 7, 4, 28890, 1, 7, 0, 87000, 0, 7, 4, 30000, 0, 8, 4],
};

describe("serviceDayStart", () => {
  it("is Stockholm midnight on an ordinary day", () => {
    expect(serviceDayStart("20261126")).toBe(at("2026-11-25T23:00:00Z"));
  });

  it("is noon minus twelve hours when the clocks change", () => {
    // 25 October 2026: back to standard time at 03:00, so midnight is 13 hours before noon.
    expect(serviceDayStart("20261025")).toBe(at("2026-10-24T23:00:00Z"));
  });
});

describe("expandDay", () => {
  const day = expandDay(file, current, "20261126");

  it("lists the day's services only, in the file's time order", () => {
    expect(day.map((d) => d.line.designation)).toEqual(["4", "17", "4"]);
    expect(day[0].scheduled).toBe(at("2026-11-26T07:00:00Z"));
    expect(day[2].scheduled).toBe(at("2026-11-26T23:10:00Z"));
  });

  it("builds a row the list can show and the sheet can follow", () => {
    expect(day[0]).toMatchObject({
      line: { designation: "4", mode: "BUS", group: "blåbuss" },
      destination: "Gullmarsplan",
      state: "expected",
      platform: "A",
      stopAreaId: 10151,
      trip: { version: "20261126", route: 3, pattern: 2, position: 5, profile: 4 },
    });
    expect(day[0].expected).toBe(day[0].scheduled);
    expect(new Set(day.map((d) => d.key)).size).toBe(3);
  });
});

describe("mergeLive", () => {
  const timetable = expandDay(file, current, "20261126");
  const live = (over: Partial<Departure>): Departure => ({
    key: "live",
    line: { designation: "4", mode: "BUS" },
    destination: "Gullmarsplan",
    scheduled: at("2026-11-26T07:00:00Z"),
    expected: at("2026-11-26T07:03:00Z"),
    state: "expected",
    platform: "A",
    stopAreaId: 10151,
    ...over,
  });

  it("gives the timetable row the board's live time and keeps its trip", () => {
    const out = mergeLive(timetable, [live({ message: "Försenad" })]);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({
      key: timetable[0].key,
      expected: at("2026-11-26T07:03:00Z"),
      message: "Försenad",
      line: { designation: "4", group: "blåbuss" },
    });
    expect(out[0].trip).toBeDefined();
    expect(out[1]).toBe(timetable[1]);
  });

  it("matches a metro train by platform when the line numbers disagree", () => {
    const train = live({
      line: { designation: "19", mode: "METRO" },
      scheduled: at("2026-11-26T07:01:40Z"),
      expected: at("2026-11-26T07:01:40Z"),
      platform: "1",
      stopAreaId: 1051,
      state: "cancelled",
    });
    const out = mergeLive(timetable, [train]);
    expect(out).toHaveLength(3);
    expect(out[1]).toMatchObject({ state: "cancelled", line: { designation: "19" } });
  });

  it("keeps a board departure the timetable does not have as its own row", () => {
    const extra = live({ key: "x", line: { designation: "94", mode: "BUS" } });
    const other = live({ key: "y", stopAreaId: 999 });
    const late = live({ key: "z", scheduled: at("2026-11-26T07:02:00Z") });
    const out = mergeLive(timetable, [extra, other, late]);
    expect(out.map((d) => d.key)).toEqual([
      timetable[0].key,
      "x",
      "y",
      timetable[1].key,
      "z",
      timetable[2].key,
    ]);
    expect(out[0]).toBe(timetable[0]);
  });

  it("uses a timetable row for one board departure only", () => {
    const out = mergeLive(timetable, [live({ key: "a" }), live({ key: "u" })]);
    // Same timetable time: the tie goes by key, only so the order is stable.
    expect(out.map((d) => d.key)).toEqual([
      timetable[0].key,
      "u",
      timetable[1].key,
      timetable[2].key,
    ]);
  });
});

describe("tripJourney", () => {
  const stations = new Stations([
    [9117, "Odenplan", 59.3429, 18.0491, [1131]],
    [9118, "Rådmansgatan", 59.3405, 18.0588, [1121]],
    [9119, "Hötorget", 59.3355, 18.0639, [1111]],
  ]);
  const route: RouteFile = {
    areas: [
      [1131, "Odenplan"],
      [1121, "Rådmansgatan"],
      [1111, "Hötorget"],
      [555, "Vändplan"],
    ],
    patterns: [[3, 0, 1, 2]],
    profiles: [
      [
        [0, 120, 240, 420],
        [0, 180, 240, 420],
      ],
      [[0, 100, 200, 300], null],
    ],
  };
  const scheduled = at("2026-11-26T07:00:00Z");
  const trip = { version: "v", route: 1, pattern: 0, position: 1, profile: 0 };

  it("lists the stops from this station on, timed from its departure", () => {
    const journey = tripJourney(route, { scheduled, trip }, stations);
    expect(journey?.stops).toEqual([
      { name: "Odenplan", siteId: 9117, planned: scheduled },
      // Arrives 240 s into the trip; the vehicle left Odenplan at 180 s.
      { name: "Rådmansgatan", siteId: 9118, planned: scheduled + 60_000 },
      { name: "Hötorget", siteId: 9119, planned: scheduled + 240_000 },
    ]);
    expect(journey?.approximate).toBe(false);
  });

  it("uses arrivals as departures when the profile has no dwell", () => {
    const journey = tripJourney(route, { scheduled, trip: { ...trip, profile: 1 } }, stations);
    expect(journey?.stops.map((s) => s.planned - scheduled)).toEqual([0, 100_000, 200_000]);
  });

  it("gives up on a reference the file does not have", () => {
    expect(tripJourney(route, { scheduled, trip: { ...trip, pattern: 9 } }, stations)).toBeNull();
  });
});
