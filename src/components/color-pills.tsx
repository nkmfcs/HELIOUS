import { COLORS, type Color } from "@/lib/types";
import { colorLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ColorPills({
  value,
  onChange,
}: {
  value: Color;
  onChange: (c: Color) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-elevated p-1">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            "h-10 flex-1 rounded-md text-sm font-medium transition-colors",
            value === c
              ? c === "white"
                ? "bg-white-chip text-fg shadow-soft"
                : c === "black"
                  ? "bg-black-chip text-on-ink"
                  : "bg-gold-chip text-fg"
              : "text-muted hover:text-fg",
          )}
        >
          {colorLabel(c)}
        </button>
      ))}
    </div>
  );
}
