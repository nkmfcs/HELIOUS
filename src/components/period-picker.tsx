import { ChevronLeft, ChevronRight } from "lucide-react";
import { type Period, type PeriodKind, periodTitle, shiftPeriod } from "@/lib/period";
import { cn } from "@/lib/utils";

const KINDS: { id: PeriodKind; label: string }[] = [
  { id: "all", label: "Всё" },
  { id: "week", label: "Неделя" },
  { id: "month", label: "Месяц" },
  { id: "year", label: "Год" },
];

export function PeriodPicker({
  value,
  onChange,
}: {
  value: Period;
  onChange: (period: Period) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-1 overflow-x-auto pb-1">
        {KINDS.map((kind) => (
          <button
            key={kind.id}
            type="button"
            onClick={() => onChange({ ...value, kind: kind.id })}
            className={cn(
              "h-9 shrink-0 rounded-full px-3 text-sm",
              value.kind === kind.id ? "bg-accent text-accent-fg" : "bg-surface text-muted",
            )}
          >
            {kind.label}
          </button>
        ))}
      </div>
      {value.kind !== "all" ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Предыдущий период"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-muted"
            onClick={() => onChange(shiftPeriod(value, -1))}
          >
            <ChevronLeft className="size-4" />
          </button>
          {value.kind === "month" ? (
            <label className="relative flex-1">
              <span className="block text-center text-sm font-medium">{periodTitle(value)}</span>
              <input
                type="month"
                aria-label="Выбрать месяц"
                className="absolute inset-0 opacity-0"
                value={value.anchor.slice(0, 7)}
                onChange={(event) => {
                  if (/^\d{4}-\d{2}$/.test(event.target.value))
                    onChange({ ...value, anchor: `${event.target.value}-01` });
                }}
              />
            </label>
          ) : (
            <span className="flex-1 text-center text-sm font-medium">{periodTitle(value)}</span>
          )}
          <button
            type="button"
            aria-label="Следующий период"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-muted"
            onClick={() => onChange(shiftPeriod(value, 1))}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
