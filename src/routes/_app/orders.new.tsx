import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BoxBadge } from "@/components/box-badge";
import { ColorPills } from "@/components/color-pills";
import { boxOf, groupItemsByBox } from "@/lib/boxes";
import { QtyStepper } from "@/components/qty-stepper";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { colorLabel, formatSum, todayISO } from "@/lib/format";
import { parseOrderText, type ParseUnit } from "@/lib/order-parser";
import { cartToItems, emptyCart, useWarehouse } from "@/lib/store";
import { checkAvailability } from "@/lib/stats";
import { COLORS, SELL_PRICE, SIZES, type Color } from "@/lib/types";
import { cn } from "@/lib/utils";

type Search = { clientId?: string };

export const Route = createFileRoute("/_app/orders/new")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    clientId: typeof s.clientId === "string" ? s.clientId : undefined,
  }),
  component: NewOrderPage,
});

function NewOrderPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const clients = useWarehouse((s) => s.clients);
  const stock = useWarehouse((s) => s.stock);
  const boxes = useWarehouse((s) => s.boxes);
  const addClient = useWarehouse((s) => s.addClient);
  const shipOrder = useWarehouse((s) => s.shipOrder);

  const [clientId, setClientId] = useState(search.clientId ?? clients[0]?.id ?? "");
  const [newName, setNewName] = useState("");
  const [newShop, setNewShop] = useState("");
  const [color, setColor] = useState<Color>("white");
  const [cart, setCart] = useState(emptyCart);
  const [ai, setAi] = useState("");
  const [unit, setUnit] = useState<ParseUnit>("pairs");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayISO());

  const items = useMemo(() => cartToItems(cart), [cart]);
  const checked = useMemo(() => checkAvailability(stock, items), [stock, items]);
  const pickByBox = useMemo(
    () =>
      groupItemsByBox(
        boxes,
        checked.filter((i) => i.can > 0).map((i) => ({ ...i, qty: i.can })),
      ),
    [boxes, checked],
  );
  const can = checked.reduce((s, i) => s + i.can, 0);
  const miss = checked.reduce((s, i) => s + i.miss, 0);

  function setQty(c: Color, size: number, qty: number) {
    setCart((prev) => ({ ...prev, [c]: { ...prev[c], [size]: qty } }));
  }

  function applyAI() {
    const parsed = parseOrderText(ai, unit);
    if (!parsed.length) {
      toast("Не удалось разобрать текст");
      return;
    }
    setCart((prev) => {
      const next = Object.fromEntries(
        COLORS.map((entryColor) => [entryColor, { ...prev[entryColor] }]),
      ) as typeof prev;
      for (const p of parsed) next[p.color][p.size] = (next[p.color][p.size] ?? 0) + p.qty;
      return next;
    });
    toast(`Добавлено ${parsed.length} позиций`);
  }

  function createClient() {
    if (!newName.trim()) {
      toast("Имя клиента");
      return;
    }
    const id = addClient({ name: newName, shop: newShop });
    setClientId(id);
    setNewName("");
    setNewShop("");
    toast("Клиент создан");
  }

  function submit() {
    if (!clientId) {
      toast("Выберите клиента");
      return;
    }
    if (!items.length) {
      toast("Пустой заказ");
      return;
    }
    const res = shipOrder({ clientId, items, note, date });
    if (!res) {
      toast("Нечего отгружать");
      return;
    }
    toast(`Отгружено ${res.shipped} пар`);
    void navigate({ to: "/orders/$orderId", params: { orderId: res.orderId } });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Новый заказ</h1>
        <p className="mt-1 text-sm text-muted">
          Сначала клиент, потом состав. Недостающее уйдёт в предзаказ клиента.
        </p>
      </div>

      <Card className="space-y-3 p-4">
        <Label>Клиент</Label>
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm"
        >
          <option value="">— выбрать —</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.shop ? ` · ${c.shop}` : ""}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder="Новый клиент"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Input placeholder="Точка" value={newShop} onChange={(e) => setNewShop(e.target.value)} />
        </div>
        <Button variant="secondary" size="sm" onClick={createClient}>
          Создать клиента
        </Button>
      </Card>

      <Card className="space-y-3 p-4">
        <div className="text-sm font-medium">Вставить список</div>
        <Textarea
          value={ai}
          onChange={(e) => setAi(e.target.value)}
          placeholder={"БЕЛЫЕ / ОК\n17 10\n18 10\n\nЧЁРНЫЕ / КОРА\n17 10\n\nСЕРЫЕ\n18 5"}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setUnit("pairs")}
            className={cn(
              "h-9 flex-1 rounded-sm text-sm",
              unit === "pairs" ? "bg-elevated" : "text-muted",
            )}
          >
            Числа = пары
          </button>
          <button
            type="button"
            onClick={() => setUnit("packs")}
            className={cn(
              "h-9 flex-1 rounded-sm text-sm",
              unit === "packs" ? "bg-elevated" : "text-muted",
            )}
          >
            Числа = упак. ×5
          </button>
        </div>
        <Button variant="secondary" className="w-full" onClick={applyAI}>
          Разобрать и добавить
        </Button>
      </Card>

      <ColorPills value={color} onChange={setColor} />

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-subtle">
              <th className="px-4 py-3 text-left font-medium">Размер</th>
              <th className="px-2 py-3 text-center font-medium">Кор.</th>
              <th className="px-2 py-3 text-center font-medium">Склад</th>
              <th className="px-2 py-3 text-center font-medium">Заказ</th>
              <th className="px-3 py-3 text-right font-medium">±5</th>
            </tr>
          </thead>
          <tbody>
            {SIZES.map((size) => {
              const have = stock[color][size] ?? 0;
              const qty = cart[color][size] ?? 0;
              return (
                <tr key={size} className="border-t border-border/70">
                  <td className="px-4 py-2 font-medium">{size}</td>
                  <td className="px-2 py-2 text-center">
                    <BoxBadge box={boxOf(boxes, color, size)} />
                  </td>
                  <td
                    className={cn(
                      "px-2 py-2 text-center font-mono tabular",
                      have === 0 ? "text-danger" : "text-muted",
                    )}
                  >
                    {have}
                  </td>
                  <td
                    className={cn(
                      "px-2 py-2 text-center font-mono tabular",
                      qty > 0 ? "text-fg" : "text-subtle",
                    )}
                  >
                    {qty}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <QtyStepper compact value={qty} onChange={(v) => setQty(color, size, v)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {checked.length > 0 ? (
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-medium">Сверка со складом</h3>
          <ul className="space-y-1 text-sm">
            {checked.map((i) => (
              <li key={`${i.color}-${i.size}`} className="flex justify-between">
                <span>
                  {colorLabel(i.color)} р.{i.size} × {i.qty}{" "}
                  <BoxBadge box={boxOf(boxes, i.color, i.size)} />
                </span>
                {i.miss > 0 ? (
                  <span className="text-danger">
                    отдам {i.can}, нет {i.miss}
                  </span>
                ) : (
                  <span className="text-ok">есть</span>
                )}
              </li>
            ))}
          </ul>
          {pickByBox.length > 0 ? (
            <div className="mt-3 border-t border-border pt-3 text-sm">
              <div className="mb-1 text-xs text-muted">Откуда доставать</div>
              {pickByBox.map((g) => (
                <div key={g.box} className="py-0.5">
                  #{g.box}:{" "}
                  {g.items.map((i) => `${colorLabel(i.color)} ${i.size}×${i.qty}`).join(" · ")}
                </div>
              ))}
            </div>
          ) : null}
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Дата</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label>Заметка</Label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="деньги не отдал…"
          />
        </div>
      </div>

      <Card className="flex items-center justify-between p-4">
        <div>
          <div className="text-xs text-muted">Отгрузить</div>
          <div className="font-medium">
            {can} пар · {formatSum(can * SELL_PRICE)}
          </div>
          {miss > 0 ? <Badge tone="warn">не хватает {miss}</Badge> : null}
        </div>
        <Button disabled={can === 0 && miss === 0} onClick={submit}>
          Оформить
        </Button>
      </Card>

      {COLORS.some((c) => Object.values(cart[c]).some((q) => q > 0)) ? (
        <p className="text-center text-xs text-subtle">
          Корзина общая по всем цветам — переключайте, не сбрасывается.
        </p>
      ) : null}
    </div>
  );
}
