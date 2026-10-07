import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { CheckCircle2, ChevronRight, PackageCheck, Scissors, Shirt, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Stat } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { colorLabel, formatDate, formatNum } from "@/lib/format";
import { BoxBadge } from "@/components/box-badge";
import { boxOf } from "@/lib/boxes";
import { useWarehouse } from "@/lib/store";
import { lowStock } from "@/lib/stats";
import {
  itemKey,
  isActiveProductionStage,
  productionPairs,
  productionQtyFor,
  productionStageLabel,
  productionStageRole,
  productionStageTone,
} from "@/lib/production";
import { COLORS, PACK, type Color, type WorkerRole } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/preorder")({ component: PreorderPage });

type Selection = Record<string, number>;

const ROLE_BY_STAGE: Record<"cutting" | "sewing" | "packaging", WorkerRole> = {
  cutting: "cutting",
  sewing: "sewing",
  packaging: "packaging",
};

function PreorderPage() {
  const state = useWarehouse();
  const setLowThreshold = useWarehouse((s) => s.setLowThreshold);
  const createProductionBatch = useWarehouse((s) => s.createProductionBatch);
  const advanceProductionBatch = useWarehouse((s) => s.advanceProductionBatch);
  const cancelProductionBatch = useWarehouse((s) => s.cancelProductionBatch);
  const [selection, setSelection] = useState<Selection>({});
  const [workerSelection, setWorkerSelection] = useState<Record<string, string>>({});

  const productionBatches = state.productionBatches ?? [];
  const rows = lowStock(state).map((row) => {
    const inProduction = productionQtyFor(productionBatches, row.color, row.size);
    const cutting = productionQtyFor(productionBatches, row.color, row.size, "cutting");
    const sewing = productionQtyFor(productionBatches, row.color, row.size, "sewing");
    const packaging = productionQtyFor(productionBatches, row.color, row.size, "packaging");
    return {
      ...row,
      inProduction,
      cutting,
      sewing,
      packaging,
      remainingNeed: Math.max(0, row.need - inProduction),
    };
  });

  const need = rows.reduce((sum, row) => sum + row.remainingNeed, 0);
  const rawNeed = rows.reduce((sum, row) => sum + row.need, 0);
  const selectedCount = Object.values(selection).reduce((sum, qty) => sum + qty, 0);
  const activeBatches = productionBatches.filter((batch) => isActiveProductionStage(batch.stage));
  const completedBatches = productionBatches
    .filter((batch) => batch.stage === "done" || batch.stage === "cancelled")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const stagePairs = useMemo(
    () => ({
      cutting: activeBatches
        .filter((batch) => batch.stage === "cutting")
        .reduce((sum, batch) => sum + productionPairs(batch), 0),
      sewing: activeBatches
        .filter((batch) => batch.stage === "sewing")
        .reduce((sum, batch) => sum + productionPairs(batch), 0),
      packaging: activeBatches
        .filter((batch) => batch.stage === "packaging")
        .reduce((sum, batch) => sum + productionPairs(batch), 0),
    }),
    [activeBatches],
  );

  const clientMissing = state.orders
    .filter((o) => o.status === "shipped" && o.missing.length > 0)
    .flatMap((o) => {
      const client = state.clients.find((c) => c.id === o.clientId);
      return o.missing.map((m) => ({
        ...m,
        client: client ? `${client.name} ${client.shop}`.trim() : "Клиент",
        date: o.date,
      }));
    });

  function toggleRow(color: Color, size: number, remainingNeed: number) {
    if (remainingNeed <= 0) return;
    const key = itemKey({ color, size });
    setSelection((current) => {
      if (current[key]) {
        const next = { ...current };
        delete next[key];
        return next;
      }
      return { ...current, [key]: remainingNeed };
    });
  }

  function updateSelectedQty(color: Color, size: number, remainingNeed: number, value: number) {
    const key = itemKey({ color, size });
    const qty = Math.max(0, Math.min(remainingNeed, Math.round(Number(value) || 0)));
    setSelection((current) => {
      const next = { ...current };
      if (qty <= 0) delete next[key];
      else next[key] = qty;
      return next;
    });
  }

  function sendSelectedToCutting() {
    const items = Object.entries(selection).map(([key, qty]) => {
      const [color, size] = key.split(":");
      return { color: color as Color, size: Number(size), qty };
    });
    const id = createProductionBatch({ items, note: "Предзаказ → крой" });
    if (!id) {
      toast.error("Не удалось отправить выбранные позиции на крой");
      return;
    }
    setSelection({});
    toast.success("Выбранные позиции отправлены на крой");
  }

  function copyList() {
    if (!rows.length) {
      toast("Нет низких остатков");
      return;
    }
    let text = `ПРЕДЗАКАЗ (остаток < ${state.lowThreshold})\n================\n`;
    for (const c of COLORS) {
      const part = rows.filter((r) => r.color === c);
      text += `\n${colorLabel(c).toUpperCase()}:\n`;
      if (!part.length) text += "  всё в норме\n";
      else {
        text +=
          part
            .map(
              (r) =>
                `  р.${r.size}: ${r.pairs} (нужно +${r.remainingNeed}${r.inProduction ? ` · в производстве ${r.inProduction}` : ""})`,
            )
            .join("\n") + "\n";
      }
    }
    text += `\nОсталось запустить: ${need} пар`;
    if (clientMissing.length) {
      text += "\n\nНЕ СОБРАЛИ КЛИЕНТАМ:\n";
      text += clientMissing
        .map((m) => `  ${m.client}: ${colorLabel(m.color)} р.${m.size} × ${m.qty}`)
        .join("\n");
    }
    void navigator.clipboard.writeText(text).then(
      () => toast("Список скопирован"),
      () => toast("Не удалось скопировать"),
    );
  }

  function advanceBatch(batchId: string, workerId?: string) {
    const ok = advanceProductionBatch({ batchId, workerId: workerId || undefined });
    if (!ok) toast.error("Не удалось перевести партию на следующий этап");
    else {
      setWorkerSelection((current) => {
        const next = { ...current };
        delete next[batchId];
        return next;
      });
      toast.success("Этап производства обновлён");
    }
  }

  function cancelBatch(batchId: string) {
    if (!cancelProductionBatch(batchId)) {
      toast.error("Не удалось отменить партию");
      return;
    }
    toast("Партия снята с производства");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Предзаказ</h1>
        <p className="mt-1 text-sm text-muted">
          Выбирай позиции, отправляй их по этапам и закрывай производство прямо здесь.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Позиций ниже порога" value={String(rows.length)} />
        <Stat label="Осталось запустить" value={formatNum(need)} tone="warn" />
        <Stat
          label="В производстве"
          value={formatNum(stagePairs.cutting + stagePairs.sewing + stagePairs.packaging)}
        />
        <Stat label="Всего дефицита" value={formatNum(rawNeed)} />
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex-1">
            <Label>Порог (пар)</Label>
            <Input
              type="number"
              value={state.lowThreshold}
              onChange={(e) => setLowThreshold(Number(e.target.value) || 0)}
            />
            <p className="mt-1 text-xs text-subtle">
              Производство уже в очереди автоматически вычитается из потребности.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={copyList}>
              Скопировать список
            </Button>
            <Button onClick={sendSelectedToCutting} disabled={selectedCount === 0}>
              <Scissors className="size-4" />
              На крой · {formatNum(selectedCount)} пар
            </Button>
          </div>
        </div>
      </Card>

      <Card className="grid grid-cols-3 divide-x divide-border overflow-hidden">
        <div className="px-4 py-4">
          <div className="text-xs uppercase tracking-wide text-subtle">Крой</div>
          <div className="mt-1 font-mono text-xl">{formatNum(stagePairs.cutting)}</div>
        </div>
        <div className="px-4 py-4">
          <div className="text-xs uppercase tracking-wide text-subtle">Швейки</div>
          <div className="mt-1 font-mono text-xl">{formatNum(stagePairs.sewing)}</div>
        </div>
        <div className="px-4 py-4">
          <div className="text-xs uppercase tracking-wide text-subtle">Упаковка</div>
          <div className="mt-1 font-mono text-xl">{formatNum(stagePairs.packaging)}</div>
        </div>
      </Card>

      {COLORS.map((c) => {
        const part = rows.filter((r) => r.color === c);
        return (
          <Card key={c} className="overflow-hidden">
            <div className="border-b border-border px-4 py-3 text-sm font-medium">
              {colorLabel(c)}
            </div>
            {part.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">Всё ≥ {state.lowThreshold}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-subtle">
                      <th className="w-10 px-2 py-2 text-center font-medium">✓</th>
                      <th className="px-4 py-2 text-left font-medium">Размер</th>
                      <th className="px-2 py-2 text-center font-medium">Кор.</th>
                      <th className="px-2 py-2 text-center font-medium">Остаток</th>
                      <th className="px-2 py-2 text-center font-medium">В процессе</th>
                      <th className="px-2 py-2 text-center font-medium">Уп</th>
                      <th className="px-4 py-2 text-right font-medium">Осталось +</th>
                    </tr>
                  </thead>
                  <tbody>
                    {part.map((r) => {
                      const key = itemKey(r);
                      const checked = selection[key] !== undefined;
                      const hasCutting = r.cutting > 0;
                      return (
                        <tr
                          key={r.size}
                          className={cn(
                            "border-t border-border/70 transition-colors",
                            r.pairs === 0 ? "bg-danger-bg/40" : "bg-warn-bg/20",
                            hasCutting && "grayscale opacity-65",
                          )}
                        >
                          <td className="px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={r.remainingNeed <= 0}
                              onChange={() => toggleRow(r.color, r.size, r.remainingNeed)}
                              className="size-4 accent-current"
                            />
                          </td>
                          <td className="px-4 py-2 font-medium">{r.size}</td>
                          <td className="px-2 py-2 text-center">
                            <BoxBadge box={boxOf(state.boxes, r.color, r.size)} />
                          </td>
                          <td
                            className={cn(
                              "px-2 py-2 text-center font-mono",
                              r.pairs === 0 ? "text-danger" : "text-warn",
                            )}
                          >
                            {r.pairs}
                          </td>
                          <td className="px-2 py-2 text-center text-xs">
                            {r.inProduction ? (
                              <div className="space-y-0.5">
                                {r.cutting ? <div>крой {r.cutting}</div> : null}
                                {r.sewing ? <div>швеи {r.sewing}</div> : null}
                                {r.packaging ? <div>упак. {r.packaging}</div> : null}
                              </div>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-center text-muted">
                            {Math.floor(r.pairs / PACK)}
                          </td>
                          <td className="px-4 py-2 text-right font-mono">
                            {r.remainingNeed > 0 ? (
                              <div className="flex items-center justify-end gap-2">
                                {checked ? (
                                  <Input
                                    className="h-8 w-20 text-right"
                                    type="number"
                                    min={1}
                                    max={r.remainingNeed}
                                    value={selection[key]}
                                    onChange={(e) =>
                                      updateSelectedQty(
                                        r.color,
                                        r.size,
                                        r.remainingNeed,
                                        Number(e.target.value),
                                      )
                                    }
                                  />
                                ) : null}
                                <span className="text-danger">+{r.remainingNeed}</span>
                              </div>
                            ) : (
                              <Badge tone="ok">в очереди</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        );
      })}

      {activeBatches.length ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-medium">Производство в работе</h2>
            <p className="text-sm text-muted">Крой → швейки → упаковка → склад.</p>
          </div>

          <div className="space-y-3">
            {activeBatches
              .slice()
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((batch) => {
                const role = productionStageRole(batch.stage) ?? ROLE_BY_STAGE.cutting;
                const workers = state.workers.filter((worker) => worker.role === role);
                const assignedWorkerId = workerSelection[batch.id] ?? "";
                return (
                  <Card key={batch.id} className="p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={productionStageTone(batch.stage)}>
                            {productionStageLabel(batch.stage)}
                          </Badge>
                          <span className="font-mono text-sm">
                            {formatNum(productionPairs(batch))} пар
                          </span>
                          <span className="text-xs text-muted">
                            {formatDate(batch.createdAt.slice(0, 10))}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {batch.items.map((item) => (
                            <span
                              key={`${batch.id}-${itemKey(item)}`}
                              className="rounded-md bg-elevated px-2 py-1 text-xs"
                            >
                              {colorLabel(item.color)} · р.{item.size} × {item.qty}
                            </span>
                          ))}
                        </div>
                        {batch.note ? (
                          <p className="mt-3 text-xs text-muted">{batch.note}</p>
                        ) : null}
                      </div>

                      <div className="flex flex-col gap-2 lg:min-w-72 lg:max-w-xs">
                        {workers.length ? (
                          <select
                            value={assignedWorkerId}
                            onChange={(e) =>
                              setWorkerSelection((current) => ({
                                ...current,
                                [batch.id]: e.target.value,
                              }))
                            }
                            className="h-9 rounded-sm border border-border bg-surface px-3 text-sm outline-none"
                          >
                            <option value="">Ответственный · не выбран</option>
                            {workers.map((worker) => (
                              <option key={worker.id} value={worker.id}>
                                {worker.name}
                              </option>
                            ))}
                          </select>
                        ) : null}

                        <div className="flex gap-2">
                          <Button
                            className="flex-1"
                            onClick={() => advanceBatch(batch.id, assignedWorkerId)}
                          >
                            {batch.stage === "cutting" ? <Shirt className="size-4" /> : null}
                            {batch.stage === "sewing" ? <PackageCheck className="size-4" /> : null}
                            {batch.stage === "packaging" ? (
                              <CheckCircle2 className="size-4" />
                            ) : null}
                            {batch.stage === "cutting" ? "Забрал крой → швеям" : null}
                            {batch.stage === "sewing" ? "Забрал у швей → упаковка" : null}
                            {batch.stage === "packaging" ? "Упаковка готова → склад" : null}
                            <ChevronRight className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="iconSm"
                            title="Отменить партию"
                            onClick={() => cancelBatch(batch.id)}
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
          </div>
        </section>
      ) : null}

      {completedBatches.length ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-medium">Последние завершённые партии</h2>
            <p className="text-sm text-muted">
              После этапа «Упаковка» количество автоматически добавляется на склад.
            </p>
          </div>
          <Card className="divide-y divide-border">
            {completedBatches.slice(0, 8).map((batch) => (
              <div
                key={batch.id}
                className="flex flex-col gap-2 px-4 py-3 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone={batch.stage === "cancelled" ? "danger" : "ok"}>
                    {productionStageLabel(batch.stage)}
                  </Badge>
                  <span>{formatNum(productionPairs(batch))} пар</span>
                  <span className="text-muted">{formatDate(batch.updatedAt.slice(0, 10))}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {batch.items.map((item) => (
                    <span key={`${batch.id}-${itemKey(item)}`} className="text-xs text-muted">
                      {colorLabel(item.color)} р.{item.size} × {item.qty}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </Card>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-medium">Не отдали клиентам</h2>
        {clientMissing.length === 0 ? (
          <p className="text-sm text-muted">Долгов по размерам нет</p>
        ) : (
          <Card className="divide-y divide-border">
            {clientMissing.map((m, i) => (
              <div key={i} className="flex justify-between px-4 py-3 text-sm">
                <span>
                  {m.client}
                  <span className="text-muted">
                    {" "}
                    · {colorLabel(m.color)} р.{m.size}{" "}
                    <BoxBadge box={boxOf(state.boxes, m.color, m.size)} />
                  </span>
                </span>
                <span className="text-warn">{m.qty} пар</span>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
