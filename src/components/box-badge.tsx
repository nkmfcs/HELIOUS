import { boxLabel, type BoxId } from "@/lib/boxes";
import { cn } from "@/lib/utils";

export function BoxBadge({ box, className }: { box: BoxId | number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center rounded-sm bg-elevated px-1.5 text-xs font-semibold tabular",
        className,
      )}
    >
      {boxLabel(box)}
    </span>
  );
}
