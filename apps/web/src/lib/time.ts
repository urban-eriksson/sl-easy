const clock = new Intl.DateTimeFormat("sv-SE", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Stockholm",
});
const weekday = new Intl.DateTimeFormat("sv-SE", { weekday: "long", timeZone: "Europe/Stockholm" });
const stockholmParts = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Europe/Stockholm",
});

/** "09:07", always Stockholm time. */
export function formatClock(ms: number): string {
  return clock.format(ms);
}

/** Calendar date and wall-clock time in Stockholm, as the journey planner wants them. */
export function stockholmDateTime(ms: number): { date: string; time: string; day: string } {
  const p = Object.fromEntries(stockholmParts.formatToParts(ms).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}${p.month}${p.day}`,
    time: `${p.hour}${p.minute}`,
    day: `${p.year}-${p.month}-${p.day}`,
  };
}

/**
 * SL's departures API sends Stockholm wall-clock time without an offset
 * ("2026-11-25T09:07:00"). Resolve it to an instant whatever the device's zone.
 */
export function parseStockholm(local: string): number {
  const asUtc = Date.parse(`${local}Z`);
  // What Stockholm's clock shows at that instant tells us the offset to remove.
  const p = stockholmDateTime(asUtc);
  const shown = Date.UTC(
    Number(p.date.slice(0, 4)),
    Number(p.date.slice(4, 6)) - 1,
    Number(p.date.slice(6, 8)),
    Number(p.time.slice(0, 2)),
    Number(p.time.slice(2, 4)),
  );
  const offset = shown - Math.floor(asUtc / 60000) * 60000;
  return asUtc - offset;
}

/** Whole minutes from `now` until `ms`, never negative. */
export function minutesUntil(ms: number, now: number): number {
  return Math.max(0, Math.round((ms - now) / 60000));
}

/** "Nu", "4 min", "1 h 5 min". */
export function formatCountdown(minutes: number): string {
  if (minutes <= 0) return "Nu";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Heading for a day in the list: "I morgon", otherwise the weekday. Empty for today. */
export function dayLabel(ms: number, now: number): string {
  const day = stockholmDateTime(ms).day;
  if (day === stockholmDateTime(now).day) return "";
  if (day === stockholmDateTime(now + 86400000).day) return "I morgon";
  const name = weekday.format(ms);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** "120 m", "1,4 km". */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}
