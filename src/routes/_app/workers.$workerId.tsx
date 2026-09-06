import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Group, MetricRow, SectionLabel } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { formatDate, formatNum } from "@/lib/format";
import { cashLabel } from "@/lib/stats";
import { useWarehouse } from "@/lib/store";
import { workerOwed, workerPaid } from "@/lib/stats";
import { workerRoleLabel } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/workers/$workerId")({ component: WorkerPage });

function WorkerPage() {
  const { workerId } = Route.useParams();
  const state = useWarehouse();
  const payWorker = useWarehouse((s) => s.payWorker);
  const addWorkerDebt = useWarehouse((s) => s.addWorkerDebt);
  const worker = (state.workers ?? []).find((w) => w.id === workerId);

  const [pay, setPay] = useState("");
  const [debt, setDebt] = useState("");
  const [note, setNote] = useState("");

  if (!worker) {
    return (
      <div className="space-y-4">
        <p className="text-muted">Работник не найден</p>
        <Button asChild variant="secondary">
          <Link to="/workers">Назад</Link>
        </Button>
      </div>
    );
  }

  const given = workerPaid(state, worker.id);
  const owed = workerOwed(state, worker.id);
  const rows = (state.cash ?? [])
    .filter((t) => t.workerId === worker.id)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  function parseAmount(raw: string) {
    return Number(String(raw).replace(/\s/g, "").replace(",", "."));
  }

  function give() {
    const n = parseAmount(pay);
    if (!n || n <= 0) {
      toast("Укажи сумму");
      return;
    }
    payWorker(workerId, n, note);
    setPay("");
    setNote("");
    toast(`Отдали ${formatNum(n)}`);
  }

  function owe() {
    const n = parseAmount(debt);
    if (!n || n <= 0) {
      toast("Укажи сумму");
      return;
    }
    addWorkerDebt(workerId, n, note);
    setDebt("");
    setNote("");
    toast(`Долг ${formatNum(n)}`);
  }

  return (
    <div className="space-y-7">
      <div>
        <Link to="/workers" className="text-xs text-muted hover:text-fg">
          ← Работники
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{worker.name}</h1>
        <p className="text-sm text-muted">{workerRoleLabel(worker.role)}</p>
        {worker.note ? <p className="mt-1 text-sm text-subtle">{worker.note}</p> : null}
      </div>

      <Group>
        <MetricRow label="Отдали" value={formatNum(given)} />
        <div className="ml-4 h-px bg-border" />
        <MetricRow label="Должны" value={formatNum(owed)} tone={owed > 0 ? "danger" : "ok"} />
      </Group>

      <section>
        <SectionLabel>Отдал сейчас</SectionLabel>
        <Group className="space-y-3 p-4">
          <div>
            <Label>Сумма</Label>
            <Input inputMode="numeric" value={pay} onChange={(e) => setPay(e.target.value)} placeholder="1500000" />
          </div>
          <div>
            <Label>Заметка</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="зарплата, крой…" />
          </div>
          <Button className="w-full" onClick={give}>
            Записать в кассу
          </Button>
        </Group>
      </section>

      <section>
        <SectionLabel>Мы должны</SectionLabel>
        <Group className="space-y-3 p-4">
          <div>
            <Label>Сумма долга</Label>
            <Input inputMode="numeric" value={debt} onChange={(e) => setDebt(e.target.value)} placeholder="1000000" />
          </div>
          <Button variant="secondary" className="w-full" onClick={owe}>
            Добавить долг
          </Button>
        </Group>
      </section>

      <section>
        <SectionLabel>История</SectionLabel>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">Пока пусто</p>
        ) : (
          <Group>
            {rows.map((t, i) => (
              <div key={t.id}>
                {i > 0 ? <div className="ml-4 h-px bg-border" /> : null}
                <div className="flex items-start justify-between gap-3 px-4 py-3">
                  <div>
                    <div className="text-sm font-medium">{cashLabel(t.kind)}</div>
                    <div className="text-xs text-muted">
                      {formatDate(t.date)}
                      {t.note ? ` · ${t.note}` : ""}
                    </div>
                  </div>
                  <div className={cn("text-sm font-semibold tabular", "text-danger")}>−{formatNum(t.amount)}</div>
                </div>
              </div>
            ))}
          </Group>
        )}
      </section>
    </div>
  );
}
