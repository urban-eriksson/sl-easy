import { ArrowLeft, Clock, MapPin, Navigation } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { t } from "@/lib/i18n";
import type { Station } from "@/lib/model";
import { distance, type Stations } from "@/lib/stations";
import { formatDistance } from "@/lib/time";
import type { Position } from "@/lib/use-location";
import type { Chip } from "./station-chips";

const MAX_HITS = 30;

/**
 * Full-screen station search. The whole station list is on the device, so
 * results follow every keystroke with no network round trip.
 */
export function StationPicker({
  stations,
  stationsFailed,
  position,
  nearby,
  recent,
  onSelect,
  onClose,
}: {
  stations: Stations | null;
  stationsFailed: boolean;
  position: Position | null;
  nearby: Chip[];
  recent: Station[];
  onSelect: (station: Station) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");

  useEffect(() => {
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

  const hits = useMemo<Chip[]>(() => {
    if (!stations || !query.trim()) return [];
    return stations.search(query, MAX_HITS, position ?? undefined).map((p) => ({
      id: p.id,
      name: p.name,
      distance: position ? distance(position.lat, position.lon, p.lat, p.lon) : undefined,
    }));
  }, [stations, query, position]);

  const searching = query.trim().length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.nav.pickStation}
      className="fixed inset-0 z-50 flex animate-fade-in flex-col bg-background pt-[env(safe-area-inset-top)]"
    >
      <form
        className="mx-auto flex h-14 w-full max-w-2xl shrink-0 items-center gap-1 px-2 sm:px-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (hits[0]) onSelect(hits[0]);
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t.nav.close}
          className="flex size-10 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-3"
        >
          <ArrowLeft aria-hidden className="size-5" />
        </button>
        <input
          // biome-ignore lint/a11y/noAutofocus: the picker exists to type in
          autoFocus
          type="search"
          enterKeyHint="go"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.picker.placeholder}
          aria-label={t.picker.placeholder}
          className="h-10 min-w-0 flex-1 rounded-lg border bg-card px-3 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-3"
        />
      </form>

      <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto overscroll-contain px-2 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-4">
        {searching ? (
          stations ? (
            hits.length > 0 ? (
              <Rows rows={hits} icon="pin" onSelect={onSelect} />
            ) : (
              <p className="px-3 py-6 text-muted-foreground">{t.picker.noHits}</p>
            )
          ) : (
            <p className="px-3 py-6 text-muted-foreground">
              {stationsFailed ? t.picker.failed : t.picker.loading}
            </p>
          )
        ) : (
          <>
            {nearby.length > 0 ? (
              <Section title={t.picker.nearby}>
                <Rows rows={nearby} icon="near" onSelect={onSelect} />
              </Section>
            ) : null}
            {recent.length > 0 ? (
              <Section title={t.picker.recent}>
                <Rows rows={recent} icon="recent" onSelect={onSelect} />
              </Section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="pt-3">
      <h2 className="px-3 pb-1 text-sm font-medium text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

const icons = { pin: MapPin, near: Navigation, recent: Clock };

function Rows({
  rows,
  icon,
  onSelect,
}: {
  rows: Chip[];
  icon: keyof typeof icons;
  onSelect: (station: Station) => void;
}) {
  const Icon = icons[icon];
  return (
    <ul>
      {rows.map((row) => (
        <li key={row.id}>
          <button
            type="button"
            onClick={() => onSelect({ id: row.id, name: row.name })}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left outline-none focus-visible:ring-3 active:bg-card"
          >
            <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{row.name}</span>
            {row.distance !== undefined ? (
              <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
                {formatDistance(row.distance)}
              </span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
