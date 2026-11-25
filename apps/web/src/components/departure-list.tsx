import { memo } from "react";
import { t } from "@/lib/i18n";
import type { Departure } from "@/lib/model";
import { dayLabel, formatClock, formatCountdown, minutesUntil } from "@/lib/time";
import { cn } from "@/lib/utils";
import { LinePill } from "./line-pill";

/** Only departures this close get a countdown: beyond it the clock time says more. */
const COUNTDOWN_WITHIN_MS = 60 * 60_000;

/** Departures in timetable order, with a heading where the date changes. */
export function DepartureList({
  departures,
  now,
  onOpen,
}: {
  departures: Departure[];
  now: number;
  onOpen: (departure: Departure) => void;
}) {
  let day = "";
  return (
    <ul className="divide-y">
      {departures.map((d) => {
        const label = dayLabel(d.scheduled, now);
        const heading = label !== day ? label : "";
        day = label;
        const soon = d.expected - now < COUNTDOWN_WITHIN_MS;
        return (
          <li key={d.key}>
            {heading ? (
              <h2 className="pt-5 pb-1 text-sm font-medium text-muted-foreground">{heading}</h2>
            ) : null}
            {/* `now` only reaches rows that show a countdown, so the rest never re-render. */}
            <DepartureRow departure={d} now={soon ? now : 0} onOpen={onOpen} />
          </li>
        );
      })}
    </ul>
  );
}

/**
 * One departure. The timetable time leads; the live picture (minutes left,
 * minutes late) is the smaller line under it.
 */
const DepartureRow = memo(function DepartureRow({
  departure: d,
  now,
  onOpen,
}: {
  departure: Departure;
  /** 0 for rows too far ahead for a countdown. */
  now: number;
  onOpen: (departure: Departure) => void;
}) {
  const cancelled = d.state === "cancelled";
  const late = Math.round((d.expected - d.scheduled) / 60000);
  const detail = [d.platform ? t.list.platform(d.platform) : "", d.message ?? ""]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      onClick={() => onOpen(d)}
      className="flex w-full items-center gap-3 py-2.5 text-left outline-none focus-visible:ring-3 active:bg-card"
    >
      <LinePill line={d.line} className={cancelled ? "opacity-50" : undefined} />
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate font-medium", cancelled && "text-muted-foreground")}>
          {d.destination}
        </span>
        {cancelled ? (
          <span className="block text-sm text-destructive">{t.list.cancelled}</span>
        ) : detail ? (
          <span className="block truncate text-sm text-muted-foreground">{detail}</span>
        ) : null}
      </span>
      <span className="shrink-0 text-right">
        <span
          className={cn(
            "block text-lg leading-tight font-medium tabular-nums",
            cancelled && "text-muted-foreground line-through",
          )}
        >
          {formatClock(d.scheduled)}
        </span>
        {!cancelled && (now > 0 || late !== 0) ? (
          <span className="block text-sm text-muted-foreground tabular-nums">
            {now > 0
              ? d.state === "atStop"
                ? t.list.now
                : formatCountdown(minutesUntil(d.expected, now))
              : null}
            {late !== 0 ? (
              <span className="text-late">
                {now > 0 ? " · " : ""}
                {late > 0 ? `+${late}` : `−${-late}`}
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
    </button>
  );
});
