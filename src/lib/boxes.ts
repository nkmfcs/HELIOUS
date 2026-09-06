import { COLORS, SIZES, type Color } from "./types";

export const BOX_IDS = [1, 2, 3, 4, 5] as const;
export type BoxId = (typeof BOX_IDS)[number];
export type BoxMap = Record<Color, Record<number, BoxId>>;

export function defaultBoxes(): BoxMap {
  const fill = (n: BoxId): Record<number, BoxId> => {
    const o: Record<number, BoxId> = {};
    for (const size of SIZES) o[size] = n;
    return o;
  };

  const white = fill(1);
  for (let s = 20; s <= 22; s++) white[s] = 4;
  for (let s = 23; s <= 28; s++) white[s] = 5;

  const black = fill(1);
  black[18] = 2;
  black[19] = 2;
  black[16] = 5;
  black[17] = 5;
  for (const s of [14, 15, 20, 21, 22, 23, 24, 25, 26, 27]) black[s] = 3;

  return { white, black, gold: fill(1) };
}

export function ensureBoxes(map?: BoxMap | null): BoxMap {
  const base = defaultBoxes();
  if (!map) return base;
  for (const color of COLORS) {
    const row = map[color] ?? {};
    for (const size of SIZES) {
      const n = Number(row[size]);
      if (n >= 1 && n <= 5) base[color][size] = n as BoxId;
    }
  }
  return base;
}

export function boxOf(map: BoxMap | undefined, color: Color, size: number): BoxId {
  const n = map?.[color]?.[size];
  if (typeof n === "number" && n >= 1 && n <= 5) return n as BoxId;
  return defaultBoxes()[color][size] ?? 1;
}

export function boxLabel(id: BoxId | number): string {
  return `#${id}`;
}

export function sizesInBox(map: BoxMap, box: BoxId, color: Color): number[] {
  return SIZES.filter((s) => boxOf(map, color, s) === box);
}

export function groupItemsByBox<T extends { color: Color; size: number }>(
  map: BoxMap | undefined,
  items: T[],
): { box: BoxId; items: T[] }[] {
  const buckets = new Map<BoxId, T[]>();
  for (const id of BOX_IDS) buckets.set(id, []);
  for (const item of items) {
    const box = boxOf(map, item.color, item.size);
    buckets.get(box)!.push(item);
  }
  return BOX_IDS.map((box) => ({ box, items: buckets.get(box)! })).filter((g) => g.items.length > 0);
}

export function moveWhite1719ToBox1<T extends { boxes?: BoxMap | null }>(s: T): T {
  const boxes = ensureBoxes(s.boxes);
  let changed = false;
  for (const size of [17, 18, 19]) {
    if (boxes.white[size] === 4) {
      boxes.white[size] = 1;
      changed = true;
    }
  }
  return changed ? { ...s, boxes } : { ...s, boxes };
}
