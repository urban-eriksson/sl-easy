export type Mode = "METRO" | "BUS" | "TRAIN" | "TRAM" | "FERRY" | "SHIP" | "TAXI";

/** A station as the user knows it (an SL "site": metro, bus and train stops of one place). */
export type Station = { id: number; name: string };

export type Line = {
  designation: string;
  mode: Mode;
  /** "Tunnelbanans gröna linje", "Blåbuss", "Pendeltåg" ... when SL gives one. */
  group?: string;
};

/** One stop on a journey, from the station the user is at to the end of the line. */
export type Stop = {
  name: string;
  /** Station to open when tapped; missing when the stop maps to no known station. */
  siteId?: number;
  /** Timetable time, epoch ms. */
  planned: number;
  /** Minutes late (negative: early) when live data is known for this stop. */
  delay?: number;
};

export type Departure = {
  key: string;
  line: Line;
  destination: string;
  /** Timetable time, epoch ms. */
  scheduled: number;
  /** Live time, epoch ms; equals `scheduled` without live data. */
  expected: number;
  state: "expected" | "atStop" | "cancelled";
  platform?: string;
  /** SL stop area the vehicle leaves from: the origin for journey lookups. */
  stopAreaId: number;
  message?: string;
  /**
   * Departures from the journey planner (the "till" list) carry the stops as far
   * as the chosen station, and the planner's id for where the vehicle ends: the
   * sheet shows the first at once and asks for the whole route with the second.
   */
  journey?: Journey;
  terminusId?: string;
  /** Departures from the timetable files know their trip: the sheet reads its stops there. */
  trip?: TripRef;
};

/** Where a timetable departure's stops and times are: see `lib/timetable.ts`. */
export type TripRef = {
  version: string;
  route: number;
  pattern: number;
  /** This station's place in the pattern. */
  position: number;
  profile: number;
};

export type Journey = {
  stops: Stop[];
  /** True when the planner had no journey at this exact time and a later one was shifted. */
  approximate: boolean;
};

export type Alert = { title?: string; text: string };
