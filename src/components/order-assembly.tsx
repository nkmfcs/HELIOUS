import { Link, useNavigate } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BoxBadge } from "@/components/box-badge";
import { QtyStepper } from "@/components/qty-stepper";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { groupItemsByBox } from "@/lib/boxes";
import { colorLabel, formatDate, formatSum, todayISO } from "@/lib/format";
import { useWarehouse } from "@/lib/store";
import { type Order, type OrderItem } from "@/lib/types";
import { hasCustomPrices, itemsSum, priceOf } from "@/lib/pricing";
import { cn } from "@/lib/utils";

const key = (i: { color: string; size: number }) => `${i.color}-${i.size}`;

/**
 * Экран сборки: заказ вписан, сверен со складом, но склад ещё не списан.
 * Отмечаешь, что собрал, и подтверждаешь — только тогда заказ оформляется.
 */
export function OrderAssembly({ order }: { order: Order }) {
  const navigate = useNavigate();
  const stock = useWarehouse((s) => s.stock);
  const boxes = useWarehouse((s) => s.boxes);
  const orders = useWarehouse((s) => s.orders);
  const client = useWarehouse((s) => s.clients.find((c) => c.id === order.clientId));
  const setPicked = useWarehouse((s) => s.setAssemblyPicked);
  const confirmAssembly = useWarehouse((s) => s.confirmAssembly);
  const deleteAssembly = useWarehouse((s) => s.deleteAssembly);
  const [date, setDate] = useState(todayISO());

  const picked = useMemo(
    () => new Map((order.picked ?? []).map((i) => [key(i), i.qty])),
    [order.picked],
  );

  // Сколько этих же позиций ждут другие сборки — чтобы не пообещать одно и то же дважды.
  const reservedElsewhere = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of orders) {
      if (o.status !== "assembling" || o.id === order.id) continue;
      for (const i of o.items) map.set(key(i), (map.get(key(i)) ?? 0) + i.qty);
    }
    return map;
  }, [orders, order.id]);

  const rows = order.items.map((i) => {
    const have = stock[i.color][i.size] ?? 0;
    const max = Math.min(i.qty, have);
    return { ...i, have, max, got: Math.min(picked.get(key(i)) ?? 0, max) };
  });
  const requested = rows.reduce((s, r) => s + r.qty, 0);
  const collected = rows.reduce((s, r) => s + r.got, 0);
  const canCollect = rows.reduce((s, r) => s + r.max, 0);
  const shortage = requested - canCollect;
  const done = rows.length > 0 && rows.every((r) => r.got === r.max);

  function update(item: OrderItem, qty: number) {
    const next = rows.map((r) => ({
      color: r.color,
      size: r.size,
      qty: key(r) === key(item) ? qty : r.got,
    }));
    setPicked(order.id, next);
  }

  function pickAll() {
    setPicked(
      order.id,
      rows.map((r) => ({ color: r.color, size: r.size, qty: r.max })),
    );
  }

  function confirm_() {
    if (collected < canCollect) {
      if (
        !confirm(
          `Собрано ${collected} из ${canCollect} доступных. Несобранное (${requested - collected} пар) уйдёт в «Не хватило». Оформить?`,
        )
      )
        return;
    }
    const res = confirmAssembly({
      orderId: order.id,
      picked: rows.map((r) => ({ color: r.color, size: r.size, qty: r.got })),
      date,
    });
    if (!res.ok) {
      if (res.reason === "insufficient_stock") {
        toast(
          `Склад изменился: ${res.shortages
            .map((s) => `${colorLabel(s.color)} ${s.size} — есть ${s.have}`)
            .join("; ")}`,
        );
      } else toast("Нечего оформлять");
      return;
    }
    toast(`Заказ оформлен: ${res.shipped} пар${res.missing ? `, не хватило ${res.missing}` : ""}`);
  }

  function remove() {
    if (!confirm("Удалить эту сборку? Склад не меняется.")) return;
    deleteAssembly(order.id);
    toast("Сборка удалена");
    void navigate({ to: "/orders" });
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/orders" className="text-xs text-muted hover:text-fg">
          ← Заказы
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Сборка заказа</h1>
        <p className="text-sm text-muted">
          {client ? `${client.name}${client.shop ? ` · ${client.shop}` : ""}` : "Клиент удалён"} ·
          вписан {formatDate(order.date)}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge tone="warn">Сборка — склад не списан</Badge>
        {shortage > 0 ? <Badge tone="danger">не хватает {shortage}</Badge> : null}
      </div>

      {order.note ? <Card className="p-4 text-sm text-muted">{order.note}</Card> : null}

      <Card className="space-y-2 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted">Собрано</span>
          <span className="text-2xl font-semibold tabular">
            {collected}
            <span className="text-base font-normal text-muted"> / {canCollect}</span>
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-elevated">
          <div
            className="h-full bg-ok transition-all"
            style={{ width: `${canCollect ? (collected / canCollect) * 100 : 0}%` }}
          />
        </div>
        <div className="text-xs text-muted">
          Заказано {requested} пар
          {shortage > 0
            ? ` · на складе нет ${shortage} — уйдут в предзаказ`
            : " · всё есть на складе"}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs">
          {[...new Set(rows.map((r) => r.color))].map((c) => {
            const cr = rows.filter((r) => r.color === c);
            return (
              <span key={c}>
                {colorLabel(c)}:{" "}
                <span className="font-mono font-medium tabular">
                  {cr.reduce((s, r) => s + r.got, 0)}/{cr.reduce((s, r) => s + r.qty, 0)}
                </span>
                {hasCustomPrices(order.prices) ? (
                  <span className="text-muted"> · {priceOf(order.prices, c)}</span>
                ) : null}
              </span>
            );
          })}
        </div>
        {!done ? (
          <Button variant="secondary" size="sm" className="w-full" onClick={pickAll}>
            Отметить всё доступное как собранное
          </Button>
        ) : null}
      </Card>

      {groupItemsByBox(boxes, rows).map((g) => (
        <Card key={g.box} className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-medium">
            <BoxBadge box={g.box} /> Коробка
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-subtle">
                <th className="px-4 py-2 text-left font-medium">Позиция</th>
                <th className="px-1 py-2 text-center font-medium">Надо</th>
                <th className="px-1 py-2 text-center font-medium">Склад</th>
                <th className="px-3 py-2 text-right font-medium">Собрал</th>
              </tr>
            </thead>
            <tbody>
              {g.items.map((r) => {
                const full = r.got === r.max && r.max > 0;
                const other = reservedElsewhere.get(key(r)) ?? 0;
                return (
                  <tr
                    key={key(r)}
                    className={cn(
                      "border-t border-border/70",
                      full ? "bg-ok-bg/40" : r.max === 0 ? "bg-danger-bg/30" : "",
                    )}
                  >
                    <td className="px-4 py-2">
                      <div className="font-medium">
                        {colorLabel(r.color)} {r.size}
                      </div>
                      {other > 0 ? (
                        <div className="text-[11px] text-warn">ещё {other} в других сборках</div>
                      ) : null}
                    </td>
                    <td className="px-1 py-2 text-center font-mono tabular">{r.qty}</td>
                    <td
                      className={cn(
                        "px-1 py-2 text-center font-mono tabular",
                        r.have < r.qty ? "text-danger" : "text-muted",
                      )}
                    >
                      {r.have}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {r.max === 0 ? (
                        <span className="pr-2 text-xs text-danger">нет</span>
                      ) : (
                        <div className="inline-flex items-center gap-1">
                          <QtyStepper
                            compact
                            value={r.got}
                            onChange={(v) => update(r, Math.min(r.max, v))}
                          />
                          <button
                            type="button"
                            aria-label="Собрал всё"
                            onClick={() => update(r, full ? 0 : r.max)}
                            className={cn(
                              "grid size-9 place-items-center rounded-sm",
                              full ? "bg-ok text-white" : "bg-elevated text-subtle",
                            )}
                          >
                            <Check className="size-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ))}

      <Card className="space-y-3 p-4">
        <div>
          <Label>Дата оформления</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">К оформлению</span>
          <span className="font-medium">
            {collected} пар ·{" "}
            {formatSum(
              itemsSum(
                rows.map((r) => ({ color: r.color, size: r.size, qty: r.got })),
                order.prices,
              ),
            )}
          </span>
        </div>
        <Button className="w-full" disabled={collected === 0 && canCollect > 0} onClick={confirm_}>
          Собрал — оформить заказ
        </Button>
        <p className="text-center text-xs text-subtle">
          Только после этого спишется склад и появится долг клиента.
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Button asChild variant="secondary">
          <Link to="/orders/new" search={{ editId: order.id }}>
            Изменить состав
          </Link>
        </Button>
        <Button variant="danger" onClick={remove}>
          Удалить сборку
        </Button>
      </div>
    </div>
  );
}
