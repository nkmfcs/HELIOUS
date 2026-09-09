import { SIZES, type Color, type OrderItem } from "./types.ts";

export type ParseUnit = "pairs" | "packs";

const COLOR_WORDS: ReadonlyArray<[Color, RegExp]> = [
  ["white", /(?:^|[\s:;,()])(белые|белый|бел|white|ок)(?=$|[\s:;,()])/u],
  ["black", /(?:^|[\s:;,()])(черные|черный|черн|black|кора)(?=$|[\s:;,()])/u],
  ["gray", /(?:^|[\s:;,()])(серые|серый|серая|сер|gray|grey)(?=$|[\s:;,()])/u],
  ["gold", /(?:^|[\s:;,()])(золотые|золотой|золот|gold|голд)(?=$|[\s:;,()])/u],
];

function colorInLine(line: string): Color | undefined {
  return COLOR_WORDS.find(([, pattern]) => pattern.test(line))?.[0];
}

export function parseOrderText(text: string, unit: ParseUnit): OrderItem[] {
  const result: OrderItem[] = [];
  if (!text.trim()) return result;

  const raw = text.replace(/ё/g, "е").replace(/Ё/g, "Е").replace(/[–—−]/g, "-").trim();

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
    const detectedColor = colorInLine(lower);
    if (detectedColor && !/\d/.test(line)) {
      currentColor = detectedColor;
      continue;
    }

    const color: Color = detectedColor ?? currentColor;
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
