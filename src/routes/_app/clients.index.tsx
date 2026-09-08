import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Group } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatNum, formatSum } from "@/lib/format";
import { useWarehouse } from "@/lib/store";
import { clientDebt, clientPairs, clientTurnover } from "@/lib/stats";

export const Route = createFileRoute("/_app/clients/")({ component: ClientsPage });

function ClientsPage() {
  const state = useWarehouse();
  const addClient = useWarehouse((s) => s.addClient);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [shop, setShop] = useState("");
  const [phone, setPhone] = useState("");

  const list = state.clients
    .filter((c) => {
      const s = `${c.name} ${c.shop} ${c.phone}`.toLowerCase();
      return s.includes(q.toLowerCase().trim());
    })
    .map((c) => ({
      ...c,
      debt: clientDebt(state, c.id),
      pairs: clientPairs(state, c.id),
      turnover: clientTurnover(state, c.id),
    }))
    .sort((a, b) => b.debt - a.debt || a.name.localeCompare(b.name, "ru"));

  function create() {
    if (!name.trim()) {
      toast("Укажите имя");
      return;
    }
    const id = addClient({ name, shop, phone });
    setName("");
    setShop("");
    setPhone("");
    setOpen(false);
    toast("Клиент добавлен");
    return id;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Клиенты</h1>
          <p className="mt-1 text-sm text-muted">{state.clients.length} в базе · отдельно от заказов</p>
        </div>
        <Button onClick={() => setOpen((v) => !v)}>Добавить</Button>
      </div>

      <Input placeholder="Поиск по имени, точке, телефону" value={q} onChange={(e) => setQ(e.target.value)} />

      {open ? (
        <Group className="space-y-3 p-4">
          <div>
            <Label>Имя</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя клиента" />
          </div>
          <div>
            <Label>Точка / магазин</Label>
            <Input value={shop} onChange={(e) => setShop(e.target.value)} placeholder="Название точки" />
          </div>
          <div>
            <Label>Телефон</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998…" />
          </div>
          <Button className="w-full" onClick={create}>
            Сохранить клиента
          </Button>
        </Group>
      ) : null}

      <div className="space-y-2">
        {list.length === 0 ? (
          <Group>
            <p className="p-8 text-center text-sm text-muted">Клиентов нет</p>
          </Group>
        ) : (
          <Group>
            {list.map((c, i) => (
              <div key={c.id}>
                {i > 0 ? <div className="ml-4 h-px bg-border" /> : null}
                <Link to="/clients/$clientId" params={{ clientId: c.id }} className="flex items-center justify-between px-4 py-3.5">
                  <div>
                    <div className="text-sm font-medium">
                      {c.name}
                      {c.shop ? <span className="text-muted"> · {c.shop}</span> : null}
                    </div>
                    <div className="mt-0.5 text-xs text-muted">
                      {c.pairs} пар · оборот {formatNum(c.turnover)}
                      {c.phone ? ` · ${c.phone}` : ""}
                    </div>
                  </div>
                  {c.debt > 0 ? (
                    <Badge tone="danger">{formatSum(c.debt)}</Badge>
                  ) : (
                    <Badge tone="ok">чисто</Badge>
                  )}
                </Link>
              </div>
            ))}
          </Group>
        )}
      </div>
    </div>
  );
}
