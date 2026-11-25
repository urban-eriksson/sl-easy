import { ChevronDown, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { t } from "@/lib/i18n";
import type { Alert } from "@/lib/model";
import { cn } from "@/lib/utils";

/** Disruption notices, folded to one line until asked for. */
export function Alerts({ alerts }: { alerts: Alert[] }) {
  const [open, setOpen] = useState(false);
  if (alerts.length === 0) return null;
  return (
    <section className="mb-3 rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm outline-none focus-visible:ring-3"
      >
        <TriangleAlert aria-hidden className="size-4 shrink-0 text-late" />
        <span className="flex-1">{t.alerts.summary(alerts.length)}</span>
        <ChevronDown
          aria-hidden
          className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <ul className="space-y-3 border-t px-3 py-3 text-sm">
          {alerts.map((a) => (
            <li key={a.text}>
              {a.title ? <p className="font-medium">{a.title}</p> : null}
              <p className="whitespace-pre-line text-muted-foreground">{a.text}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
