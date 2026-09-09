import { defaultBoxes } from "./boxes";
import { SIZES, type ColorStock, type WarehouseState } from "./types";

/** Marker used only to clear the private snapshot from the first Railway build. */
export const LEGACY_PRIVATE_DATA_REV = 2026081803;

/** Empty installations start clean; real data is restored from an owned backup. */
export const DATA_REV = 0;

function emptyStock(): ColorStock {
  return Object.fromEntries(SIZES.map((size) => [size, 0])) as ColorStock;
}

export const SEED: WarehouseState = {
  stock: {
    white: emptyStock(),
    black: emptyStock(),
    gray: emptyStock(),
    gold: emptyStock(),
  },
  clients: [],
  orders: [],
  payments: [],
  incoming: [],
  events: [],
  cash: [],
  cashOpening: 0,
  costs: {
    sewing: 4000,
    cutting: 1700,
    packaging: 150,
    materialUSD: 4,
    avgMeters: 0.1,
    usdRate: 12100,
  },
  lowThreshold: 30,
  dataRev: DATA_REV,
  boxes: defaultBoxes(),
  payables: [],
  workers: [],
};
