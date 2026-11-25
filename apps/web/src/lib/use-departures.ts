import { useCallback, useEffect, useRef, useState } from "react";
import type { Alert, Departure } from "./model";
import { fetchAlerts, fetchDepartures, HttpError } from "./sl";

const REFRESH_MS = 30_000;

export type Board = {
  /** The station the data belongs to; lags `stationId` while a new one loads. */
  stationId: number | null;
  departures: Departure[];
  alerts: Alert[];
  status: "loading" | "ready" | "error";
  /** Set when the last refresh failed: "busy" is SL's rate limit. */
  problem: "busy" | "failed" | null;
  reload: () => void;
};

function merge(a: Alert[], b: Alert[]): Alert[] {
  const seen = new Set<string>();
  return [...a, ...b].filter((x) => !seen.has(x.text) && seen.add(x.text));
}

/**
 * A station's next departures, refetched every 30 s while the page is visible
 * and at once when it becomes visible again. A failed refresh keeps the last
 * list on screen and reports the problem beside it.
 */
export function useDepartures(stationId: number | null): Board {
  const [data, setData] = useState<Omit<Board, "reload">>({
    stationId: null,
    departures: [],
    alerts: [],
    status: "loading",
    problem: null,
  });
  const [turn, setTurn] = useState(0);
  const reload = useCallback(() => setTurn((n) => n + 1), []);
  // Disruption notices change slowly and that API is quick to rate-limit: once per station.
  const notices = useRef<{ stationId: number; alerts: Alert[] } | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `turn` is the manual reload trigger
  useEffect(() => {
    if (stationId === null) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    setData((d) =>
      d.stationId === stationId
        ? d
        : { stationId, departures: [], alerts: [], status: "loading", problem: null },
    );

    const load = async () => {
      clearTimeout(timer);
      if (document.hidden) return;
      try {
        if (notices.current?.stationId !== stationId) {
          notices.current = { stationId, alerts: [] };
          fetchAlerts(stationId, abort.signal)
            .then((alerts) => {
              if (notices.current?.stationId !== stationId) return;
              notices.current.alerts = alerts;
              setData((d) =>
                d.stationId === stationId ? { ...d, alerts: merge(d.alerts, alerts) } : d,
              );
            })
            .catch(() => {});
        }
        const result = await fetchDepartures(stationId, abort.signal);
        setData({
          stationId,
          departures: result.departures,
          alerts: merge(result.alerts, notices.current?.alerts ?? []),
          status: "ready",
          problem: null,
        });
      } catch (err) {
        if (abort.signal.aborted) return;
        const problem = err instanceof HttpError && err.status === 429 ? "busy" : "failed";
        setData((d) => ({ ...d, status: d.status === "ready" ? "ready" : "error", problem }));
      }
      timer = setTimeout(load, REFRESH_MS);
    };

    load();
    const onVisible = () => {
      if (!document.hidden) load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      abort.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [stationId, turn]);

  return { ...data, reload };
}
