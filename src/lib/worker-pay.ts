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

type PaymentRow = {
  amount: number;
  date: string;
  createdAt?: string;
  workerId?: string;
  kind?: string;
  payableId?: string;
};

/**
 * Заново распределяет выплаты работнику по его начислениям.
 * Нужна после удаления выплаты или начисления, чтобы остатки «Осталось» совпадали с кассой.
 * Выплата «Закрыть» по конкретному начислению сначала идёт в него; остальное — от старых начислений к новым.
 */
export function reallocateWorkerPayments<P extends Payable>(
  payables: P[],
  cash: PaymentRow[],
  workerId: string,
): P[] {
  const result = payables.map((payable) =>
    payable.workerId === workerId ? { ...payable, paidSum: 0 } : payable,
  );
  const own = result
    .map((payable, index) => ({ payable, index }))
    .filter(({ payable }) => payable.workerId === workerId)
    .sort((a, b) => a.payable.date.localeCompare(b.payable.date) || a.index - b.index)
    .map(({ payable }) => payable);
  const payments = cash
    .filter((row) => row.kind === "worker" && row.workerId === workerId)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || (a.createdAt ?? "").localeCompare(b.createdAt ?? ""),
    );
  for (const payment of payments) {
    let left = Math.max(0, Math.round(payment.amount));
    const target = payment.payableId ? own.find((p) => p.id === payment.payableId) : undefined;
    for (const payable of target ? [target, ...own] : own) {
      if (left <= 0) break;
      const take = Math.min(left, payable.amount - payable.paidSum);
      if (take <= 0) continue;
      payable.paidSum += take;
      left -= take;
    }
  }
  return result;
}
