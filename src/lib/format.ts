import { COLORS, type Color } from "./types.ts";

export function formatNum(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(n || 0));
}

export function formatSum(n: number): string {
  return `${formatNum(n)} сум`;
}

export function formatCompact(n: number): string {
  const abs = Math.abs(n || 0);
  if (abs >= 1_000_000) {
    const v = (n / 1_000_000).toFixed(2).replace(".", ",");
    return `${v} млн`;
  }
  return formatNum(n);
}

export function colorLabel(c: Color): string {
  if (c === "white") return "Белые";
  if (c === "black") return "Чёрные";
  return "Золотые";
}

export function colorShort(c: Color): string {
  if (c === "white") return "Бел";
  if (c === "black") return "Чёр";
  return "Зол";
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const names = [
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
  const idx = Number(m) - 1;
  return `${names[idx] ?? m} ${y}`;
}

export function emptySizeMap(): Record<number, number> {
  const o: Record<number, number> = {};
  for (let s = 14; s <= 28; s++) o[s] = 0;
  return o;
}

export function emptyCart(): Record<Color, Record<number, number>> {
  return {
    white: emptySizeMap(),
    black: emptySizeMap(),
    gold: emptySizeMap(),
  };
}

export function stockTotal(stock: Record<number, number>): number {
  return Object.values(stock).reduce((a, b) => a + b, 0);
}

export function allStockTotal(stock: Record<Color, Record<number, number>>): number {
  return COLORS.reduce((s, c) => s + stockTotal(stock[c] ?? {}), 0);
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
