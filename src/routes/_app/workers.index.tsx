import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Phone, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, Group, SectionLabel, Stat } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { formatCompact, formatNum } from "@/lib/format";
import { useWarehouse } from "@/lib/store";
import { workerAccrued, workerOwed, workerPaid } from "@/lib/stats";
import { WORKER_ROLES, type WorkerRole, workerRoleLabel } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/workers/")({ component: WorkersPage });

type RoleFilter = "all" | WorkerRole;

function WorkersPage() {
  const navigate = useNavigate();
  const state = useWarehouse();
  const addWorker = useWarehouse((store) => store.addWorker);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState<WorkerRole>("sewing");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState<RoleFilter>("all");

  const workers = (state.workers ?? []).map((worker) => ({
    ...worker,
    accrued: workerAccrued(state, worker.id),
    paid: workerPaid(state, worker.id),
    owed: workerOwed(state, worker.id),
  }));
  const list = workers
    .filter((worker) => filter === "all" || worker.role === filter)
    .sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name, "ru"));
  const accrued = workers.reduce((total, worker) => total + worker.accrued, 0);
  const paid = workers.reduce((total, worker) => total + worker.paid, 0);
  const owed = workers.reduce((total, worker) => total + worker.owed, 0);

  function createWorker() {
    if (!name.trim()) {
      toast("Укажи имя работника");
      return;
    }
    const id = addWorker({ name, role, phone, note });
    if (!id) return;
    setName("");
    setPhone("");
    setNote("");
    setFormOpen(false);
    toast("Работник добавлен");
    void navigate({ to: "/workers/$workerId", params: { workerId: id } });
  }

  return (
    <div className="space-y-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Работники</h1>
          <p className="mt-1 text-sm text-muted">
            Начисления, выплаты и остаток по каждому человеку
          </p>
        </div>
        <Button size="sm" onClick={() => setFormOpen((value) => !value)}>
          <UserPlus className="size-4" />
          <span className="hidden sm:inline">Добавить</span>
        </Button>
      </div>

      <Card className="grid grid-cols-2 gap-px overflow-hidden bg-border lg:grid-cols-4">
        <div className="bg-surface p-4">
          <Stat label="Работников" value={formatNum(workers.length)} />
        </div>
        <div className="bg-surface p-4">
          <Stat label="Начислено" value={formatCompact(accrued)} />
        </div>
        <div className="bg-surface p-4">
          <Stat label="Выплачено" value={formatCompact(paid)} tone="ok" />
        </div>
        <div className="bg-surface p-4">
          <Stat label="К выплате" value={formatCompact(owed)} tone={owed > 0 ? "danger" : "ok"} />
        </div>
      </Card>

      {formOpen ? (
        <section>
          <SectionLabel>Новый работник</SectionLabel>
          <Group className="space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Имя</Label>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Имя работника"
                />
              </div>
              <div>
                <Label>Работа</Label>
                <select
                  className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
                  value={role}
                  onChange={(event) => setRole(event.target.value as WorkerRole)}
                >
                  {WORKER_ROLES.map((workerRole) => (
                    <option key={workerRole} value={workerRole}>
                      {workerRoleLabel(workerRole)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Label>Телефон</Label>
              <Input
                inputMode="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+998 …"
              />
            </div>
            <div>
              <Label>Заметка</Label>
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Расценка, график или важная информация"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setFormOpen(false)}>
                Отмена
              </Button>
              <Button onClick={createWorker}>Сохранить</Button>
            </div>
          </Group>
        </section>
      ) : null}

      {workers.length > 0 ? (
        <div className="flex gap-1 overflow-x-auto pb-1">
          {(["all", ...WORKER_ROLES] as RoleFilter[]).map((roleFilter) => (
            <button
              key={roleFilter}
              type="button"
              onClick={() => setFilter(roleFilter)}
              className={cn(
                "h-9 shrink-0 rounded-full px-3 text-sm",
                filter === roleFilter ? "bg-accent text-accent-fg" : "bg-surface text-muted",
              )}
            >
              {roleFilter === "all" ? "Все" : workerRoleLabel(roleFilter)}
            </button>
          ))}
        </div>
      ) : null}

      <section>
        <SectionLabel>Люди</SectionLabel>
        {workers.length === 0 ? (
          <Card className="px-5 py-8 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-bg text-muted">
              <Users className="size-5" />
            </span>
            <div className="mt-3 text-sm font-medium">Работников пока нет</div>
            <p className="mt-1 text-xs text-muted">
              Добавь человека, чтобы вести начисления и выплаты отдельно.
            </p>
            <Button size="sm" className="mt-4" onClick={() => setFormOpen(true)}>
              Добавить работника
            </Button>
          </Card>
        ) : list.length === 0 ? (
          <Card className="px-4 py-5 text-sm text-muted">В этой категории пока никого нет.</Card>
        ) : (
          <Group>
            {list.map((worker, index) => (
              <div key={worker.id}>
                {index > 0 ? <div className="ml-16 h-px bg-border" /> : null}
                <Link
                  to="/workers/$workerId"
                  params={{ workerId: worker.id }}
                  className="flex items-center gap-3 px-4 py-4"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-fg">
                    {worker.name.trim().slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold">{worker.name}</span>
                      <Badge>{workerRoleLabel(worker.role)}</Badge>
                    </div>
                    {worker.phone ? (
                      <div className="mt-1 flex items-center gap-1 text-xs text-muted">
                        <Phone className="size-3" /> {worker.phone}
                      </div>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      <span className="text-subtle">Начислено {formatCompact(worker.accrued)}</span>
                      <span className="text-ok">Выплачено {formatCompact(worker.paid)}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div
                      className={cn(
                        "text-sm font-semibold tabular",
                        worker.owed > 0 ? "text-danger" : "text-ok",
                      )}
                    >
                      {formatCompact(worker.owed)}
                    </div>
                    <div className="mt-0.5 text-[11px] text-subtle">к выплате</div>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-subtle" />
                </Link>
              </div>
            ))}
          </Group>
        )}
      </section>
    </div>
  );
}
