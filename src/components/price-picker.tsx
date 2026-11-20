import { Card } from "@/components/ui/card";
import { colorLabel, formatNum } from "@/lib/format";
import { normalizePrices, premiumPrices, priceOf } from "@/lib/pricing";
import { COLORS, SELL_PRICE, type Color, type ColorPrices } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Цена за пару по цветам для одного заказа.
 * Две быстрые кнопки + ручная правка любой цены.
 */
export function PricePicker({
  value,
  onChange,
  usedColors,
}: {
  value: ColorPrices | undefined;
  onChange: (next: ColorPrices | undefined) => void;
  /** Цвета, которые есть в заказе — их выделяем. */
  usedColors?: readonly Color[];
}) {
  const current = normalizePrices(value);
  const isBase = !current;
  const premium = normalizePrices(premiumPrices());
  const isPremium = JSON.stringify(current) === JSON.stringify(premium);

  function setPrice(color: Color, raw: string) {
    const n = Number(raw.replace(/\D/g, ""));
    onChange(normalizePrices({ ...(current ?? {}), [color]: n > 0 ? n : SELL_PRICE }));
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="text-sm font-medium">Цена за пару</div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className={cn(
            "rounded-md px-3 py-2 text-sm",
            isBase ? "bg-fg text-bg" : "bg-elevated text-muted",
          )}
        >
          Все по {formatNum(SELL_PRICE)}
        </button>
        <button
          type="button"
          onClick={() => onChange(premiumPrices())}
          className={cn(
            "rounded-md px-3 py-2 text-sm",
            isPremium ? "bg-fg text-bg" : "bg-elevated text-muted",
          )}
        >
          Серые и золотые по 20 000
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {COLORS.map((c) => {
          const used = !usedColors || usedColors.includes(c);
          const price = priceOf(current, c);
          return (
            <label
              key={c}
              className={cn(
                "flex flex-col gap-1 rounded-md border px-3 py-2 text-xs",
                price !== SELL_PRICE ? "border-warn/50 bg-warn-bg/30" : "border-border",
                used ? "" : "opacity-50",
              )}
            >
              <span className="text-muted">{colorLabel(c)}</span>
              <input
                inputMode="numeric"
                className="w-full bg-transparent font-mono text-sm tabular outline-none"
                value={formatNum(price)}
                onChange={(e) => setPrice(c, e.target.value)}
              />
            </label>
          );
        })}
      </div>
    </Card>
  );
}
