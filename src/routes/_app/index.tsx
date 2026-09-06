import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Group, MetricRow, SectionLabel } from "@/components/ui/card";
import {
  allStockTotal,
  colorLabel,
  formatCompact,
  formatDate,
  formatNum,
  formatSum,
  monthKey,
  monthLabel,
  stockTotal,
  todayISO,
} from "@/lib/format";
import { useWarehouse } from "@/lib/store";
import {
  cashBalance,
  clientDebt,
  dayReport,
  lowStock,
  monthSummary,
  pairCost,
  revenuePotential,
  totalDebt,
  warehouseValue,
} from "@/lib/stats";
import { COLORS } from "@/lib/types";

export const Route = createFileRoute("/_app/")({ component: Home });

function Home() {
  const state = useWarehouse();
  const today = todayISO();
  const todayR = dayReport(state, today);
  const month = monthSummary(state, monthKey(today));
  const debt = totalDebt(state);
  const pairs = allStockTotal(state.stock);
  const low = lowStock(state);
  const cost = pairCost(state.costs);
  const value = warehouseValue(state);
  const pot = revenuePotential(state);
  const cash = cashBalance(state);
  const recent = [...state.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4);
  const debtors = state.clients
    .map((c) => ({ ...c, debt: clientDebt(state, c.id) }))
    .filter((c) => c.debt > 0)
    .sort((a, b) => b.debt - a.debt);

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Склад</h1>
        <p className="mt-1 text-sm text-muted">{formatDate(today)}</p>
      </div>

      <Group>
        <div className="px-4 pb-4 pt-5">
          <div className="text-4xl font-semibold tabular leading-none">{formatNum(pairs)}</div>
          <div className="mt-1 text-sm text-muted">пар на складе</div>
          <div className="mt-5 grid grid-cols-3 gap-3">
            {COLORS.map((c) => (
              <div key={c}>
                <div className="text-xs text-subtle">{colorLabel(c)}</div>
                <div className="mt-0.5 text-lg font-semibold tabular">{formatNum(stockTotal(state.stock[c]))}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-border">
          <MetricRow label="Долги" value={formatCompact(debt)} tone={debt > 0 ? "danger" : "ok"} />
          <div className="h-px bg-border ml-4" />
          <Link to="/cash">
            <MetricRow label="На руках" value={formatCompact(cash)} tone={cash < 0 ? "danger" : "ok"} />
          </Link>
          <div className="h-px bg-border ml-4" />
          <MetricRow label="Себестоимость пары" value={formatNum(cost)} />
          <div className="h-px bg-border ml-4" />
          <MetricRow label="Склад в деньгах" value={formatCompact(value)} />
          <div className="h-px bg-border ml-4" />
          <MetricRow label="Если продать всё" value={formatCompact(pot)} />
        </div>
      </Group>

      <section>
        <SectionLabel>Сегодня</SectionLabel>
        <Group>
          <MetricRow label="Отгружено" value={`${formatNum(todayR.shippedPairs)} пар`} />
          <div className="h-px bg-border ml-4" />
          <MetricRow label="На сумму" value={formatCompact(todayR.billed)} />
          <div className="h-px bg-border ml-4" />
          <MetricRow label="Оплачено" value={formatCompact(todayR.paid)} tone="ok" />
          <div className="h-px bg-border ml-4" />
          <MetricRow label="Приход" value={`${formatNum(todayR.incomingPairs)} пар`} />
        </Group>
      </section>

      <section>
        <SectionLabel>{monthLabel(monthKey(today))}</SectionLabel>
        <Group>
          <MetricRow label="Заказов" value={formatNum(month.orderCount)} />
          <div className="h-px bg-border ml-4" />
          <MetricRow label="Пар отгружено" value={formatNum(month.shippedPairs)} />
          <div className="h-px bg-border ml-4" />
          <MetricRow label="Выручка" value={formatCompact(month.billed)} />
          <div className="h-px bg-border ml-4" />
          <MetricRow label="Получено" value={formatCompact(month.paid)} tone="ok" />
        </Group>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <div className="text-xs font-medium text-subtle">Должники</div>
          <Link to="/clients" className="text-xs text-accent">
            Все
          </Link>
        </div>
        <Group>
          {debtors.length === 0 ? (
            <p className="px-4 py-5 text-sm text-muted">Долгов нет</p>
          ) : (
            debtors.map((c, i) => (
              <div key={c.id}>
                {i > 0 ? <div className="h-px bg-border ml-4" /> : null}
                <Link
                  to="/clients/$clientId"
                  params={{ clientId: c.id }}
                  className="flex items-center justify-between gap-3 px-4 py-3.5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{c.name}</div>
                    <div className="text-xs text-subtle">{c.shop || "без точки"}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-semibold text-danger tabular">{formatSum(c.debt)}</span>
                    <ChevronRight className="size-4 text-subtle" />
                  </div>
                </Link>
              </div>
            ))
          )}
        </Group>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <div className="text-xs font-medium text-subtle">Заказы</div>
          <Link to="/orders" className="text-xs text-accent">
            Все
          </Link>
        </div>
        <Group>
          {recent.length === 0 ? (
            <p className="px-4 py-5 text-sm text-muted">Заказов пока нет</p>
          ) : (
            recent.map((o, i) => {
              const client = state.clients.find((c) => c.id === o.clientId);
              const unpaid = o.status === "shipped" && o.paidSum < o.totalSum;
              return (
                <div key={o.id}>
                  {i > 0 ? <div className="h-px bg-border ml-4" /> : null}
                  <Link
                    to="/orders/$orderId"
                    params={{ orderId: o.id }}
                    className="flex items-center justify-between gap-3 px-4 py-3.5"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {client ? `${client.name} ${client.shop}`.trim() : "Клиент"}
                      </div>
                      <div className="text-xs text-subtle">
                        {formatDate(o.date)} · {o.totalPairs} пар
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <div className="text-sm font-semibold tabular">{formatNum(o.totalSum)}</div>
                        {o.status === "cancelled" ? (
                          <Badge>Отменён</Badge>
                        ) : unpaid ? (
                          <Badge tone="danger">Долг</Badge>
                        ) : (
                          <Badge tone="ok">Оплачен</Badge>
                        )}
                      </div>
                      <ChevronRight className="size-4 text-subtle" />
                    </div>
                  </Link>
                </div>
              );
            })
          )}
        </Group>
      </section>

      {low.length > 0 ? (
        <section>
          <SectionLabel>Предзаказ</SectionLabel>
          <Link to="/preorder">
            <Group>
              <div className="flex items-center justify-between px-4 py-3.5">
                <div>
                  <div className="text-sm font-medium">{low.length} размеров ниже {state.lowThreshold}</div>
                  <div className="text-xs text-muted">дошить {formatNum(low.reduce((s, r) => s + r.need, 0))} пар</div>
                </div>
                <ChevronRight className="size-4 text-subtle" />
              </div>
            </Group>
          </Link>
        </section>
      ) : null}
    </div>
  );
}
