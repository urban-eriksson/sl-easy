import { ArrowRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { findJourney } from "@/lib/journey-lookup";
import type { Departure, Journey, Station } from "@/lib/model";
import type { Stations } from "@/lib/stations";
import { formatClock } from "@/lib/time";
import { cn } from "@/lib/utils";
import { LinePill } from "./line-pill";

type Lookup = { for: string; journey: Journey | null | "failed" } | null;

/**
 * Bottom sheet for one departure: the stops from here to the end of the line.
 * Tapping a stop narrows the list to every direct way there from here; the
 * arrow beside it moves to that station instead. Together they let the user
 * chain from station to station without the app being a trip planner.
 */
export function JourneySheet({
  departure,
  stations,
  towardsId,
  onTowards,
  onOpenStation,
  onClose,
}: {
  departure: Departure;
  stations: Stations | null;
  /** The station the list is narrowed to, if any: marked in the stop list. */
  towardsId: number | undefined;
  onTowards: (station: Station) => void;
  onOpenStation: (station: Station) => void;
  onClose: () => void;
}) {
  const [lookup, setLookup] = useState<Lookup>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // A planner departure knows its stops only as far as the chosen station: fetch the rest.
    if ((departure.journey && !departure.terminusId) || !stations) return;
    const abort = new AbortController();
    findJourney(departure, stations, abort.signal)
      .then((journey) => setLookup({ for: departure.key, journey }))
      .catch(() => {
        if (!abort.signal.aborted) setLookup({ for: departure.key, journey: "failed" });
      });
    return () => abort.abort();
  }, [departure, stations]);

  useEffect(() => {
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const looked = lookup?.for === departure.key ? lookup.journey : undefined;
  const found = looked && looked !== "failed" ? looked : (departure.journey ?? looked);
  const cancelled = departure.state === "cancelled";
  const late = Math.round((departure.expected - departure.scheduled) / 60000);

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label={t.nav.close}
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-black/60"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${departure.line.designation} ${t.sheet.towards(departure.destination)}`}
        className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[85dvh] max-w-2xl animate-sheet-up flex-col rounded-t-2xl border-t bg-card motion-reduce:animate-none"
      >
        <div className="flex items-start gap-3 px-4 pt-4 pb-3">
          <LinePill line={departure.line} className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg leading-tight font-semibold">
              {t.sheet.towards(departure.destination)}
            </h2>
            <p className="text-sm text-muted-foreground">
              {cancelled ? (
                <span className="text-destructive">{t.list.cancelled}</span>
              ) : (
                <>
                  {t.sheet.departs(formatClock(departure.scheduled))}
                  {late !== 0 ? (
                    <span className="text-late"> {late > 0 ? `+${late}` : `−${-late}`}</span>
                  ) : null}
                </>
              )}
              {departure.platform ? ` · ${t.list.platform(departure.platform)}` : ""}
            </p>
          </div>
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            aria-label={t.nav.close}
            className="-mt-1 -mr-1 flex size-10 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-3"
          >
            <X aria-hidden className="size-5 text-muted-foreground" />
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {departure.message ? <p className="pb-3 text-sm text-late">{departure.message}</p> : null}

          <h3 className="text-sm font-medium text-muted-foreground">{t.sheet.stops}</h3>
          <p className="pb-1 text-sm text-muted-foreground">{t.sheet.hint}</p>
          {found === undefined ? (
            <p className="py-3 text-muted-foreground">{t.sheet.loading}</p>
          ) : found === null || found === "failed" || found.stops.length < 2 ? (
            <p className="py-3 text-muted-foreground">
              {found === "failed" ? t.sheet.failed : t.sheet.notFound}
            </p>
          ) : (
            <>
              <StopList
                journey={found}
                stations={stations}
                towardsId={towardsId}
                onTowards={onTowards}
                onOpenStation={onOpenStation}
              />
              {found.approximate ? (
                <p className="pt-2 text-sm text-muted-foreground">{t.sheet.approximate}</p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StopList({
  journey,
  stations,
  towardsId,
  onTowards,
  onOpenStation,
}: {
  journey: Journey;
  stations: Stations | null;
  towardsId: number | undefined;
  onTowards: (station: Station) => void;
  onOpenStation: (station: Station) => void;
}) {
  const last = journey.stops.length - 1;
  return (
    <ol>
      {journey.stops.map((stop, i) => {
        // The first stop is where the user already is.
        const target = i > 0 && stop.siteId !== undefined ? stations?.get(stop.siteId) : undefined;
        const chosen = target !== undefined && target.id === towardsId;
        const row = (
          <>
            <span className="w-12 shrink-0 text-muted-foreground tabular-nums">
              {journey.approximate ? "~" : ""}
              {formatClock(stop.planned)}
            </span>
            {/* The line the vehicle runs along, with a dot per stop. */}
            <span aria-hidden className="relative flex w-3 shrink-0 justify-center self-stretch">
              <span
                className={cn(
                  "absolute w-0.5 bg-foreground/30",
                  i === 0 ? "top-1/2 bottom-0" : i === last ? "top-0 bottom-1/2" : "inset-y-0",
                )}
              />
              <span
                className={cn(
                  "relative my-auto size-2.5 rounded-full border-2 border-foreground bg-card",
                  (i === 0 || i === last || chosen) && "bg-foreground",
                )}
              />
            </span>
            <span className={cn("min-w-0 flex-1 truncate", chosen && "font-semibold")}>
              {stop.name}
              {stop.delay ? (
                <span className="text-sm font-normal text-late tabular-nums">
                  {" "}
                  {stop.delay > 0 ? `+${stop.delay}` : `−${-stop.delay}`}
                </span>
              ) : null}
            </span>
            {i === 0 ? (
              <span className="shrink-0 pr-2 text-sm text-muted-foreground">{t.sheet.here}</span>
            ) : null}
          </>
        );
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed sequence; loop lines visit a stop twice
          <li key={i} className="flex items-center gap-1">
            {target ? (
              <>
                <button
                  type="button"
                  onClick={() => onTowards({ id: target.id, name: target.name })}
                  aria-label={t.sheet.filterTo(target.name)}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-3 active:bg-muted"
                >
                  {row}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenStation({ id: target.id, name: target.name })}
                  aria-label={t.sheet.openStation(target.name)}
                  className="flex size-10 shrink-0 items-center justify-center rounded-full border bg-background outline-none focus-visible:ring-3 active:bg-muted"
                >
                  <ArrowRight aria-hidden className="size-4" />
                </button>
              </>
            ) : (
              <div className="flex min-h-11 min-w-0 flex-1 items-center gap-3">{row}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
