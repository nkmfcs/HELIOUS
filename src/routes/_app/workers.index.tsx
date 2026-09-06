import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Group, SectionLabel } from "@/components/ui/card";
import { formatNum } from "@/lib/format";
import { useWarehouse } from "@/lib/store";
import { workerOwed, workerPaid } from "@/lib/stats";
import { workerRoleLabel } from "@/lib/types";

export const Route = createFileRoute("/_app/workers/")({ component: WorkersPage });

function WorkersPage() {
  const state = useWarehouse();
  const list = [...(state.workers ?? [])].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const owed = list.reduce((n, w) => n + workerOwed(state, w.id), 0);
  const paid = list.reduce((n, w) => n + workerPaid(state, w.id), 0);

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Работники</h1>
        <p className="mt-1 text-sm text-muted">Швеи, крой, упаковка — отдельно от клиентов</p>
      </div>

      <Group>
        <div className="grid grid-cols-2 gap-4 px-4 py-4">
          <div>
            <div className="text-xs text-muted">Отдали</div>
            <div className="mt-0.5 text-lg font-semibold tabular">{formatNum(paid)}</div>
          </div>
          <div>
            <div className="text-xs text-muted">Должны им</div>
            <div className={`mt-0.5 text-lg font-semibold tabular ${owed > 0 ? "text-danger" : ""}`}>
              {formatNum(owed)}
            </div>
          </div>
        </div>
      </Group>

      <section>
        <SectionLabel>Люди</SectionLabel>
        {list.length === 0 ? (
          <p className="text-sm text-muted">Никого нет</p>
        ) : (
          <Group>
            {list.map((w, i) => {
              const debt = workerOwed(state, w.id);
              const given = workerPaid(state, w.id);
              return (
                <div key={w.id}>
                  {i > 0 ? <div className="ml-4 h-px bg-border" /> : null}
                  <Link to="/workers/$workerId" params={{ workerId: w.id }} className="flex items-center gap-3 px-4 py-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{w.name}</div>
                      <div className="text-xs text-muted">{workerRoleLabel(w.role)}</div>
                      {debt > 0 ? (
                        <div className="mt-0.5 text-xs text-danger">должны {formatNum(debt)}</div>
                      ) : given > 0 ? (
                        <div className="mt-0.5 text-xs text-subtle">отдали {formatNum(given)}</div>
                      ) : null}
                    </div>
                    <ChevronRight className="size-4 text-subtle" />
                  </Link>
                </div>
              );
            })}
          </Group>
        )}
      </section>
    </div>
  );
}
