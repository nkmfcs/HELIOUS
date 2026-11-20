import { useEffect, useState } from "react";
import {
  Scissors,
  Users,
  Layers,
  PackageCheck,
  Warehouse,
  ArrowDownLeft,
  ArrowUpRight,
  ClipboardList,
  History,
  Trash2,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  COLORS,
  SIZES,
  type Color,
  type ProductionMove,
  type ProductionMoveInput,
  type ProductionMoveKind,
} from "@/lib/types";
import { colorLabel, formatNum, todayISO } from "@/lib/format";
import { useWarehouse } from "@/lib/store";
import {
  MOVE_LABELS,
  balanceItems,
  moveRoute,
  productionToken,
  remainingPlanItems,
  replayProduction,
  workerLocation,
  earnsForMove,
} from "@/lib/production-moves";
import { itemKey } from "@/lib/production";

const total = (items: { qty: number }[]) => items.reduce((s, i) => s + i.qty, 0);
const accent = {
  cut: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  sewn: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  packed: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  finished: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  worker: "bg-teal-500/10 text-teal-700 dark:text-teal-300",
};
const initial = (): ProductionMoveInput => ({
  kind: "cut-in",
  items: [],
  date: todayISO(),
  note: "",
});
export function ProductionWorkerBalance({ workerId }: { workerId: string }) {
  const moves = useWarehouse((s) => s.productionMoves);
  const { balances, error } = replayProduction(moves ?? []);
  const items = [
    ...balanceItems(balances, workerLocation("sewing", workerId)),
    ...balanceItems(balances, workerLocation("packaging", workerId)),
  ];
  return (
    <Card className="space-y-2 p-4">
      <div className="flex justify-between">
        <h2 className="font-medium">На руках</h2>
        <b>{formatNum(total(items))} пар</b>
      </div>
      {error ? (
        <p className="text-danger">{error}</p>
      ) : items.length ? (
        <div className="flex flex-wrap gap-2">
          {items.map((item, i) => (
            <span key={i} className="rounded-md bg-elevated px-2 py-1 text-sm">
              {colorLabel(item.color)} · р.{item.size} × {item.qty}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">Нет учтённых остатков</p>
      )}
      <p className="text-xs text-muted">
        Выдача и приёмка — в разделе «Предзаказ». Зарплата начисляется при подтверждении приёмки.
      </p>
    </Card>
  );
}
export function ProductionMovements() {
  const state = useWarehouse();
  const moves = state.productionMoves ?? [];
  const { balances, error } = replayProduction(moves);
  const [draft, setDraft] = useState<ProductionMoveInput>(initial);
  const [editing, setEditing] = useState<string>();
  const [color, setColor] = useState<Color>("white");
  const [startSize, setStartSize] = useState("17");
  const [endSize, setEndSize] = useState("24");
  const [rangeQty, setRangeQty] = useState("50");
  const [reportColor, setReportColor] = useState<Color>("white");
  const [journalQuery, setJournalQuery] = useState("");
  const [tab, setTab] = useState<"overview" | "workers" | "journal">("overview");
  const [showCancelled, setShowCancelled] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [voidPending, setVoidPending] = useState<{ ids: string[]; token: string }>();
  const [compactSizes, setCompactSizes] = useState(false);
  const [pending, setPending] = useState<{
    input: ProductionMoveInput;
    token: string;
    id?: string;
  }>();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (open)
      document
        .getElementById("production-move-editor")
        ?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [open, editing]);
  const role =
    draft.kind === "cut-in"
      ? "cutting"
      : ["cut-out", "sewn-in"].includes(draft.kind)
        ? "sewing"
        : ["pack-out", "packed-in"].includes(draft.kind)
          ? "packaging"
          : null;
  const workerName = (id?: string) => state.workers.find((w) => w.id === id)?.name ?? "Не выбран";
  const locationName = (key: string) =>
    key === "cut"
      ? "Склад кроя"
      : key === "sewn"
        ? "После пошива"
        : key === "packed"
          ? "Упаковано · ждёт приёмки"
          : key === "finished"
            ? "Основной склад"
            : key === "outside"
              ? "Получение извне"
              : workerName(key.split(":").slice(1).join(":"));
  const route = moveRoute(draft);
  const source = route?.[0];
  const planOptions = state.productionBatches.filter(
    (b) =>
      b.stage === "cutting" && (remainingPlanItems(b, moves).length > 0 || b.id === draft.planId),
  );
  const beforeEdit = editing
    ? replayProduction(
        moves.slice(
          0,
          moves.findIndex((m) => m.id === editing),
        ),
      ).balances
    : balances;
  const available = source && source !== "outside" ? balanceItems(beforeEdit, source) : [];
  const rate = draft.rate ?? state.workers.find((w) => w.id === draft.workerId)?.rate;
  const earning = earnsForMove(draft.kind);
  const locations = [
    "cut",
    "sewn",
    "packed",
    ...state.workers.flatMap((w) =>
      w.role === "sewing" || w.role === "packaging" ? [workerLocation(w.role, w.id)] : [],
    ),
  ];
  const shortages =
    source && source !== "outside"
      ? draft.items.filter(
          (i) =>
            i.qty > (available.find((a) => a.color === i.color && a.size === i.size)?.qty ?? 0),
        )
      : [];
  const visibleMoves = moves
    .filter(
      (m) =>
        (showCancelled || !m.cancelledAt) &&
        (!journalQuery.trim() ||
          [
            MOVE_LABELS[m.kind],
            workerName(m.workerId),
            m.date,
            m.note,
            ...m.items.map((i) => colorLabel(i.color) + " " + i.size),
          ]
            .join(" ")
            .toLowerCase()
            .includes(journalQuery.trim().toLowerCase())),
    )
    .slice()
    .reverse();
  // Ручные начисления тому же работнику в тот же день — частая причина двойной записи.
  const manualSameDay = pending
    ? (state.payables ?? []).filter(
        (p) =>
          !p.productionMoveId &&
          p.workerId &&
          p.workerId === pending.input.workerId &&
          p.date === pending.input.date,
      )
    : [];
  function requestVoid(ids: string[]) {
    setVoidPending({ ids, token: productionToken(state) });
  }
  function confirmVoid() {
    if (!voidPending) return;
    const error = state.voidProductionMoves(voidPending.ids, voidPending.token);
    if (error) {
      toast.error(error);
      setVoidPending(undefined);
      return;
    }
    toast.success("Операции отменены, остатки пересчитаны");
    setSelected([]);
    setVoidPending(undefined);
    setOpen(false);
    setEditing(undefined);
  }
  function begin(kind: ProductionMoveKind, workerId?: string) {
    setDraft({ ...initial(), kind, workerId });
    setEditing(undefined);
    setOpen(true);
    setPending(undefined);
    setCompactSizes(false);
  }
  function fillRange() {
    const start = Number(startSize),
      end = Number(endSize),
      n = Number(rangeQty);
    if (
      !SIZES.some((s) => s === start) ||
      !SIZES.some((s) => s === end) ||
      start > end ||
      !Number.isSafeInteger(n) ||
      n <= 0
    ) {
      toast.error("Проверьте диапазон и количество");
      return;
    }
    setDraft((d) => ({
      ...d,
      items: [
        ...d.items.filter((i) => i.color !== color || i.size < start || i.size > end),
        ...SIZES.filter((s) => s >= start && s <= end).map((size) => ({ color, size, qty: n })),
      ],
    }));
  }
  function qty(c: Color, size: number, value: number) {
    if (!Number.isSafeInteger(value) || value < 0) return;
    setDraft((d) => ({
      ...d,
      items: [
        ...d.items.filter((i) => i.color !== c || i.size !== size),
        ...(value ? [{ color: c, size, qty: value }] : []),
      ],
    }));
  }
  function edit(move: ProductionMove) {
    setDraft({
      kind: move.kind,
      items: move.items.map((i) => ({ ...i })),
      workerId: move.workerId,
      planId: move.planId,
      openingTo: move.openingTo,
      rate: move.rate,
      date: move.date,
      note: move.note,
    });
    if (move.cancelledAt) return;
    setColor(move.items[0]?.color ?? "white");
    setEditing(move.id);
    setOpen(true);
    setPending(undefined);
    setCompactSizes(true);
  }
  function save(rateOverride?: number) {
    if (!pending) return;
    const input =
      rateOverride === undefined ? pending.input : { ...pending.input, rate: rateOverride };
    const err = state.confirmProductionMove(input, pending.token, pending.id);
    if (err) {
      toast.error(err);
      setPending(undefined);
      return;
    }
    toast.success("Операция подтверждена");
    setDraft(initial());
    setEditing(undefined);
    setPending(undefined);
    setOpen(false);
  }
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">Движение</h2>
          <p className="text-xs text-muted">От кроя до готовых чешек</p>
        </div>
        <Button onClick={() => begin("cut-in")}>
          <Plus className="size-4" /> Операция
        </Button>
      </div>
      {error ? <p className="text-danger">{error}</p> : null}
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-elevated p-1">
        {(
          [
            { id: "overview", label: "Обзор", icon: Layers },
            { id: "workers", label: "Работники", icon: Users },
            { id: "journal", label: "Журнал", icon: History },
          ] as const
        ).map((t) => (
          <button
            type="button"
            key={t.id}
            aria-pressed={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center justify-center gap-1.5 rounded-lg px-1 py-2 text-xs font-medium sm:text-sm ${tab === t.id ? "bg-surface shadow-sm text-fg" : "text-muted"}`}
          >
            <t.icon className="size-4 shrink-0" />
            {t.label}
          </button>
        ))}
      </div>
      {tab === "overview" ? (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {(
              [
                { loc: "cut", title: "Склад кроя", icon: Scissors, tone: accent.cut },
                { loc: "sewn", title: "После пошива", icon: Layers, tone: accent.sewn },
                { loc: "packed", title: "Ждёт приёмки", icon: PackageCheck, tone: accent.packed },
                { loc: "finished", title: "Готовый склад", icon: Warehouse, tone: accent.finished },
              ] as const
            ).map((c) => {
              const items =
                c.loc === "finished"
                  ? COLORS.flatMap((color) =>
                      SIZES.map((size) => ({
                        color,
                        size,
                        qty: state.stock[color][size] ?? 0,
                      })).filter((i) => i.qty > 0),
                    )
                  : balanceItems(balances, c.loc);
              return (
                <Card key={c.loc} className="p-3 space-y-1.5">
                  <div className={`inline-flex rounded-lg p-2 ${c.tone}`}>
                    <c.icon className="size-5" />
                  </div>
                  <div className="text-xs text-muted">{c.title}</div>
                  <div className="text-2xl font-semibold tracking-tight tabular-nums">
                    {formatNum(total(items))}
                    <span className="ml-1 text-xs font-normal text-muted">пар</span>
                  </div>
                  {items.length > 0 && (
                    <details className="text-xs">
                      <summary className="text-muted cursor-pointer">По размерам</summary>
                      <div className="mt-1 max-h-40 overflow-y-auto">
                        {items.map((i) => (
                          <div key={itemKey(i)}>
                            {colorLabel(i.color)} · {i.size} × {i.qty}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </Card>
              );
            })}
          </div>
          <Card className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm">Быстрые действия</h3>
              <span className="text-xs text-muted">С подтверждением</span>
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {(Object.entries(MOVE_LABELS) as [ProductionMoveKind, string][]).map(
                ([kind, label]) => (
                  <button
                    type="button"
                    key={kind}
                    onClick={() => begin(kind)}
                    className="flex min-h-12 items-center gap-2 rounded-lg border border-border p-2 text-left text-xs font-medium hover:bg-elevated sm:text-sm"
                  >
                    <span
                      className={`rounded-md p-1.5 ${kind === "warehouse-in" ? accent.finished : kind === "opening" ? accent.packed : kind === "cut-in" || kind === "cut-out" ? accent.cut : accent.sewn}`}
                    >
                      {kind === "cut-out" || kind === "pack-out" ? (
                        <ArrowUpRight className="size-4" />
                      ) : kind === "opening" ? (
                        <ClipboardList className="size-4" />
                      ) : (
                        <ArrowDownLeft className="size-4" />
                      )}
                    </span>
                    {label}
                  </button>
                ),
              )}
            </div>
          </Card>
          <Card className="p-3 space-y-2">
            <details>
              <summary className="cursor-pointer font-medium">Сверка по цветам и размерам</summary>
              <div className="mt-3 grid grid-cols-4 gap-1">
                {COLORS.map((c) => (
                  <Button
                    key={c}
                    size="sm"
                    className="px-1 text-xs"
                    variant={reportColor === c ? "primary" : "secondary"}
                    onClick={() => setReportColor(c)}
                  >
                    {c === "gray" ? "Серебро" : colorLabel(c)}
                  </Button>
                ))}
              </div>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-center text-xs sm:text-sm">
                  <thead>
                    <tr>
                      <th className="py-2">Размер</th>
                      <th className="text-amber-600">Крой</th>
                      <th className="text-teal-600">У швей</th>
                      <th className="text-sky-600">Пошито</th>
                      <th className="text-violet-600">Упак.</th>
                      <th className="text-emerald-600">Склад</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SIZES.map((size) => {
                      const key = itemKey({ color: reportColor, size });
                      const get = (loc: string) => balances.get(loc)?.get(key) ?? 0;
                      const sewn = locations
                        .filter((l) => l.startsWith("sewing:"))
                        .reduce((n, l) => n + get(l), 0);
                      const pack = locations
                        .filter((l) => l.startsWith("packaging:"))
                        .reduce((n, l) => n + get(l), get("packed"));
                      return (
                        <tr key={size} className="border-t border-border">
                          <th className="py-2">{size}</th>
                          {[
                            get("cut"),
                            sewn,
                            get("sewn"),
                            pack,
                            state.stock[reportColor][size] ?? 0,
                          ].map((n, i) => (
                            <td key={i} className={n ? "font-medium tabular-nums" : "text-subtle"}>
                              {n || "—"}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          </Card>
        </>
      ) : null}
      {tab === "workers" ? (
        <div className="grid gap-2 md:grid-cols-2">
          {state.workers
            .filter((w) => w.role === "sewing" || w.role === "packaging")
            .map((w) => {
              const items = balanceItems(
                balances,
                workerLocation(w.role === "sewing" ? "sewing" : "packaging", w.id),
              );
              return (
                <Card key={w.id} className="space-y-2 p-3">
                  <div className="flex items-center gap-3">
                    <div className={`rounded-xl p-2 ${accent.worker}`}>
                      <Users className="size-5" />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">{w.name}</div>
                      <div className="text-xs text-muted">
                        {w.role === "sewing" ? "Швея" : "Упаковка"}
                      </div>
                    </div>
                    <b className="text-xl tabular-nums">{formatNum(total(items))}</b>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {items.map((i) => (
                      <span key={itemKey(i)} className="rounded-md bg-elevated px-2 py-1 text-xs">
                        {colorLabel(i.color)} · {i.size} × {i.qty}
                      </span>
                    ))}
                    {items.length === 0 ? (
                      <span className="text-xs text-muted">Нет остатков</span>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => begin(w.role === "sewing" ? "cut-out" : "pack-out", w.id)}
                    >
                      Выдать
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => begin(w.role === "sewing" ? "sewn-in" : "packed-in", w.id)}
                    >
                      Принять
                    </Button>
                  </div>
                  <button
                    type="button"
                    className="text-xs text-muted underline"
                    onClick={() => {
                      begin("opening");
                      setDraft((d) => ({
                        ...d,
                        openingTo: workerLocation(
                          w.role === "sewing" ? "sewing" : "packaging",
                          w.id,
                        ),
                      }));
                    }}
                  >
                    Внести начальный остаток
                  </button>
                </Card>
              );
            })}
        </div>
      ) : null}
      {open ? (
        <div id="production-move-editor" className="scroll-mt-16">
          <Card className="space-y-3 p-3 sm:p-4">
            <h3 className="font-medium">{editing ? "Исправить операцию" : "Новая операция"}</h3>
            {draft.kind === "opening" ? (
              <p className="text-warn text-xs">
                Внесите только физический остаток, который ещё не учтён в журнале. Для исправления
                уже учтённого количества используйте «Изменить».
              </p>
            ) : null}
            <select
              aria-label="Операция"
              disabled={!!editing}
              value={draft.kind}
              onChange={(e) =>
                setDraft({ ...initial(), kind: e.target.value as ProductionMoveKind })
              }
              className="w-full rounded-md border border-border bg-surface p-2"
            >
              {Object.entries(MOVE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            {role ? (
              <select
                aria-label="Работник"
                value={draft.workerId ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    workerId: e.target.value || undefined,
                    rate: undefined,
                  }))
                }
                className="w-full rounded-md border border-border bg-surface p-2"
              >
                <option value="">Выбрать работника</option>
                {state.workers
                  .filter((w) => w.role === role)
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
              </select>
            ) : null}
            {draft.kind === "opening" ? (
              <select
                aria-label="Место начального остатка"
                value={draft.openingTo ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, openingTo: e.target.value }))}
                className="w-full rounded-md border border-border bg-surface p-2"
              >
                <option value="">Выбрать место</option>
                {locations.map((l) => (
                  <option key={l} value={l}>
                    {locationName(l)}
                  </option>
                ))}
              </select>
            ) : null}
            {draft.kind === "cut-in" ? (
              <>
                <select
                  aria-label="Предзаказ"
                  value={draft.planId ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, planId: e.target.value || undefined }))}
                  className="w-full rounded-md border border-border bg-surface p-2"
                >
                  <option value="">Без предзаказа (ручная приёмка)</option>
                  {planOptions.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.note || b.id} · {total(remainingPlanItems(b, moves))} пар осталось
                    </option>
                  ))}
                </select>
                {draft.planId ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const b = planOptions.find((b) => b.id === draft.planId);
                      if (b) setDraft((d) => ({ ...d, items: remainingPlanItems(b, moves) }));
                    }}
                  >
                    Заполнить по предзаказу
                  </Button>
                ) : null}
              </>
            ) : null}
            {route ? (
              <p className="text-sm text-muted">
                {locationName(route[0])} → {locationName(route[1])}
              </p>
            ) : null}
            {source && source !== "outside" ? (
              <Button
                variant="secondary"
                onClick={() => setDraft((d) => ({ ...d, items: available.map((i) => ({ ...i })) }))}
              >
                Заполнить весь остаток ({total(available)})
              </Button>
            ) : null}
            <div className="grid grid-cols-4 gap-1">
              {COLORS.map((c) => (
                <Button
                  key={c}
                  size="sm"
                  variant={color === c ? "primary" : "secondary"}
                  className="min-w-0 px-1 text-xs"
                  onClick={() => setColor(c)}
                >
                  {colorLabel(c) === "Серые" ? "Серебро" : colorLabel(c)}
                </Button>
              ))}
            </div>
            <div className="rounded-md border border-border p-2 space-y-2">
              <p className="text-xs font-medium">Заполнить диапазон · {colorLabel(color)}</p>
              <div className="grid grid-cols-3 gap-2">
                <Input
                  aria-label="От размера"
                  type="number"
                  value={startSize}
                  onChange={(e) => setStartSize(e.target.value)}
                />
                <Input
                  aria-label="До размера"
                  type="number"
                  value={endSize}
                  onChange={(e) => setEndSize(e.target.value)}
                />
                <Input
                  aria-label="Пар на размер"
                  type="number"
                  value={rangeQty}
                  onChange={(e) => setRangeQty(e.target.value)}
                />
              </div>
              <Button variant="secondary" size="sm" onClick={fillRange}>
                Заполнить размеры
              </Button>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={compactSizes}
                onChange={(e) => setCompactSizes(e.target.checked)}
              />{" "}
              Только заполненные размеры
            </label>
            <div className="grid gap-x-4 md:grid-cols-2">
              {SIZES.filter(
                (size) =>
                  !compactSizes || draft.items.some((i) => i.color === color && i.size === size),
              ).map((size) => {
                const n = draft.items.find((i) => i.color === color && i.size === size)?.qty ?? 0;
                const have = available.find((i) => i.color === color && i.size === size)?.qty ?? 0;
                return (
                  <div
                    key={size}
                    className="flex flex-wrap items-center gap-1.5 border-b border-border py-2"
                  >
                    <div className="min-w-12 flex-1 text-sm font-medium">
                      р.{size}
                      {source && source !== "outside" ? (
                        <div className={n > have ? "text-xs text-danger" : "text-xs text-muted"}>
                          Есть {have}
                          {n > have ? " · больше остатка" : ""}
                        </div>
                      ) : null}
                    </div>
                    <Input
                      aria-label={colorLabel(color) + " размер " + size}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={n || ""}
                      placeholder="0"
                      className="h-9 w-16 text-center"
                      onChange={(e) => qty(color, size, Number(e.target.value))}
                    />
                    {[-5, 5, 10, 25, 50].map((v) => (
                      <Button
                        type="button"
                        key={v}
                        variant="secondary"
                        size="sm"
                        className="px-2"
                        onClick={() => qty(color, size, Math.max(0, n + v))}
                      >
                        {v > 0 ? "+" : ""}
                        {v}
                      </Button>
                    ))}
                  </div>
                );
              })}
            </div>
            {earning ? (
              <div className="space-y-1">
                <label className="text-sm font-medium">Ставка за пару, сум</label>
                <Input
                  aria-label="Ставка за пару"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={rate ?? ""}
                  placeholder="Укажите ставку или 0"
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      rate: e.target.value === "" ? undefined : Number(e.target.value),
                    }))
                  }
                />
                <p className="text-xs text-muted">
                  {rate === undefined
                    ? "Укажите ставку. 0 — приёмка без начисления."
                    : `Начисление: ${formatNum(total(draft.items) * rate)} сум`}
                </p>
              </div>
            ) : null}
            <Input
              aria-label="Дата"
              type="date"
              value={draft.date}
              onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
            />
            <Input
              aria-label="Комментарий"
              placeholder="Комментарий"
              value={draft.note}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
            />
            {shortages.length ? (
              <p className="text-sm text-danger">
                Проверьте превышение остатка:{" "}
                {shortages.map((i) => colorLabel(i.color) + " " + i.size).join(", ")}
              </p>
            ) : null}
            <div className="sticky bottom-20 z-10 flex flex-wrap gap-2 rounded-lg bg-surface p-2 shadow-sm lg:bottom-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setOpen(false);
                  setEditing(undefined);
                }}
              >
                Отмена
              </Button>
              <Button
                disabled={
                  shortages.length > 0 ||
                  !route ||
                  !draft.items.length ||
                  (earning && (rate === undefined || !Number.isSafeInteger(rate) || rate < 0))
                }
                onClick={() =>
                  setPending({
                    input: {
                      ...draft,
                      rate: earning ? rate : undefined,
                      items: draft.items.map((i) => ({ ...i })),
                    },
                    token: productionToken(state),
                    id: editing,
                  })
                }
              >
                Проверить · {total(draft.items)} пар
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
      {pending ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
        >
          <Card className="max-h-[85dvh] w-full max-w-lg space-y-3 overflow-y-auto p-4">
            <h3 className="text-lg font-semibold">Вы уверены?</h3>
            <p>
              {MOVE_LABELS[pending.input.kind]}
              {pending.input.workerId ? " · " + workerName(pending.input.workerId) : ""} ·{" "}
              {total(pending.input.items)} пар
            </p>
            <div className="divide-y divide-border">
              {pending.input.items.map((i) => (
                <div key={itemKey(i)} className="flex justify-between py-2 text-sm">
                  <span>
                    {colorLabel(i.color)} · размер {i.size}
                  </span>
                  <b>{i.qty}</b>
                </div>
              ))}
            </div>
            {earnsForMove(pending.input.kind) && (pending.input.rate ?? 0) > 0 ? (
              <div className="space-y-2 rounded-md bg-elevated p-3 text-sm">
                <div className="font-medium">
                  Начислить {workerName(pending.input.workerId) || "работнику"}{" "}
                  {formatNum(total(pending.input.items) * (pending.input.rate ?? 0))} сум?
                </div>
                {manualSameDay.length ? (
                  <p className="text-warn">
                    За {pending.input.date} уже есть начисление, внесённое вручную:{" "}
                    {manualSameDay
                      .map((p) => `${p.pairs ? p.pairs + " пар · " : ""}${formatNum(p.amount)} сум`)
                      .join(", ")}
                    . Если это та же партия — выберите «Без начисления».
                  </p>
                ) : (
                  <p className="text-xs text-muted">
                    Если деньги за эти пары уже внесены вручную — выберите «Без начисления».
                  </p>
                )}
              </div>
            ) : earnsForMove(pending.input.kind) ? (
              <p className="text-sm text-muted">Без начисления денег.</p>
            ) : null}
            {pending.input.kind === "warehouse-in" ? (
              <p className="text-warn text-sm">
                Только после подтверждения изменится основной склад.
              </p>
            ) : (
              <p className="text-xs text-muted">Основной склад не изменится.</p>
            )}
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setPending(undefined)}>
                Исправить
              </Button>
              {earnsForMove(pending.input.kind) && (pending.input.rate ?? 0) > 0 ? null : (
                <Button className="flex-1" onClick={() => save()}>
                  Подтвердить
                </Button>
              )}
            </div>
            {earnsForMove(pending.input.kind) && (pending.input.rate ?? 0) > 0 ? (
              <div className="grid gap-2">
                <Button onClick={() => save()}>
                  Да, начислить {formatNum(total(pending.input.items) * (pending.input.rate ?? 0))}{" "}
                  сум
                </Button>
                <Button variant="secondary" onClick={() => save(0)}>
                  Без начисления — уже внёс сам
                </Button>
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}
      {tab === "journal" ? (
        <Card className="divide-y divide-border">
          <div className="p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium">Журнал перемещений</h3>
              {selected.length > 0 ? (
                <Button size="sm" variant="danger" onClick={() => requestVoid(selected)}>
                  <Trash2 className="size-4" /> Отменить ({selected.length})
                </Button>
              ) : null}
            </div>
            <Input
              placeholder="Работник, цвет, размер, операция"
              value={journalQuery}
              onChange={(e) => setJournalQuery(e.target.value)}
            />
            <label className="flex gap-2 items-center text-xs text-muted">
              <input
                type="checkbox"
                checked={showCancelled}
                onChange={(e) => setShowCancelled(e.target.checked)}
              />{" "}
              Показать отменённые
            </label>
            <p className="text-xs text-muted">
              Отметьте связанные ошибочные записи и отмените их вместе.
            </p>
          </div>
          {visibleMoves.length === 0 ? (
            <p className="p-3 text-sm text-muted">Нет операций</p>
          ) : (
            visibleMoves.map((m) => (
              <div key={m.id} className={`space-y-1 p-3 ${m.cancelledAt ? "opacity-60" : ""}`}>
                <div className="flex items-center gap-2">
                  {!m.cancelledAt ? (
                    <input
                      aria-label="Выбрать операцию"
                      type="checkbox"
                      className="size-4 shrink-0 accent-current"
                      checked={selected.includes(m.id)}
                      onChange={(e) =>
                        setSelected((s) =>
                          e.target.checked ? [...s, m.id] : s.filter((id) => id !== m.id),
                        )
                      }
                    />
                  ) : null}
                  <div
                    className={`rounded-md p-1.5 ${m.kind === "cut-out" || m.kind === "pack-out" ? accent.cut : m.kind === "opening" ? accent.packed : accent.finished}`}
                  >
                    {m.kind === "cut-out" || m.kind === "pack-out" ? (
                      <ArrowUpRight className="size-4" />
                    ) : (
                      <ArrowDownLeft className="size-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <b className="text-sm">
                      {MOVE_LABELS[m.kind]} · {total(m.items)} пар
                    </b>
                    <p className="text-xs text-muted">
                      {m.date}
                      {m.workerId
                        ? " · " + workerName(m.workerId)
                        : m.openingTo
                          ? " · " + locationName(m.openingTo)
                          : ""}
                      {m.cancelledAt ? " · Отменено" : ""}
                    </p>
                  </div>
                  {!m.cancelledAt ? (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => edit(m)}>
                        Изменить
                      </Button>
                      <button
                        type="button"
                        aria-label="Отменить операцию"
                        className="rounded-lg p-2 text-danger"
                        onClick={() => requestVoid([m.id])}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </>
                  ) : null}
                </div>
                <p className="pl-2 text-xs text-muted">
                  {m.items.map((i) => colorLabel(i.color) + " " + i.size + "×" + i.qty).join(" · ")}
                </p>
                {m.audit?.length ? (
                  <details className="text-xs text-muted">
                    <summary>История исправлений ({m.audit.length})</summary>
                    {m.audit.map((a, i) => (
                      <p key={i}>
                        {a.at.slice(0, 16).replace("T", " ")} · было:{" "}
                        {a.before.items
                          .map((i) => colorLabel(i.color) + " " + i.size + "×" + i.qty)
                          .join(" · ")}
                      </p>
                    ))}
                  </details>
                ) : null}
              </div>
            ))
          )}
        </Card>
      ) : null}
      {voidPending ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
        >
          <Card className="w-full max-w-lg space-y-3 p-4">
            <h3 className="text-lg font-semibold">Отменить выбранные операции?</h3>
            <p className="text-sm text-muted">
              Остатки и неоплаченные начисления пересчитаются. Записи останутся в истории
              отменённых.
            </p>
            {moves
              .filter((m) => voidPending.ids.includes(m.id))
              .map((m) => (
                <div key={m.id} className="rounded-lg bg-elevated p-2 text-sm">
                  {MOVE_LABELS[m.kind]} · {total(m.items)} пар
                  {m.workerId ? " · " + workerName(m.workerId) : ""}
                  <div className="text-xs text-muted">
                    {m.items
                      .map((i) => colorLabel(i.color) + " " + i.size + "×" + i.qty)
                      .join(" · ")}
                  </div>
                </div>
              ))}
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setVoidPending(undefined)}
              >
                Назад
              </Button>
              <Button variant="danger" className="flex-1" onClick={confirmVoid}>
                Подтвердить отмену
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </section>
  );
}
