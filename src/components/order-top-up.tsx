import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BoxBadge } from "@/components/box-badge";
import { ColorPills } from "@/components/color-pills";
import { QtyStepper } from "@/components/qty-stepper";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { boxOf } from "@/lib/boxes";
import { colorLabel, formatSum } from "@/lib/format";
import { normalizeOrderItems, subtractItems } from "@/lib/inventory";
import { cartToItems, emptyCart, useWarehouse } from "@/lib/store";
import { SELL_PRICE, SIZES, type Color, type Order } from "@/lib/types";
import { cn } from "@/lib/utils";

type Cart = Record<Color, Record<number, number>>;

/**
 * Дополнение уже оформленного заказа: показывает, что из «Не хватило»
 * сейчас есть на складе и сколько можно добавить, плюс любые другие позиции.
 */
export function OrderTopUp({ order, onDone }: { order: Order; onDone: () => void }) {
  const stock = useWarehouse((s) => s.stock);
  const boxes = useWarehouse((s) => s.boxes);
  const updateOrder = useWarehouse((s) => s.updateOrder);

  const missingRows = useMemo(
    () =>
      order.missing.map((i) => {
        const have = stock[i.color][i.size] ?? 0;
        return { ...i, have, can: Math.min(i.qty, have) };
      }),
    [order.missing, stock],
  );

  const [fromMissing, setFromMissing] = useState<Record<string, number>>(() =>
    Object.fromEntries(missingRows.map((r) => [`${r.color}-${r.size}`, r.can])),
  );
  const [extra, setExtra] = useState<Cart>(emptyCart);
  const [color, setColor] = useState<Color>(order.missing[0]?.color ?? "white");

  const fromMissingItems = missingRows
    .map((r) => ({ color: r.color, size: r.size, qty: fromMissing[`${r.color}-${r.size}`] ?? 0 }))
    .filter((i) => i.qty > 0);
  const extraItems = cartToItems(extra);
  const add = normalizeOrderItems([...fromMissingItems, ...extraItems]);
  const addPairs = add.reduce((s, i) => s + i.qty, 0);
  const canFromMissing = missingRows.reduce((s, r) => s + r.can, 0);
  const missingTotal = missingRows.reduce((s, r) => s + r.qty, 0);

  const usedFromMissing = (c: Color, size: number) => fromMissing[`${c}-${size}`] ?? 0;

  function save() {
    if (!addPairs) {
      toast("Нечего добавлять");
      return;
    }
    const result = updateOrder({
      orderId: order.id,
      items: [...order.items, ...add],
      missing: subtractItems(order.missing, add),
      note: order.note,
      date: order.date,
    });
    if (!result.ok) {
      if (result.reason === "insufficient_stock") {
        toast(
          `Не хватает на складе: ${result.shortages
            .map((s) => `${colorLabel(s.color)} ${s.size}`)
            .join(", ")}`,
        );
      } else toast("Не удалось дополнить заказ");
      return;
    }
    toast(`Добавлено ${addPairs} пар · теперь ${result.shipped} пар в заказе`);
    onDone();
  }

  return (
    <div className="space-y-5">
      {missingRows.length > 0 ? (
        <Card className="overflow-hidden">
          <div className="border-b border-border px-4 py-3">
            <div className="text-sm font-medium">Из «Не хватило»</div>
            <div className="text-xs text-muted">
              Не хватило {missingTotal} пар · сейчас можно добавить{" "}
              <span className={canFromMissing ? "font-medium text-ok" : "text-danger"}>
                {canFromMissing}
              </span>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-subtle">
                <th className="px-4 py-2 text-left font-medium">Позиция</th>
                <th className="px-1 py-2 text-center font-medium">Ждёт</th>
                <th className="px-1 py-2 text-center font-medium">Склад</th>
                <th className="px-3 py-2 text-right font-medium">Добавить</th>
              </tr>
            </thead>
            <tbody>
              {missingRows.map((r) => {
                const k = `${r.color}-${r.size}`;
                const value = fromMissing[k] ?? 0;
                return (
                  <tr
                    key={k}
                    className={cn(
                      "border-t border-border/70",
                      r.can === 0 ? "bg-danger-bg/30" : value > 0 ? "bg-ok-bg/40" : "",
                    )}
                  >
                    <td className="px-4 py-2">
                      <span className="font-medium">
                        {colorLabel(r.color)} {r.size}
                      </span>{" "}
                      <BoxBadge box={boxOf(boxes, r.color, r.size)} />
                    </td>
                    <td className="px-1 py-2 text-center font-mono tabular">{r.qty}</td>
                    <td
                      className={cn(
                        "px-1 py-2 text-center font-mono tabular",
                        r.have === 0 ? "text-danger" : "text-muted",
                      )}
                    >
                      {r.have}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {r.can === 0 ? (
                        <span className="pr-2 text-xs text-danger">пока нет</span>
                      ) : (
                        <QtyStepper
                          compact
                          value={value}
                          onChange={(v) =>
                            setFromMissing((p) => ({ ...p, [k]: Math.min(r.can, v) }))
                          }
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card className="p-4 text-sm text-muted">
          В этом заказе нет недостачи. Ниже можно добавить другие позиции.
        </Card>
      )}

      <div className="space-y-3">
        <div className="text-sm font-medium">Добавить другое</div>
        <ColorPills value={color} onChange={setColor} />
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-subtle">
                <th className="px-4 py-3 text-left font-medium">Размер</th>
                <th className="px-2 py-3 text-center font-medium">Кор.</th>
                <th className="px-2 py-3 text-center font-medium">Можно</th>
                <th className="px-3 py-3 text-right font-medium">±5</th>
              </tr>
            </thead>
            <tbody>
              {SIZES.map((size) => {
                const free = Math.max(0, (stock[color][size] ?? 0) - usedFromMissing(color, size));
                const qty = extra[color][size] ?? 0;
                return (
                  <tr key={size} className="border-t border-border/70">
                    <td className="px-4 py-2 font-medium">{size}</td>
                    <td className="px-2 py-2 text-center">
                      <BoxBadge box={boxOf(boxes, color, size)} />
                    </td>
                    <td
                      className={cn(
                        "px-2 py-2 text-center font-mono tabular",
                        free === 0 ? "text-danger" : "text-muted",
                      )}
                    >
                      {free}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <QtyStepper
                        compact
                        value={qty}
                        onChange={(v) =>
                          setExtra((p) => ({
                            ...p,
                            [color]: { ...p[color], [size]: Math.min(free, v) },
                          }))
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>

      <Card className="space-y-3 p-4">
        {add.length > 0 ? (
          <div className="text-sm">
            {add.map((i) => `${colorLabel(i.color)} ${i.size}×${i.qty}`).join(" · ")}
          </div>
        ) : null}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Добавится</span>
          <span className="font-medium">
            +{addPairs} пар · +{formatSum(addPairs * SELL_PRICE)}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Заказ станет</span>
          <span>
            {order.totalPairs + addPairs} пар ·{" "}
            {formatSum((order.totalPairs + addPairs) * SELL_PRICE)}
          </span>
        </div>
        <Button className="w-full" disabled={!addPairs} onClick={save}>
          Добавить в заказ
        </Button>
      </Card>
    </div>
  );
}
