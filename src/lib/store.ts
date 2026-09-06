import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DATA_REV, SEED } from "./seed";
import { applyPendingFixes, applyWhiteIncoming0817, payMuzrab0818, reassembleMuzrab0817, renameMamaToSherzod, shipMama0817, shipMuzrab0817, transferDilshodToMurod } from "./migrations";
import { ensureBoxes, type BoxId } from "./boxes";
import {
  COLORS,
  PACK,
  SELL_PRICE,
  type Color,
  type Costs,
  type CashKind,
  type OrderItem,
  type WarehouseState,
  type Worker,
  type WorkerRole,
} from "./types";
import { emptySizeMap, todayISO, uid } from "./format";
import { orderDebt } from "./stats";

type Cart = Record<Color, Record<number, number>>;

type Actions = {
  addClient: (data: { name: string; shop?: string; phone?: string; note?: string }) => string;
  updateClient: (id: string, patch: Partial<{ name: string; shop: string; phone: string; note: string }>) => void;
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
  cancelOrder: (orderId: string) => void;
  addPayment: (input: { clientId: string; amount: number; note?: string; date?: string; orderId?: string }) => void;
  addCash: (input: { kind: CashKind; amount: number; person?: string; note?: string; date?: string; clientId?: string }) => void;
  deleteCash: (id: string) => void;
  setCashOpening: (n: number) => void;
  addPayable: (input: { person: string; amount: number; note?: string; date?: string; workerId?: string }) => void;
  payPayable: (id: string, amount?: number) => void;
  addWorker: (data: { name: string; role?: WorkerRole; phone?: string; note?: string }) => string;
  payWorker: (workerId: string, amount: number, note?: string, date?: string) => void;
  addWorkerDebt: (workerId: string, amount: number, note?: string, date?: string) => void;
  setCosts: (patch: Partial<Costs>) => void;
  setLowThreshold: (n: number) => void;
  setBox: (color: Color, size: number, box: BoxId) => void;
  resetSeed: () => void;
  loadOfficial: () => void;
  importState: (raw: unknown) => boolean;
};

export type Store = WarehouseState & Actions;

function cartToItems(cart: Cart): OrderItem[] {
  const items: OrderItem[] = [];
  for (const color of COLORS) {
    for (let size = 14; size <= 28; size++) {
      const qty = cart[color][size] ?? 0;
      if (qty > 0) items.push({ color, size, qty });
    }
  }
  return items;
}

export { cartToItems };

export function snapshotOf(s: WarehouseState): WarehouseState {
  return {
    stock: s.stock,
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
  };
}

export function applyOfficialSeed(_s?: WarehouseState): WarehouseState {
  return { ...SEED, cash: [...SEED.cash], payments: [...SEED.payments], events: [...SEED.events] };
}

export const useWarehouse = create<Store>()(
  persist(
    (set, get) => ({
      ...SEED,

      addClient: ({ name, shop = "", phone = "", note = "" }) => {
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
        set((s) => ({
          clients: s.clients.map((c) => (c.id === id ? { ...c, ...patch } : c)),
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
        set((s) => ({
          stock: {
            ...s.stock,
            [color]: {
              ...s.stock[color],
              [size]: Math.max(0, (s.stock[color][size] ?? 0) + delta),
            },
          },
        }));
      },

      setStock: (color, size, value) => {
        set((s) => ({
          stock: {
            ...s.stock,
            [color]: { ...s.stock[color], [size]: Math.max(0, Math.round(value) || 0) },
          },
        }));
      },

      addIncoming: (color, items, note = "", date = todayISO()) => {
        const list = Object.entries(items)
          .map(([size, qty]) => ({ size: Number(size), qty }))
          .filter((i) => i.qty > 0);
        if (!list.length) return;
        const totalPairs = list.reduce((a, i) => a + i.qty, 0);
        const id = uid("in");
        set((s) => {
          const next = { ...s.stock[color] };
          for (const i of list) next[i.size] = (next[i.size] ?? 0) + i.qty;
          return {
            stock: { ...s.stock, [color]: next },
            incoming: [...s.incoming, { id, date, color, items: list, totalPairs, note }],
            events: [
              ...s.events,
              {
                id: uid("ev"),
                date,
                type: "incoming" as const,
                pairs: totalPairs,
                sum: 0,
                note: note || `Приход ${color}`,
                incomingId: id,
              },
            ],
          };
        });
      },

      shipOrder: ({ clientId, items, note = "", date = todayISO() }) => {
        if (!items.length) return null;
        const s = get();
        const shipped: OrderItem[] = [];
        const missing: OrderItem[] = [];
        const nextStock: WarehouseState["stock"] = {
          white: { ...s.stock.white },
          black: { ...s.stock.black },
          gold: { ...s.stock.gold },
        };

        for (const item of items) {
          const have = nextStock[item.color][item.size] ?? 0;
          const take = Math.min(have, item.qty);
          const miss = item.qty - take;
          if (take > 0) {
            nextStock[item.color][item.size] = have - take;
            shipped.push({ color: item.color, size: item.size, qty: take });
          }
          if (miss > 0) missing.push({ color: item.color, size: item.size, qty: miss });
        }

        const totalPairs = shipped.reduce((a, i) => a + i.qty, 0);
        if (totalPairs === 0 && missing.length === 0) return null;

        const orderId = uid("o");
        const totalSum = totalPairs * SELL_PRICE;
        const client = s.clients.find((c) => c.id === clientId);

        set({
          stock: nextStock,
          orders: [
            ...s.orders,
            {
              id: orderId,
              clientId,
              date,
              items: shipped,
              missing,
              totalPairs,
              totalSum,
              paidSum: 0,
              status: "shipped",
              note,
              createdAt: new Date().toISOString(),
            },
          ],
          events: [
            ...s.events,
            {
              id: uid("ev"),
              date,
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

      cancelOrder: (orderId) => {
        const s = get();
        const o = s.orders.find((x) => x.id === orderId);
        if (!o || o.status === "cancelled") return;
        const nextStock = {
          white: { ...s.stock.white },
          black: { ...s.stock.black },
          gold: { ...s.stock.gold },
        };
        for (const i of o.items) {
          nextStock[i.color][i.size] = (nextStock[i.color][i.size] ?? 0) + i.qty;
        }
        const refund = o.paidSum;
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
                    id: uid("p"),
                    clientId: o.clientId,
                    orderId,
                    date: todayISO(),
                    amount: -refund,
                    note: "Возврат при отмене",
                  },
                ]
              : s.payments,
          events: [
            ...s.events,
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
      },

      addPayment: ({ clientId, amount, note = "", date = todayISO(), orderId }) => {
        if (amount <= 0) return;
        const s = get();
        let left = amount;
        const next = s.orders.map((o) => ({ ...o }));
        const targets = next
          .filter((o) => o.clientId === clientId && o.status === "shipped" && orderDebt(o) > 0)
          .filter((o) => (orderId ? o.id === orderId : true))
          .sort((a, b) => a.date.localeCompare(b.date));

        for (const o of targets) {
          if (left <= 0) break;
          const debt = orderDebt(o);
          const take = Math.min(debt, left);
          o.paidSum += take;
          left -= take;
        }

        const client = s.clients.find((c) => c.id === clientId);
        const applied = amount - left;
        if (applied <= 0) return;
        const payId = uid("p");

        set({
          orders: next,
          payments: [
            ...s.payments,
            {
              id: payId,
              clientId,
              orderId,
              date,
              amount: applied,
              note,
            },
          ],
          cash: [
            ...(s.cash ?? []),
            {
              id: uid("k"),
              date,
              kind: "income",
              amount: applied,
              person: client ? client.name : "",
              note: note || (client ? `Оплата: ${client.name}` : "Оплата клиента"),
              paymentId: payId,
              createdAt: new Date().toISOString(),
            },
          ],
          events: [
            ...s.events,
            {
              id: uid("ev"),
              date,
              type: "payment",
              pairs: 0,
              sum: applied,
              note: note || "Оплата",
              clientId,
              orderId,
            },
          ],
        });
      },

      addCash: ({ kind, amount, person = "", note = "", date = todayISO(), clientId }) => {
        const n = Math.round(Math.abs(amount));
        if (n <= 0) return;
        if (kind === "income" && clientId) {
          get().addPayment({ clientId, amount: n, note: note || "Оплата из кассы", date });
          return;
        }
        set((s) => ({
          cash: [
            ...(s.cash ?? []),
            {
              id: uid("k"),
              date,
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
          const cash = (s.cash ?? []).filter((t) => t.id !== id);
          if (!row?.paymentId) return { cash };
          const pay = s.payments.find((p) => p.id === row.paymentId);
          const payments = s.payments.filter((p) => p.id !== row.paymentId);
          let left = pay?.amount ?? row.amount;
          const orders = s.orders.map((o) => ({ ...o }));
          const targets = orders
            .filter((o) => o.clientId === pay?.clientId || o.id === pay?.orderId)
            .sort((a, b) => b.date.localeCompare(a.date));
          for (const o of targets) {
            if (left <= 0) break;
            const take = Math.min(o.paidSum, left);
            o.paidSum -= take;
            left -= take;
          }
          return { cash, payments, orders };
        });
      },

      setCashOpening: (n) => set({ cashOpening: Math.max(0, Math.round(n) || 0) }),

      addPayable: ({ person, amount, note = "", date = todayISO(), workerId }) => {
        const n = Math.round(Math.abs(amount));
        if (n <= 0 || !person.trim()) return;
        set((s) => ({
          payables: [
            ...(s.payables ?? []),
            { id: uid("d"), person: person.trim(), amount: n, paidSum: 0, note: note.trim(), date, workerId },
          ],
        }));
      },

      payPayable: (id, amount) => {
        const s = get();
        const row = (s.payables ?? []).find((p) => p.id === id);
        if (!row) return;
        const left = Math.max(0, row.amount - row.paidSum);
        const n = Math.min(left, Math.round(Math.abs(amount ?? left)));
        if (n <= 0) return;
        set({
          payables: (s.payables ?? []).map((p) => (p.id === id ? { ...p, paidSum: p.paidSum + n } : p)),
          cash: [
            ...(s.cash ?? []),
            {
              id: uid("k"),
              date: todayISO(),
              kind: "worker",
              amount: n,
              person: row.person,
              note: row.note || "Закрыл долг работнику",
              workerId: row.workerId,
              createdAt: new Date().toISOString(),
            },
          ],
        });
      },

      addWorker: ({ name, role = "other", phone = "", note = "" }) => {
        const id = uid("w");
        set((s) => ({
          workers: [
            ...(s.workers ?? []),
            { id, name: name.trim(), role, phone: phone.trim(), note: note.trim(), createdAt: new Date().toISOString() },
          ],
        }));
        return id;
      },

      payWorker: (workerId, amount, note = "", date = todayISO()) => {
        const n = Math.round(Math.abs(amount));
        if (n <= 0) return;
        const s = get();
        const w = (s.workers ?? []).find((x) => x.id === workerId);
        if (!w) return;
        const open = (s.payables ?? []).find((p) => p.workerId === workerId && p.amount - p.paidSum > 0);
        if (open) {
          get().payPayable(open.id, n);
          return;
        }
        set({
          cash: [
            ...(s.cash ?? []),
            {
              id: uid("k"),
              date,
              kind: "worker",
              amount: n,
              person: w.name,
              note: note.trim() || "Зарплата",
              workerId,
              createdAt: new Date().toISOString(),
            },
          ],
        });
      },

      addWorkerDebt: (workerId, amount, note = "", date = todayISO()) => {
        const w = get().workers.find((x) => x.id === workerId);
        if (!w) return;
        get().addPayable({ person: w.name, amount, note: note || "Долг работнику", date, workerId });
      },

      setCosts: (patch) => set((s) => ({ costs: { ...s.costs, ...patch } })),
      setLowThreshold: (n) => set({ lowThreshold: Math.max(0, n) }),
      setBox: (color, size, box) =>
        set((s) => ({
          boxes: {
            ...ensureBoxes(s.boxes),
            [color]: { ...ensureBoxes(s.boxes)[color], [size]: box },
          },
        })),
      resetSeed: () => set({ ...SEED }),
      loadOfficial: () => set((s) => applyOfficialSeed(s)),

      importState: (raw) => {
        if (!raw || typeof raw !== "object") return false;
        const d = raw as Partial<WarehouseState>;
        if (!d.stock || !d.clients || !d.orders) return false;
        const next = applyPendingFixes({
          stock: d.stock,
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
        });
        set(next);
        return true;
      },
    }),
    {
      name: "cheshki_erp_v1",
      version: 30,
      migrate: (persisted, version) => {
        let s = persisted as WarehouseState;
        if (!s?.stock?.white) return s;
        if (version < 2) s = applyWhiteIncoming0817(s);
        if (version < 3) s = transferDilshodToMurod(s);
        if (version < 4) s = shipMuzrab0817(s);
        if (version < 5) s = reassembleMuzrab0817(s);
        if (version < 6) s = shipMama0817(s);
        if (version < 7) s = renameMamaToSherzod(s);
        if (version < 8) s = { ...s, cash: s.cash ?? [], cashOpening: s.cashOpening ?? 0 };
        if (version < 9) s = { ...s, cash: s.cash ?? [], cashOpening: s.cashOpening ?? 0, dataRev: s.dataRev ?? 0 };
        if (version < 10) s = payMuzrab0818(s);
        return applyPendingFixes(s);
      },
    },
  ),
);

export function emptyCart(): Cart {
  return {
    white: emptySizeMap(),
    black: emptySizeMap(),
    gold: emptySizeMap(),
  };
}

export { PACK, SELL_PRICE };
