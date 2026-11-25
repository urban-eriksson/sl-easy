import { ArrowLeft, ChevronDown, LocateFixed, Search } from "lucide-react";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Sticky top bar: the station name is the title. It and the position button both
 * open the station panel.
 * Safe-area padding keeps it under the iOS status bar in standalone mode.
 */
export function AppHeader({
  title,
  canGoBack,
  locating,
  onBack,
  onPick,
  onLocate,
}: {
  /** Station name; empty before one is chosen. */
  title: string;
  canGoBack: boolean;
  locating: boolean;
  onBack: () => void;
  onPick: () => void;
  onLocate: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-2xl items-center gap-1 px-2 sm:px-4">
        {canGoBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label={t.nav.back}
            className="flex size-10 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-3"
          >
            <ArrowLeft aria-hidden className="size-5" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={onPick}
          aria-label={t.nav.pickStation}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1.5 text-left outline-none focus-visible:ring-3",
            canGoBack ? "pl-1" : "pl-2",
          )}
        >
          <h1 className="truncate text-xl font-semibold tracking-tight">{title || t.brand}</h1>
          {title ? (
            <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          )}
        </button>
        <button
          type="button"
          onClick={onLocate}
          aria-label={t.nav.locate}
          className="flex size-10 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-3"
        >
          <LocateFixed
            aria-hidden
            className={cn(
              "size-5 text-muted-foreground",
              locating && "animate-pulse text-foreground",
            )}
          />
        </button>
      </div>
      {/* Horizon line: the header's only decoration. */}
      <div
        aria-hidden
        className="h-px bg-gradient-to-r from-transparent via-foreground/25 to-transparent"
      />
    </header>
  );
}
