import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, Stat } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { colorLabel, formatCompact, formatDate, formatNum, formatSum } from "@/lib/format";
import { useWarehouse } from "@/lib/store";
import { clientDebt, clientPairs, clientTurnover, orderDebt } from "@/lib/stats";

export const Route = createFileRoute("/_app/clients/$clientId")({ component: ClientPage });

function ClientPage() {
  const { clientId } = Route.useParams();
  const navigate = useNavigate();
  const state = useWarehouse();
  const updateClient = useWarehouse((s) => s.updateClient);
  const deleteClient = useWarehouse((s) => s.deleteClient);
  const addPayment = useWarehouse((s) => s.addPayment);
  const client = state.clients.find((c) => c.id === clientId);
  const orders = state.orders
    .filter((o) => o.clientId === clientId)
    .sort((a, b) => b.date.localeCompare(a.date));
  const payments = state.payments
    .filter((p) => p.clientId === clientId)
    .sort((a, b) => b.date.localeCompare(a.date));
  const [pay, setPay] = useState("");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(client?.name ?? "");
  const [shop, setShop] = useState(client?.shop ?? "");
  const [phone, setPhone] = useState(client?.phone ?? "");
  const [note, setNote] = useState(client?.note ?? "");

  if (!client) {
    return (
      <div className="space-y-4">
        <p className="text-muted">Клиент не найден</p>
        <Button asChild variant="secondary">
          <Link to="/clients">Назад</Link>
        </Button>
      </div>
    );
  }

  const debt = clientDebt(state, client.id);

  function save() {
    updateClient(clientId, { name, shop, phone, note });
    setEditing(false);
    toast("Сохранено");
  }

  function payNow() {
    const amount = Number(pay.replace(/\s/g, ""));
    if (!amount || amount <= 0) {
      toast("Укажите сумму");
      return;
    }
    const result = addPayment({ clientId, amount, note: "Оплата по клиенту" });
    if (!result) {
      toast("У клиента уже нет долга");
      return;
    }
    setPay("");
    toast(
      result.unapplied > 0
        ? `Принято ${formatSum(result.applied)}. Лишние ${formatSum(result.unapplied)} не записаны.`
        : `Принято ${formatSum(result.applied)}`,
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/clients" className="text-xs text-muted hover:text-fg">
          ← Клиенты
        </Link>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{client.name}</h1>
            <p className="text-sm text-muted">{client.shop || "без точки"}</p>
          </div>
          <Button asChild>
            <Link to="/orders/new" search={{ clientId }}>
              Заказ
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Долг"
          value={formatCompact(debt)}
          tone={debt > 0 ? "danger" : "ok"}
          hint="сум"
        />
        <Stat label="Оборот" value={formatCompact(clientTurnover(state, client.id))} />
        <Stat label="Пар взял" value={formatNum(clientPairs(state, client.id))} />
        <Stat label="Заказов" value={String(orders.filter((o) => o.status === "shipped").length)} />
      </div>

      {debt > 0 ? (
        <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label>Принять оплату</Label>
            <Input
              inputMode="numeric"
              value={pay}
              onChange={(e) => setPay(e.target.value)}
              placeholder={`до ${formatNum(debt)}`}
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              setPay(String(debt));
            }}
          >
            Весь долг
          </Button>
          <Button onClick={payNow}>Зачислить</Button>
        </Card>
      ) : null}

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium">Карточка</h2>
          <button
            type="button"
            className="text-xs text-muted hover:text-fg"
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? "Закрыть" : "Изменить"}
          </button>
        </div>
        {editing ? (
          <div className="space-y-3">
            <div>
              <Label>Имя</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>Точка</Label>
              <Input value={shop} onChange={(e) => setShop(e.target.value)} />
            </div>
            <div>
              <Label>Телефон</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <Label>Заметка</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <Button onClick={save}>Сохранить</Button>
          </div>
        ) : (
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Телефон</dt>
              <dd>{client.phone || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Заметка</dt>
              <dd className="text-right">{client.note || "—"}</dd>
            </div>
          </dl>
        )}
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-medium">Заказы</h2>
        <div className="space-y-2">
          {orders.length === 0 ? (
            <p className="text-sm text-muted">Заказов нет</p>
          ) : (
            orders.map((o) => {
              const d = orderDebt(o);
              return (
                <Link key={o.id} to="/orders/$orderId" params={{ orderId: o.id }}>
                  <Card className="mb-2 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">
                          {formatDate(o.date)} · {o.totalPairs} пар
                        </div>
                        <div className="mt-1 text-xs text-muted">
                          {o.items
                            .slice(0, 6)
                            .map((i) => `${colorLabel(i.color).slice(0, 1)}${i.size}×${i.qty}`)
                            .join(" · ")}
                          {o.items.length > 6 ? "…" : ""}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-sm tabular">{formatSum(o.totalSum)}</div>
                        {o.status === "cancelled" ? (
                          <Badge>Отменён</Badge>
                        ) : d > 0 ? (
                          <Badge tone="danger">Долг {formatNum(d)}</Badge>
                        ) : (
                          <Badge tone="ok">Оплачен</Badge>
                        )}
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })
          )}
        </div>
      </section>

      {payments.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-medium">Оплаты</h2>
          <Card className="divide-y divide-border">
            {payments.map((p) => (
              <div key={p.id} className="flex justify-between px-4 py-3 text-sm">
                <span className="text-muted">{formatDate(p.date)}</span>
                <span className={p.amount < 0 ? "text-danger" : "text-ok"}>
                  {formatSum(p.amount)}
                </span>
              </div>
            ))}
          </Card>
        </section>
      ) : null}

      <Button
        variant="ghost"
        className="text-danger"
        onClick={() => {
          if (!deleteClient(clientId)) {
            toast("Нельзя удалить: есть отгруженные заказы");
            return;
          }
          toast("Удалён");
          void navigate({ to: "/clients" });
        }}
      >
        Удалить клиента
      </Button>
    </div>
  );
}
