import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  Pencil,
  Phone,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, Group, SectionLabel, Stat } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { formatCompact, formatDate, formatNum, todayISO } from "@/lib/format";
import { useWarehouse } from "@/lib/store";
import { payableLeft, workerAccrued, workerOwed, workerPaid } from "@/lib/stats";
import { WORKER_ROLES, type WorkerRole, workerRoleLabel } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/workers/$workerId")({ component: WorkerPage });

type ActionMode = "accrual" | "payment" | null;

function WorkerPage() {
  const { workerId } = Route.useParams();
  const state = useWarehouse();
  const payWorker = useWarehouse((store) => store.payWorker);
  const addWorkerDebt = useWarehouse((store) => store.addWorkerDebt);
  const payPayable = useWarehouse((store) => store.payPayable);
  const updateWorker = useWarehouse((store) => store.updateWorker);
  const worker = (state.workers ?? []).find((entry) => entry.id === workerId);

  const [mode, setMode] = useState<ActionMode>(null);
  const [payment, setPayment] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [accrual, setAccrual] = useState("");
  const [accrualNote, setAccrualNote] = useState("");
  const [accrualDate, setAccrualDate] = useState(todayISO());
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState(worker?.name ?? "");
  const [editRole, setEditRole] = useState<WorkerRole>(worker?.role ?? "other");
  const [editPhone, setEditPhone] = useState(worker?.phone ?? "");
  const [editNote, setEditNote] = useState(worker?.note ?? "");

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

  const paid = workerPaid(state, worker.id);
  const owed = workerOwed(state, worker.id);
  const accrued = workerAccrued(state, worker.id);
  const payables = (state.payables ?? [])
    .filter((entry) => entry.workerId === worker.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const openPayables = payables.filter((entry) => payableLeft(entry) > 0);
  const payments = (state.cash ?? [])
    .filter((entry) => entry.kind === "worker" && entry.workerId === worker.id)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const activity = [
    ...payables.map((entry) => ({
      id: `accrual-${entry.id}`,
      kind: "accrual" as const,
      date: entry.date,
      amount: entry.amount,
      note: entry.note,
      detail:
        payableLeft(entry) > 0
          ? `Осталось ${formatNum(payableLeft(entry))}`
          : "Полностью выплачено",
    })),
    ...payments.map((entry) => ({
      id: `payment-${entry.id}`,
      kind: "payment" as const,
      date: entry.date,
      amount: entry.amount,
      note: entry.note,
      detail: "Записано в кассе",
    })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  function parseAmount(raw: string) {
    return Number(String(raw).replace(/\s/g, "").replace(",", "."));
  }

  function recordPayment() {
    const amount = parseAmount(payment);
    if (!amount || amount <= 0) {
      toast("Укажи сумму выплаты");
      return;
    }
    payWorker(workerId, amount, paymentNote, paymentDate);
    setPayment("");
    setPaymentNote("");
    setMode(null);
    toast(`Выплачено ${formatNum(amount)}`);
  }

  function recordAccrual() {
    const amount = parseAmount(accrual);
    if (!amount || amount <= 0) {
      toast("Укажи сумму начисления");
      return;
    }
    addWorkerDebt(workerId, amount, accrualNote, accrualDate);
    setAccrual("");
    setAccrualNote("");
    setMode(null);
    toast(`Начислено ${formatNum(amount)}`);
  }

  function saveProfile() {
    if (!editName.trim()) {
      toast("Имя не может быть пустым");
      return;
    }
    updateWorker(workerId, {
      name: editName,
      role: editRole,
      phone: editPhone,
      note: editNote,
    });
    setEditOpen(false);
    toast("Карточка обновлена");
  }

  return (
    <div className="space-y-7">
      <div>
        <Link to="/workers" className="text-xs text-muted hover:text-fg">
          ← Все работники
        </Link>
      </div>

      <Card className="p-5">
        <div className="flex items-start gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-accent text-xl font-semibold text-accent-fg">
            {worker.name.trim().slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{worker.name}</h1>
              <Badge tone="accent">{workerRoleLabel(worker.role)}</Badge>
            </div>
            {worker.phone ? (
              <a
                href={`tel:${worker.phone}`}
                className="mt-2 flex items-center gap-1.5 text-sm text-accent"
              >
                <Phone className="size-4" />
                {worker.phone}
              </a>
            ) : (
              <div className="mt-2 text-sm text-subtle">Телефон не указан</div>
            )}
            {worker.note ? (
              <p className="mt-3 text-sm leading-relaxed text-muted">{worker.note}</p>
            ) : null}
          </div>
          <Button
            size="sm"
            variant="secondary"
            aria-label="Редактировать работника"
            onClick={() => setEditOpen((value) => !value)}
          >
            <Pencil className="size-4" />
          </Button>
        </div>
      </Card>

      {editOpen ? (
        <section>
          <SectionLabel>Редактирование</SectionLabel>
          <Group className="space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Имя</Label>
                <Input value={editName} onChange={(event) => setEditName(event.target.value)} />
              </div>
              <div>
                <Label>Работа</Label>
                <select
                  className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
                  value={editRole}
                  onChange={(event) => setEditRole(event.target.value as WorkerRole)}
                >
                  {WORKER_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {workerRoleLabel(role)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Label>Телефон</Label>
              <Input
                inputMode="tel"
                value={editPhone}
                onChange={(event) => setEditPhone(event.target.value)}
              />
            </div>
            <div>
              <Label>Заметка</Label>
              <Textarea value={editNote} onChange={(event) => setEditNote(event.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setEditOpen(false)}>
                Отмена
              </Button>
              <Button onClick={saveProfile}>Сохранить</Button>
            </div>
          </Group>
        </section>
      ) : null}

      <Card className="grid grid-cols-3 gap-px overflow-hidden bg-border">
        <div className="bg-surface p-3 sm:p-4">
          <Stat label="Начислено" value={formatCompact(accrued)} />
        </div>
        <div className="bg-surface p-3 sm:p-4">
          <Stat label="Выплачено" value={formatCompact(paid)} tone="ok" />
        </div>
        <div className="bg-surface p-3 sm:p-4">
          <Stat label="К выплате" value={formatCompact(owed)} tone={owed > 0 ? "danger" : "ok"} />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setMode(mode === "accrual" ? null : "accrual")}
          className={cn(
            "rounded-lg p-4 text-left transition-colors",
            mode === "accrual" ? "bg-accent text-accent-fg" : "bg-surface text-fg",
          )}
        >
          <ArrowUpRight className="size-5" />
          <div className="mt-3 text-sm font-semibold">Начислить</div>
          <div
            className={cn("mt-1 text-xs", mode === "accrual" ? "text-accent-fg/70" : "text-muted")}
          >
            Добавить долг за работу
          </div>
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "payment" ? null : "payment")}
          className={cn(
            "rounded-lg p-4 text-left transition-colors",
            mode === "payment" ? "bg-accent text-accent-fg" : "bg-surface text-fg",
          )}
        >
          <Banknote className="size-5" />
          <div className="mt-3 text-sm font-semibold">Выплатить</div>
          <div
            className={cn("mt-1 text-xs", mode === "payment" ? "text-accent-fg/70" : "text-muted")}
          >
            Записать расход в кассу
          </div>
        </button>
      </div>

      {mode === "accrual" ? (
        <Group className="space-y-3 p-4">
          <div>
            <Label>Сумма начисления</Label>
            <Input
              inputMode="numeric"
              value={accrual}
              onChange={(event) => setAccrual(event.target.value)}
              placeholder="например 1 000 000"
            />
          </div>
          <div>
            <Label>За какую работу</Label>
            <Input
              value={accrualNote}
              onChange={(event) => setAccrualNote(event.target.value)}
              placeholder="пошив, крой, упаковка…"
            />
          </div>
          <div>
            <Label>Дата</Label>
            <Input
              type="date"
              value={accrualDate}
              onChange={(event) => setAccrualDate(event.target.value)}
            />
          </div>
          <Button className="w-full" onClick={recordAccrual}>
            Записать начисление
          </Button>
        </Group>
      ) : null}

      {mode === "payment" ? (
        <Group className="space-y-3 p-4">
          <div>
            <Label>Сумма выплаты</Label>
            <Input
              inputMode="numeric"
              value={payment}
              onChange={(event) => setPayment(event.target.value)}
              placeholder="например 500 000"
            />
          </div>
          <div>
            <Label>Заметка</Label>
            <Input
              value={paymentNote}
              onChange={(event) => setPaymentNote(event.target.value)}
              placeholder="аванс, зарплата…"
            />
          </div>
          <div>
            <Label>Дата</Label>
            <Input
              type="date"
              value={paymentDate}
              onChange={(event) => setPaymentDate(event.target.value)}
            />
          </div>
          <Button className="w-full" onClick={recordPayment}>
            Выплатить и записать в кассу
          </Button>
        </Group>
      ) : null}

      {openPayables.length > 0 ? (
        <section>
          <SectionLabel>Открытые начисления</SectionLabel>
          <Group>
            {openPayables.map((entry, index) => {
              const left = payableLeft(entry);
              return (
                <div key={entry.id}>
                  {index > 0 ? <div className="ml-4 h-px bg-border" /> : null}
                  <div className="flex items-center gap-3 px-4 py-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{entry.note || "Работа"}</div>
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                        <CalendarDays className="size-3" /> {formatDate(entry.date)}
                      </div>
                      <div className="mt-1 text-xs text-danger">Осталось {formatNum(left)}</div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!confirm(`Выплатить ${formatNum(left)} и закрыть начисление?`)) return;
                        payPayable(entry.id, undefined, todayISO(), "Закрыл начисление");
                        toast(`Выплачено ${formatNum(left)}`);
                      }}
                    >
                      Закрыть
                    </Button>
                  </div>
                </div>
              );
            })}
          </Group>
        </section>
      ) : null}

      <section>
        <SectionLabel>Полная история</SectionLabel>
        {activity.length === 0 ? (
          <Card className="px-5 py-7 text-center">
            <UserRound className="mx-auto size-5 text-subtle" />
            <p className="mt-2 text-sm text-muted">Начислений и выплат пока нет.</p>
          </Card>
        ) : (
          <Group>
            {activity.map((entry, index) => {
              const isAccrual = entry.kind === "accrual";
              return (
                <div key={entry.id}>
                  {index > 0 ? <div className="ml-14 h-px bg-border" /> : null}
                  <div className="flex items-start gap-3 px-4 py-3.5">
                    <span
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-full",
                        isAccrual ? "bg-danger-bg text-danger" : "bg-ok-bg text-ok",
                      )}
                    >
                      {isAccrual ? (
                        <ArrowUpRight className="size-4" />
                      ) : (
                        <ArrowDownLeft className="size-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">
                        {isAccrual ? "Начислено" : "Выплачено"}
                      </div>
                      <div className="mt-0.5 text-xs text-muted">
                        {formatDate(entry.date)}
                        {entry.note ? ` · ${entry.note}` : ""}
                      </div>
                      <div className="mt-1 text-xs text-subtle">{entry.detail}</div>
                    </div>
                    <div
                      className={cn(
                        "shrink-0 text-sm font-semibold tabular",
                        isAccrual ? "text-danger" : "text-ok",
                      )}
                    >
                      {isAccrual ? "+" : "−"}
                      {formatNum(entry.amount)}
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
