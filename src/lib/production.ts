import type { Color, OrderItem, ProductionBatch, ProductionStage } from "./types.ts";
import { COLORS, SIZES } from "./types.ts";

export const PRODUCTION_STAGES: readonly ProductionStage[] = [
  "cutting",
  "sewing",
  "packaging",
  "done",
  "cancelled",
];

const ACTIVE_STAGES: readonly ProductionStage[] = ["cutting", "sewing", "packaging"];

export function isProductionStage(value: unknown): value is ProductionStage {
  return PRODUCTION_STAGES.includes(value as ProductionStage);
}

export function isActiveProductionStage(stage: ProductionStage): boolean {
  return ACTIVE_STAGES.includes(stage);
}

export function productionStageLabel(stage: ProductionStage): string {
  if (stage === "cutting") return "Крой";
  if (stage === "sewing") return "Швейки";
  if (stage === "packaging") return "Упаковка";
  if (stage === "cancelled") return "Отменено";
  return "Готово";
}

export function productionStageRole(
  stage: ProductionStage,
): "cutting" | "sewing" | "packaging" | null {
  if (stage === "cutting") return "cutting";
  if (stage === "sewing") return "sewing";
  if (stage === "packaging") return "packaging";
  return null;
}

export function productionStageTone(
  stage: ProductionStage,
): "muted" | "warn" | "accent" | "ok" | "danger" {
  if (stage === "cutting") return "muted";
  if (stage === "sewing") return "warn";
  if (stage === "packaging") return "accent";
  if (stage === "cancelled") return "danger";
  return "ok";
}

export function itemKey(item: Pick<OrderItem, "color" | "size">): string {
  return `${item.color}:${item.size}`;
}

export function itemMap(items: OrderItem[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    const qty = Math.max(0, Math.round(Number(item.qty) || 0));
    if (
      !COLORS.includes(item.color) ||
      !SIZES.includes(item.size as (typeof SIZES)[number]) ||
      qty <= 0
    )
      continue;
    const key = itemKey(item);
    map.set(key, (map.get(key) ?? 0) + qty);
  }
  return map;
}

export function productionQtyFor(
  batches: ProductionBatch[] | undefined,
  color: Color,
  size: number,
  stage?: ProductionStage,
): number {
  const target = itemKey({ color, size });
  return (batches ?? [])
    .filter((batch) => (stage ? batch.stage === stage : isActiveProductionStage(batch.stage)))
    .reduce(
      (sum, batch) =>
        sum + batch.items.reduce((n, item) => (itemKey(item) === target ? n + item.qty : n), 0),
      0,
    );
}

export function productionPairs(batch: ProductionBatch): number {
  return batch.items.reduce((sum, item) => sum + item.qty, 0);
}

export function normalizeProductionBatches(value: unknown): ProductionBatch[] {
  if (!Array.isArray(value)) return [];
  const result: ProductionBatch[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const batch = raw as Partial<ProductionBatch>;
    if (
      typeof batch.id !== "string" ||
      !Array.isArray(batch.items) ||
      !isProductionStage(batch.stage)
    )
      continue;
    const items = batch.items
      .filter((item): item is OrderItem => {
        if (!item || typeof item !== "object") return false;
        const candidate = item as Partial<OrderItem>;
        return (
          typeof candidate.color === "string" &&
          COLORS.includes(candidate.color as Color) &&
          Number.isInteger(candidate.size) &&
          SIZES.includes(candidate.size as (typeof SIZES)[number]) &&
          Number.isFinite(candidate.qty) &&
          Number(candidate.qty) > 0
        );
      })
      .map((item) => ({
        color: item.color,
        size: Number(item.size),
        qty: Math.max(1, Math.round(Number(item.qty))),
      }));
    if (!items.length) continue;
    const history = Array.isArray(batch.history)
      ? batch.history.filter(
          (entry) =>
            entry &&
            typeof entry === "object" &&
            isProductionStage((entry as { stage?: unknown }).stage) &&
            typeof (entry as { at?: unknown }).at === "string",
        )
      : [];
    const firstAt =
      typeof batch.createdAt === "string" ? batch.createdAt : new Date().toISOString();
    result.push({
      id: batch.id,
      items,
      stage: batch.stage,
      createdAt: firstAt,
      updatedAt: typeof batch.updatedAt === "string" ? batch.updatedAt : firstAt,
      note: typeof batch.note === "string" ? batch.note : "",
      history: history.length
        ? history.map((entry) => ({
            stage: entry.stage,
            at: entry.at,
            workerId: typeof entry.workerId === "string" ? entry.workerId : undefined,
          }))
        : [{ stage: batch.stage, at: firstAt }],
      cuttingWorkerId:
        typeof batch.cuttingWorkerId === "string" ? batch.cuttingWorkerId : undefined,
      sewingWorkerId: typeof batch.sewingWorkerId === "string" ? batch.sewingWorkerId : undefined,
      packagingWorkerId:
        typeof batch.packagingWorkerId === "string" ? batch.packagingWorkerId : undefined,
    });
  }
  return result;
}
