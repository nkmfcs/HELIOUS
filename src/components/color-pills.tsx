import { COLORS, type Color } from "@/lib/types";
import { colorLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ColorPills({ value, onChange }: { value: Color; onChange: (c: Color) => void }) {
  return (
    <div className="grid grid-cols-4 gap-1 rounded-lg bg-elevated p-1">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-pressed={value === c}
          className={cn(
            "flex h-10 min-w-0 items-center justify-center gap-1 rounded-md px-1 text-xs font-medium transition-colors sm:text-sm",
            value === c
              ? c === "white"
                ? "bg-white-chip text-fg shadow-sm"
                : c === "black"
                  ? "bg-black-chip text-on-ink"
                  : c === "gray"
                    ? "bg-gray-chip text-fg"
                    : "bg-gold-chip text-fg"
              : "text-muted hover:text-fg",
          )}
        >
          <span aria-hidden className="helious-palette" style={{background:({white:"#fff",black:"#222",gray:"#a6a6ab",gold:"#c4a574"})[c]}}/>
          <span className="truncate">{colorLabel(c)}</span>
        </button>
      ))}
    </div>
  );
}
