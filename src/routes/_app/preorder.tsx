import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Scissors, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Stat } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { colorLabel, formatDate, formatNum } from "@/lib/format";
import { BoxBadge } from "@/components/box-badge";
import { boxOf } from "@/lib/boxes";
import { useWarehouse } from "@/lib/store";
import {
  itemKey,
  isActiveProductionStage,
  productionPairs,
  productionQtyFor,
  productionStageLabel,
  productionStageTone,
} from "@/lib/production";
import { COLORS, PACK, SIZES, type Color } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ProductionMovements } from "@/components/production-movements";
import {
  replayProduction,
  remainingPlanItems,
  physicalProductionQty,
  physicalStageQty,
} from "@/lib/production-moves";

export const Route = createFileRoute("/_app/preorder")({ component: PreorderPage });

type Selection = Record<string, number>;

function PreorderPage() {
  const state = useWarehouse();
  const setLowThreshold = useWarehouse((s) => s.setLowThreshold);
  const createProductionBatch = useWarehouse((s) => s.createProductionBatch);
  const cancelProductionBatch = useWarehouse((s) => s.cancelProductionBatch);
  const [selection, setSelection] = useState<Selection>({});
  const [showAll, setShowAll] = useState(false);
  const [pageTab, setPageTab] = useState<"production" | "plan">("production");

  const moves = state.productionMoves ?? [];
  const physical = replayProduction(moves).balances;
  const productionBatches = (state.productionBatches ?? [])
    .map((b) => (b.stage === "cutting" ? { ...b, items: remainingPlanItems(b, moves) } : b))
    .filter((b) => b.items.length > 0);
  const allRows = COLORS.flatMap((color) =>
    SIZES.map((size) => {
      const pairs = state.stock[color][size] ?? 0;
      return { color, size, pairs, need: Math.max(0, state.lowThreshold - pairs) };
    }),
  ).map((row) => {
    const inProduction =
      productionQtyFor(productionBatches, row.color, row.size) +
      physicalProductionQty(physical, row.color, row.size);
    const cutting =
      productionQtyFor(productionBatches, row.color, row.size, "cutting") +
      physicalStageQty(physical, "cutting", row.color, row.size);
    const sewing =
      productionQtyFor(productionBatches, row.color, row.size, "sewing") +
      physicalStageQty(physical, "sewing", row.color, row.size);
    const packaging =
      productionQtyFor(productionBatches, row.color, row.size, "packaging") +
      physicalStageQty(physical, "packaging", row.color, row.size);
    return {
      ...row,
      inProduction,
      cutting,
      sewing,
      packaging,
      remainingNeed: Math.max(0, row.need - inProduction),
    };
  });

  const rows = allRows.filter((row) => row.need > 0);
  const visibleRows = showAll
    ? allRows
    : allRows.filter((row) => row.need > 0 || selection[itemKey(row)] > 0);
  const need = rows.reduce((sum, row) => sum + row.remainingNeed, 0);
  const rawNeed = rows.reduce((sum, row) => sum + row.need, 0);
  const selectedCount = Object.values(selection).reduce((sum, qty) => sum + qty, 0);
  const activeBatches = productionBatches.filter((batch) => isActiveProductionStage(batch.stage));
  const completedBatches = productionBatches
    .filter((batch) => batch.stage === "done" || batch.stage === "cancelled")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const stagePairs = useMemo(
    () => ({
      cutting:
        activeBatches
          .filter((batch) => batch.stage === "cutting")
          .reduce((sum, batch) => sum + productionPairs(batch), 0) +
        physicalStageQty(physical, "cutting"),
      sewing:
        activeBatches
          .filter((batch) => batch.stage === "sewing")
          .reduce((sum, batch) => sum + productionPairs(batch), 0) +
        physicalStageQty(physical, "sewing"),
      packaging:
        activeBatches
          .filter((batch) => batch.stage === "packaging")
          .reduce((sum, batch) => sum + productionPairs(batch), 0) +
        physicalStageQty(physical, "packaging"),
    }),
    [activeBatches, physical],
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

  function updateSelectedQty(color: Color, size: number, value: number) {
    const key = itemKey({ color, size });
    if (!Number.isSafeInteger(value) || value < 0) return;
    setSelection((current) => {
      const next = { ...current };
      if (value === 0) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  function addSelectedQty(color: Color, size: number, delta: number) {
    const key = itemKey({ color, size });
    setSelection((current) => {
      const qty = Math.max(0, (current[key] ?? 0) + delta);
      if (!Number.isSafeInteger(qty)) return current;
      const next = { ...current };
      if (qty === 0) delete next[key];
      else next[key] = qty;
      return next;
    });
  }

  function sendSelectedToCutting() {
    const items = Object.entries(selection).map(([key, qty]) => {
      const [color, size] = key.split(":");
      return { color: color as Color, size: Number(size), qty };
    });
    if (
      !window.confirm(
        `Отправить на крой ${selectedCount} пар?\n${items.map((i) => colorLabel(i.color) + " · р." + i.size + " × " + i.qty).join("\n")}`,
      )
    )
      return;
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

  function cancelBatch(batchId: string) {
    if (!window.confirm("Отменить этот предзаказ? Остатки склада не изменятся.")) return;
    if (!cancelProductionBatch(batchId)) {
      toast.error("Не удалось отменить партию");
      return;
    }
    toast("Партия снята с производства");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Производство</h1>
        <p className="mt-1 text-sm text-muted">
          Остатки, работники и план выпуска — в одном месте.
        </p>
      </div>

      <div
        className="grid grid-cols-2 gap-1 rounded-xl bg-elevated p-1"
        aria-label="Раздел производства"
      >
        {(
          [
            ["production", "Производство"],
            ["plan", "Предзаказ"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            aria-pressed={pageTab === v}
            onClick={() => setPageTab(v)}
            className={cn(
              "rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              pageTab === v ? "bg-surface text-fg shadow-sm" : "text-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={pageTab === "production" ? "" : "hidden"}>
        <ProductionMovements />
      </div>
      <div className={pageTab === "plan" ? "space-y-6" : "hidden"}>
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
                Дефицит — рекомендация. Количество для кроя можно указать самостоятельно.
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

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-medium">Количество на крой</h2>
            <div className="flex gap-2">
              <Button variant={showAll ? "secondary" : "primary"} onClick={() => setShowAll(false)}>
                Дефицит
              </Button>
              <Button variant={showAll ? "primary" : "secondary"} onClick={() => setShowAll(true)}>
                Все размеры
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted">
            Впишите свое количество или прибавляйте пары кнопками. Нажатие на «Нужно» заполняет
            рекомендованное количество.
          </p>
          {COLORS.map((c) => {
            const part = visibleRows.filter((r) => r.color === c);
            return (
              <Card key={c} className="overflow-hidden">
                <div className="border-b border-border px-4 py-3 text-sm font-medium">
                  {colorLabel(c)}
                </div>
                {part.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-muted">Нет дефицита</p>
                ) : (
                  <div className="divide-y divide-border">
                    {part.map((r) => {
                      const qty = selection[itemKey(r)] ?? 0;
                      return (
                        <div
                          key={r.size}
                          className={cn("space-y-2 px-3 py-3 sm:px-4", qty > 0 && "bg-elevated/50")}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-base font-semibold">р. {r.size}</span>
                              <BoxBadge box={boxOf(state.boxes, r.color, r.size)} />
                            </div>
                            <div className="text-xs text-muted">
                              Остаток:{" "}
                              <span className={cn("font-mono", r.pairs === 0 && "text-danger")}>
                                {r.pairs}
                              </span>{" "}
                              · {Math.floor(r.pairs / PACK)} уп.
                            </div>
                            <button
                              type="button"
                              disabled={r.remainingNeed === 0}
                              onClick={() => updateSelectedQty(r.color, r.size, r.remainingNeed)}
                              className={cn(
                                "rounded-md px-2 py-1 text-xs font-medium",
                                r.remainingNeed > 0 ? "bg-warn-bg text-warn" : "text-muted",
                              )}
                            >
                              Нужно {r.remainingNeed > 0 ? `+${r.remainingNeed}` : "0"}
                            </button>
                          </div>
                          {r.inProduction > 0 ? (
                            <div className="text-xs text-muted">
                              В процессе: {r.inProduction} пар
                              {r.cutting ? ` · крой ${r.cutting}` : ""}
                              {r.sewing ? ` · швеи ${r.sewing}` : ""}
                              {r.packaging ? ` · упак. ${r.packaging}` : ""}
                            </div>
                          ) : null}
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Input
                              className="h-9 w-20 text-center font-mono"
                              type="number"
                              inputMode="numeric"
                              min={0}
                              step={1}
                              placeholder="0"
                              aria-label={`${colorLabel(c)}, размер ${r.size}, пар на крой`}
                              value={qty || ""}
                              onChange={(e) =>
                                updateSelectedQty(r.color, r.size, Number(e.target.value))
                              }
                            />
                            {[-5, 5, 10, 25, 50].map((delta) => (
                              <button
                                key={delta}
                                type="button"
                                disabled={delta < 0 && qty === 0}
                                onClick={() => addSelectedQty(r.color, r.size, delta)}
                                className="h-9 rounded-md border border-border bg-surface px-2 text-xs font-medium disabled:opacity-40"
                              >
                                {delta > 0 ? "+" : ""}
                                {delta}
                              </button>
                            ))}
                            {qty > 0 ? (
                              <button
                                type="button"
                                aria-label="Очистить количество"
                                onClick={() => updateSelectedQty(r.color, r.size, 0)}
                                className="h-9 px-2 text-muted"
                              >
                                <X className="size-4" />
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
          {selectedCount > 0 ? (
            <div className="sticky bottom-24 z-10 rounded-xl border border-border bg-surface p-3 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs text-muted">
                    Выбрано · {Object.keys(selection).length} поз.
                  </div>
                  <div className="font-semibold">{formatNum(selectedCount)} пар</div>
                </div>
                <Button onClick={sendSelectedToCutting}>
                  <Scissors className="size-4" /> На крой
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        {activeBatches.length ? (
          <section className="space-y-3">
            <h2 className="text-lg font-medium">Предзаказы и старые партии</h2>
            {activeBatches.map((batch) => (
              <Card key={batch.id} className="space-y-2 p-3">
                <div className="flex justify-between">
                  <Badge tone={productionStageTone(batch.stage)}>
                    {batch.stage === "cutting"
                      ? "Осталось принять крой"
                      : productionStageLabel(batch.stage)}
                  </Badge>
                  <b>{formatNum(productionPairs(batch))} пар</b>
                </div>
                <p className="text-xs text-muted">
                  {batch.items
                    .map((i) => colorLabel(i.color) + " " + i.size + "×" + i.qty)
                    .join(" · ")}
                </p>
                <p className="text-xs text-muted">
                  {batch.stage === "cutting"
                    ? "Примите фактическое количество в журнале, выбрав этот предзаказ."
                    : "Старая партия: сверьте фактическое место и количество, затем внесите начальные остатки. Автоприёмка отключена."}
                </p>
                {!moves.some((m) => !m.cancelledAt && m.planId === batch.id) ? (
                  <Button variant="secondary" onClick={() => cancelBatch(batch.id)}>
                    Отменить после сверки
                  </Button>
                ) : (
                  <p className="text-xs text-muted">
                    Частично принят — исправление факта через журнал.
                  </p>
                )}
              </Card>
            ))}
          </section>
        ) : null}

        {completedBatches.length ? (
          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-medium">Последние завершённые партии</h2>
              <p className="text-sm text-muted">
                История старых завершённых партий. Новая приёмка отражается в журнале.
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
    </div>
  );
}
