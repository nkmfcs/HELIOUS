import { COLORS, SIZES, type OrderItem, type ProductionBatch, type ProductionMove, type ProductionMoveInput, type WarehouseState } from "./types.ts";
import { itemKey, manualProductionItems } from "./production.ts";

export const MOVE_LABELS = {
  "cut-in": "Принять крой у резака",
  "cut-out": "Выдать крой швее",
  "sewn-in": "Принять пошив у швеи",
  "pack-out": "Выдать на упаковку",
  "packed-in": "Принять от упаковщика",
  "warehouse-in": "Подтвердить приход на склад",
  opening: "Начальный остаток",
} as const;
export const workerLocation = (role: "sewing" | "packaging", id: string) => role + ":" + id;
export function moveRoute(input: ProductionMoveInput): [string, string] | null {
  const id = input.workerId;
  switch (input.kind) {
    case "cut-in": return id ? ["outside", "cut"] : null;
    case "cut-out": return id ? ["cut", workerLocation("sewing", id)] : null;
    case "sewn-in": return id ? [workerLocation("sewing", id), "sewn"] : null;
    case "pack-out": return id ? ["sewn", workerLocation("packaging", id)] : null;
    case "packed-in": return id ? [workerLocation("packaging", id), "packed"] : null;
    case "warehouse-in": return ["packed", "finished"];
    case "opening":
      return input.openingTo && (["cut", "sewn", "packed"].includes(input.openingTo) || /^(sewing|packaging):.+$/.test(input.openingTo))
        ? ["outside", input.openingTo] : null;
    default: return null;
  }
}
export type Balances = Map<string, Map<string, number>>;
export function replayProduction(moves: readonly ProductionMove[]): { balances: Balances; error: string | null } {
  const balances: Balances = new Map();
  const ids = new Set<string>();
  for (const move of moves) {
    if (!move || typeof move.id !== "string" || ids.has(move.id) || !Array.isArray(move.items))
      return { balances, error: "Некорректный журнал производства" };
    ids.add(move.id);
    const route = moveRoute(move);
    const items = manualProductionItems(move.items);
    if (!route || !items) return { balances, error: "Некорректная операция: " + move.id };
    const [from, to] = route;
    for (const item of items) {
      const key = itemKey(item);
      if (from !== "outside") {
        const source = balances.get(from) ?? new Map<string, number>();
        const available = source.get(key) ?? 0;
        if (available < item.qty) return { balances, error: "Недостаточно: " + key + " · доступно " + available + ", указано " + item.qty };
        source.set(key, available - item.qty);
        balances.set(from, source);
      }
      if (to !== "finished") {
        const target = balances.get(to) ?? new Map<string, number>();
        const next = (target.get(key) ?? 0) + item.qty;
        if (!Number.isSafeInteger(next)) return { balances, error: "Слишком большое количество" };
        target.set(key, next);
        balances.set(to, target);
      }
    }
  }
  return { balances, error: null };
}
export function balanceItems(balances: Balances, location: string): OrderItem[] {
  const bucket = balances.get(location);
  return COLORS.flatMap(color => SIZES.flatMap(size => {
    const qty = bucket?.get(itemKey({color,size})) ?? 0;
    return qty > 0 ? [{color,size,qty}] : [];
  }));
}
export function remainingPlanItems(batch: ProductionBatch, moves: readonly ProductionMove[]): OrderItem[] {
  if (batch.stage !== "cutting") return [];
  const received = new Map<string, number>();
  for (const move of moves) if (move.kind === "cut-in" && move.planId === batch.id) {
    for (const item of move.items) received.set(itemKey(item), (received.get(itemKey(item)) ?? 0) + item.qty);
  }
  return batch.items.map(item => ({...item,qty: Math.max(0,item.qty-(received.get(itemKey(item))??0))})).filter(item=>item.qty>0);
}
export function productionToken(state: WarehouseState): string {
  return JSON.stringify([state.productionMoves ?? [], state.productionBatches, state.stock, state.workers]);
}
export function validateMoveInput(state: WarehouseState, input: ProductionMoveInput): string | null {
  if (!moveRoute(input) || !manualProductionItems(input.items)) return "Укажите корректные позиции и получателя";
  const d = new Date(input.date + "T00:00:00Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0,10) !== input.date) return "Укажите корректную дату";
  const role = input.kind === "cut-in" ? "cutting" : ["cut-out","sewn-in"].includes(input.kind) ? "sewing" : ["pack-out","packed-in"].includes(input.kind) ? "packaging" : null;
  if (role && !state.workers.some(w=>w.id===input.workerId && w.role===role)) return "Выберите работника нужной специальности";
  if (input.kind === "opening" && input.openingTo?.includes(":")) {
    const [r,...id] = input.openingTo.split(":");
    if (!state.workers.some(w=>w.id===id.join(":") && w.role===r)) return "Работник не найден";
  }
  if (input.planId && (input.kind !== "cut-in" || !state.productionBatches.some(b=>b.id===input.planId && b.stage==="cutting"))) return "Предзаказ не найден";
  return null;
}
export function physicalProductionQty(balances: Balances, color: OrderItem["color"], size: number): number {
  return [...balances.values()].reduce((n,b)=>n+(b.get(itemKey({color,size}))??0),0);
}

export function stageLocation(stage: "cutting" | "sewing" | "packaging", location: string): boolean {
  if (stage === "cutting") return location === "cut";
  if (stage === "sewing") return location === "sewn" || location.startsWith("sewing:");
  return location === "packed" || location.startsWith("packaging:");
}
export function physicalStageQty(balances: Balances, stage: "cutting" | "sewing" | "packaging", color?: OrderItem["color"], size?: number): number {
  let sum = 0;
  for (const [location,bucket] of balances) {
    if (!stageLocation(stage,location)) continue;
    sum += color !== undefined && size !== undefined ? (bucket.get(itemKey({color,size}))??0) : [...bucket.values()].reduce((a,b)=>a+b,0);
  }
  return sum;
}
