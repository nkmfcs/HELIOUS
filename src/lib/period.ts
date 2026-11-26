export type PeriodKind = "all" | "week" | "month" | "year";

export type Period = { kind: PeriodKind; anchor: string };

export type PeriodRange = { from: string; to: string } | null;

const MONTHS = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
];

function parse(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** Границы периода (включительно) в формате YYYY-MM-DD; `null` — за всё время. */
export function periodRange({ kind, anchor }: Period): PeriodRange {
  const date = parse(anchor);
  if (kind === "week") {
    const monday = addDays(date, -((date.getUTCDay() + 6) % 7));
    return { from: iso(monday), to: iso(addDays(monday, 6)) };
  }
  if (kind === "month") {
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth();
    return { from: iso(new Date(Date.UTC(y, m, 1))), to: iso(new Date(Date.UTC(y, m + 1, 0))) };
  }
  if (kind === "year") {
    const y = date.getUTCFullYear();
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  return null;
}

export function inPeriod(date: string, range: PeriodRange): boolean {
  return !range || (date >= range.from && date <= range.to);
}

/** Сдвигает период на `step` недель/месяцев/лет. */
export function shiftPeriod(period: Period, step: number): Period {
  const date = parse(period.anchor);
  if (period.kind === "week") return { ...period, anchor: iso(addDays(date, step * 7)) };
  if (period.kind === "month")
    return {
      ...period,
      anchor: iso(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + step, 1))),
    };
  if (period.kind === "year")
    return { ...period, anchor: iso(new Date(Date.UTC(date.getUTCFullYear() + step, 0, 1))) };
  return period;
}

export function periodTitle(period: Period): string {
  const range = periodRange(period);
  if (!range) return "За всё время";
  const [fy, fm, fd] = range.from.split("-");
  const [ty, tm, td] = range.to.split("-");
  if (period.kind === "year") return `${fy} год`;
  if (period.kind === "month") {
    const name = MONTHS[Number(fm) - 1];
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${fy}`;
  }
  return `${fd}.${fm}${fy === ty ? "" : `.${fy}`} – ${td}.${tm}.${ty}`;
}
