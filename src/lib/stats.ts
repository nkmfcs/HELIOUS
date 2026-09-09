import {
  COLORS,
  SELL_PRICE,
  type CashKind,
  type CashTxn,
  type Color,
  type Costs,
  type Order,
  type WarehouseState,
} from "./types.ts";
import { monthKey, stockTotal } from "./format.ts";

export function pairCost(c: Costs): number {
  const fixed = c.sewing + c.cutting + c.packaging;
  const material = c.avgMeters * c.materialUSD * c.usdRate;
  return fixed + material;
}

export function warehouseValue(state: WarehouseState): number {
  const pairs = COLORS.reduce((s, col) => s + stockTotal(state.stock[col]), 0);
  return pairs * pairCost(state.costs);
}

export function orderDebt(o: Order): number {
  if (o.status === "cancelled") return 0;
  return Math.max(0, o.totalSum - o.paidSum);
}

export function clientDebt(state: WarehouseState, clientId: string): number {
  return state.orders.filter((o) => o.clientId === clientId).reduce((s, o) => s + orderDebt(o), 0);
}

export function clientTurnover(state: WarehouseState, clientId: string): number {
  return state.orders
    .filter((o) => o.clientId === clientId && o.status === "shipped")
    .reduce((s, o) => s + o.totalSum, 0);
}

export function clientPairs(state: WarehouseState, clientId: string): number {
  return state.orders
    .filter((o) => o.clientId === clientId && o.status === "shipped")
    .reduce((s, o) => s + o.totalPairs, 0);
}

export function payableLeft(p: { amount: number; paidSum: number }): number {
  return Math.max(0, p.amount - p.paidSum);
}

export function workerPaid(state: WarehouseState, workerId: string): number {
  return (state.cash ?? [])
    .filter((t) => t.kind === "worker" && t.workerId === workerId)
    .reduce((n, t) => n + t.amount, 0);
}

export function workerAccrued(state: WarehouseState, workerId: string): number {
  return (state.payables ?? [])
    .filter((payable) => payable.workerId === workerId)
    .reduce((total, payable) => total + payable.amount, 0);
}

export function workerOwed(state: WarehouseState, workerId: string): number {
  return (state.payables ?? [])
    .filter((p) => p.workerId === workerId)
    .reduce((n, p) => n + payableLeft(p), 0);
}

export function totalDebt(state: WarehouseState): number {
  return state.orders.reduce((s, o) => s + orderDebt(o), 0);
}

export function totalPaid(state: WarehouseState): number {
  return state.payments.reduce((s, p) => s + p.amount, 0);
}

export type DayReport = {
  date: string;
  incomingPairs: number;
  orderCount: number;
  shippedPairs: number;
  billed: number;
  paid: number;
  cancelled: number;
};

export function dayReport(state: WarehouseState, date: string): DayReport {
  const orders = state.orders.filter((order) => order.date === date && order.status === "shipped");
  const incoming = state.incoming.filter((row) => row.date === date);
  const payments = state.payments.filter((payment) => payment.date === date);
  const ev = state.events.filter((event) => event.date === date);
  return {
    date,
    incomingPairs: incoming.reduce((sum, row) => sum + row.totalPairs, 0),
    orderCount: orders.length,
    shippedPairs: orders.reduce((sum, order) => sum + order.totalPairs, 0),
    billed: orders.reduce((sum, order) => sum + order.totalSum, 0),
    paid: payments.reduce((sum, payment) => sum + payment.amount, 0),
    cancelled: ev.filter((e) => e.type === "cancel").reduce((s, e) => s + e.pairs, 0),
  };
}

export function monthDays(state: WarehouseState, ym: string): DayReport[] {
  const dates = new Set([
    ...state.events.filter((event) => monthKey(event.date) === ym).map((event) => event.date),
    ...state.orders.filter((order) => monthKey(order.date) === ym).map((order) => order.date),
    ...state.incoming.filter((row) => monthKey(row.date) === ym).map((row) => row.date),
    ...state.payments
      .filter((payment) => monthKey(payment.date) === ym)
      .map((payment) => payment.date),
  ]);
  return [...dates].sort().map((d) => dayReport(state, d));
}

export function monthSummary(state: WarehouseState, ym: string) {
  const days = monthDays(state, ym);
  return {
    orderCount: days.reduce((s, d) => s + d.orderCount, 0),
    shippedPairs: days.reduce((s, d) => s + d.shippedPairs, 0),
    incomingPairs: days.reduce((s, d) => s + d.incomingPairs, 0),
    billed: days.reduce((s, d) => s + d.billed, 0),
    paid: days.reduce((s, d) => s + d.paid, 0),
    days,
  };
}

export function availableMonths(state: WarehouseState): string[] {
  const set = new Set([
    ...state.events.map((event) => monthKey(event.date)),
    ...state.orders.map((order) => monthKey(order.date)),
    ...state.incoming.map((row) => monthKey(row.date)),
    ...state.payments.map((payment) => monthKey(payment.date)),
  ]);
  return [...set].sort().reverse();
}

export function lowStock(state: WarehouseState) {
  const rows: { color: Color; size: number; pairs: number; need: number }[] = [];
  for (const color of COLORS) {
    for (let size = 14; size <= 28; size++) {
      const pairs = state.stock[color][size] ?? 0;
      if (pairs < state.lowThreshold) {
        rows.push({ color, size, pairs, need: state.lowThreshold - pairs });
      }
    }
  }
  return rows;
}

export function checkAvailability(
  stock: WarehouseState["stock"],
  items: { color: Color; size: number; qty: number }[],
) {
  return items.map((item) => {
    const have = stock[item.color]?.[item.size] ?? 0;
    const can = Math.min(item.qty, have);
    return { ...item, have, can, miss: item.qty - can };
  });
}

export function revenuePotential(state: WarehouseState): number {
  return COLORS.reduce((s, c) => s + stockTotal(state.stock[c]), 0) * SELL_PRICE;
}

export function cashSign(kind: CashKind): 1 | -1 {
  return kind === "income" ? 1 : -1;
}

export function cashLabel(kind: CashKind): string {
  if (kind === "income") return "Приход";
  if (kind === "material") return "Материал";
  if (kind === "worker") return "Работник";
  if (kind === "withdraw") return "Снял";
  if (kind === "refund") return "Возврат клиенту";
  return "Прочее";
}

export function sortedCash(state: Pick<WarehouseState, "cash">): CashTxn[] {
  return [...(state.cash ?? [])].sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    if (d !== 0) return d;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export type CashRow = CashTxn & { before: number; after: number };

export function cashLedger(state: Pick<WarehouseState, "cash" | "cashOpening">): CashRow[] {
  let bal = state.cashOpening ?? 0;
  return sortedCash(state).map((t) => {
    const before = bal;
    const after = bal + cashSign(t.kind) * t.amount;
    bal = after;
    return { ...t, before, after };
  });
}

export function cashBalance(state: Pick<WarehouseState, "cash" | "cashOpening">): number {
  const rows = cashLedger(state);
  return rows.length ? rows[rows.length - 1].after : (state.cashOpening ?? 0);
}

export function cashTotals(state: Pick<WarehouseState, "cash">) {
  const cash = state.cash ?? [];
  const sum = (kind: CashKind) =>
    cash.filter((t) => t.kind === kind).reduce((s, t) => s + t.amount, 0);
  return {
    income: sum("income"),
    material: sum("material"),
    worker: sum("worker"),
    withdraw: sum("withdraw"),
    other: sum("other"),
    refund: sum("refund"),
    spent: sum("material") + sum("worker") + sum("withdraw") + sum("other") + sum("refund"),
  };
}
