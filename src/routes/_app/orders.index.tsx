import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Group } from "@/components/ui/card";
import { formatDate, formatNum, formatSum } from "@/lib/format";
import { useWarehouse } from "@/lib/store";
import { orderDebt } from "@/lib/stats";

export const Route = createFileRoute("/_app/orders/")({ component: OrdersPage });

type Filter = "all" | "debt" | "paid" | "cancelled";

function OrdersPage() {
  const state = useWarehouse();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    return [...state.orders]
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
      .filter((o) => {
        if (filter === "debt") return o.status === "shipped" && orderDebt(o) > 0;
        if (filter === "paid") return o.status === "shipped" && orderDebt(o) === 0;
        if (filter === "cancelled") return o.status === "cancelled";
        return true;
      })
      .filter((o) => {
        const client = state.clients.find((c) => c.id === o.clientId);
        const s = `${client?.name ?? ""} ${client?.shop ?? ""} ${o.note}`.toLowerCase();
        return s.includes(q.toLowerCase().trim());
      });
  }, [state.orders, state.clients, filter, q]);

  const tabs: { id: Filter; label: string }[] = [
    { id: "all", label: "Все" },
    { id: "debt", label: "Долг" },
    { id: "paid", label: "Оплачены" },
    { id: "cancelled", label: "Отмена" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Заказы</h1>
          <p className="mt-1 text-sm text-muted">История отгрузок, отдельно от карточек клиентов</p>
        </div>
        <Button asChild>
          <Link to="/orders/new">Новый</Link>
        </Button>
      </div>

      <div className="flex gap-1 rounded-lg bg-surface p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setFilter(t.id)}
            className={
              filter === t.id
                ? "h-9 flex-1 rounded-md bg-elevated text-sm font-medium"
                : "h-9 flex-1 rounded-md text-sm text-muted"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Клиент или заметка"
        className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm outline-none focus:border-border-strong"
      />

      <div>
        {list.length === 0 ? (
          <Group>
            <p className="p-8 text-center text-sm text-muted">Нет заказов</p>
          </Group>
        ) : (
          <Group>
            {list.map((o, i) => {
              const client = state.clients.find((c) => c.id === o.clientId);
              const d = orderDebt(o);
              return (
                <div key={o.id}>
                  {i > 0 ? <div className="ml-4 h-px bg-border" /> : null}
                  <Link to="/orders/$orderId" params={{ orderId: o.id }} className="block px-4 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">
                          {client ? `${client.name}${client.shop ? " · " + client.shop : ""}` : "Без клиента"}
                        </div>
                        <div className="mt-0.5 text-xs text-muted">
                          {formatDate(o.date)} · {o.totalPairs} пар
                          {o.missing.length ? ` · не хватило ${o.missing.reduce((s, i) => s + i.qty, 0)}` : ""}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold tabular">{formatSum(o.totalSum)}</div>
                        {o.status === "cancelled" ? (
                          <Badge>Отменён</Badge>
                        ) : d > 0 ? (
                          <Badge tone="danger">Долг</Badge>
                        ) : (
                          <Badge tone="ok">Оплачен</Badge>
                        )}
                      </div>
                    </div>
                  </Link>
                </div>
              );
            })}
          </Group>
        )}
      </div>
    </div>
  );
}
