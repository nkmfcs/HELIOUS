import type { BoxMap } from "./boxes.ts";

export const SIZES = [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28] as const;
export type Size = (typeof SIZES)[number];

export const COLORS = ["white", "black", "gold"] as const;
export type Color = (typeof COLORS)[number];

export const PACK = 5;
export const SELL_PRICE = 18_000;

export type ColorStock = Record<number, number>;
export type Stock = Record<Color, ColorStock>;

export type Client = {
  id: string;
  name: string;
  shop: string;
  phone: string;
  note: string;
  createdAt: string;
};

export type OrderItem = {
  color: Color;
  size: number;
  qty: number;
};

export type Order = {
  id: string;
  clientId: string;
  date: string;
  items: OrderItem[];
  missing: OrderItem[];
  totalPairs: number;
  totalSum: number;
  paidSum: number;
  status: "shipped" | "cancelled";
  note: string;
  createdAt: string;
};

export type Payment = {
  id: string;
  clientId: string;
  orderId?: string;
  date: string;
  amount: number;
  note: string;
  allocations?: { orderId: string; amount: number }[];
};

export type Incoming = {
  id: string;
  date: string;
  color: Color;
  items: { size: number; qty: number }[];
  totalPairs: number;
  note: string;
  createdAt?: string;
};

export type JournalEvent = {
  id: string;
  date: string;
  type: "incoming" | "order" | "order_edit" | "payment" | "cancel" | "stock_adjustment";
  pairs: number;
  sum: number;
  note: string;
  clientId?: string;
  orderId?: string;
  incomingId?: string;
  paymentId?: string;
};

export type Costs = {
  sewing: number;
  cutting: number;
  packaging: number;
  materialUSD: number;
  avgMeters: number;
  usdRate: number;
};

export const CASH_KINDS = ["income", "material", "worker", "withdraw", "other", "refund"] as const;
export type CashKind = (typeof CASH_KINDS)[number];

export type CashTxn = {
  id: string;
  date: string;
  kind: CashKind;
  amount: number;
  person: string;
  note: string;
  paymentId?: string;
  workerId?: string;
  locked?: boolean;
  createdAt: string;
};

export type Payable = {
  id: string;
  person: string;
  amount: number;
  paidSum: number;
  note: string;
  date: string;
  workerId?: string;
};

export const WORKER_ROLES = ["sewing", "cutting", "packaging", "other"] as const;
export type WorkerRole = (typeof WORKER_ROLES)[number];

export type Worker = {
  id: string;
  name: string;
  role: WorkerRole;
  phone: string;
  note: string;
  createdAt: string;
};

export function workerRoleLabel(role: WorkerRole): string {
  if (role === "sewing") return "Швея";
  if (role === "cutting") return "Крой";
  if (role === "packaging") return "Упаковка";
  return "Другое";
}

export type WarehouseState = {
  stock: Stock;
  clients: Client[];
  orders: Order[];
  payments: Payment[];
  incoming: Incoming[];
  events: JournalEvent[];
  cash: CashTxn[];
  cashOpening: number;
  costs: Costs;
  lowThreshold: number;
  dataRev: number;
  boxes: BoxMap;
  payables: Payable[];
  workers: Worker[];
};
