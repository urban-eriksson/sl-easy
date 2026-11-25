import { describe, expect, it } from "vitest";
import {
  dayLabel,
  formatClock,
  formatCountdown,
  formatDistance,
  minutesUntil,
  parseStockholm,
  stockholmDateTime,
} from "./time";

describe("parseStockholm", () => {
  it("reads winter time as UTC+1", () => {
    expect(parseStockholm("2026-11-25T09:07:00")).toBe(Date.parse("2026-11-25T08:07:00Z"));
  });
  it("reads summer time as UTC+2", () => {
    expect(parseStockholm("2026-07-01T09:07:30")).toBe(Date.parse("2026-07-01T07:07:30Z"));
  });
  it("round-trips through formatClock", () => {
    expect(formatClock(parseStockholm("2026-11-25T23:59:00"))).toBe("23:59");
  });
});

describe("stockholmDateTime", () => {
  it("gives the planner's date and time, crossing midnight in Stockholm", () => {
    expect(stockholmDateTime(Date.parse("2026-11-25T23:30:00Z"))).toEqual({
      date: "20261126",
      time: "0030",
      day: "2026-11-26",
    });
  });
});

describe("formatCountdown", () => {
  it.each([
    [0, "Nu"],
    [4, "4 min"],
    [60, "1 h"],
    [65, "1 h 5 min"],
  ])("%i -> %s", (minutes, text) => {
    expect(formatCountdown(minutes)).toBe(text);
  });
  it("never counts below zero", () => {
    expect(minutesUntil(1000, 120_000)).toBe(0);
  });
});

describe("dayLabel", () => {
  const now = Date.parse("2026-11-25T08:00:00Z");
  it("is empty for today", () => {
    expect(dayLabel(now + 3600_000, now)).toBe("");
  });
  it("names tomorrow", () => {
    expect(dayLabel(Date.parse("2026-11-26T02:00:00Z"), now)).toBe("I morgon");
  });
  it("names the weekday after that", () => {
    expect(dayLabel(Date.parse("2026-11-27T10:00:00Z"), now)).toBe("Fredag");
  });
});

describe("formatDistance", () => {
  it.each([
    [123, "120 m"],
    [1449, "1,4 km"],
  ])("%i -> %s", (m, text) => {
    expect(formatDistance(m)).toBe(text);
  });
});
