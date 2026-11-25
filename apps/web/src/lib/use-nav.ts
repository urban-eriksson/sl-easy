import { useCallback, useEffect, useRef, useState } from "react";
import type { Departure, Station } from "./model";
import { store } from "./store";

/**
 * Where the user is: a station's departures, optionally with one departure's
 * journey sheet open on top. Each step is a browser history entry, so the back
 * button (and the header arrow) walks back through station -> sheet -> station.
 */
export type View = {
  station: Station | null;
  departure: Departure | null;
  /** When the departure the user followed here arrives at this station. */
  arrival?: number;
  /** History entries below this one that belong to the app. */
  depth: number;
};

function isView(value: unknown): value is View {
  return typeof value === "object" && value !== null && "station" in value && "depth" in value;
}

function linkedStation(): Station | null {
  const id = Number(new URLSearchParams(location.search).get("s"));
  if (!id) return null;
  // The name is filled in once the station list has loaded.
  return store.recent().find((s) => s.id === id) ?? { id, name: "" };
}

function initialView(): { view: View; cold: boolean } {
  if (isView(history.state)) return { view: history.state, cold: false };
  // A fresh start shows full lists; narrowings only last while walking back and forth.
  store.clearTowards();
  const linked = linkedStation();
  return {
    view: { station: linked ?? store.last() ?? null, departure: null, depth: 0 },
    cold: !linked,
  };
}

const urlOf = (station: Station | null) =>
  station ? `${location.pathname}?s=${station.id}` : location.pathname;

export function useNav() {
  const [{ view, cold }, setState] = useState(initialView);
  // History calls are side effects: they read the current view here, not in a state updater.
  const current = useRef(view);
  current.current = view;

  // biome-ignore lint/correctness/useExhaustiveDependencies: registers once; `view` is only the first entry
  useEffect(() => {
    if (!isView(history.state)) history.replaceState(view, "", urlOf(view.station));
    const onPop = (e: PopStateEvent) => {
      const root = pendingRoot.current;
      pendingRoot.current = null;
      if (root) go(root, true);
      else if (isView(e.state)) setState({ view: e.state, cold: false });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const go = useCallback((next: View, replace: boolean) => {
    if (replace) history.replaceState(next, "", urlOf(next.station));
    else history.pushState(next, "", urlOf(next.station));
    current.current = next;
    setState({ view: next, cold: false });
  }, []);

  /** `replace`: swap the current entry instead of adding one (start-up, renames). */
  const openStation = useCallback(
    (station: Station, options?: { replace?: boolean; arrival?: number }) => {
      const replace = options?.replace ?? false;
      const depth = current.current.depth + (replace ? 0 : 1);
      go({ station, departure: null, arrival: options?.arrival, depth }, replace);
      if (station.name) store.visit(station);
      window.scrollTo(0, 0);
    },
    [go],
  );

  /**
   * Start over from a station picked in the station panel: it becomes the bottom
   * of the app's history, so there is nothing to go back to.
   */
  const pendingRoot = useRef<View | null>(null);
  const openRoot = useCallback(
    (station: Station) => {
      const root = { station, departure: null, depth: 0 };
      store.clearTowards();
      const depth = current.current.depth;
      if (depth === 0) go(root, true);
      else {
        // Rewind to the app's first entry; `onPop` swaps the station in when it lands.
        pendingRoot.current = root;
        history.go(-depth);
      }
      store.visit(station);
      window.scrollTo(0, 0);
    },
    [go],
  );

  const openDeparture = useCallback(
    (departure: Departure) => {
      go({ ...current.current, departure, depth: current.current.depth + 1 }, false);
    },
    [go],
  );

  const back = useCallback(() => history.back(), []);

  return { view, cold, openStation, openRoot, openDeparture, back };
}
