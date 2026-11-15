import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BoxBadge } from "@/components/box-badge";
import { ColorPills } from "@/components/color-pills";
import { QtyStepper } from "@/components/qty-stepper";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { boxOf } from "@/lib/boxes";
import { colorLabel, formatNum, formatSum } from "@/lib/format";
import { addItemsToStock } from "@/lib/inventory";
import { cartToItems, emptyCart, useWarehouse } from "@/lib/store";
import { SELL_PRICE, SIZES, type Color, type OrderItem } from "@/lib/types";
import { cn } from "@/lib/utils";

type Cart = Record<Color, Record<number, number>>;
type EditPart = "items" | "missing";

function cartFromItems(items: readonly OrderItem[]): Cart {
  const cart = emptyCart();
  for (const item of items)
    cart[item.color][item.size] = (cart[item.color][item.size] ?? 0) + item.qty;
  return cart;
}

export function OrderEditor({
  orderId,
  onDone,
  onClose,
}: {
  orderId: string;
  onDone: () => void;
  onClose: () => void;
}) {
  const order = useWarehouse((state) => state.orders.find((candidate) => candidate.id === orderId));
  const stock = useWarehouse((state) => state.stock);
  const boxes = useWarehouse((state) => state.boxes);
  const updateOrder = useWarehouse((state) => state.updateOrder);
  const [part, setPart] = useState<EditPart>("items");
  const [color, setColor] = useState<Color>("white");
  const [itemsCart, setItemsCart] = useState<Cart>(() => cartFromItems(order?.items ?? []));
  const [missingCart, setMissingCart] = useState<Cart>(() => cartFromItems(order?.missing ?? []));
  const [date, setDate] = useState(order?.date ?? "");
  const [note, setNote] = useState(order?.note ?? "");

  const items = useMemo(() => cartToItems(itemsCart), [itemsCart]);
  const missing = useMemo(() => cartToItems(missingCart), [missingCart]);
  const releasedStock = useMemo(
    () => addItemsToStock(stock, order?.status === "shipped" ? order.items : []),
    [stock, order],
  );
  const shippedTotal = items.reduce((sum, item) => sum + item.qty, 0);
  const missingTotal = missing.reduce((sum, item) => sum + item.qty, 0);
  const totalSum = shippedTotal * SELL_PRICE;
  const shortages = items
    .map((item) => ({ ...item, have: releasedStock[item.color][item.size] ?? 0 }))
    .filter((item) => item.qty > item.have);
  const refundAmount = order ? Math.max(0, order.paidSum - totalSum) : 0;
  const activeCart = part === "items" ? itemsCart : missingCart;

  if (!order) return null;

  function setQty(nextColor: Color, size: number, qty: number) {
    const setter = part === "items" ? setItemsCart : setMissingCart;
    setter((previous) => ({ ...previous, [nextColor]: { ...previous[nextColor], [size]: qty } }));
  }

  function save() {
    if (
      refundAmount > 0 &&
      !confirm(
        `Новая сумма меньше уже оплаченной. Записать возврат клиенту ${formatSum(refundAmount)}?`,
      )
    ) {
      return;
    }
    const result = updateOrder({ orderId, items, missing, note, date });
    if (!result.ok) {
      if (result.reason === "insufficient_stock") {
        const detail = result.shortages
          .map(
            (item) =>
              `${colorLabel(item.color)} ${item.size}: нужно ${item.qty}, есть ${item.have}`,
          )
          .join("; ");
        toast(`Не хватает на складе: ${detail}`);
      } else if (result.reason === "empty") {
        toast("Заказ не может быть полностью пустым");
      } else if (result.reason === "invalid_history") {
        toast("В старом заказе повреждён состав по размерам. Склад не изменён.");
      } else {
        toast("Заказ уже отменён или не найден");
      }
      return;
    }
    toast(
      `Заказ обновлён: ${result.shipped} пар, не хватило ${result.missing}${result.refunded ? `, возврат ${formatSum(result.refunded)}` : ""}`,
    );
    onDone();
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-3 p-4">
        <div className="flex gap-1 rounded-md bg-bg p-1">
          <button
            type="button"
            className={cn(
              "h-10 flex-1 rounded-sm text-sm",
              part === "items" ? "bg-elevated font-medium" : "text-muted",
            )}
            onClick={() => setPart("items")}
          >
            Отдано · {shippedTotal}
          </button>
          <button
            type="button"
            className={cn(
              "h-10 flex-1 rounded-sm text-sm",
              part === "missing" ? "bg-elevated font-medium" : "text-muted",
            )}
            onClick={() => setPart("missing")}
          >
            Не хватило · {missingTotal}
          </button>
        </div>
        <p className="text-xs text-muted">
          {part === "items"
            ? "Количество «Отдано» списывается со склада и входит в сумму заказа."
            : "Количество «Не хватило» остаётся предзаказом и склад не меняет."}
        </p>
      </Card>

      <ColorPills value={color} onChange={setColor} />

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-subtle">
              <th className="px-4 py-3 text-left font-medium">Размер</th>
              <th className="px-2 py-3 text-center font-medium">Кор.</th>
              <th className="px-2 py-3 text-center font-medium">Доступно</th>
              <th className="px-3 py-3 text-right font-medium">±5</th>
            </tr>
          </thead>
          <tbody>
            {SIZES.map((size) => {
              const qty = activeCart[color][size] ?? 0;
              const have = releasedStock[color][size] ?? 0;
              const lacks = part === "items" && qty > have;
              return (
                <tr
                  key={size}
                  className={cn("border-t border-border/70", lacks ? "bg-danger-bg/40" : "")}
                >
                  <td className="px-4 py-2 font-medium">{size}</td>
                  <td className="px-2 py-2 text-center">
                    <BoxBadge box={boxOf(boxes, color, size)} />
                  </td>
                  <td
                    className={cn(
                      "px-2 py-2 text-center font-mono tabular",
                      lacks ? "text-danger" : "text-muted",
                    )}
                  >
                    {part === "items" ? have : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <QtyStepper
                      compact
                      value={qty}
                      onChange={(value) => setQty(color, size, value)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {shortages.length > 0 ? (
        <Card className="p-4 text-sm text-danger">
          Не хватает:{" "}
          {shortages
            .map((item) => `${colorLabel(item.color)} ${item.size} — ${item.qty - item.have}`)
            .join(" · ")}
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Дата заказа</Label>
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </div>
        <div className="rounded-md bg-surface p-3">
          <div className="text-xs text-muted">Новая сумма</div>
          <div className="mt-1 font-semibold">{formatSum(totalSum)}</div>
        </div>
      </div>

      <div>
        <Label>Заметка</Label>
        <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
      </div>

      {refundAmount > 0 ? (
        <Card className="p-4 text-sm text-danger">
          Уже оплачено {formatSum(order.paidSum)}, а новая сумма — {formatSum(totalSum)}. При
          сохранении будет записан возврат клиенту {formatSum(refundAmount)}.
        </Card>
      ) : null}

      <Card className="p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">Отдано</span>
          <span>{formatNum(shippedTotal)} пар</span>
        </div>
        <div className="mt-1 flex justify-between">
          <span className="text-muted">Не хватило</span>
          <span>{formatNum(missingTotal)} пар</span>
        </div>
        <div className="mt-1 flex justify-between">
          <span className="text-muted">Оплачено</span>
          <span>{formatSum(order.paidSum)}</span>
        </div>
        {totalSum > order.paidSum ? (
          <Badge tone="danger" className="mt-3">
            Долг {formatSum(totalSum - order.paidSum)}
          </Badge>
        ) : null}
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={onClose}>
          Отмена
        </Button>
        <Button disabled={shortages.length > 0} onClick={save}>
          Сохранить
        </Button>
      </div>
    </div>
  );
}
