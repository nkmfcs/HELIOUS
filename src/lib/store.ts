import { create } from "zustand";
import { persist } from "zustand/middleware";
import { LEGACY_PRIVATE_DATA_REV, SEED } from "./seed";
import { ensureBoxes, type BoxId } from "./boxes";
import {
  COLORS,
  PACK,
  SELL_PRICE,
  SIZES,
  type Color,
  type Costs,
  type CashKind,
  type OrderItem,
  type Payable,
  type WarehouseState,
  type WorkerRole,
  type ProductionBatch,
  type ProductionStage,
} from "./types";
import { colorLabel, emptySizeMap, todayISO, uid } from "./format";
import {
  itemMap,
  normalizeProductionBatches,
  productionQtyFor,
  isActiveProductionStage,
  productionStageRole,
} from "./production";
import { orderDebt } from "./stats";
import { buildPairsAccrual, cleanWholeNumber } from "./worker-pay";
import {
  addItemsToStock,
  allocateOrder,
  itemTotal,
  normalizeOrderItems,
  normalizeStock,
  replaceOrderAllocation,
  type StockShortage,
} from "./inventory";

type Cart = Record<Color, Record<number, number>>;

function formatOrderDelta(pairs: number, sum: number): string {
  const signed = (value: number) => `${value > 0 ? "+" : ""}${value}`;
  return `${signed(pairs)} пар, ${signed(sum)} сум`;
}

function validDate(value: string | undefined, fallback = todayISO()): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value
    ? fallback
    : value;
}

function relatedPaymentIdsForOrder(
  payments: WarehouseState["payments"],
  order: Pick<WarehouseState["orders"][number], "id" | "clientId">,
): Set<string> {
  return new Set(
    payments
      .filter(
        (payment) =>
          payment.amount > 0 &&
          (payment.orderId === order.id ||
            payment.allocations?.some((allocation) => allocation.orderId === order.id) ||
            (!payment.orderId && !payment.allocations && payment.clientId === order.clientId)),
      )
      .map((payment) => payment.id),
  );
}

type Actions = {
  addClient: (data: { name: string; shop?: string; phone?: string; note?: string }) => string;
  updateClient: (
    id: string,
    patch: Partial<{ name: string; shop: string; phone: string; note: string }>,
  ) => void;
  deleteClient: (id: string) => boolean;
  changeStock: (color: Color, size: number, delta: number) => void;
  setStock: (color: Color, size: number, value: number) => void;
  addIncoming: (color: Color, items: Record<number, number>, note?: string, date?: string) => void;
  shipOrder: (input: {
    clientId: string;
    items: OrderItem[];
    note?: string;
    date?: string;
  }) => { orderId: string; shipped: number; missing: OrderItem[] } | null;
  updateOrder: (input: {
    orderId: string;
    items: OrderItem[];
    missing: OrderItem[];
    note?: string;
    date?: string;
  }) =>
    | { ok: true; shipped: number; missing: number; refunded: number }
    | {
        ok: false;
        reason: "not_found" | "cancelled" | "empty" | "invalid_history";
        shortages?: StockShortage[];
      }
    | { ok: false; reason: "insufficient_stock"; shortages: StockShortage[] };
  cancelOrder: (
    orderId: string,
  ) =>
    | { ok: true; returned: number; refunded: number }
    | { ok: false; reason: "not_found" | "already_cancelled" | "invalid_history" };
  addPayment: (input: {
    clientId: string;
    amount: number;
    note?: string;
    date?: string;
    orderId?: string;
  }) => { applied: number; unapplied: number } | null;
  addCash: (input: {
    kind: CashKind;
    amount: number;
    person?: string;
    note?: string;
    date?: string;
    clientId?: string;
  }) => void;
  deleteCash: (id: string) => void;
  setCashOpening: (n: number) => void;
  addPayable: (input: {
    person: string;
    amount: number;
    note?: string;
    date?: string;
    workerId?: string;
  }) => void;
  payPayable: (id: string, amount?: number, date?: string, note?: string) => void;
  updateWorkerAccrual: (
    id: string,
    patch: Pick<Payable, "amount" | "date" | "note">,
    expected: Payable,
  ) => string | null;
  addWorker: (data: {
    name: string;
    role?: WorkerRole;
    phone?: string;
    note?: string;
    rate?: number;
  }) => string;
  updateWorker: (
    id: string,
    patch: Partial<{ name: string; role: WorkerRole; phone: string; note: string; rate: number }>,
  ) => void;
  payWorker: (workerId: string, amount: number, note?: string, date?: string) => void;
  addWorkerDebt: (workerId: string, amount: number, note?: string, date?: string) => void;
  /** Принять пары у работника: долг = пары × его ставка. Возвращает текст ошибки или `null`. */
  addWorkerPairs: (workerId: string, pairs: number, note?: string, date?: string) => string | null;
  setCosts: (patch: Partial<Costs>) => void;
  setLowThreshold: (n: number) => void;
  setBox: (color: Color, size: number, box: BoxId) => void;
  createProductionBatch: (input: { items: OrderItem[]; note?: string }) => string | null;
  advanceProductionBatch: (input: {
    batchId: string;
    nextStage?: ProductionStage;
    workerId?: string;
  }) => boolean;
  cancelProductionBatch: (batchId: string) => boolean;
  importState: (raw: unknown) => boolean;
};

export type Store = WarehouseState & Actions;

function cartToItems(cart: Cart): OrderItem[] {
  const items: OrderItem[] = [];
  for (const color of COLORS) {
    for (const size of SIZES) {
      const qty = cart[color][size] ?? 0;
      if (qty > 0) items.push({ color, size, qty });
    }
  }
  return items;
}

export { cartToItems };

export function snapshotOf(s: WarehouseState): WarehouseState {
  return {
    stock: normalizeStock(s.stock),
    clients: s.clients,
    orders: s.orders,
    payments: s.payments,
    incoming: s.incoming,
    events: s.events,
    cash: s.cash ?? [],
    cashOpening: s.cashOpening ?? 0,
    costs: s.costs,
    lowThreshold: s.lowThreshold,
    dataRev: s.dataRev ?? 0,
    boxes: ensureBoxes(s.boxes),
    payables: s.payables ?? [],
    workers: s.workers ?? [],
    productionBatches: s.productionBatches ?? [],
  };
}

export const useWarehouse = create<Store>()(
  persist(
    (set, get) => ({
      ...SEED,

      addClient: ({ name, shop = "", phone = "", note = "" }) => {
        if (!name.trim()) return "";
        const id = uid("c");
        set((s) => ({
          clients: [
            ...s.clients,
            {
              id,
              name: name.trim(),
              shop: shop.trim(),
              phone: phone.trim(),
              note: note.trim(),
              createdAt: new Date().toISOString(),
            },
          ],
        }));
        return id;
      },

      updateClient: (id, patch) => {
        if (patch.name !== undefined && !patch.name.trim()) return;
        const cleaned = Object.fromEntries(
          Object.entries(patch).map(([key, value]) => [key, value.trim()]),
        );
        set((s) => ({
          clients: s.clients.map((c) => (c.id === id ? { ...c, ...cleaned } : c)),
        }));
      },

      deleteClient: (id) => {
        const s = get();
        if (s.orders.some((o) => o.clientId === id && o.status === "shipped")) return false;
        set({
          clients: s.clients.filter((c) => c.id !== id),
        });
        return true;
      },

      changeStock: (color, size, delta) => {
        if (!Number.isFinite(delta) || !SIZES.includes(size as (typeof SIZES)[number])) return;
        set((s) => {
          const before = s.stock[color][size] ?? 0;
          const after = Math.max(0, Math.round(before + delta) || 0);
          const actualDelta = after - before;
          if (actualDelta === 0) return {};
          return {
            stock: {
              ...s.stock,
              [color]: { ...s.stock[color], [size]: after },
            },
            events: [
              ...s.events,
              {
                id: uid("ev"),
                date: todayISO(),
                type: "stock_adjustment" as const,
                pairs: actualDelta,
                sum: 0,
                note: `Корректировка: ${colorLabel(color)} р.${size} ${actualDelta > 0 ? "+" : ""}${actualDelta}`,
              },
            ],
          };
        });
      },

      setStock: (color, size, value) => {
        if (!Number.isFinite(value) || !SIZES.includes(size as (typeof SIZES)[number])) return;
        set((s) => {
          const before = s.stock[color][size] ?? 0;
          const after = Math.max(0, Math.round(value) || 0);
          const actualDelta = after - before;
          if (actualDelta === 0) return {};
          return {
            stock: {
              ...s.stock,
              [color]: { ...s.stock[color], [size]: after },
            },
            events: [
              ...s.events,
              {
                id: uid("ev"),
                date: todayISO(),
                type: "stock_adjustment" as const,
                pairs: actualDelta,
                sum: 0,
                note: `Инвентаризация: ${colorLabel(color)} р.${size}, ${before} → ${after}`,
              },
            ],
          };
        });
      },

      addIncoming: (color, items, note = "", date = todayISO()) => {
        const list = normalizeOrderItems(
          Object.entries(items).map(([size, qty]) => ({ color, size: Number(size), qty })),
        ).map(({ size, qty }) => ({ size, qty }));
        if (!list.length) return;
        const totalPairs = list.reduce((a, i) => a + i.qty, 0);
        const id = uid("in");
        const recordDate = validDate(date);
        set((s) => {
          const next = { ...s.stock[color] };
          for (const i of list) next[i.size] = (next[i.size] ?? 0) + i.qty;
          return {
            stock: { ...s.stock, [color]: next },
            incoming: [
              ...s.incoming,
              {
                id,
                date: recordDate,
                color,
                items: list,
                totalPairs,
                note: note.trim(),
                createdAt: new Date().toISOString(),
              },
            ],
            events: [
              ...s.events,
              {
                id: uid("ev"),
                date: recordDate,
                type: "incoming" as const,
                pairs: totalPairs,
                sum: 0,
                note: note.trim() || `Приход ${color}`,
                incomingId: id,
              },
            ],
          };
        });
      },

      shipOrder: ({ clientId, items, note = "", date = todayISO() }) => {
        const requested = normalizeOrderItems(items);
        if (!requested.length) return null;
        const s = get();
        if (!s.clients.some((client) => client.id === clientId)) return null;
        const allocation = allocateOrder(s.stock, requested);
        const { items: shipped, missing, stock: nextStock } = allocation;

        const totalPairs = shipped.reduce((a, i) => a + i.qty, 0);
        if (totalPairs === 0 && missing.length === 0) return null;

        const orderId = uid("o");
        const totalSum = totalPairs * SELL_PRICE;
        const client = s.clients.find((c) => c.id === clientId);
        const recordDate = validDate(date);
        const recordNote = note.trim();

        set({
          stock: nextStock,
          orders: [
            ...s.orders,
            {
              id: orderId,
              clientId,
              date: recordDate,
              items: shipped,
              missing,
              totalPairs,
              totalSum,
              paidSum: 0,
              status: "shipped",
              note: recordNote,
              createdAt: new Date().toISOString(),
            },
          ],
          events: [
            ...s.events,
            {
              id: uid("ev"),
              date: recordDate,
              type: "order",
              pairs: totalPairs,
              sum: totalSum,
              note: client ? `${client.name} ${client.shop}`.trim() : "Заказ",
              clientId,
              orderId,
            },
          ],
        });

        return { orderId, shipped: totalPairs, missing };
      },

      updateOrder: ({ orderId, items, missing, note, date }) => {
        const s = get();
        const order = s.orders.find((candidate) => candidate.id === orderId);
        if (!order) return { ok: false, reason: "not_found" };
        if (order.status === "cancelled") return { ok: false, reason: "cancelled" };
        if (itemTotal(order.items) !== order.totalPairs) {
          return { ok: false, reason: "invalid_history" };
        }

        const nextMissing = normalizeOrderItems(missing);
        const allocation = replaceOrderAllocation(s.stock, order.items, items);
        if (!allocation.ok) {
          return { ok: false, reason: "insufficient_stock", shortages: allocation.shortages };
        }

        const totalPairs = itemTotal(allocation.items);
        if (totalPairs === 0 && nextMissing.length === 0) return { ok: false, reason: "empty" };
        const totalSum = totalPairs * SELL_PRICE;
        const refund = Math.max(0, order.paidSum - totalSum);
        const refundId = refund > 0 ? uid("p") : "";
        const relatedPaymentIds = relatedPaymentIdsForOrder(s.payments, order);

        const nextDate = validDate(date, validDate(order.date));
        const nextNote = note === undefined ? order.note : note.trim();
        const client = s.clients.find((candidate) => candidate.id === order.clientId);
        const now = todayISO();
        const deltaPairs = totalPairs - order.totalPairs;
        const deltaSum = totalSum - order.totalSum;
        const originalEvent = s.events.find(
          (event) => event.type === "order" && event.orderId === orderId,
        );

        set({
          stock: allocation.stock,
          orders: s.orders.map((candidate) =>
            candidate.id === orderId
              ? {
                  ...candidate,
                  date: nextDate,
                  items: allocation.items,
                  missing: nextMissing,
                  totalPairs,
                  totalSum,
                  paidSum: candidate.paidSum - refund,
                  note: nextNote,
                }
              : candidate,
          ),
          events: [
            ...s.events.map((event) =>
              event.id === originalEvent?.id
                ? {
                    ...event,
                    date: nextDate,
                    pairs: totalPairs,
                    sum: totalSum,
                    note: client ? `${client.name} ${client.shop}`.trim() : event.note,
                  }
                : event,
            ),
            ...(refund > 0
              ? [
                  {
                    id: uid("ev"),
                    date: now,
                    type: "payment" as const,
                    pairs: 0,
                    sum: -refund,
                    note: "Возврат разницы после изменения заказа",
                    clientId: order.clientId,
                    orderId,
                    paymentId: refundId,
                  },
                ]
              : []),
            {
              id: uid("ev"),
              date: now,
              type: "order_edit" as const,
              pairs: deltaPairs,
              sum: deltaSum,
              note: `Изменён заказ ${formatOrderDelta(deltaPairs, deltaSum)}`,
              clientId: order.clientId,
              orderId,
            },
          ],
          payments:
            refund > 0
              ? [
                  ...s.payments,
                  {
                    id: refundId,
                    clientId: order.clientId,
                    orderId,
                    date: now,
                    amount: -refund,
                    note: "Возврат разницы после изменения заказа",
                    allocations: [{ orderId, amount: -refund }],
                  },
                ]
              : s.payments,
          cash:
            refund > 0
              ? [
                  ...(s.cash ?? []).map((row) =>
                    row.paymentId && relatedPaymentIds.has(row.paymentId)
                      ? { ...row, locked: true }
                      : row,
                  ),
                  {
                    id: uid("k"),
                    date: now,
                    kind: "refund" as const,
                    amount: refund,
                    person: client?.name ?? "",
                    note: "Возврат разницы после изменения заказа",
                    paymentId: refundId,
                    locked: true,
                    createdAt: new Date().toISOString(),
                  },
                ]
              : s.cash,
        });

        return { ok: true, shipped: totalPairs, missing: itemTotal(nextMissing), refunded: refund };
      },

      cancelOrder: (orderId) => {
        const s = get();
        const o = s.orders.find((x) => x.id === orderId);
        if (!o) return { ok: false, reason: "not_found" };
        if (o.status === "cancelled") return { ok: false, reason: "already_cancelled" };
        if (itemTotal(o.items) !== o.totalPairs) {
          return { ok: false, reason: "invalid_history" };
        }
        const nextStock = addItemsToStock(s.stock, o.items);
        const refund = o.paidSum;
        const refundId = refund > 0 ? uid("p") : "";
        const client = s.clients.find((candidate) => candidate.id === o.clientId);
        const relatedPaymentIds = relatedPaymentIdsForOrder(s.payments, o);
        set({
          stock: nextStock,
          orders: s.orders.map((x) =>
            x.id === orderId ? { ...x, status: "cancelled", paidSum: 0 } : x,
          ),
          payments:
            refund > 0
              ? [
                  ...s.payments,
                  {
                    id: refundId,
                    clientId: o.clientId,
                    orderId,
                    date: todayISO(),
                    amount: -refund,
                    note: "Возврат при отмене",
                    allocations: [{ orderId, amount: -refund }],
                  },
                ]
              : s.payments,
          cash:
            refund > 0
              ? [
                  ...(s.cash ?? []).map((row) =>
                    row.paymentId && relatedPaymentIds.has(row.paymentId)
                      ? { ...row, locked: true }
                      : row,
                  ),
                  {
                    id: uid("k"),
                    date: todayISO(),
                    kind: "refund" as const,
                    amount: refund,
                    person: client?.name ?? "",
                    note: "Возврат оплаты при отмене заказа",
                    paymentId: refundId,
                    locked: true,
                    createdAt: new Date().toISOString(),
                  },
                ]
              : s.cash,
          events: [
            ...s.events,
            ...(refund > 0
              ? [
                  {
                    id: uid("ev"),
                    date: todayISO(),
                    type: "payment" as const,
                    pairs: 0,
                    sum: -refund,
                    note: "Возврат оплаты при отмене",
                    clientId: o.clientId,
                    orderId,
                    paymentId: refundId,
                  },
                ]
              : []),
            {
              id: uid("ev"),
              date: todayISO(),
              type: "cancel",
              pairs: o.totalPairs,
              sum: o.totalSum,
              note: "Отмена заказа",
              clientId: o.clientId,
              orderId,
            },
          ],
        });
        return { ok: true, returned: o.totalPairs, refunded: refund };
      },

      addPayment: ({ clientId, amount, note = "", date = todayISO(), orderId }) => {
        const requestedAmount = Math.round(Number(amount));
        if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) return null;
        const s = get();
        let left = requestedAmount;
        const next = s.orders.map((o) => ({ ...o }));
        const allocations: { orderId: string; amount: number }[] = [];
        const targets = next
          .filter((o) => o.clientId === clientId && o.status === "shipped" && orderDebt(o) > 0)
          .filter((o) => (orderId ? o.id === orderId : true))
          .sort((a, b) => a.date.localeCompare(b.date));

        for (const o of targets) {
          if (left <= 0) break;
          const debt = orderDebt(o);
          const take = Math.min(debt, left);
          o.paidSum += take;
          allocations.push({ orderId: o.id, amount: take });
          left -= take;
        }

        const client = s.clients.find((c) => c.id === clientId);
        const applied = requestedAmount - left;
        if (applied <= 0) return null;
        const payId = uid("p");
        const recordDate = validDate(date);
        const recordNote = note.trim();

        set({
          orders: next,
          payments: [
            ...s.payments,
            {
              id: payId,
              clientId,
              orderId: orderId ?? (allocations.length === 1 ? allocations[0].orderId : undefined),
              date: recordDate,
              amount: applied,
              note: recordNote,
              allocations,
            },
          ],
          cash: [
            ...(s.cash ?? []),
            {
              id: uid("k"),
              date: recordDate,
              kind: "income",
              amount: applied,
              person: client ? client.name : "",
              note: recordNote || (client ? `Оплата: ${client.name}` : "Оплата клиента"),
              paymentId: payId,
              createdAt: new Date().toISOString(),
            },
          ],
          events: [
            ...s.events,
            {
              id: uid("ev"),
              date: recordDate,
              type: "payment",
              pairs: 0,
              sum: applied,
              note: recordNote || "Оплата",
              clientId,
              orderId: orderId ?? (allocations.length === 1 ? allocations[0].orderId : undefined),
              paymentId: payId,
            },
          ],
        });
        return { applied, unapplied: left };
      },

      addCash: ({ kind, amount, person = "", note = "", date = todayISO(), clientId }) => {
        const n = Math.round(Math.abs(amount));
        if (!Number.isFinite(n) || n <= 0) return;
        if (kind === "income" && clientId) {
          get().addPayment({ clientId, amount: n, note: note || "Оплата из кассы", date });
          return;
        }
        const recordDate = validDate(date);
        set((s) => ({
          cash: [
            ...(s.cash ?? []),
            {
              id: uid("k"),
              date: recordDate,
              kind,
              amount: n,
              person: person.trim(),
              note: note.trim(),
              createdAt: new Date().toISOString(),
            },
          ],
        }));
      },

      deleteCash: (id) => {
        set((s) => {
          const row = (s.cash ?? []).find((t) => t.id === id);
          if (row?.locked) return {};
          const cash = (s.cash ?? []).filter((t) => t.id !== id);
          if (!row?.paymentId) return { cash };
          const pay = s.payments.find((p) => p.id === row.paymentId);
          const payments = s.payments.filter((p) => p.id !== row.paymentId);
          const orders = s.orders.map((o) => ({ ...o }));
          if (pay?.allocations?.length) {
            for (const allocation of pay.allocations) {
              const order = orders.find((candidate) => candidate.id === allocation.orderId);
              if (order)
                order.paidSum = Math.max(0, order.paidSum - Math.max(0, allocation.amount));
            }
          } else {
            let left = Math.max(0, pay?.amount ?? row.amount);
            const targets = orders
              .filter((o) => o.clientId === pay?.clientId || o.id === pay?.orderId)
              .sort((a, b) => b.date.localeCompare(a.date));
            for (const order of targets) {
              if (left <= 0) break;
              const take = Math.min(order.paidSum, left);
              order.paidSum -= take;
              left -= take;
            }
          }
          const events = s.events.filter((event) => event.paymentId !== row.paymentId);
          return { cash, payments, orders, events };
        });
      },

      setCashOpening: (n) => {
        if (!Number.isFinite(n)) return;
        set({ cashOpening: Math.max(0, Math.round(n)) });
      },

      addPayable: ({ person, amount, note = "", date = todayISO(), workerId }) => {
        const n = Math.round(Math.abs(amount));
        if (!Number.isFinite(n) || n <= 0 || !person.trim()) return;
        set((s) => ({
          payables: [
            ...(s.payables ?? []),
            {
              id: uid("d"),
              person: person.trim(),
              amount: n,
              paidSum: 0,
              note: note.trim(),
              date: validDate(date),
              workerId,
            },
          ],
        }));
      },

      updateWorkerAccrual: (id, patch, expected) => {
        const row = (get().payables ?? []).find((entry) => entry.id === id);
        if (!row || !row.workerId) return "Начисление работника не найдено";
        if (row.amount <= row.paidSum) return "Начисление уже закрыто";
        if (
          (["id", "workerId", "person", "amount", "paidSum", "date", "note"] as const).some(
            (key) => row[key] !== expected[key],
          )
        )
          return "Начисление изменилось. Закройте форму и откройте редактирование заново.";
        if (!Number.isSafeInteger(patch.amount) || patch.amount <= 0)
          return "Укажите положительную целую сумму начисления";
        if (patch.amount < row.paidSum)
          return "Сумма начисления не может быть меньше уже выплаченной";
        const date = new Date(`${patch.date}T00:00:00Z`);
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(patch.date) ||
          Number.isNaN(date.getTime()) ||
          date.toISOString().slice(0, 10) !== patch.date
        )
          return "Укажите корректную дату начисления";
        set((s) => ({
          payables: (s.payables ?? []).map((entry) =>
            entry.id === id
              ? { ...entry, amount: patch.amount, date: patch.date, note: patch.note.trim() }
              : entry,
          ),
        }));
        return null;
      },

      payPayable: (id, amount, date = todayISO(), note = "") => {
        const s = get();
        const row = (s.payables ?? []).find((p) => p.id === id);
        if (!row) return;
        const left = Math.max(0, row.amount - row.paidSum);
        const requested = Math.round(Math.abs(amount ?? left));
        if (!Number.isFinite(requested)) return;
        const n = Math.min(left, requested);
        if (n <= 0) return;
        set({
          payables: (s.payables ?? []).map((p) =>
            p.id === id ? { ...p, paidSum: p.paidSum + n } : p,
          ),
          cash: [
            ...(s.cash ?? []),
            {
              id: uid("k"),
              date: validDate(date),
              kind: "worker",
              amount: n,
              person: row.person,
              note: note.trim() || row.note || "Закрыл долг работнику",
              workerId: row.workerId,
              createdAt: new Date().toISOString(),
            },
          ],
        });
      },

      addWorker: ({ name, role = "other", phone = "", note = "", rate }) => {
        if (!name.trim()) return "";
        const id = uid("w");
        set((s) => ({
          workers: [
            ...(s.workers ?? []),
            {
              id,
              name: name.trim(),
              role,
              phone: phone.trim(),
              note: note.trim(),
              rate: cleanWholeNumber(rate) || undefined,
              createdAt: new Date().toISOString(),
            },
          ],
        }));
        return id;
      },

      updateWorker: (id, patch) => {
        if (patch.name !== undefined && !patch.name.trim()) return;
        set((s) => ({
          workers: (s.workers ?? []).map((worker) =>
            worker.id === id
              ? {
                  ...worker,
                  ...patch,
                  name: patch.name?.trim() ?? worker.name,
                  phone: patch.phone?.trim() ?? worker.phone,
                  note: patch.note?.trim() ?? worker.note,
                  rate:
                    patch.rate === undefined
                      ? worker.rate
                      : cleanWholeNumber(patch.rate) || undefined,
                }
              : worker,
          ),
        }));
      },

      payWorker: (workerId, amount, note = "", date = todayISO()) => {
        const n = Math.round(Math.abs(amount));
        if (!Number.isFinite(n) || n <= 0) return;
        const s = get();
        const w = (s.workers ?? []).find((x) => x.id === workerId);
        if (!w) return;
        let left = n;
        const payables = (s.payables ?? []).map((payable) => ({ ...payable }));
        const open = payables
          .filter(
            (payable) => payable.workerId === workerId && payable.amount - payable.paidSum > 0,
          )
          .sort((a, b) => a.date.localeCompare(b.date));
        for (const payable of open) {
          if (left <= 0) break;
          const take = Math.min(left, payable.amount - payable.paidSum);
          payable.paidSum += take;
          left -= take;
        }
        set({
          payables,
          cash: [
            ...(s.cash ?? []),
            {
              id: uid("k"),
              date: validDate(date),
              kind: "worker",
              amount: n,
              person: w.name,
              note: note.trim() || (open.length ? "Оплата долгов и работы" : "Зарплата"),
              workerId,
              createdAt: new Date().toISOString(),
            },
          ],
        });
      },

      addWorkerDebt: (workerId, amount, note = "", date = todayISO()) => {
        const w = get().workers.find((x) => x.id === workerId);
        if (!w) return;
        get().addPayable({
          person: w.name,
          amount,
          note: note || "Долг работнику",
          date,
          workerId,
        });
      },

      addWorkerPairs: (workerId, pairs, note = "", date = todayISO()) => {
        const worker = get().workers.find((x) => x.id === workerId);
        if (!worker) return "Работник не найден";
        const accrual = buildPairsAccrual(worker, pairs);
        if ("error" in accrual) return accrual.error;
        set((s) => ({
          payables: [
            ...(s.payables ?? []),
            {
              id: uid("d"),
              ...accrual,
              paidSum: 0,
              note: note.trim() || "Принял пары",
              date: validDate(date),
              workerId,
            },
          ],
        }));
        return null;
      },

      setCosts: (patch) =>
        set((s) => {
          const costs = { ...s.costs };
          for (const [key, value] of Object.entries(patch)) {
            if (Number.isFinite(value)) costs[key as keyof Costs] = Math.max(0, Number(value));
          }
          return { costs };
        }),
      setLowThreshold: (n) => {
        if (!Number.isFinite(n)) return;
        set({ lowThreshold: Math.max(0, Math.round(n)) });
      },
      setBox: (color, size, box) =>
        set((s) => ({
          boxes: {
            ...ensureBoxes(s.boxes),
            [color]: { ...ensureBoxes(s.boxes)[color], [size]: box },
          },
        })),

      createProductionBatch: ({ items, note = "" }) => {
        const requested = itemMap(items);
        if (!requested.size) return null;
        const state = get();
        const normalized: OrderItem[] = [];
        for (const [key, requestedQty] of requested.entries()) {
          const [color, sizeText] = key.split(":");
          const size = Number(sizeText);
          const stock = state.stock[color as (typeof COLORS)[number]]?.[size] ?? 0;
          const inProduction = productionQtyFor(
            state.productionBatches,
            color as (typeof COLORS)[number],
            size,
          );
          const remainingNeed = Math.max(0, state.lowThreshold - stock - inProduction);
          const qty = Math.min(requestedQty, remainingNeed);
          if (qty > 0) normalized.push({ color: color as (typeof COLORS)[number], size, qty });
        }
        if (!normalized.length) return null;

        const now = new Date().toISOString();
        const id = uid("prod");
        const batch: ProductionBatch = {
          id,
          items: normalized,
          stage: "cutting",
          createdAt: now,
          updatedAt: now,
          note: note.trim(),
          history: [{ stage: "cutting", at: now }],
        };
        set((s) => ({ productionBatches: [...(s.productionBatches ?? []), batch] }));
        return id;
      },

      advanceProductionBatch: ({ batchId, nextStage, workerId }) => {
        const state = get();
        const batch = state.productionBatches.find((entry) => entry.id === batchId);
        if (!batch || !isActiveProductionStage(batch.stage)) return false;
        const expected: Record<ProductionStage, ProductionStage> = {
          cutting: "sewing",
          sewing: "packaging",
          packaging: "done",
          done: "done",
          cancelled: "cancelled",
        };
        const target = nextStage ?? expected[batch.stage];
        if (target !== expected[batch.stage]) return false;
        if (workerId) {
          const worker = state.workers.find((entry) => entry.id === workerId);
          if (!worker || worker.role !== productionStageRole(batch.stage)) return false;
        }

        const now = new Date().toISOString();
        const updated: ProductionBatch = {
          ...batch,
          stage: target,
          updatedAt: now,
          history: [...batch.history, { stage: target, at: now, workerId }],
          ...(batch.stage === "cutting"
            ? { cuttingWorkerId: workerId ?? batch.cuttingWorkerId }
            : {}),
          ...(batch.stage === "sewing" ? { sewingWorkerId: workerId ?? batch.sewingWorkerId } : {}),
          ...(batch.stage === "packaging"
            ? { packagingWorkerId: workerId ?? batch.packagingWorkerId }
            : {}),
        };

        if (target !== "done") {
          set({
            productionBatches: state.productionBatches.map((entry) =>
              entry.id === batchId ? updated : entry,
            ),
          });
          return true;
        }

        const nextStock = { ...state.stock };
        const byColor = new Map<(typeof COLORS)[number], { size: number; qty: number }[]>();
        for (const item of batch.items) {
          nextStock[item.color] = {
            ...nextStock[item.color],
            [item.size]: (nextStock[item.color][item.size] ?? 0) + item.qty,
          };
          const rows = byColor.get(item.color) ?? [];
          rows.push({ size: item.size, qty: item.qty });
          byColor.set(item.color, rows);
        }

        const incoming = [...state.incoming];
        const events = [...state.events];
        for (const [color, rows] of byColor.entries()) {
          const incomingId = uid("in");
          const totalPairs = rows.reduce((sum, row) => sum + row.qty, 0);
          incoming.push({
            id: incomingId,
            date: now.slice(0, 10),
            color,
            items: rows,
            totalPairs,
            note: batch.note || `Производство · ${batch.id}`,
            createdAt: now,
          });
          events.push({
            id: uid("ev"),
            date: now.slice(0, 10),
            type: "incoming",
            pairs: totalPairs,
            sum: 0,
            note: `Готовый крой → склад: ${batch.id}`,
            incomingId,
          });
        }

        set({
          stock: nextStock,
          incoming,
          events,
          productionBatches: state.productionBatches.map((entry) =>
            entry.id === batchId ? updated : entry,
          ),
        });
        return true;
      },

      cancelProductionBatch: (batchId) => {
        const state = get();
        const batch = state.productionBatches.find((entry) => entry.id === batchId);
        if (!batch || !isActiveProductionStage(batch.stage)) return false;
        const now = new Date().toISOString();
        set({
          productionBatches: state.productionBatches.map((entry) =>
            entry.id === batchId
              ? {
                  ...entry,
                  stage: "cancelled",
                  updatedAt: now,
                  history: [...entry.history, { stage: "cancelled", at: now }],
                }
              : entry,
          ),
        });
        return true;
      },

      importState: (raw) => {
        if (!raw || typeof raw !== "object") return false;
        const d = raw as Partial<WarehouseState>;
        if (
          !d.stock?.white ||
          !d.stock?.black ||
          !Array.isArray(d.clients) ||
          !Array.isArray(d.orders)
        )
          return false;
        // An exported backup must be restored exactly. Historical seed fixes
        // belong to the persisted-store migration below; applying them during
        // import can unexpectedly replace a user's current stock.
        const next: WarehouseState = {
          stock: normalizeStock(d.stock),
          clients: d.clients,
          orders: d.orders,
          payments: d.payments ?? [],
          incoming: d.incoming ?? [],
          events: d.events ?? [],
          cash: d.cash ?? [],
          cashOpening: d.cashOpening ?? 0,
          costs: { ...SEED.costs, ...d.costs },
          lowThreshold: d.lowThreshold ?? 30,
          dataRev: d.dataRev ?? 0,
          boxes: ensureBoxes(d.boxes),
          payables: d.payables ?? [],
          workers: d.workers ?? [],
          productionBatches: normalizeProductionBatches(d.productionBatches),
        };
        set(next);
        return true;
      },
    }),
    {
      name: "cheshki_erp_v1",
      version: 34,
      migrate: (persisted, version) => {
        const state = persisted as WarehouseState;
        if (!state?.stock?.white) return SEED;

        // The first public Railway build accidentally shipped a private dated
        // snapshot as its browser default. Replace only that exact legacy
        // snapshot on upgrade; user imports and all other persisted states are
        // preserved verbatim.
        if (version < 32 && state.dataRev === LEGACY_PRIVATE_DATA_REV) return SEED;

        if (version < 33) {
          return {
            ...state,
            stock: normalizeStock(state.stock),
            boxes: ensureBoxes(state.boxes),
            productionBatches: normalizeProductionBatches(state.productionBatches),
          };
        }

        if (version < 34) {
          return {
            ...state,
            productionBatches: normalizeProductionBatches(state.productionBatches),
          };
        }

        return state;
      },
    },
  ),
);

export function emptyCart(): Cart {
  return Object.fromEntries(COLORS.map((color) => [color, emptySizeMap()])) as Cart;
}

export { PACK, SELL_PRICE };
