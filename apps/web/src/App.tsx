import { ArrowRight, LocateFixed, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alerts } from "@/components/alerts";
import { AppHeader } from "@/components/app-header";
import { DepartureList } from "@/components/departure-list";
import { JourneySheet } from "@/components/journey-sheet";
import { type Chip, StationChips } from "@/components/station-chips";
import { StationPicker } from "@/components/station-picker";
import { t } from "@/lib/i18n";
import type { Mode, Station } from "@/lib/model";
import { loadStations, type Stations } from "@/lib/stations";
import { store } from "@/lib/store";
import { useDepartures } from "@/lib/use-departures";
import { useDirect } from "@/lib/use-direct";
import { useLocation } from "@/lib/use-location";
import { useNav } from "@/lib/use-nav";
import { useNow } from "@/lib/use-now";

const NEARBY_CHIPS = 3;
const NEARBY_IN_PICKER = 6;

export function App() {
  const { view, cold, openStation, openDeparture, back } = useNav();
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
  const nearby = useMemo<Chip[]>(
    () =>
      stations && position
        ? stations
            .nearest(position.lat, position.lon, NEARBY_IN_PICKER)
            .map((p) => ({ id: p.id, name: p.name, distance: p.distance }))
        : [],
    [stations, position],
  );

  // Opened from the home screen, not from a link: go to the stop the user is standing at.
  const follow = useRef(cold && store.followsLocation());
  useEffect(() => {
    if (follow.current) locate();
  }, [locate]);
  useEffect(() => {
    if (!follow.current || nearby.length === 0) return;
    follow.current = false;
    if (nearby[0].id !== station?.id) openStation(nearby[0], { replace: true });
  }, [nearby, station, openStation]);

  const [picking, setPicking] = useState(false);
  const select = useCallback(
    (next: Station) => {
      follow.current = false;
      setPicking(false);
      if (next.id !== station?.id) openStation(next);
    },
    [station, openStation],
  );
  const locateAndGo = useCallback(async () => {
    follow.current = false;
    const found = await locate();
    if (!found) return;
    const all = stations ?? (await loadStations().catch(() => null));
    const nearest = all?.nearest(found.lat, found.lon, 1)[0];
    if (nearest && nearest.id !== station?.id) openStation({ id: nearest.id, name: nearest.name });
  }, [locate, stations, station, openStation]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: recents change when the station does
  const recent = useMemo(() => store.recent(), [station]);
  const chips = useMemo<Chip[]>(() => {
    const near = nearby.slice(0, NEARBY_CHIPS);
    return [...near, ...recent.filter((r) => !near.some((n) => n.id === r.id))];
  }, [nearby, recent]);

  // "Till Hornstull": the station the list is narrowed to, saved per station.
  // `towardsState` lags a render behind a station change.
  const [towardsState, setTowardsState] = useState<{ from: number; to: Station | null }>();
  const towards = useMemo(
    () =>
      station
        ? towardsState?.from === station.id
          ? towardsState.to
          : store.towards(station.id)
        : null,
    [station, towardsState],
  );
  const setTowards = useCallback(
    (to: Station | null) => {
      if (!station) return;
      store.setTowards(station.id, to);
      setTowardsState({ from: station.id, to });
      window.scrollTo(0, 0);
    },
    [station],
  );

  const board = useDepartures(station?.id ?? null);
  const fresh = board.stationId === station?.id;
  const live = fresh ? board.departures : [];
  const modes = useMemo<Mode[]>(() => [...new Set(live.map((d) => d.line.mode))], [live]);
  const direct = useDirect(station?.id ?? null, towards?.id ?? null, modes, stations, now);
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
        canGoBack={view.depth > 0}
        locating={locating}
        onBack={back}
        onPick={() => setPicking(true)}
        onLocate={locateAndGo}
      >
        <StationChips chips={chips} activeId={station?.id} onSelect={select} />
      </AppHeader>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-3 pb-8 sm:px-6">
        {locationProblem ? (
          <p role="alert" className="mb-3 rounded-lg border bg-card px-3 py-2.5 text-sm">
            {t.location[locationProblem]}
          </p>
        ) : null}

        {!station ? (
          <Welcome onLocate={locateAndGo} onSearch={() => setPicking(true)} locating={locating} />
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
                <button
                  type="button"
                  onClick={() => openStation(towards)}
                  className="flex items-center gap-1.5 rounded-full border bg-card py-1 pr-2.5 pl-3 text-sm outline-none focus-visible:ring-3"
                >
                  {t.towards.go(towards.name)}
                  <ArrowRight aria-hidden className="size-3.5 text-muted-foreground" />
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
                  <p className="py-10 text-center text-muted-foreground">{t.list.empty}</p>
                )}
                <div ref={sentinel} />
                <p className="pt-5 text-center text-sm text-muted-foreground">
                  {!towards
                    ? live.length > 0
                      ? t.list.scope
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
          nearby={nearby}
          recent={recent}
          onSelect={select}
          onClose={() => setPicking(false)}
        />
      ) : null}

      {sheet && !picking ? (
        <JourneySheet
          departure={sheet}
          stations={stations}
          towardsId={towards?.id}
          onTowards={(to) => {
            setTowards(to);
            back();
          }}
          onOpenStation={openStation}
          onClose={back}
        />
      ) : null}
    </div>
  );
}

function Welcome({
  onLocate,
  onSearch,
  locating,
}: {
  onLocate: () => void;
  onSearch: () => void;
  locating: boolean;
}) {
  return (
    <div className="py-12 text-center">
      <h2 className="text-2xl font-semibold">{t.welcome.title}</h2>
      <p className="mt-2 text-muted-foreground">{t.welcome.body}</p>
      <div className="mx-auto mt-8 flex max-w-xs flex-col gap-3">
        <button
          type="button"
          onClick={onLocate}
          disabled={locating}
          className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground outline-none focus-visible:ring-3 disabled:opacity-60"
        >
          <LocateFixed aria-hidden className="size-4" />
          {t.welcome.locate}
        </button>
        <button
          type="button"
          onClick={onSearch}
          className="flex items-center justify-center gap-2 rounded-lg border bg-card px-4 py-3 font-medium outline-none focus-visible:ring-3"
        >
          <Search aria-hidden className="size-4" />
          {t.welcome.search}
        </button>
      </div>
    </div>
  );
}
