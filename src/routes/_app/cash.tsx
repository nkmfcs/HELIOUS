import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Group, MetricRow, SectionLabel } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { formatCompact, formatDate, formatNum, todayISO } from "@/lib/format";
import { cashBalance, cashLabel, cashLedger, cashTotals, clientDebt, payableLeft } from "@/lib/stats";
import { useWarehouse } from "@/lib/store";
import { type CashKind } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/cash")({ component: CashPage });

const KINDS: { id: CashKind; label: string }[] = [
  { id: "income", label: "Приход" },
  { id: "material", label: "Материал" },
  { id: "worker", label: "Работник" },
  { id: "withdraw", label: "Снял" },
  { id: "other", label: "Прочее" },
];

function CashPage() {
  const state = useWarehouse();
  const addCash = useWarehouse((s) => s.addCash);
  const addPayment = useWarehouse((s) => s.addPayment);
  const payPayable = useWarehouse((s) => s.payPayable);
  const deleteCash = useWarehouse((s) => s.deleteCash);
  const setCashOpening = useWarehouse((s) => s.setCashOpening);

  const [kind, setKind] = useState<CashKind>("income");
  const [amount, setAmount] = useState("");
  const [person, setPerson] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayISO());
  const [clientId, setClientId] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [opening, setOpening] = useState(String(state.cashOpening || ""));
  const [kill, setKill] = useState<string | null>(null);

  const ledger = useMemo(() => cashLedger(state).reverse(), [state.cash, state.cashOpening]);
  const bal = cashBalance(state);
  const tot = cashTotals(state);
  const debtors = state.clients
    .map((c) => ({ ...c, debt: clientDebt(state, c.id) }))
    .filter((c) => c.debt > 0)
    .sort((a, b) => b.debt - a.debt);
  const weOwe = (state.payables ?? [])
    .map((p) => ({ ...p, left: payableLeft(p) }))
    .filter((p) => p.left > 0);

  function parseAmount(raw: string) {
    return Number(String(raw).replace(/\s/g, "").replace(",", "."));
  }

  function submit() {
    const n = parseAmount(amount);
    if (!n || n <= 0) {
      toast("Укажи сумму");
      return;
    }
    if (kind === "income" && clientId) {
      addPayment({ clientId, amount: n, note: note || "Оплата", date });
    } else {
      addCash({ kind, amount: n, person, note, date, clientId: undefined });
    }
    setAmount("");
    setPerson("");
    setNote("");
    toast(kind === "income" ? "Приход записан, долг закрыт" : "Списание записано");
  }

  function saveOpening() {
    const n = parseAmount(opening);
    setCashOpening(n || 0);
    setEditOpen(false);
    toast("Стартовый баланс обновлён");
  }

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Касса</h1>
        <p className="mt-1 text-sm text-muted">Что пришло, что ушло, сколько на руках</p>
      </div>

      <Group>
        <div className="px-4 pb-4 pt-5">
          <div className={cn("text-4xl font-semibold tabular leading-none", bal < 0 ? "text-danger" : "text-fg")}>
            {formatNum(bal)}
          </div>
          <div className="mt-1 text-sm text-muted">на руках сейчас</div>
        </div>
        <div className="border-t border-border">
          <button type="button" className="w-full text-left" onClick={() => setEditOpen((v) => !v)}>
            <MetricRow label="Было на старте" value={formatCompact(state.cashOpening)} />
          </button>
          <div className="ml-4 h-px bg-border" />
          <MetricRow label="Пришло" value={formatCompact(tot.income)} tone="ok" />
          <div className="ml-4 h-px bg-border" />
          <MetricRow label="Ушло" value={formatCompact(tot.spent)} tone="danger" />
        </div>
      </Group>

      {editOpen ? (
        <Group className="space-y-3 p-4">
          <div>
            <Label>Сколько было на руках до учёта</Label>
            <Input inputMode="numeric" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0" />
          </div>
          <Button className="w-full" onClick={saveOpening}>
            Сохранить старт
          </Button>
        </Group>
      ) : null}

      {debtors.length > 0 ? (
        <section>
          <SectionLabel>Кто должен — нажми и закрой</SectionLabel>
          <Group>
            {debtors.map((c, i) => (
              <div key={c.id}>
                {i > 0 ? <div className="ml-4 h-px bg-border" /> : null}
                <div className="flex items-center gap-3 px-4 py-3">
                  <Link to="/clients/$clientId" params={{ clientId: c.id }} className="min-w-0 flex-1">
                    <div className="text-sm font-medium">
                      {c.name}
                      {c.shop ? ` · ${c.shop}` : ""}
                    </div>
                    <div className="text-xs text-danger">долг {formatNum(c.debt)}</div>
                  </Link>
                  <Button
                    size="sm"
                    onClick={() => {
                      addPayment({ clientId: c.id, amount: c.debt, note: "Закрыл долг" });
                      toast(`${c.name}: долг закрыт, ${formatNum(c.debt)} в кассе`);
                    }}
                  >
                    Оплатил
                  </Button>
                </div>
              </div>
            ))}
          </Group>
        </section>
      ) : null}

      {weOwe.length > 0 ? (
        <section>
          <SectionLabel>Кому должны мы</SectionLabel>
          <Group>
            {weOwe.map((p, i) => (
              <div key={p.id}>
                {i > 0 ? <div className="ml-4 h-px bg-border" /> : null}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{p.person}</div>
                    <div className="text-xs text-danger">должны {formatNum(p.left)}</div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      payPayable(p.id);
                      toast(`Отдали ${p.person} ${formatNum(p.left)}`);
                    }}
                  >
                    Отдал
                  </Button>
                </div>
              </div>
            ))}
          </Group>
        </section>
      ) : null}

      <section>
        <SectionLabel>Куда ушло</SectionLabel>
        <Group>
          <MetricRow label="Материал" value={formatCompact(tot.material)} />
          <div className="ml-4 h-px bg-border" />
          <MetricRow label="Работники" value={formatCompact(tot.worker)} />
          <div className="ml-4 h-px bg-border" />
          <MetricRow label="Снял себе" value={formatCompact(tot.withdraw)} />
          <div className="ml-4 h-px bg-border" />
          <MetricRow label="Прочее" value={formatCompact(tot.other)} />
        </Group>
      </section>

      <section>
        <SectionLabel>Новая запись</SectionLabel>
        <Group className="space-y-3 p-4">
          <div className="flex flex-wrap gap-1">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                className={cn(
                  "h-9 rounded-full px-3 text-sm",
                  kind === k.id ? "bg-accent text-accent-fg" : "bg-bg text-muted",
                )}
              >
                {k.label}
              </button>
            ))}
          </div>
          <div>
            <Label>Сумма, сум</Label>
            <Input
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="например 1 200 000"
            />
          </div>
          {kind === "income" ? (
            <div>
              <Label>От кого (закроет долг)</Label>
              <select
                className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                <option value="">Просто приход, без долга</option>
                {debtors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.shop ? ` · ${c.shop}` : ""} — {formatNum(c.debt)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {kind === "worker" ? (
            <div>
              <Label>Кто получил</Label>
              <Input value={person} onChange={(e) => setPerson(e.target.value)} placeholder="Имя работника" />
            </div>
          ) : null}
          <div>
            <Label>{kind === "material" ? "Что купил" : "Заметка"}</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={kind === "withdraw" ? "на карту, нал…" : "по желанию"}
            />
          </div>
          <div>
            <Label>Дата</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <Button className="w-full" onClick={submit}>
            Записать
          </Button>
        </Group>
      </section>

      <section>
        <SectionLabel>История</SectionLabel>
        {ledger.length === 0 ? (
          <Group>
            <p className="px-4 py-5 text-sm text-muted">Пока пусто. Запиши материал, зарплату или снятие.</p>
          </Group>
        ) : (
          <Group>
            {ledger.map((t, i) => {
              const plus = t.kind === "income";
              return (
                <div key={t.id}>
                  {i > 0 ? <div className="ml-4 h-px bg-border" /> : null}
                  <div className="flex items-start justify-between gap-3 px-4 py-3.5">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        {cashLabel(t.kind)}
                        {t.person ? ` · ${t.person}` : ""}
                      </div>
                      <div className="mt-0.5 text-xs text-muted">
                        {formatDate(t.date)}
                        {t.note ? ` · ${t.note}` : ""}
                      </div>
                      <div className="mt-1 text-xs text-subtle">
                        было {formatNum(t.before)} → стало {formatNum(t.after)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={cn("text-sm font-semibold tabular", plus ? "text-ok" : "text-danger")}>
                        {plus ? "+" : "−"}
                        {formatNum(t.amount)}
                      </div>
                      <button
                        type="button"
                        className="mt-2 min-h-9 px-1 text-xs text-danger"
                        onClick={() => {
                          if (kill !== t.id) {
                            setKill(t.id);
                            return;
                          }
                          deleteCash(t.id);
                          setKill(null);
                          toast("Запись удалена");
                        }}
                      >
                        {kill === t.id ? "точно удалить" : "удалить"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </Group>
        )}
      </section>
    </div>
  );
}
