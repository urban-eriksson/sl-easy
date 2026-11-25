import { describe, expect, it } from "vitest";
import { Stations } from "./stations";

const stations = new Stations([
  [9117, "Odenplan", 59.3429, 18.0491, [1131, 10151, 5320]],
  [9118, "Rådmansgatan", 59.3405, 18.0588, [1121]],
  [9192, "Slussen", 59.3195, 18.0723, [1011, 11002]],
  [7936, "Björknäs", 59.193, 17.736, [70001]],
  [136, "Björknäs", 59.427, 18.424, [70002]],
  [4110, "Björknäs centrum", 59.315, 18.228, [40258]],
  [5000, "Nya Slussen", 59.0, 18.0, [50000]],
]);
const odenplan = { lat: 59.343, lon: 18.049 };

describe("Stations", () => {
  it("finds the station a stop area belongs to", () => {
    expect(stations.ofArea(10151)?.name).toBe("Odenplan");
    expect(stations.ofArea(1)).toBeUndefined();
  });

  it("orders by distance", () => {
    const near = stations.nearest(odenplan.lat, odenplan.lon, 2);
    expect(near.map((p) => p.name)).toEqual(["Odenplan", "Rådmansgatan"]);
    expect(near[0].distance).toBeLessThan(50);
  });

  it("ranks names that start with the query before words and substrings", () => {
    expect(stations.search("sluss", 5).map((p) => p.name)).toEqual(["Slussen", "Nya Slussen"]);
  });

  it("puts the exact name first and breaks ties by distance", () => {
    const hits = stations.search("björknäs", 5, { lat: 59.32, lon: 18.07 });
    expect(hits.map((p) => p.id)).toEqual([136, 7936, 4110]);
  });

  it("matches case-insensitively with å, ä and ö", () => {
    expect(stations.search("RÅD", 5).map((p) => p.name)).toEqual(["Rådmansgatan"]);
  });

  it("offers both same-named stations and one that begins with the sign", () => {
    const from = stations.get(9192);
    const ids = stations.destinationCandidates("Björknäs", from, 4).map((p) => p.id);
    expect(ids).toEqual([136, 7936, 4110]);
    expect(stations.destinationCandidates("Björknäs", from, 2).map((p) => p.id)).toEqual([
      136, 4110,
    ]);
  });
});
