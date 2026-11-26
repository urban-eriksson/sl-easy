import { useCallback, useEffect, useMemo, useState } from "react";
import type { Departure } from "./model";
import { stockholmDateTime } from "./time";
import { type Current, expandDay, type StationFile, serviceDays } from "./timetable";
import { loadCurrent, loadStation } from "./timetable-source";

type Loaded = {
  stationId: number;
  /** "missing": no timetable for this station, or it could not be fetched. */
  status: "loading" | "ready" | "missing";
  current?: Current;
  file?: StationFile;
  /** How many service days are expanded, counted from yesterday. */
  days: number;
};

/** Yesterday (its trips run past midnight), today and tomorrow. */
const FIRST_DAYS = 3;

/**
 * A station's timetable for the coming week, a day at a time: `more()` adds the
 * next day when the user has scrolled to the end of what is listed.
 */
export function useTimetable(stationId: number | null) {
  const [state, setState] = useState<Loaded | null>(null);

  useEffect(() => {
    if (stationId === null) return;
    const abort = new AbortController();
    setState({ stationId, status: "loading", days: FIRST_DAYS });
    loadCurrent()
      .then(async (current) => {
        const file = await loadStation(current.version, stationId, abort.signal);
        setState({ stationId, status: "ready", current, file, days: FIRST_DAYS });
      })
      .catch(() => {
        if (!abort.signal.aborted) setState({ stationId, status: "missing", days: 0 });
      });
    return () => abort.abort();
  }, [stationId]);

  const mine = state?.stationId === stationId ? state : null;
  const { current, file, days = 0 } = mine ?? {};

  const dates = useMemo(() => {
    if (!current) return [];
    const all = serviceDays(current);
    // Start at yesterday's service day; the files begin there when they are fresh.
    const today = stockholmDateTime(Date.now()).date;
    const from = Math.max(0, all.findIndex((d) => d >= today) - 1);
    return all.slice(from);
  }, [current]);

  const departures = useMemo<Departure[]>(() => {
    if (!current || !file) return [];
    return dates
      .slice(0, days)
      .flatMap((date) => expandDay(file, current, date))
      .sort((a, b) => a.scheduled - b.scheduled);
  }, [current, file, dates, days]);

  const more = useCallback(() => {
    setState((s) => (s && s.status === "ready" ? { ...s, days: s.days + 1 } : s));
  }, []);

  return {
    /** The station the data belongs to; lags `stationId` while a new one loads. */
    stationId: mine?.stationId ?? null,
    status: mine?.status ?? "loading",
    departures,
    more,
    days,
    /** True when every published day is listed. */
    end: days >= dates.length,
  };
}
