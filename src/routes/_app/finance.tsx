import type { ChangeEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, Stat } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { allStockTotal, formatCompact, formatNum, formatSum } from "@/lib/format";
import { pairCost, revenuePotential, totalDebt, totalPaid, warehouseValue } from "@/lib/stats";
import { useWarehouse } from "@/lib/store";
import { SELL_PRICE } from "@/lib/types";

export const Route = createFileRoute("/_app/finance")({ component: FinancePage });

function FinancePage() {
  const state = useWarehouse();
  const setCosts = useWarehouse((s) => s.setCosts);
  const importState = useWarehouse((s) => s.importState);
  const cost = pairCost(state.costs);
  const profit = SELL_PRICE - cost;
  const pairs = allStockTotal(state.stock);

  function exportJson() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            stock: state.stock,
            clients: state.clients,
            orders: state.orders,
            payments: state.payments,
            incoming: state.incoming,
            events: state.events,
            cash: state.cash ?? [],
            cashOpening: state.cashOpening ?? 0,
            dataRev: state.dataRev ?? 0,
            boxes: state.boxes,
            payables: state.payables ?? [],
            workers: state.workers ?? [],
            costs: state.costs,
            lowThreshold: state.lowThreshold,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cheshki-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    toast("Файл скачан");
  }

  function onImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!importState(data)) toast("Неверный файл");
        else toast("Импорт выполнен");
      } catch {
        toast("Не удалось прочитать файл");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Финансы</h1>
        <p className="mt-1 text-sm text-muted">
          Себестоимость пары. Живые деньги — в{" "}
          <Link to="/cash" className="text-accent">
            кассе
          </Link>
          .
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Себестоимость" value={formatNum(cost)} />
        <Stat label="Прибыль / пару" value={formatNum(profit)} tone="ok" />
        <Stat
          label="Склад"
          value={formatCompact(warehouseValue(state))}
          hint={`${formatNum(pairs)} пар`}
        />
        <Stat label="Потенциал" value={formatCompact(revenuePotential(state))} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Все долги" value={formatCompact(totalDebt(state))} tone="danger" />
        <Stat label="Получено всего" value={formatCompact(totalPaid(state))} tone="ok" />
      </div>

      <Card className="space-y-4 p-4">
        <h2 className="text-sm font-medium">Себестоимость 1 пары</h2>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["sewing", "Шитьё"],
              ["cutting", "Крой"],
              ["packaging", "Упаковка"],
              ["materialUSD", "Материал $/м"],
              ["avgMeters", "Расход м/пару"],
              ["usdRate", "Курс $"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <Label>{label}</Label>
              <Input
                type="number"
                step={key === "avgMeters" || key === "materialUSD" ? "0.01" : "1"}
                value={state.costs[key]}
                onChange={(e) => setCosts({ [key]: Number(e.target.value) || 0 })}
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-subtle">
          1 м ≈ {state.costs.avgMeters > 0 ? Math.round(1 / state.costs.avgMeters) : "—"} пар · цена
          продажи {formatSum(SELL_PRICE)}
        </p>
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-medium">Данные</h2>
        <p className="text-sm text-muted">
          Склад сам пишется в облако. Экспорт — запасная копия на всякий случай.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportJson}>
            Экспорт JSON
          </Button>
          <label className="inline-flex h-11 cursor-pointer items-center rounded-md border border-border bg-elevated px-4 text-sm font-medium">
            Импорт
            <input type="file" accept=".json" className="hidden" onChange={onImport} />
          </label>
        </div>
        <div className="flex gap-4 text-sm">
          <Link to="/preorder" className="text-muted hover:text-fg">
            Предзаказ
          </Link>
          <Link to="/reports" className="text-muted hover:text-fg">
            Отчёты
          </Link>
        </div>
      </Card>
    </div>
  );
}
