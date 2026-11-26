import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchDirect } from "./journey-lookup";
import type { Departure, Mode } from "./model";
import type { Stations } from "./stations";

/** Give up on a mode after this many pages in a row without a departure. */
const MAX_EMPTY_PAGES = 4;
/** How far ahead to page: the planner's timetable runs out eventually. */
const HORIZON_MS = 2 * 24 * 3600_000;
/** Departures stay listed this long after they have left. */
const GRACE_MS = 60_000;

type Stream = { rows: Departure[]; next: number; empty: number; done: boolean };

/**
 * Every direct way from one station to another ("till Hornstull"), in timetable
 * order, paged from the journey planner as the user scrolls.
 *
 * The planner hides journeys it finds worse than another, so a bus loses to a
 * faster metro. Asking once per transport mode gets around that: each mode is
 * its own stream, the one furthest behind is fetched next, and rows are shown
 * only up to the point every stream has reached, so nothing is inserted above
 * what the user is reading.
 */
export function useDirect(
  from: number | null,
  to: number | null,
  /** Start the list here instead of now: when the user gets to `from`. */
  start: number | undefined,
  /** The modes that leave from `from`; ignored after the first non-empty value per pair. */
  modes: Mode[],
  stations: Stations | null,
  now: number,
) {
  const scope = from !== null && to !== null ? `${from}>${to}@${start ?? ""}` : "";
  const [state, setState] = useState<{ scope: string; streams: Partial<Record<Mode, Stream>> }>({
    scope,
    streams: {},
  });
  const streams = state.scope === scope ? state.streams : {};
  const [loading, setLoading] = useState(false);
  const busy = useRef<AbortController | null>(null);

  // The mode list comes from the live board and may flicker; fix it per pair.
  const fixed = useRef<{ scope: string; modes: Mode[] }>({ scope: "", modes: [] });
  if (fixed.current.scope !== scope || fixed.current.modes.length === 0) {
    fixed.current = { scope, modes: [...new Set(modes)].sort() };
  }
  const streamModes = fixed.current.modes;

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new pair cancels the old pair's request
  useEffect(() => {
    return () => {
      busy.current?.abort();
      busy.current = null;
      setLoading(false);
    };
  }, [scope]);

  const first = useCallback(() => Math.max(Date.now(), start ?? 0) - GRACE_MS, [start]);
  const cursor = (mode: Mode) => streams[mode]?.next ?? first();
  const open = streamModes.filter((m) => !streams[m]?.done);
  const done = scope !== "" && streamModes.length > 0 && open.length === 0;

  const run = useCallback(
    async (mode: Mode, after: number, refreshing: boolean) => {
      if (!stations || from === null || to === null) return;
      const abort = new AbortController();
      if (!refreshing) {
        busy.current = abort;
        setLoading(true);
      }
      let page: Awaited<ReturnType<typeof fetchDirect>> | null = null;
      try {
        page = await fetchDirect({ from, to, mode, after }, stations, abort.signal);
      } catch {
        // Counted as an empty page below.
      }
      if (abort.signal.aborted) return;
      if (!refreshing) {
        busy.current = null;
        setLoading(false);
      }
      setState((s) => {
        const current = s.scope === scope ? s.streams : {};
        const before = current[mode] ?? { rows: [], next: after, empty: 0, done: false };
        const fetched = page?.departures ?? [];
        // A refresh only brings live times up to date for rows already listed.
        const fresh = new Map(fetched.map((d) => [d.key, d]));
        const rows = before.rows.map((d) => fresh.get(d.key) ?? d);
        if (refreshing) return { scope, streams: { ...current, [mode]: { ...before, rows } } };
        const known = new Set(rows.map((d) => d.key));
        const added = fetched.filter((d) => !known.has(d.key));
        const empty = added.length ? 0 : before.empty + 1;
        const next = page?.next ?? after + 30 * 60_000;
        return {
          scope,
          streams: {
            ...current,
            [mode]: {
              rows: [...rows, ...added],
              next,
              empty,
              done: empty >= MAX_EMPTY_PAGES || next > Date.now() + HORIZON_MS,
            },
          },
        };
      });
    },
    [stations, from, to, scope],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: `open` and `cursor` derive from `streams`
  const loadMore = useCallback(() => {
    if (busy.current || open.length === 0) return;
    const mode = open.reduce((a, b) => (cursor(b) < cursor(a) ? b : a));
    run(mode, cursor(mode), false);
  }, [run, streams, streamModes]);

  /** Bring the live times of the nearest departures up to date. */
  const refresh = useCallback(() => {
    for (const mode of streamModes) {
      if (streams[mode]?.rows.length) run(mode, first(), true);
    }
  }, [run, streams, streamModes, first]);

  const departures = useMemo(() => {
    const frontier = Math.min(
      ...streamModes.filter((m) => !streams[m]?.done).map((m) => streams[m]?.next ?? 0),
      Number.POSITIVE_INFINITY,
    );
    return streamModes
      .flatMap((m) => streams[m]?.rows ?? [])
      .filter((d) => d.scheduled <= frontier && d.expected > now - GRACE_MS)
      .sort((a, b) => a.scheduled - b.scheduled);
  }, [streams, streamModes, now]);

  return { departures, loadMore, refresh, loading, done };
}
