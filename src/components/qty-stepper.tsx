import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function QtyStepper({
  value,
  onChange,
  step = 5,
  className,
  compact = false,
}: {
  value: number;
  onChange: (next: number) => void;
  step?: number;
  className?: string;
  compact?: boolean;
}) {
  const btn = compact
    ? "grid size-9 place-items-center rounded-sm"
    : "grid size-11 place-items-center rounded-sm";
  return (
    <div className={cn("inline-flex items-center gap-0.5", className)}>
      <button
        type="button"
        className={cn(btn, "bg-danger-bg text-danger")}
        onClick={() => onChange(Math.max(0, value - step))}
        aria-label="Минус"
      >
        <Minus className="size-3.5" />
      </button>
      <span
        className={cn(
          "min-w-8 text-center font-mono text-sm tabular",
          value > 0 ? "text-fg" : "text-subtle",
        )}
      >
        {value}
      </span>
      <button
        type="button"
        className={cn(btn, "bg-ok-bg text-ok")}
        onClick={() => onChange(value + step)}
        aria-label="Плюс"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
