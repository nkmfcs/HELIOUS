import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, Stat } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { colorLabel, formatDate, formatNum, formatSum } from "@/lib/format";
import { BoxBadge } from "@/components/box-badge";
import { boxOf, groupItemsByBox } from "@/lib/boxes";
import { useWarehouse } from "@/lib/store";
import { orderDebt } from "@/lib/stats";
import { COLORS } from "@/lib/types";

export const Route = createFileRoute("/_app/orders/$orderId")({ component: OrderPage });

function OrderPage() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const state = useWarehouse();
  const addPayment = useWarehouse((s) => s.addPayment);
  const cancelOrder = useWarehouse((s) => s.cancelOrder);
  const order = state.orders.find((o) => o.id === orderId);
  const boxes = state.boxes;
  const [pay, setPay] = useState("");

  if (!order) {
    return (
      <div className="space-y-3">
        <p className="text-muted">Заказ не найден</p>
        <Button asChild variant="secondary">
          <Link to="/orders">К списку</Link>
        </Button>
      </div>
    );
  }

  const client = state.clients.find((c) => c.id === order.clientId);
  const debt = orderDebt(order);

  function payNow() {
    const amount = Number(pay.replace(/\s/g, ""));
    if (!amount || amount <= 0) {
      toast("Сумма");
      return;
    }
    addPayment({ clientId: order!.clientId, amount, orderId: order!.id, note: "Оплата заказа" });
    setPay("");
    toast("Оплата принята");
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/orders" className="text-xs text-muted hover:text-fg">
          ← Заказы
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Заказ {formatDate(order.date)}</h1>
        {client ? (
          <Link to="/clients/$clientId" params={{ clientId: client.id }} className="text-sm text-muted hover:text-fg">
            {client.name}
            {client.shop ? ` · ${client.shop}` : ""}
          </Link>
        ) : (
          <p className="text-sm text-muted">Клиент удалён</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {order.status === "cancelled" ? (
          <Badge>Отменён</Badge>
        ) : debt > 0 ? (
          <Badge tone="danger">Долг {formatSum(debt)}</Badge>
        ) : (
          <Badge tone="ok">Оплачен</Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Пар" value={formatNum(order.totalPairs)} />
        <Stat label="Сумма" value={formatSum(order.totalSum)} />
        <Stat label="Оплачено" value={formatSum(order.paidSum)} tone="ok" />
        <Stat label="Остаток" value={formatSum(debt)} tone={debt > 0 ? "danger" : "ok"} />
      </div>

      {order.status === "shipped" && debt > 0 ? (
        <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label>Оплата по этому заказу</Label>
            <Input inputMode="numeric" value={pay} onChange={(e) => setPay(e.target.value)} placeholder={String(debt)} />
          </div>
          <Button onClick={payNow}>Принять</Button>
        </Card>
      ) : null}

      {order.note ? (
        <Card className="p-4 text-sm text-muted">{order.note}</Card>
      ) : null}

      {order.items.length > 0 ? (
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-medium">Откуда доставали</h3>
          <div className="space-y-1 text-sm">
            {groupItemsByBox(boxes, order.items).map((g) => (
              <div key={g.box}>
                #{g.box}: {g.items.map((i) => `${colorLabel(i.color)} ${i.size}×${i.qty}`).join(" · ")}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {COLORS.map((c) => {
        const rows = order.items.filter((i) => i.color === c);
        if (!rows.length) return null;
        return (
          <Card key={c} className="overflow-hidden">
            <div className="border-b border-border px-4 py-3 text-sm font-medium">{colorLabel(c)}</div>
            <table className="w-full text-sm">
              <tbody>
                {rows.map((i) => (
                  <tr key={i.size} className="border-t border-border/70">
                    <td className="px-4 py-2">р.{i.size}</td>
                    <td className="px-2 py-2 text-center">
                      <BoxBadge box={boxOf(boxes, i.color, i.size)} />
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular">{i.qty} пар</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        );
      })}

      {order.missing.length > 0 ? (
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-medium">Не собрали (предзаказ клиента)</h3>
          <ul className="space-y-1 text-sm text-warn">
            {order.missing.map((i) => (
              <li key={`${i.color}-${i.size}`}>
                {colorLabel(i.color)} р.{i.size} × {i.qty}{" "}
                <BoxBadge box={boxOf(boxes, i.color, i.size)} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {order.status === "shipped" ? (
        <Button
          variant="danger"
          onClick={() => {
            if (!confirm("Отменить заказ и вернуть товар на склад?")) return;
            cancelOrder(order.id);
            toast("Заказ отменён, товар возвращён");
            void navigate({ to: "/orders" });
          }}
        >
          Отменить и вернуть на склад
        </Button>
      ) : null}
    </div>
  );
}
