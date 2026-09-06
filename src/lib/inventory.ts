import { COLORS, SIZES, type OrderItem, type Stock } from "./types.ts";

export type StockShortage = OrderItem & { have: number };

function cloneStock(stock: Stock): Stock {
  return {
    white: { ...stock.white },
    black: { ...stock.black },
    gold: { ...stock.gold },
  };
}

/**
 * Cleans user-controlled order data and combines duplicate colour/size rows.
 * Keeping this at the inventory boundary prevents malformed imports or duplicate
 * rows from adding stock by accident.
 */
export function normalizeOrderItems(items: readonly OrderItem[]): OrderItem[] {
  const merged = new Map<string, OrderItem>();
  for (const item of items) {
    if (!COLORS.includes(item.color)) continue;
    if (!SIZES.includes(item.size as (typeof SIZES)[number])) continue;
    const qty = Math.round(Number(item.qty));
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const key = `${item.color}-${item.size}`;
    const previous = merged.get(key);
    merged.set(key, { color: item.color, size: item.size, qty: (previous?.qty ?? 0) + qty });
  }
  return [...merged.values()].sort((a, b) => {
    const color = COLORS.indexOf(a.color) - COLORS.indexOf(b.color);
    return color || a.size - b.size;
  });
}

export function addItemsToStock(stock: Stock, items: readonly OrderItem[]): Stock {
  const next = cloneStock(stock);
  for (const item of normalizeOrderItems(items)) {
    next[item.color][item.size] = (next[item.color][item.size] ?? 0) + item.qty;
  }
  return next;
}

/** Allocate a new requested order. Anything unavailable is kept as missing. */
export function allocateOrder(
  stock: Stock,
  requested: readonly OrderItem[],
): { stock: Stock; items: OrderItem[]; missing: OrderItem[] } {
  const next = cloneStock(stock);
  const items: OrderItem[] = [];
  const missing: OrderItem[] = [];

  for (const item of normalizeOrderItems(requested)) {
    const have = Math.max(0, next[item.color][item.size] ?? 0);
    const take = Math.min(have, item.qty);
    const miss = item.qty - take;
    if (take > 0) {
      next[item.color][item.size] = have - take;
      items.push({ ...item, qty: take });
    }
    if (miss > 0) missing.push({ ...item, qty: miss });
  }

  return { stock: next, items, missing };
}

/**
 * Replaces the stock part of an active order atomically.
 * Old shipped rows are released first, then the edited rows are deducted.
 * If even one edited row is unavailable, no stock is changed.
 */
export function replaceOrderAllocation(
  stock: Stock,
  previousItems: readonly OrderItem[],
  nextItems: readonly OrderItem[],
): { ok: true; stock: Stock; items: OrderItem[] } | { ok: false; shortages: StockShortage[] } {
  const released = addItemsToStock(stock, previousItems);
  const items = normalizeOrderItems(nextItems);
  const shortages: StockShortage[] = [];

  for (const item of items) {
    const have = Math.max(0, released[item.color][item.size] ?? 0);
    if (item.qty > have) shortages.push({ ...item, have });
  }
  if (shortages.length) return { ok: false, shortages };

  const next = cloneStock(released);
  for (const item of items) next[item.color][item.size] -= item.qty;
  return { ok: true, stock: next, items };
}

export function itemTotal(items: readonly OrderItem[]): number {
  return normalizeOrderItems(items).reduce((sum, item) => sum + item.qty, 0);
}
