import { Navigation } from "lucide-react";
import type { Station } from "@/lib/model";
import { formatDistance } from "@/lib/time";
import { cn } from "@/lib/utils";

export type Chip = Station & { distance?: number };

/** One-tap shortcuts under the header: the stations nearest the user, then recent ones. */
export function StationChips({
  chips,
  activeId,
  onSelect,
}: {
  chips: Chip[];
  activeId: number | undefined;
  onSelect: (station: Station) => void;
}) {
  if (chips.length === 0) return null;
  return (
    <div className="mx-auto flex max-w-2xl gap-2 overflow-x-auto px-4 pb-2.5 [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden">
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          onClick={() => onSelect({ id: chip.id, name: chip.name })}
          aria-current={chip.id === activeId ? "true" : undefined}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm whitespace-nowrap outline-none focus-visible:ring-3",
            chip.id === activeId
              ? "border-primary bg-primary text-primary-foreground"
              : "bg-card text-foreground",
          )}
        >
          {chip.distance !== undefined ? <Navigation aria-hidden className="size-3" /> : null}
          {chip.name}
          {chip.distance !== undefined ? (
            <span className={chip.id === activeId ? "opacity-70" : "text-muted-foreground"}>
              {formatDistance(chip.distance)}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
