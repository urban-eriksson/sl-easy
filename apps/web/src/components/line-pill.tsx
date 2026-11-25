import { lineColor } from "@/lib/lines";
import type { Line } from "@/lib/model";
import { cn } from "@/lib/utils";

/** The line number on SL's colour for the line: the only colour in the app. */
export function LinePill({ line, className }: { line: Line; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-8 min-w-12 shrink-0 items-center justify-center rounded-md px-2 text-[0.95rem] font-semibold tabular-nums",
        lineColor(line),
        className,
      )}
    >
      {line.designation}
    </span>
  );
}
