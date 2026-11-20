import { COLORS, SELL_PRICE, type Color, type ColorPrices, type OrderItem } from "./types.ts";

export const PREMIUM_PRICE = 20_000;
/** Цвета, которые иногда идут дороже. */
export const PREMIUM_COLORS: readonly Color[] = ["gray", "gold"];

export function priceOf(prices: ColorPrices | undefined, color: Color): number {
  const value = prices?.[color];
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : SELL_PRICE;
}

export function itemsSum(items: readonly OrderItem[], prices?: ColorPrices): number {
  return items.reduce((sum, item) => sum + item.qty * priceOf(prices, item.color), 0);
}

/** Оставляет только цены, отличные от базовой — чтобы не хранить лишнего. */
export function normalizePrices(prices: ColorPrices | undefined): ColorPrices | undefined {
  if (!prices) return undefined;
  const out: ColorPrices = {};
  for (const color of COLORS) {
    const value = priceOf(prices, color);
    if (value !== SELL_PRICE) out[color] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

export function premiumPrices(): ColorPrices {
  return Object.fromEntries(PREMIUM_COLORS.map((c) => [c, PREMIUM_PRICE])) as ColorPrices;
}

export function hasCustomPrices(prices: ColorPrices | undefined): boolean {
  return normalizePrices(prices) !== undefined;
}
