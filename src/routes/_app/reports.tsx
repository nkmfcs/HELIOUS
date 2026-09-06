import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, Stat } from "@/components/ui/card";
import { availableMonths, clientDebt, dayReport, monthSummary } from "@/lib/stats";
import {
  formatCompact,
  formatDate,
  formatNum,
  formatSum,
  monthKey,
  monthLabel,
  todayISO,
} from "@/lib/format";
import { useWarehouse } from "@/lib/store";

export const Route = createFileRoute("/_app/reports")({ component: ReportsPage });

function ReportsPage() {
  const state = useWarehouse();
  const months = availableMonths(state);
  const [ym, setYm] = useState(months[0] ?? monthKey(todayISO()));
  const [day, setDay] = useState(todayISO());
  const summary = monthSummary(state, ym);
  const daily = dayReport(state, day);
  const dayEvents = state.events
    .filter((e) => e.date === day)
    .sort((a, b) => a.id.localeCompare(b.id));

  const chart = useMemo(
    () =>
      summary.days.map((d) => ({
        name: d.date.slice(8),
        пары: d.shippedPairs,
        сумма: Math.round(d.billed / 1000),
      })),
    [summary.days],
  );

  const topClients = [...state.clients]
    .map((c) => ({
      ...c,
      billed: state.orders
        .filter((o) => o.clientId === c.id && o.status === "shipped" && monthKey(o.date) === ym)
        .reduce((s, o) => s + o.totalSum, 0),
      pairs: state.orders
        .filter((o) => o.clientId === c.id && o.status === "shipped" && monthKey(o.date) === ym)
        .reduce((s, o) => s + o.totalPairs, 0),
      debt: clientDebt(state, c.id),
    }))
    .filter((c) => c.billed > 0 || c.debt > 0)
    .sort((a, b) => b.billed - a.billed);

  const typeLabel: Record<string, string> = {
    incoming: "Приход",
    order: "Заказ",
    order_edit: "Изменение заказа",
    payment: "Оплата",
    cancel: "Отмена",
    stock_adjustment: "Корректировка склада",
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Отчёты</h1>
        <p className="mt-1 text-sm text-muted">
          День и месяц отдельно. Сводка по заказам, приходу и деньгам.
        </p>
      </div>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-base font-medium">Месяц</h2>
          <select
            value={ym}
            onChange={(e) => setYm(e.target.value)}
            className="h-11 rounded-md border border-border bg-bg px-3 text-sm"
          >
            {(months.length ? months : [ym]).map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Заказов" value={formatNum(summary.orderCount)} />
          <Stat label="Пар" value={formatNum(summary.shippedPairs)} />
          <Stat label="Выставлено" value={formatCompact(summary.billed)} />
          <Stat label="Получено" value={formatCompact(summary.paid)} tone="ok" />
        </div>
        {chart.length > 0 ? (
          <Card className="p-4">
            <div className="mb-3 text-xs uppercase tracking-wide text-subtle">Пары по дням</div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart}>
                  <CartesianGrid stroke="rgb(28 27 24 / 0.08)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "#6a665c", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#6a665c", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    width={32}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#fffcf7",
                      border: "1px solid rgb(28 27 24 / 0.1)",
                      borderRadius: 8,
                      color: "#1c1b18",
                    }}
                  />
                  <Bar dataKey="пары" fill="#1c1b18" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        ) : (
          <p className="text-sm text-muted">В этом месяце событий нет</p>
        )}

        {summary.days.length > 0 ? (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-subtle">
                  <th className="px-4 py-2 text-left font-medium">День</th>
                  <th className="px-2 py-2 text-right font-medium">Зак.</th>
                  <th className="px-2 py-2 text-right font-medium">Пар</th>
                  <th className="px-4 py-2 text-right font-medium">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {summary.days.map((d) => (
                  <tr
                    key={d.date}
                    className="cursor-pointer border-t border-border/70 hover:bg-elevated"
                    onClick={() => setDay(d.date)}
                  >
                    <td className="px-4 py-2">{formatDate(d.date)}</td>
                    <td className="px-2 py-2 text-right font-mono tabular">{d.orderCount}</td>
                    <td className="px-2 py-2 text-right font-mono tabular">{d.shippedPairs}</td>
                    <td className="px-4 py-2 text-right font-mono tabular">
                      {formatNum(d.billed)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : null}

        {topClients.length > 0 ? (
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-medium">Клиенты месяца</h3>
            <ul className="divide-y divide-border">
              {topClients.map((c) => (
                <li key={c.id}>
                  <Link
                    to="/clients/$clientId"
                    params={{ clientId: c.id }}
                    className="flex justify-between py-2.5 text-sm"
                  >
                    <span>
                      {c.name}
                      <span className="text-muted">{c.shop ? ` · ${c.shop}` : ""}</span>
                    </span>
                    <span className="font-mono tabular">
                      {formatNum(c.pairs)} п · {formatNum(c.billed)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-base font-medium">День</h2>
          <input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="h-11 rounded-md border border-border bg-bg px-3 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Заказов" value={String(daily.orderCount)} />
          <Stat label="Отгружено пар" value={formatNum(daily.shippedPairs)} />
          <Stat label="Выставлено" value={formatCompact(daily.billed)} />
          <Stat
            label="Приход / оплата"
            value={`${daily.incomingPairs} / ${formatCompact(daily.paid)}`}
          />
        </div>
        <Card className="divide-y divide-border">
          {dayEvents.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">В этот день записей нет</p>
          ) : (
            dayEvents.map((e) => (
              <div key={e.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <div className="font-medium">{typeLabel[e.type]}</div>
                  <div className="text-xs text-muted">{e.note}</div>
                </div>
                <div className="text-right font-mono text-xs tabular">
                  {e.pairs ? <div>{e.pairs} пар</div> : null}
                  {e.sum ? <div>{formatSum(e.sum)}</div> : null}
                </div>
              </div>
            ))
          )}
        </Card>
      </section>
    </div>
  );
}
