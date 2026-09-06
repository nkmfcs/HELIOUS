import { SIZES, type Color, type OrderItem } from "./types";

export type ParseUnit = "pairs" | "packs";

export function parseOrderText(text: string, unit: ParseUnit): OrderItem[] {
  const result: OrderItem[] = [];
  if (!text.trim()) return result;

  const raw = text
    .replace(/ё/g, "е")
    .replace(/Ё/g, "Е")
    .replace(/[–—−]/g, "-")
    .trim();

  const lines = raw
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  let currentColor: Color = "white";
  const isPacks = unit === "packs";

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (/\b(пар|всего|итого|сумма)\b/.test(lower) && !/\b(1[4-9]|2[0-8])\b/.test(lower)) {
      continue;
    }
    if (/^(бел|белый|белые|white|ок)\b/.test(lower) && !/\d/.test(line)) {
      currentColor = "white";
      continue;
    }
    if (/^(черн|чёрн|черный|черные|black|кора)\b/.test(lower) && !/\d/.test(line)) {
      currentColor = "black";
      continue;
    }
    if (/^(золот|gold|голд)\b/.test(lower) && !/\d/.test(line)) {
      currentColor = "gold";
      continue;
    }

    let color: Color = currentColor;
    if (/\b(бел|белый|белые|white|ок)\b/.test(lower)) color = "white";
    if (/\b(черн|чёрн|черный|черные|black|кора)\b/.test(lower)) color = "black";
    if (/\b(золот|gold|голд)\b/.test(lower)) color = "gold";
    currentColor = color;

    const match = line.match(/\b(1[4-9]|2[0-8])\b\s*[-:–—/]?\s*(\d+)/);
    if (!match) continue;
    const size = Number(match[1]);
    let qty = Number(match[2]);
    if (isPacks || /\b(уп|упак|упаковк)/i.test(line)) qty *= 5;
    if (qty > 0 && SIZES.includes(size as (typeof SIZES)[number])) {
      const existing = result.find((r) => r.color === color && r.size === size);
      if (existing) existing.qty += qty;
      else result.push({ color, size, qty });
    }
  }
  return result;
}
