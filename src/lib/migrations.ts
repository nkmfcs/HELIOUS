import { ensureBoxes, moveWhite1719ToBox1 } from "./boxes";
import type { Color, OrderItem, WarehouseState } from "./types";

const WHITE_IN_0817: Record<number, number> = { 15: 80, 16: 80, 17: 50, 18: 50, 19: 50, 26: 80 };

export function applyWhiteIncoming0817(s: WarehouseState): WarehouseState {
  if ((s.incoming ?? []).some((i) => i.id === "in-white-0817")) return s;
  const white = { ...s.stock.white };
  for (const [size, qty] of Object.entries(WHITE_IN_0817)) {
    const n = Number(size);
    white[n] = (white[n] ?? 0) + qty;
  }
  return {
    ...s,
    stock: { ...s.stock, white },
    incoming: [
      ...(s.incoming ?? []),
      {
        id: "in-white-0817",
        date: "2026-08-17",
        color: "white",
        items: Object.entries(WHITE_IN_0817).map(([size, qty]) => ({ size: Number(size), qty })),
        totalPairs: 390,
        note: "Приход белых 17.08",
      },
    ],
    events: [
      ...(s.events ?? []),
      {
        id: "ev-in-w-0817",
        date: "2026-08-17",
        type: "incoming",
        pairs: 390,
        sum: 0,
        note: "Приход белых",
        incomingId: "in-white-0817",
      },
    ],
  };
}

function mergeItems(a: OrderItem[], b: OrderItem[]): OrderItem[] {
  const map = new Map<string, OrderItem>();
  for (const i of [...a, ...b]) {
    const key = `${i.color}-${i.size}`;
    const prev = map.get(key);
    map.set(key, { ...i, qty: (prev?.qty ?? 0) + i.qty });
  }
  const order: Color[] = ["white", "black", "gold"];
  return [...map.values()].sort((x, y) => {
    const c = order.indexOf(x.color) - order.indexOf(y.color);
    return c !== 0 ? c : x.size - y.size;
  });
}

export function transferDilshodToMurod(s: WarehouseState): WarehouseState {
  const dil = s.orders.find((o) => o.id === "o-dilshod" && o.status === "shipped" && o.clientId === "c-dilshod");
  const murod = s.orders.find((o) => o.id === "o-murod");
  if (!dil || !murod) return s;

  const gold = dil.items.filter((i) => i.color === "gold");
  const dilKeep = dil.items.filter((i) => i.color !== "gold");
  const items = mergeItems(murod.items, dilKeep);
  const missing = mergeItems(murod.missing, dil.missing);
  const totalPairs = items.reduce((n, i) => n + i.qty, 0);
  const totalSum = totalPairs * 18_000;

  const goldStock = { ...s.stock.gold };
  for (const i of gold) goldStock[i.size] = (goldStock[i.size] ?? 0) + i.qty;

  return {
    ...s,
    stock: { ...s.stock, gold: goldStock },
    clients: s.clients.map((c) => {
      if (c.id === "c-dilshod") {
        return { ...c, note: "Заказ забрал Мурод. Золотые остались на складе." };
      }
      if (c.id === "c-murod") {
        return { ...c, note: "Взял свой заказ и заказ Дильшода. Золотые не брал. Деньги не отдал." };
      }
      return c;
    }),
    orders: [
      {
        ...murod,
        items,
        missing,
        totalPairs,
        totalSum,
        paidSum: (murod.paidSum || 0) + (dil.paidSum || 0),
        note: "Свой заказ + заказ Дильшода. Золотые 21 и 28 по 5 пар остались на складе. Деньги не отдал.",
      },
      ...s.orders.filter((o) => o.id !== "o-murod" && o.id !== "o-dilshod"),
    ],
    events: [
      ...s.events
        .filter((e) => e.id !== "ev-o-d" && e.orderId !== "o-dilshod")
        .map((e) =>
          e.id === "ev-o-m" || e.orderId === "o-murod"
            ? {
                ...e,
                pairs: totalPairs,
                sum: totalSum,
                note: "Мурод Динамо — свой + заказ Дильшода (без золотых)",
                clientId: "c-murod",
                orderId: "o-murod",
              }
            : e,
        ),
    ],
  };
}

export function shipMuzrab0817(s: WarehouseState): WarehouseState {
  if (s.orders.some((o) => o.id === "o-muzrab")) return s;

  const need = 10;
  const white = { ...s.stock.white };
  const black = { ...s.stock.black };
  const items: OrderItem[] = [];
  const missing: OrderItem[] = [];

  for (const color of ["white", "black"] as const) {
    const stock = color === "white" ? white : black;
    for (let size = 14; size <= 28; size++) {
      const have = stock[size] ?? 0;
      const take = Math.min(need, have);
      const lack = need - take;
      if (take > 0) {
        items.push({ color, size, qty: take });
        stock[size] = have - take;
      }
      if (lack > 0) missing.push({ color, size, qty: lack });
    }
  }

  const totalPairs = items.reduce((n, i) => n + i.qty, 0);
  const totalSum = totalPairs * 18_000;
  const clients = s.clients.some((c) => c.id === "c-muzrab")
    ? s.clients
    : [
        ...s.clients,
        {
          id: "c-muzrab",
          name: "Музраб",
          shop: "Старый Динамо",
          phone: "",
          note: "Заказ 17.08. Деньги не отдал.",
          createdAt: "2026-08-17T12:50:00",
        },
      ];

  return {
    ...s,
    stock: { ...s.stock, white, black },
    clients,
    orders: [
      ...s.orders,
      {
        id: "o-muzrab",
        clientId: "c-muzrab",
        date: "2026-08-17",
        items,
        missing,
        totalPairs,
        totalSum,
        paidSum: 0,
        status: "shipped",
        note: "Белые и чёрные 14–28 по 10 пар. Собрали что было, остальное в нехватке. Деньги не отдал.",
        createdAt: "2026-08-17T12:50:00",
      },
    ],
    events: [
      ...s.events,
      {
        id: "ev-o-muzrab",
        date: "2026-08-17",
        type: "order",
        pairs: totalPairs,
        sum: totalSum,
        note: "Музраб Старый Динамо",
        clientId: "c-muzrab",
        orderId: "o-muzrab",
      },
    ],
  };
}

const IN_WHITE_PM: Record<number, number> = { 14: 30, 15: 20, 19: 5, 20: 30, 21: 25, 22: 5, 27: 5, 28: 45 };
const IN_BLACK_PM: Record<number, number> = { 17: 40, 18: 10, 19: 35, 20: 50, 21: 105, 22: 20, 23: 70, 24: 30 };

function addSizes(base: Record<number, number>, add: Record<number, number>) {
  const next = { ...base };
  for (const [size, qty] of Object.entries(add)) {
    const n = Number(size);
    next[n] = (next[n] ?? 0) + qty;
  }
  return next;
}

export function reassembleMuzrab0817(s: WarehouseState): WarehouseState {
  if ((s.incoming ?? []).some((i) => i.id === "in-white-0817pm")) return s;

  const white = { ...s.stock.white };
  const black = { ...s.stock.black };
  const old = s.orders.find((o) => o.id === "o-muzrab");
  if (old) {
    for (const i of old.items) {
      if (i.color === "white") white[i.size] = (white[i.size] ?? 0) + i.qty;
      if (i.color === "black") black[i.size] = (black[i.size] ?? 0) + i.qty;
    }
  }

  const whiteAfter = addSizes(white, IN_WHITE_PM);
  const blackAfter = addSizes(black, IN_BLACK_PM);

  const items: OrderItem[] = [];
  for (let size = 14; size <= 28; size++) {
    items.push({ color: "white", size, qty: 10 });
    whiteAfter[size] = (whiteAfter[size] ?? 0) - 10;
  }
  for (let size = 14; size <= 27; size++) {
    items.push({ color: "black", size, qty: 10 });
    blackAfter[size] = (blackAfter[size] ?? 0) - 10;
  }

  const missing: OrderItem[] = [{ color: "black", size: 28, qty: 10 }];
  const totalPairs = 290;
  const totalSum = 5_220_000;

  const clients = s.clients.some((c) => c.id === "c-muzrab")
    ? s.clients.map((c) =>
        c.id === "c-muzrab" ? { ...c, note: "Собрал 17.08: белые все, чёрные все кроме 28. Деньги не отдал." } : c,
      )
    : [
        ...s.clients,
        {
          id: "c-muzrab",
          name: "Музраб",
          shop: "Старый Динамо",
          phone: "",
          note: "Собрал 17.08: белые все, чёрные все кроме 28. Деньги не отдал.",
          createdAt: "2026-08-17T15:00:00",
        },
      ];

  const order = {
    id: "o-muzrab",
    clientId: "c-muzrab",
    date: "2026-08-17",
    items,
    missing,
    totalPairs,
    totalSum,
    paidSum: 0,
    status: "shipped" as const,
    note: "Собрал сейчас: белые 14–28 все по 10, чёрные 14–27 по 10. Чёрный 28 не нашёл. Деньги не отдал.",
    createdAt: "2026-08-17T15:00:00",
  };

  return {
    ...s,
    stock: { ...s.stock, white: whiteAfter, black: blackAfter },
    clients,
    orders: [...s.orders.filter((o) => o.id !== "o-muzrab"), order],
    incoming: [
      ...(s.incoming ?? []),
      {
        id: "in-white-0817pm",
        date: "2026-08-17",
        color: "white",
        items: Object.entries(IN_WHITE_PM).map(([size, qty]) => ({ size: Number(size), qty })),
        totalPairs: 165,
        note: "Приход белых 17.08 вечер",
      },
      {
        id: "in-black-0817pm",
        date: "2026-08-17",
        color: "black",
        items: Object.entries(IN_BLACK_PM).map(([size, qty]) => ({ size: Number(size), qty })),
        totalPairs: 360,
        note: "Приход чёрных 17.08 вечер",
      },
    ],
    events: [
      ...s.events.filter((e) => e.id !== "ev-o-muzrab"),
      {
        id: "ev-in-w-0817pm",
        date: "2026-08-17",
        type: "incoming",
        pairs: 165,
        sum: 0,
        note: "Приход белых",
        incomingId: "in-white-0817pm",
      },
      {
        id: "ev-in-b-0817pm",
        date: "2026-08-17",
        type: "incoming",
        pairs: 360,
        sum: 0,
        note: "Приход чёрных",
        incomingId: "in-black-0817pm",
      },
      {
        id: "ev-o-muzrab",
        date: "2026-08-17",
        type: "order",
        pairs: totalPairs,
        sum: totalSum,
        note: "Музраб Старый Динамо",
        clientId: "c-muzrab",
        orderId: "o-muzrab",
      },
    ],
  };
}

const MAMA_WHITE: Record<number, number> = {
  15: 5, 16: 5, 17: 10, 18: 10, 19: 20, 20: 20, 21: 20, 22: 20, 23: 10, 24: 5, 25: 5, 26: 5, 28: 5,
};
const MAMA_BLACK: Record<number, number> = {
  14: 5, 15: 5, 18: 10, 19: 15, 20: 10, 21: 10, 22: 10, 23: 10, 24: 5, 25: 10, 26: 10, 27: 5, 28: 5,
};

export function shipMama0817(s: WarehouseState): WarehouseState {
  if (s.orders.some((o) => o.id === "o-mama" || o.id === "o-sherzod")) return s;

  const white = { ...s.stock.white };
  const black = { ...s.stock.black };
  const items: OrderItem[] = [];
  const missing: OrderItem[] = [];

  for (const [size, need] of Object.entries(MAMA_WHITE)) {
    const n = Number(size);
    const have = white[n] ?? 0;
    const take = Math.min(need, have);
    if (take > 0) {
      items.push({ color: "white", size: n, qty: take });
      white[n] = have - take;
    }
    if (need - take > 0) missing.push({ color: "white", size: n, qty: need - take });
  }
  for (const [size, need] of Object.entries(MAMA_BLACK)) {
    const n = Number(size);
    const have = black[n] ?? 0;
    const take = Math.min(need, have);
    if (take > 0) {
      items.push({ color: "black", size: n, qty: take });
      black[n] = have - take;
    }
    if (need - take > 0) missing.push({ color: "black", size: n, qty: need - take });
  }

  const totalPairs = items.reduce((n, i) => n + i.qty, 0);
  const totalSum = totalPairs * 18_000;
  const clients = s.clients.some((c) => c.id === "c-sherzod" || c.id === "c-mama")
    ? s.clients
    : [
        ...s.clients,
        {
          id: "c-sherzod",
          name: "Шерзод",
          shop: "Паркент",
          phone: "",
          note: "Заказ 17.08. Упаковки по 5. Деньги не отметил.",
          createdAt: "2026-08-17T23:31:00",
        },
      ];

  const clientId = s.clients.some((c) => c.id === "c-mama") ? "c-mama" : "c-sherzod";

  return {
    ...s,
    stock: { ...s.stock, white, black },
    clients,
    orders: [
      ...s.orders,
      {
        id: "o-sherzod",
        clientId,
        date: "2026-08-17",
        items,
        missing,
        totalPairs,
        totalSum,
        paidSum: 0,
        status: "shipped",
        note: "Шерзод Паркентский. Цифры — упаковки по 5 пар. Собрали полностью.",
        createdAt: "2026-08-17T23:31:00",
      },
    ],
    events: [
      ...s.events,
      {
        id: "ev-o-sherzod",
        date: "2026-08-17",
        type: "order",
        pairs: totalPairs,
        sum: totalSum,
        note: "Шерзод Паркентский",
        clientId,
        orderId: "o-sherzod",
      },
    ],
  };
}

export function renameMamaToSherzod(s: WarehouseState): WarehouseState {
  const hasOld = s.clients.some((c) => c.id === "c-mama") || s.orders.some((o) => o.id === "o-mama" || o.clientId === "c-mama");
  const already = s.clients.some((c) => c.id === "c-sherzod" && c.name === "Шерзод");
  if (already && !hasOld) return s;

  return {
    ...s,
    clients: [
      ...s.clients
        .filter((c) => c.id !== "c-mama")
        .map((c) => (c.id === "c-sherzod" ? { ...c, name: "Шерзод", shop: "Паркент" } : c)),
      ...(s.clients.some((c) => c.id === "c-sherzod")
        ? []
        : [
            {
              id: "c-sherzod",
              name: "Шерзод",
              shop: "Паркент",
              phone: "",
              note: "Заказ 17.08. Упаковки по 5. Деньги не отметил.",
              createdAt: "2026-08-17T23:31:00",
            },
          ]),
    ],
    orders: s.orders.map((o) =>
      o.id === "o-mama" || o.clientId === "c-mama"
        ? {
            ...o,
            id: o.id === "o-mama" ? "o-sherzod" : o.id,
            clientId: "c-sherzod",
            note: "Шерзод Паркентский. Цифры — упаковки по 5 пар. Собрали полностью.",
          }
        : o,
    ),
    events: s.events.map((e) =>
      e.id === "ev-o-mama" || e.clientId === "c-mama" || e.orderId === "o-mama"
        ? {
            ...e,
            id: e.id === "ev-o-mama" ? "ev-o-sherzod" : e.id,
            clientId: "c-sherzod",
            orderId: e.orderId === "o-mama" ? "o-sherzod" : e.orderId,
            note: "Шерзод Паркентский",
          }
        : e,
    ),
  };
}

export function payMuzrab0818(s: WarehouseState): WarehouseState {
  const order = s.orders.find((o) => o.id === "o-muzrab");
  const alreadyPaid =
    (s.payments ?? []).some((p) => p.id === "p-muzrab") ||
    Boolean(order && order.totalSum > 0 && order.paidSum >= order.totalSum);
  if (alreadyPaid) {
    if (!order || order.paidSum >= order.totalSum) return s;
    return {
      ...s,
      orders: s.orders.map((o) => (o.id === "o-muzrab" ? { ...o, paidSum: o.totalSum } : o)),
    };
  }

  const amount = order?.totalSum ?? 5_220_000;
  const cash = s.cash ?? [];
  const hasCash = cash.some(
    (t) =>
      t.id === "k-muzrab" ||
      t.paymentId === "p-muzrab" ||
      (t.kind === "income" && t.amount === amount && /музраб/i.test(`${t.person} ${t.note}`)),
  );

  return {
    ...s,
    clients: s.clients.map((c) =>
      c.id === "c-muzrab" ? { ...c, note: "Оплатил долг 18.08 полностью." } : c,
    ),
    orders: s.orders.map((o) =>
      o.id === "o-muzrab"
        ? { ...o, paidSum: o.totalSum, note: "Собрал 17.08. Долг закрыл 18.08." }
        : o,
    ),
    payments: [
      ...(s.payments ?? []),
      {
        id: "p-muzrab",
        clientId: "c-muzrab",
        orderId: "o-muzrab",
        date: "2026-08-18",
        amount,
        note: "Оплатил долг полностью",
      },
    ],
    cash: hasCash
      ? cash.map((t) =>
          t.id === "k-muzrab" ||
          (t.kind === "income" && t.amount === amount && /музраб/i.test(`${t.person} ${t.note}`))
            ? { ...t, paymentId: t.paymentId || "p-muzrab" }
            : t,
        )
      : [
          ...cash,
          {
            id: "k-muzrab",
            date: "2026-08-18",
            kind: "income",
            amount,
            person: "Музраб",
            note: "Оплата долга",
            paymentId: "p-muzrab",
            createdAt: "2026-08-18T00:50:00",
          },
        ],
    events: (s.events ?? []).some((e) => e.id === "ev-p-muzrab")
      ? s.events
      : [
          ...(s.events ?? []),
          {
            id: "ev-p-muzrab",
            date: "2026-08-18",
            type: "payment",
            pairs: 0,
            sum: amount,
            note: "Музраб оплатил долг",
            clientId: "c-muzrab",
            orderId: "o-muzrab",
          },
        ],
  };
}

function applyToOrders(orders: WarehouseState["orders"], clientId: string, amount: number) {
  let left = amount;
  const next = orders.map((o) => ({ ...o }));
  const targets = next
    .filter((o) => o.clientId === clientId && o.status === "shipped" && o.totalSum - o.paidSum > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  let lastOrderId: string | undefined;
  for (const o of targets) {
    if (left <= 0) break;
    const debt = Math.max(0, o.totalSum - o.paidSum);
    const take = Math.min(debt, left);
    o.paidSum += take;
    left -= take;
    lastOrderId = o.id;
  }
  return { orders: next, applied: amount - left, lastOrderId };
}

export function linkOrphanCashToDebts(s: WarehouseState): WarehouseState {
  let orders = s.orders.map((o) => ({ ...o }));
  let payments = [...(s.payments ?? [])];
  let cash = [...(s.cash ?? [])];
  let events = [...(s.events ?? [])];
  let changed = false;

  for (let i = 0; i < cash.length; i++) {
    const t = cash[i];
    if (t.kind !== "income" || t.paymentId) continue;
    const hay = `${t.person} ${t.note}`.toLowerCase();
    const client = s.clients.find((c) => c.name && hay.includes(c.name.toLowerCase()));
    if (!client) continue;
    const debt = orders
      .filter((o) => o.clientId === client.id && o.status === "shipped")
      .reduce((n, o) => n + Math.max(0, o.totalSum - o.paidSum), 0);
    if (debt <= 0) continue;

    const res = applyToOrders(orders, client.id, t.amount);
    if (res.applied <= 0) continue;
    orders = res.orders;
    const payId = `p-link-${t.id}`;
    if (!payments.some((p) => p.id === payId)) {
      payments.push({
        id: payId,
        clientId: client.id,
        orderId: res.lastOrderId,
        date: t.date,
        amount: res.applied,
        note: t.note || `Касса → ${client.name}`,
      });
    }
    cash[i] = { ...t, paymentId: payId, person: t.person || client.name };
    if (!events.some((e) => e.id === `ev-link-${t.id}`)) {
      events.push({
        id: `ev-link-${t.id}`,
        date: t.date,
        type: "payment",
        pairs: 0,
        sum: res.applied,
        note: `Касса: ${client.name}`,
        clientId: client.id,
        orderId: res.lastOrderId,
      });
    }
    changed = true;
  }

  return changed ? { ...s, orders, payments, cash, events } : s;
}

export function applyPendingFixes(s: WarehouseState): WarehouseState {
  if (!s?.stock?.white) return s;
  let next: WarehouseState = {
    ...s,
    cash: s.cash ?? [],
    cashOpening: s.cashOpening ?? 0,
    payments: s.payments ?? [],
    dataRev: s.dataRev ?? 0,
    boxes: ensureBoxes(s.boxes),
    payables: s.payables ?? [],
    workers: s.workers ?? [],
  };
  next = moveWhite1719ToBox1(next);
  next = fixSherzod245(next);
  next = applyBlackIncoming0819(next);
  next = settleMurodAndCutter0820(next);
  next = paySherzod0820(next);
  next = paySapuraAndThread0820(next);
  next = sapuraDebt0820(next);
  next = seedWorkers0820(next);
  next = applyPick0822(next);
  next = shipSaid0822(next);
  next = holdDilshod0825(next);
  next = settleAssemblies0825(next);
  next = paySaid0825(next);
  next = completeSewn0826(next);
  next = applyIncoming0831(next);
  next = catchUpPhone0902(next);
  next = linkOrphanCashToDebts(next);
  return next;
}

const PHONE_STOCK_0902 = {
  white: {
    14: 5, 15: 95, 16: 50, 17: 40, 18: 20, 19: 0,
    20: 20, 21: 20, 22: 60, 23: 0, 24: 30, 25: 70,
    26: 55, 27: 50, 28: 45,
  },
  black: {
    14: 25, 15: 55, 16: 70, 17: 120, 18: 165, 19: 70,
    20: 10, 21: 40, 22: 0, 23: 10, 24: 0, 25: 0,
    26: 15, 27: 15, 28: 0,
  },
};

export function catchUpPhone0902(s: WarehouseState): WarehouseState {
  if (s.clients.some((c) => /муаззам/i.test(c.name))) return s;
  if (s.orders.some((o) => o.id === "o-muazzam-0827")) return s;

  const gold = { ...s.stock.gold };
  return {
    ...s,
    stock: {
      white: { ...PHONE_STOCK_0902.white },
      black: { ...PHONE_STOCK_0902.black },
      gold,
    },
    clients: [
      ...s.clients,
      {
        id: "c-muazzam",
        name: "Муаззам опа",
        shop: "Абу сахий",
        phone: "",
        note: "Заказ 27.08 · 340 пар. Остаток долга 1 670 000.",
        createdAt: "2026-08-27T12:00:00",
      },
    ],
    orders: [
      ...s.orders,
      {
        id: "o-muazzam-0827",
        clientId: "c-muazzam",
        date: "2026-08-27",
        items: [
          { color: "white", size: 14, qty: 10 },
          { color: "white", size: 17, qty: 5 },
          { color: "white", size: 18, qty: 25 },
          { color: "white", size: 19, qty: 25 },
          { color: "white", size: 20, qty: 15 },
          { color: "white", size: 23, qty: 20 },
          { color: "white", size: 24, qty: 25 },
          { color: "white", size: 25, qty: 25 },
          { color: "white", size: 26, qty: 25 },
          { color: "white", size: 27, qty: 10 },
          { color: "black", size: 14, qty: 15 },
          { color: "black", size: 20, qty: 10 },
          { color: "black", size: 21, qty: 25 },
          { color: "black", size: 23, qty: 15 },
          { color: "black", size: 24, qty: 25 },
          { color: "black", size: 25, qty: 10 },
          { color: "black", size: 26, qty: 25 },
          { color: "black", size: 27, qty: 20 },
          { color: "black", size: 28, qty: 10 },
        ],
        missing: [
          { color: "white", size: 17, qty: 25 },
          { color: "white", size: 18, qty: 5 },
          { color: "white", size: 20, qty: 15 },
          { color: "white", size: 21, qty: 15 },
          { color: "white", size: 23, qty: 10 },
          { color: "white", size: 28, qty: 15 },
          { color: "black", size: 22, qty: 25 },
          { color: "black", size: 24, qty: 5 },
          { color: "black", size: 25, qty: 20 },
        ],
        totalPairs: 340,
        totalSum: 6_120_000,
        paidSum: 4_450_000,
        status: "shipped" as const,
        note: "Муаззам опа Абу сахий. Собрали 340, не хватило 135. Остаток 1 670 000.",
        createdAt: "2026-08-27T12:00:00",
      },
      {
        id: "o-sherzod-0831",
        clientId: "c-sherzod",
        date: "2026-08-31",
        items: [],
        missing: [],
        totalPairs: 125,
        totalSum: 2_250_000,
        paidSum: 0,
        status: "shipped" as const,
        note: "Шерзод 31.08 · 125 пар, не хватило 75.",
        createdAt: "2026-08-31T12:00:00",
      },
    ],
    payments: (s.payments ?? []).some((p) => p.id === "p-muazzam-0827")
      ? s.payments
      : [
          ...(s.payments ?? []),
          {
            id: "p-muazzam-0827",
            clientId: "c-muazzam",
            orderId: "o-muazzam-0827",
            date: "2026-08-27",
            amount: 4_450_000,
            note: "Частичная оплата, остаток 1 670 000",
          },
        ],
    cash: (s.cash ?? []).some((t) => t.id === "k-muazzam-0827")
      ? s.cash
      : [
          ...(s.cash ?? []),
          {
            id: "k-muazzam-0827",
            date: "2026-08-27",
            kind: "income" as const,
            amount: 4_450_000,
            person: "Муаззам опа",
            note: "Частичная оплата",
            paymentId: "p-muazzam-0827",
            createdAt: "2026-08-27T12:30:00",
          },
          {
            id: "k-sapura-1m",
            date: "2026-09-02",
            kind: "worker" as const,
            amount: 1_000_000,
            person: "Сапура опа швея",
            note: "Закрыли долг швее",
            workerId: "w-sapura",
            createdAt: "2026-09-02T12:00:00",
          },
        ],
    payables: (s.payables ?? []).map((p) =>
      p.id === "d-sapura" ? { ...p, paidSum: p.amount } : p,
    ),
  };
}

const WHITE_IN_0831: Record<number, number> = { 18: 20, 19: 20, 22: 10, 24: 45, 25: 65, 26: 30 };
const BLACK_IN_0831: Record<number, number> = { 22: 5, 25: 10, 28: 25 };

export function applyIncoming0831(s: WarehouseState): WarehouseState {
  if ((s.incoming ?? []).some((i) => i.id === "in-white-0831")) return s;
  const white = { ...s.stock.white };
  const black = { ...s.stock.black };
  for (const [size, qty] of Object.entries(WHITE_IN_0831)) {
    const n = Number(size);
    white[n] = (white[n] ?? 0) + qty;
  }
  for (const [size, qty] of Object.entries(BLACK_IN_0831)) {
    const n = Number(size);
    black[n] = (black[n] ?? 0) + qty;
  }
  return {
    ...s,
    stock: { ...s.stock, white, black },
    incoming: [
      ...(s.incoming ?? []),
      {
        id: "in-white-0831",
        date: "2026-08-31",
        color: "white",
        items: Object.entries(WHITE_IN_0831).map(([size, qty]) => ({ size: Number(size), qty })),
        totalPairs: 190,
        note: "Приход белых 31.08",
      },
      {
        id: "in-black-0831",
        date: "2026-08-31",
        color: "black",
        items: Object.entries(BLACK_IN_0831).map(([size, qty]) => ({ size: Number(size), qty })),
        totalPairs: 40,
        note: "Приход чёрных 31.08",
      },
    ],
    events: [
      ...(s.events ?? []),
      {
        id: "ev-in-w-0831",
        date: "2026-08-31",
        type: "incoming",
        pairs: 190,
        sum: 0,
        note: "Приход белых",
        incomingId: "in-white-0831",
      },
      {
        id: "ev-in-b-0831",
        date: "2026-08-31",
        type: "incoming",
        pairs: 40,
        sum: 0,
        note: "Приход чёрных",
        incomingId: "in-black-0831",
      },
    ],
  };
}

export function completeSewn0826(s: WarehouseState): WarehouseState {
  const dilshod = s.orders.find((o) => o.id === "o-dilshod-0825");
  const usmon = s.orders.find((o) => o.id === "o-usmon-0825");
  if (dilshod?.totalPairs === 275 && usmon?.totalPairs === 110) return s;

  let incoming = [...(s.incoming ?? [])];
  let events = [...(s.events ?? [])];
  const black = { ...s.stock.black };

  if (!incoming.some((i) => i.id === "in-black-sew-0826")) {
    black[22] = (black[22] ?? 0) + 15;
    black[25] = (black[25] ?? 0) + 10;
    black[28] = (black[28] ?? 0) + 10;
    incoming.push({
      id: "in-black-sew-0826",
      date: "2026-08-26",
      color: "black",
      items: [
        { size: 22, qty: 15 },
        { size: 25, qty: 10 },
        { size: 28, qty: 10 },
      ],
      totalPairs: 35,
      note: "Пошив под Дильшода и Усмона: 22, 25, 28",
    });
    events.push({
      id: "ev-in-b-sew-0826",
      date: "2026-08-26",
      type: "incoming",
      pairs: 35,
      sum: 0,
      note: "Пошив кора 22, 25, 28 под заказы",
      incomingId: "in-black-sew-0826",
    });
  }

  const orders = s.orders.map((o) => {
    if (o.id === "o-dilshod-0825" && o.totalPairs !== 275) {
      black[22] = Math.max(0, (black[22] ?? 0) - 10);
      black[25] = Math.max(0, (black[25] ?? 0) - 10);
      black[28] = Math.max(0, (black[28] ?? 0) - 10);
      const items = [
        ...o.items.filter((i) => !(i.color === "black" && [22, 25, 28].includes(i.size))),
        { color: "black" as const, size: 22, qty: 10 },
        { color: "black" as const, size: 25, qty: 10 },
        { color: "black" as const, size: 28, qty: 10 },
      ];
      return {
        ...o,
        items,
        missing: [],
        totalPairs: 275,
        totalSum: 4_950_000,
        note: "Весь заказ отдали 26.08. Недостающее кора 22, 25, 28 сшили. Деньги не дал.",
      };
    }
    if (o.id === "o-usmon-0825" && o.totalPairs !== 110) {
      black[22] = Math.max(0, (black[22] ?? 0) - 5);
      const has22 = o.items.some((i) => i.color === "black" && i.size === 22);
      return {
        ...o,
        items: has22 ? o.items : [...o.items, { color: "black" as const, size: 22, qty: 5 }],
        missing: [],
        totalPairs: 110,
        totalSum: 1_980_000,
        note: "Весь заказ отдали 26.08. Чёрный 22 сшили. Деньги не дал.",
      };
    }
    return o;
  });

  events = events.map((e) => {
    if (e.id === "ev-o-dilshod-0825") return { ...e, pairs: 275, sum: 4_950_000, note: "Дильшод Динамо · весь заказ 275 пар" };
    if (e.id === "ev-o-usmon-0825") return { ...e, pairs: 110, sum: 1_980_000, note: "Усмон · весь заказ 110 пар" };
    return e;
  });

  return {
    ...s,
    stock: { ...s.stock, black },
    incoming,
    orders,
    events,
    clients: s.clients.map((c) => {
      if (c.id === "c-dilshod") return { ...c, note: "Весь заказ отдали 26.08. Деньги не дал." };
      if (c.id === "c-usmon") return { ...c, note: "Весь заказ отдали 26.08. Деньги не дал." };
      return c;
    }),
  };
}

export function paySaid0825(s: WarehouseState): WarehouseState {
  if ((s.payments ?? []).some((p) => p.id === "p-said-0825")) return s;
  const order = s.orders.find((o) => o.id === "o-said-0822");
  if (!order) return s;
  if (order.paidSum >= 1_790_000) return s;
  const amount = 1_790_000;
  const hasCash = (s.cash ?? []).some(
    (t) => t.id === "k-said-0825" || (t.kind === "income" && t.amount === amount && /саид/i.test(`${t.person} ${t.note}`)),
  );
  return {
    ...s,
    clients: s.clients.map((c) =>
      c.id === "c-said-button" ? { ...c, note: "Дал 1 790 000, остаток 1 000 000." } : c,
    ),
    orders: s.orders.map((o) =>
      o.id === "o-said-0822"
        ? { ...o, paidSum: o.paidSum + amount, note: "Саид Чиланзар Button. 25.08 дал 1 790 000, остаток 1 000 000." }
        : o,
    ),
    payments: [
      ...(s.payments ?? []),
      {
        id: "p-said-0825",
        clientId: "c-said-button",
        orderId: "o-said-0822",
        date: "2026-08-25",
        amount,
        note: "Частичная оплата",
      },
    ],
    cash: hasCash
      ? s.cash
      : [
          ...(s.cash ?? []),
          {
            id: "k-said-0825",
            date: "2026-08-25",
            kind: "income",
            amount,
            person: "Саид",
            note: "Частичная оплата Button",
            paymentId: "p-said-0825",
            createdAt: "2026-08-25T23:16:00",
          },
        ],
    events: (s.events ?? []).some((e) => e.id === "ev-p-said-0825")
      ? s.events
      : [
          ...(s.events ?? []),
          {
            id: "ev-p-said-0825",
            date: "2026-08-25",
            type: "payment",
            pairs: 0,
            sum: amount,
            note: "Саид Button дал 1 790 000",
            clientId: "c-said-button",
            orderId: "o-said-0822",
          },
        ],
  };
}

const PICK_W_0822: Record<number, number> = {
  16: 5, 17: 5, 18: 5, 19: 5, 20: 5, 21: 5, 22: 10, 23: 10, 24: 10, 25: 10, 26: 5, 27: 5, 28: 5,
};
const PICK_B_0822: Record<number, number> = {
  16: 5, 17: 5, 18: 5, 19: 5, 20: 5, 21: 10, 23: 10, 24: 10, 25: 10, 27: 5,
};

export function applyPick0822(s: WarehouseState): WarehouseState {
  if ((s.events ?? []).some((e) => e.id === "ev-pick-0822")) return s;
  const white = { ...s.stock.white };
  const black = { ...s.stock.black };
  for (const [size, qty] of Object.entries(PICK_W_0822)) {
    const n = Number(size);
    white[n] = Math.max(0, (white[n] ?? 0) - qty);
  }
  for (const [size, qty] of Object.entries(PICK_B_0822)) {
    const n = Number(size);
    black[n] = Math.max(0, (black[n] ?? 0) - qty);
  }
  return {
    ...s,
    stock: { ...s.stock, white, black },
    events: [
      ...(s.events ?? []),
      {
        id: "ev-pick-0822",
        date: "2026-08-22",
        type: "order",
        pairs: 155,
        sum: 2_790_000,
        note: "Сборка 22.08: белые 85 + чёрные 70. Клиент не назван.",
      },
    ],
  };
}

export function shipSaid0822(s: WarehouseState): WarehouseState {
  if (s.orders.some((o) => o.id === "o-said-0822")) return s;
  let next = applyPick0822(s);
  const clients = next.clients.some((c) => c.id === "c-said-button")
    ? next.clients
    : [
        ...next.clients,
        {
          id: "c-said-button",
          name: "Саид",
          shop: "Чиланзар · Button",
          phone: "",
          note: "Забрал сборку 22.08. Деньги не отметил.",
          createdAt: "2026-08-22T13:37:00",
        },
      ];
  const items = [
    ...Object.entries(PICK_W_0822).map(([size, qty]) => ({ color: "white" as const, size: Number(size), qty })),
    ...Object.entries(PICK_B_0822).map(([size, qty]) => ({ color: "black" as const, size: Number(size), qty })),
  ];
  return {
    ...next,
    clients,
    orders: [
      ...next.orders,
      {
        id: "o-said-0822",
        clientId: "c-said-button",
        date: "2026-08-22",
        items,
        missing: [
          { color: "white", size: 21, qty: 5 },
          { color: "black", size: 22, qty: 10 },
          { color: "black", size: 28, qty: 5 },
        ],
        totalPairs: 155,
        totalSum: 2_790_000,
        paidSum: 0,
        status: "shipped",
        note: "Саид Чиланзар Button. Отдали собранное. Белый 21 недобрали 5, чёрный 22 и 28 не было.",
        createdAt: "2026-08-22T13:37:00",
      },
    ],
    events: (next.events ?? []).map((e) =>
      e.id === "ev-pick-0822"
        ? {
            ...e,
            note: "Саид Чиланзар Button · 155 пар",
            clientId: "c-said-button",
            orderId: "o-said-0822",
          }
        : e,
    ),
  };
}

const HOLD_W_0825: Record<number, number> = {
  17: 10, 18: 10, 19: 10, 20: 10, 21: 10, 22: 10, 23: 10, 24: 10, 25: 10, 26: 10, 27: 10, 28: 10,
};
const HOLD_B_0825: Record<number, number> = {
  17: 10, 18: 10, 19: 10, 20: 10, 21: 10, 23: 10, 24: 10, 25: 5, 26: 10, 27: 10,
};

export function holdDilshod0825(s: WarehouseState): WarehouseState {
  if (s.orders.some((o) => o.id === "o-dilshod-0825")) return s;
  const white = { ...s.stock.white };
  const black = { ...s.stock.black };
  for (const [size, qty] of Object.entries(HOLD_W_0825)) {
    const n = Number(size);
    white[n] = Math.max(0, (white[n] ?? 0) - qty);
  }
  for (const [size, qty] of Object.entries(HOLD_B_0825)) {
    const n = Number(size);
    black[n] = Math.max(0, (black[n] ?? 0) - qty);
  }
  const items = [
    ...Object.entries(HOLD_W_0825).map(([size, qty]) => ({ color: "white" as const, size: Number(size), qty })),
    ...Object.entries(HOLD_B_0825).map(([size, qty]) => ({ color: "black" as const, size: Number(size), qty })),
  ];
  return {
    ...s,
    stock: { ...s.stock, white, black },
    clients: s.clients.map((c) =>
      c.id === "c-dilshod" ? { ...c, note: "Закрепили новый заказ 25.08 — ещё не собирали. Долг открыт." } : c,
    ),
    orders: [
      ...s.orders,
      {
        id: "o-dilshod-0825",
        clientId: "c-dilshod",
        date: "2026-08-25",
        items,
        missing: [
          { color: "black", size: 22, qty: 10 },
          { color: "black", size: 25, qty: 5 },
          { color: "black", size: 28, qty: 10 },
        ],
        totalPairs: 215,
        totalSum: 3_870_000,
        paidSum: 0,
        status: "shipped",
        note: "Закрепили 25.08, ещё не собирали. Ок 17–28 по 10. Кора без 22 и 28, 25 только 5.",
        createdAt: "2026-08-25T20:12:00",
      },
    ],
    events: [
      ...(s.events ?? []),
      {
        id: "ev-o-dilshod-0825",
        date: "2026-08-25",
        type: "order",
        pairs: 215,
        sum: 3_870_000,
        note: "Дильшод Динамо · закрепили 215 пар, ещё не собирали",
        clientId: "c-dilshod",
        orderId: "o-dilshod-0825",
      },
    ],
  };
}

const USMON_W_0825: Record<number, number> = {
  15: 5, 16: 5, 17: 10, 18: 10, 19: 10, 20: 10, 21: 10, 22: 10, 23: 10, 24: 10, 26: 5,
};

export function settleAssemblies0825(s: WarehouseState): WarehouseState {
  if (s.orders.some((o) => o.id === "o-usmon-0825")) return s;

  const white = { ...s.stock.white };
  const black = { ...s.stock.black };
  const gold = { ...s.stock.gold };

  let orders = s.orders.map((o) => ({ ...o, items: [...o.items], missing: [...o.missing] }));
  const dilshod = orders.find((o) => o.id === "o-dilshod-0825");
  if (dilshod && dilshod.totalPairs !== 245) {
    if (dilshod.items.some((i) => i.color === "black" && i.size === 25)) {
      black[25] = (black[25] ?? 0) + 5;
    }
    gold[21] = Math.max(0, (gold[21] ?? 0) - 5);
    gold[28] = Math.max(0, (gold[28] ?? 0) - 5);
    dilshod.items = dilshod.items
      .filter((i) => !(i.color === "black" && i.size === 25))
      .concat([
        { color: "gold", size: 18, qty: 5 },
        { color: "gold", size: 19, qty: 5 },
        { color: "gold", size: 20, qty: 5 },
        { color: "gold", size: 21, qty: 5 },
        { color: "gold", size: 23, qty: 5 },
        { color: "gold", size: 25, qty: 5 },
        { color: "gold", size: 28, qty: 5 },
      ]);
    dilshod.missing = [
      { color: "black", size: 22, qty: 10 },
      { color: "black", size: 25, qty: 10 },
      { color: "black", size: 28, qty: 10 },
    ];
    dilshod.totalPairs = 245;
    dilshod.totalSum = 4_410_000;
    dilshod.note = "Собрали 245 пар. Кора 22, 25, 28 нет. Золотые 18–21, 23, 25, 28 по 5 — со старых остатков.";
  }

  for (const [size, qty] of Object.entries(USMON_W_0825)) {
    const n = Number(size);
    white[n] = Math.max(0, (white[n] ?? 0) - qty);
  }
  black[21] = Math.max(0, (black[21] ?? 0) - 5);
  black[25] = Math.max(0, (black[25] ?? 0) - 5);

  const clients = s.clients.some((c) => c.id === "c-usmon")
    ? s.clients
    : [
        ...s.clients,
        {
          id: "c-usmon",
          name: "Усмон",
          shop: "",
          phone: "",
          note: "Собрали 25.08 · 105 пар. Деньги не отметил.",
          createdAt: "2026-08-25T23:12:00",
        },
      ];

  const events = (s.events ?? []).map((e) =>
    e.id === "ev-o-dilshod-0825"
      ? { ...e, pairs: 245, sum: 4_410_000, note: "Дильшод Динамо · собрали 245 пар" }
      : e,
  );
  if (!events.some((e) => e.id === "ev-o-usmon-0825")) {
    events.push({
      id: "ev-o-usmon-0825",
      date: "2026-08-25",
      type: "order",
      pairs: 105,
      sum: 1_890_000,
      note: "Усмон · 105 пар",
      clientId: "c-usmon",
      orderId: "o-usmon-0825",
    });
  }

  return {
    ...s,
    stock: { ...s.stock, white, black, gold },
    clients: clients.map((c) =>
      c.id === "c-dilshod" ? { ...c, note: "Собрали 25.08 · 245 пар. Кора 22, 25, 28 нет. Долг открыт." } : c,
    ),
    orders: [
      ...orders,
      {
        id: "o-usmon-0825",
        clientId: "c-usmon",
        date: "2026-08-25",
        items: [
          ...Object.entries(USMON_W_0825).map(([size, qty]) => ({ color: "white" as const, size: Number(size), qty })),
          { color: "black", size: 21, qty: 5 },
          { color: "black", size: 25, qty: 5 },
        ],
        missing: [{ color: "black", size: 22, qty: 5 }],
        totalPairs: 105,
        totalSum: 1_890_000,
        paidSum: 0,
        status: "shipped",
        note: "Собрали 105 пар, чёрный 25 включили. Чёрный 22 не было.",
        createdAt: "2026-08-25T23:12:00",
      },
    ],
    events,
  };
}

const DEFAULT_WORKERS: WarehouseState["workers"] = [
  {
    id: "w-sapura",
    name: "Сапура опа",
    role: "sewing",
    phone: "",
    note: "Швея",
    createdAt: "2026-08-20T14:00:00",
  },
  {
    id: "w-tursunoy",
    name: "Турсуной",
    role: "sewing",
    phone: "",
    note: "Швея",
    createdAt: "2026-08-20T14:00:00",
  },
  {
    id: "w-said",
    name: "Саид",
    role: "packaging",
    phone: "",
    note: "Упаковка",
    createdAt: "2026-08-20T14:00:00",
  },
  {
    id: "w-dilshod-cut",
    name: "Дильшод",
    role: "cutting",
    phone: "",
    note: "Крой",
    createdAt: "2026-08-20T14:00:00",
  },
];

export function seedWorkers0820(s: WarehouseState): WarehouseState {
  let workers = [...(s.workers ?? [])];
  for (const w of DEFAULT_WORKERS) {
    if (!workers.some((x) => x.id === w.id)) workers.push(w);
  }

  const cash = (s.cash ?? []).map((t) => {
    if (t.workerId) return t;
    const hay = `${t.person} ${t.note}`.toLowerCase();
    if (/сапур/i.test(hay)) return { ...t, workerId: "w-sapura" };
    if (/закрой/i.test(hay) && /дильшод/i.test(hay)) return { ...t, workerId: "w-dilshod-cut" };
    return t;
  });

  const payables = (s.payables ?? []).map((p) => {
    if (p.workerId) return p;
    if (/сапур/i.test(`${p.person} ${p.note}`)) return { ...p, workerId: "w-sapura" };
    return p;
  });

  return { ...s, workers, cash, payables };
}

export function sapuraDebt0820(s: WarehouseState): WarehouseState {
  let cash = [...(s.cash ?? [])];
  let payables = [...(s.payables ?? [])];
  let changed = false;

  if (!cash.some((t) => t.id === "k-sapura-20k-0820")) {
    cash.push({
      id: "k-sapura-20k-0820",
      date: "2026-08-20",
      kind: "worker",
      amount: 20_000,
      person: "Сапура опа швея",
      note: "Доплата",
      createdAt: "2026-08-20T14:10:00",
    });
    changed = true;
  }

  if (!payables.some((p) => p.id === "d-sapura")) {
    payables.push({
      id: "d-sapura",
      person: "Сапура опа швея",
      amount: 1_000_000,
      paidSum: 0,
      note: "Остаток долга швее",
      date: "2026-08-20",
    });
    changed = true;
  }

  return changed ? { ...s, cash, payables } : { ...s, payables };
}

export function paySapuraAndThread0820(s: WarehouseState): WarehouseState {
  let cash = [...(s.cash ?? [])];
  let changed = false;

  if (!cash.some((t) => t.id === "k-sapura-0820")) {
    cash.push({
      id: "k-sapura-0820",
      date: "2026-08-20",
      kind: "worker",
      amount: 1_500_000,
      person: "Сапура опа швея",
      note: "Зарплата",
      createdAt: "2026-08-20T14:00:00",
    });
    changed = true;
  }

  if (!cash.some((t) => t.id === "k-thread-0820")) {
    cash.push({
      id: "k-thread-0820",
      date: "2026-08-20",
      kind: "material",
      amount: 260_000,
      person: "",
      note: "26 ниток × 10 000. Белые 4р — 10, чёрные 4р — 10, белые 3р — 3, чёрные 3р — 3",
      createdAt: "2026-08-20T14:05:00",
    });
    changed = true;
  }

  return changed ? { ...s, cash } : s;
}

export function paySherzod0820(s: WarehouseState): WarehouseState {
  const order = s.orders.find((o) => o.id === "o-sherzod");
  if (!order) return s;
  if ((s.payments ?? []).some((p) => p.id === "p-sherzod")) return s;
  if (order.totalSum > 0 && order.paidSum >= order.totalSum) return s;

  const amount = order.totalSum;
  const hasCash = (s.cash ?? []).some(
    (t) => t.id === "k-sherzod" || (t.kind === "income" && t.amount === amount && /шерзод/i.test(`${t.person} ${t.note}`)),
  );

  return {
    ...s,
    clients: s.clients.map((c) =>
      c.id === "c-sherzod" ? { ...c, note: "Долг закрыл 20.08 полностью." } : c,
    ),
    orders: s.orders.map((o) =>
      o.id === "o-sherzod"
        ? { ...o, paidSum: o.totalSum, note: "Шерзод Паркентский. Чёрный 28 не отдали. Долг закрыл 20.08." }
        : o,
    ),
    payments: [
      ...(s.payments ?? []),
      {
        id: "p-sherzod",
        clientId: "c-sherzod",
        orderId: "o-sherzod",
        date: "2026-08-20",
        amount,
        note: "Оплатил весь долг",
      },
    ],
    cash: hasCash
      ? (s.cash ?? []).map((t) =>
          t.id === "k-sherzod" || (t.kind === "income" && t.amount === amount && /шерзод/i.test(`${t.person} ${t.note}`))
            ? { ...t, paymentId: t.paymentId || "p-sherzod" }
            : t,
        )
      : [
          ...(s.cash ?? []),
          {
            id: "k-sherzod",
            date: "2026-08-20",
            kind: "income",
            amount,
            person: "Шерзод",
            note: "Оплата всего долга",
            paymentId: "p-sherzod",
            createdAt: "2026-08-20T13:10:00",
          },
        ],
    events: (s.events ?? []).some((e) => e.id === "ev-p-sherzod")
      ? s.events
      : [
          ...(s.events ?? []),
          {
            id: "ev-p-sherzod",
            date: "2026-08-20",
            type: "payment",
            pairs: 0,
            sum: amount,
            note: "Шерзод оплатил весь долг",
            clientId: "c-sherzod",
            orderId: "o-sherzod",
          },
        ],
  };
}

export function settleMurodAndCutter0820(s: WarehouseState): WarehouseState {
  let next = s;
  const murod = next.orders.find((o) => o.id === "o-murod");
  const hasPay = (next.payments ?? []).some((p) => p.id === "p-murod");
  const alreadyPaid = Boolean(murod && murod.totalSum > 0 && murod.paidSum >= murod.totalSum);

  if (murod && !hasPay && !alreadyPaid) {
    const amount = murod.totalSum;
    const hasCash = (next.cash ?? []).some(
      (t) => t.id === "k-murod" || (t.kind === "income" && t.amount === amount && /мурод/i.test(`${t.person} ${t.note}`)),
    );
    next = {
      ...next,
      clients: next.clients.map((c) =>
        c.id === "c-murod" ? { ...c, note: "Долг закрыл 20.08 полностью." } : c,
      ),
      orders: next.orders.map((o) =>
        o.id === "o-murod"
          ? { ...o, paidSum: o.totalSum, note: "Свой заказ + заказ Дильшода. Долг закрыл 20.08." }
          : o,
      ),
      payments: [
        ...(next.payments ?? []),
        {
          id: "p-murod",
          clientId: "c-murod",
          orderId: "o-murod",
          date: "2026-08-20",
          amount,
          note: "Оплатил весь долг",
        },
      ],
      cash: hasCash
        ? (next.cash ?? []).map((t) =>
            t.id === "k-murod" || (t.kind === "income" && t.amount === amount && /мурод/i.test(`${t.person} ${t.note}`))
              ? { ...t, paymentId: t.paymentId || "p-murod" }
              : t,
          )
        : [
            ...(next.cash ?? []),
            {
              id: "k-murod",
              date: "2026-08-20",
              kind: "income" as const,
              amount,
              person: "Мурод",
              note: "Оплата всего долга",
              paymentId: "p-murod",
              createdAt: "2026-08-20T13:00:00",
            },
          ],
      events: (next.events ?? []).some((e) => e.id === "ev-p-murod")
        ? next.events
        : [
            ...(next.events ?? []),
            {
              id: "ev-p-murod",
              date: "2026-08-20",
              type: "payment" as const,
              pairs: 0,
              sum: amount,
              note: "Мурод оплатил весь долг",
              clientId: "c-murod",
              orderId: "o-murod",
            },
          ],
    };
  }

  if (!(next.cash ?? []).some((t) => t.id === "k-cutter-dilshod-0820")) {
    next = {
      ...next,
      cash: [
        ...(next.cash ?? []),
        {
          id: "k-cutter-dilshod-0820",
          date: "2026-08-20",
          kind: "worker",
          amount: 1_720_000,
          person: "Дильшод закройщик",
          note: "Крой 400 пар. Рассчитался со всеми долгами.",
          createdAt: "2026-08-20T13:05:00",
        },
      ],
    };
  }

  return next;
}

const BLACK_IN_0819: Record<number, number> = { 14: 30, 15: 50, 16: 60, 17: 30 };

export function applyBlackIncoming0819(s: WarehouseState): WarehouseState {
  if ((s.incoming ?? []).some((i) => i.id === "in-black-0819")) return s;
  const black = { ...s.stock.black };
  for (const [size, qty] of Object.entries(BLACK_IN_0819)) {
    const n = Number(size);
    black[n] = (black[n] ?? 0) + qty;
  }
  return {
    ...s,
    stock: { ...s.stock, black },
    incoming: [
      ...(s.incoming ?? []),
      {
        id: "in-black-0819",
        date: "2026-08-19",
        color: "black",
        items: [
          { size: 14, qty: 30 },
          { size: 15, qty: 50 },
          { size: 16, qty: 60 },
          { size: 17, qty: 30 },
        ],
        totalPairs: 170,
        note: "Приход чёрных 19.08",
      },
    ],
    events: [
      ...(s.events ?? []),
      {
        id: "ev-in-b-0819",
        date: "2026-08-19",
        type: "incoming",
        pairs: 170,
        sum: 0,
        note: "Приход чёрных",
        incomingId: "in-black-0819",
      },
    ],
  };
}

export function fixSherzod245(s: WarehouseState): WarehouseState {
  const order = s.orders.find((o) => o.id === "o-sherzod");
  if (!order) return s;
  const shipped28 = order.items.find((i) => i.color === "black" && i.size === 28)?.qty ?? 0;
  if (order.totalPairs === 245 && shipped28 === 0) {
    return {
      ...s,
      stock: { ...s.stock, black: { ...s.stock.black, 28: 0 } },
    };
  }
  if (shipped28 <= 0 && order.totalPairs !== 250) {
    return {
      ...s,
      stock: { ...s.stock, black: { ...s.stock.black, 28: 0 } },
    };
  }

  const items = order.items.filter((i) => !(i.color === "black" && i.size === 28));
  const alreadyMiss = order.missing.some((i) => i.color === "black" && i.size === 28);
  const missing = alreadyMiss
    ? order.missing
    : [...order.missing, { color: "black" as const, size: 28, qty: shipped28 || 5 }];
  const totalPairs = items.reduce((n, i) => n + i.qty, 0);
  const totalSum = totalPairs * 18_000;
  const paidSum = Math.min(order.paidSum, totalSum);

  return {
    ...s,
    stock: { ...s.stock, black: { ...s.stock.black, 28: 0 } },
    orders: s.orders.map((o) =>
      o.id === "o-sherzod"
        ? {
            ...o,
            items,
            missing,
            totalPairs,
            totalSum,
            paidSum,
            note: "Шерзод Паркентский. Чёрный 28 не отдали — не было на складе. 245 пар.",
          }
        : o,
    ),
    events: s.events.map((e) =>
      e.id === "ev-o-sherzod" ? { ...e, pairs: totalPairs, sum: totalSum, note: "Шерзод Паркентский · 245 пар" } : e,
    ),
  };
}





