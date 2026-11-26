import { MapPin, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alerts } from "@/components/alerts";
import { AppHeader } from "@/components/app-header";
import { DepartureList } from "@/components/departure-list";
import { JourneySheet } from "@/components/journey-sheet";
import { StationPicker } from "@/components/station-picker";
import { t } from "@/lib/i18n";
import type { Mode, Station } from "@/lib/model";
import { loadStations, type Stations } from "@/lib/stations";
import { store } from "@/lib/store";
import { formatClock } from "@/lib/time";
import { useDepartures } from "@/lib/use-departures";
import { useDirect } from "@/lib/use-direct";
import { useLocation } from "@/lib/use-location";
import { useNav } from "@/lib/use-nav";
import { useNow } from "@/lib/use-now";

export function App() {
  const { view, cold, openStation, openRoot, openDeparture, setTowards, back } = useNav();
  const station = view.station;
  const now = useNow(15_000);

  const [stations, setStations] = useState<Stations | null>(null);
  const [stationsFailed, setStationsFailed] = useState(false);
  useEffect(() => {
    loadStations().then(setStations, () => setStationsFailed(true));
  }, []);

  // A linked station (?s=9117) is known by id only until the list has loaded.
  useEffect(() => {
    if (!stations || !station || station.name) return;
    const known = stations.get(station.id);
    if (known) openStation({ id: known.id, name: known.name }, { replace: true });
  }, [stations, station, openStation]);

  const { position, locating, problem: locationProblem, locate } = useLocation();
  const nearest = useMemo<Station | null>(() => {
    const p = stations && position ? stations.nearest(position.lat, position.lon, 1)[0] : null;
    return p ? { id: p.id, name: p.name } : null;
  }, [stations, position]);

  // Opened from the home screen, not from a link: go to the stop the user is standing at.
  const follow = useRef(cold && store.followsLocation());
  useEffect(() => {
    if (follow.current) locate();
  }, [locate]);
  useEffect(() => {
    if (!follow.current || !nearest) return;
    follow.current = false;
    if (nearest.id !== station?.id) openStation(nearest, { replace: true });
  }, [nearest, station, openStation]);

  const [picking, setPicking] = useState(false);
  // The station panel: nothing changes until a station is picked in it.
  const pick = useCallback(() => {
    follow.current = false;
    setPicking(true);
    locate();
  }, [locate]);
  const select = useCallback(
    (next: Station) => {
      setPicking(false);
      openRoot(next);
    },
    [openRoot],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: recents change when the station does
  const recent = useMemo(() => store.recent(), [station]);

  const towards = view.towards ?? null;
  // Followed here on a departure: only what leaves after it has arrived is of interest.
  const after = view.arrival !== undefined && view.arrival > now ? view.arrival : undefined;

  const board = useDepartures(station?.id ?? null);
  const fresh = board.stationId === station?.id;
  const all = fresh ? board.departures : [];
  const live = useMemo(
    () => (after === undefined ? all : all.filter((d) => d.expected >= after)),
    [all, after],
  );
  const modes = useMemo<Mode[]>(() => [...new Set(all.map((d) => d.line.mode))], [all]);
  const direct = useDirect(
    station?.id ?? null,
    towards?.id ?? null,
    view.arrival,
    modes,
    stations,
    now,
  );
  const shown = towards ? direct.departures : live;

  // Page in more while the end of a "till" list is on screen.
  const sentinel = useRef<HTMLDivElement>(null);
  const { loadMore, refresh, loading: loadingMore, done: directDone } = direct;
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-observes after each page, so a still-visible end loads the next one
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !towards || directDone || loadingMore || !stations || modes.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [towards, directDone, loadingMore, loadMore, stations, modes, shown.length]);

  // The board refetches every 30 s; let the "till" list's live times follow it.
  const refreshDirect = useRef(refresh);
  refreshDirect.current = refresh;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `board.departures` changes identity on every refetch
  useEffect(() => {
    if (towards) refreshDirect.current();
  }, [board.departures]);

  const sheet = view.departure;

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader
        title={station?.name ?? ""}
        arrival={view.arrival ? formatClock(view.arrival) : undefined}
        canGoBack={view.depth > 0}
        locating={locating}
        onBack={back}
        onPick={pick}
        onLocate={pick}
      />

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-3 pb-8 sm:px-6">
        {locationProblem && !picking ? (
          <p role="alert" className="mb-3 rounded-lg border bg-card px-3 py-2.5 text-sm">
            {t.location[locationProblem]}
          </p>
        ) : null}

        {!station ? (
          <Welcome onPick={pick} />
        ) : (
          <>
            {fresh ? <Alerts alerts={board.alerts} /> : null}

            {towards ? (
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTowards(null)}
                  aria-label={t.towards.clear}
                  className="flex items-center gap-1.5 rounded-full border border-primary bg-primary py-1 pr-2 pl-3 text-sm font-medium text-primary-foreground outline-none focus-visible:ring-3"
                >
                  {t.towards.label(towards.name)}
                  <X aria-hidden className="size-3.5" />
                </button>
              </div>
            ) : null}

            {!fresh || board.status === "loading" ? (
              <p className="py-10 text-center text-muted-foreground">{t.list.loading}</p>
            ) : board.status === "error" ? (
              <div className="py-10 text-center">
                <p className="text-muted-foreground">
                  {board.problem === "busy" ? t.list.busy : t.list.failed}
                </p>
                <button
                  type="button"
                  onClick={board.reload}
                  className="mt-4 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground outline-none focus-visible:ring-3"
                >
                  {t.list.retry}
                </button>
              </div>
            ) : (
              <>
                {board.problem ? (
                  <p className="mb-2 text-sm text-late">
                    {t.list.stale} · {board.problem === "busy" ? t.list.busy : t.list.failed}
                  </p>
                ) : null}
                {shown.length > 0 ? (
                  <DepartureList departures={shown} now={now} onOpen={openDeparture} />
                ) : towards ? (
                  directDone ? (
                    <p className="py-10 text-center text-muted-foreground">
                      {t.list.noDirect(towards.name)}
                    </p>
                  ) : null
                ) : (
                  <p className="py-10 text-center text-muted-foreground">
                    {after === undefined ? t.list.empty : t.list.emptyAfter(formatClock(after))}
                  </p>
                )}
                <div ref={sentinel} />
                <p className="pt-5 text-center text-sm text-muted-foreground">
                  {!towards
                    ? live.length > 0
                      ? after === undefined
                        ? t.list.scope
                        : t.list.scopeAfter(formatClock(after))
                      : null
                    : directDone
                      ? shown.length > 0
                        ? t.list.noMoreLater
                        : null
                      : t.list.loadingLater}
                </p>
              </>
            )}
          </>
        )}
      </main>

      <footer className="mx-auto w-full max-w-2xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-xs text-muted-foreground sm:px-6">
        {t.footer.data}{" "}
        <a className="underline" href="https://www.trafiklab.se" target="_blank" rel="noopener">
          Trafiklab
        </a>{" "}
        / SL, {t.footer.licence}{" "}
        <a
          className="underline"
          href="https://creativecommons.org/licenses/by/2.0/"
          target="_blank"
          rel="noopener"
        >
          CC BY 2.0
        </a>
      </footer>

      {picking ? (
        <StationPicker
          stations={stations}
          stationsFailed={stationsFailed}
          position={position}
          locating={locating}
          problem={locationProblem}
          recent={recent}
          activeId={station?.id}
          onSelect={select}
          onClose={() => setPicking(false)}
        />
      ) : null}

      {sheet && !picking ? (
        <JourneySheet
          departure={sheet}
          stations={stations}
          towardsId={towards?.id}
          onTowards={setTowards}
          onOpenStation={(to, arrival) => openStation(to, { arrival })}
          onClose={back}
        />
      ) : null}
    </div>
  );
}

function Welcome({ onPick }: { onPick: () => void }) {
  return (
    <div className="py-12 text-center">
      <h2 className="text-2xl font-semibold">{t.welcome.title}</h2>
      <p className="mt-2 text-muted-foreground">{t.welcome.body}</p>
      <button
        type="button"
        onClick={onPick}
        className="mx-auto mt-8 flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground outline-none focus-visible:ring-3"
      >
        <MapPin aria-hidden className="size-4" />
        {t.welcome.pick}
      </button>
    </div>
  );
}
