import type { Payable, Worker, WarehouseState } from "./types.ts";

/** Приводит ставку или количество пар к целому неотрицательному числу. */
export function cleanWholeNumber(value: unknown): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Сумма к оплате за пары по ставке работника, сум. */
export function pairsAmount(pairs: number, rate: number): number {
  return cleanWholeNumber(pairs) * cleanWholeNumber(rate);
}

export type PairsAccrual = Pick<Payable, "person" | "amount" | "pairs" | "rate">;

/**
 * Считает начисление за принятые у работника пары по его ставке.
 * Возвращает текст ошибки, если посчитать нельзя.
 */
export function buildPairsAccrual(
  worker: Pick<Worker, "name" | "rate">,
  pairs: number,
): PairsAccrual | { error: string } {
  const count = cleanWholeNumber(pairs);
  if (count <= 0) return { error: "Укажите количество пар — целое число больше нуля" };
  const rate = cleanWholeNumber(worker.rate);
  if (rate <= 0) return { error: "Сначала укажите ставку за пару в карточке работника" };
  return { person: worker.name, amount: pairsAmount(count, rate), pairs: count, rate };
}

/** Сколько пар принято у работника за всё время (по всем начислениям за пары). */
export function workerPairs(state: Pick<WarehouseState, "payables">, workerId: string): number {
  return (state.payables ?? [])
    .filter((payable) => payable.workerId === workerId)
    .reduce((total, payable) => total + cleanWholeNumber(payable.pairs), 0);
}

/**
 * Подпись «200 пар × 3 000», если начисление сделано за пары и сумма не правилась
 * вручную; иначе `null`.
 */
export function pairsAccrualLabel(
  entry: Pick<Payable, "amount" | "pairs" | "rate">,
  format: (n: number) => string,
): string | null {
  const pairs = cleanWholeNumber(entry.pairs);
  const rate = cleanWholeNumber(entry.rate);
  if (!pairs || !rate || pairs * rate !== entry.amount) return null;
  return `${format(pairs)} пар × ${format(rate)}`;
}
