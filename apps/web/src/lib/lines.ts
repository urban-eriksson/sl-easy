import type { Line } from "./model";

/** Tailwind classes for a line's pill: SL's colour for the line, readable text on it. */
export function lineColor(line: Line): string {
  const n = Number.parseInt(line.designation, 10);
  switch (line.mode) {
    case "METRO":
      if (n === 13 || n === 14) return "bg-line-metro-red text-white";
      if (n >= 17 && n <= 19) return "bg-line-metro-green text-white";
      return "bg-line-metro-blue text-white";
    case "TRAIN":
      return "bg-line-train text-white";
    case "TRAM":
      return "bg-line-tram text-black";
    case "FERRY":
    case "SHIP":
      return "bg-line-ferry text-black";
    default:
      // The blue trunk buses: 1-6 in town, and those SL groups as "Blåbuss".
      if (line.group?.toLowerCase().includes("blå") || (n >= 1 && n <= 6)) {
        return "bg-line-bus-blue text-white";
      }
      return "bg-line-bus text-white";
  }
}
