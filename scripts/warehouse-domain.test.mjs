import assert from "node:assert/strict";
import test from "node:test";
import { defaultBoxes, ensureBoxes } from "../src/lib/boxes.ts";
import { addItemsToStock, allocateOrder, normalizeStock } from "../src/lib/inventory.ts";
import { parseOrderText } from "../src/lib/order-parser.ts";
import { workerAccrued, workerOwed, workerPaid } from "../src/lib/stats.ts";
import { COLORS, SIZES } from "../src/lib/types.ts";

function oldThreeColorStock() {
  const color = Object.fromEntries(SIZES.map((size) => [size, 0]));
  return {
    white: { ...color, 17: 30 },
    black: { ...color, 18: 40 },
    gold: { ...color },
  };
}

test("gray is a first-class warehouse color", () => {
  assert.deepEqual(COLORS, ["white", "black", "gray", "gold"]);
});

test("old backups gain an empty gray stock without changing existing quantities", () => {
  const normalized = normalizeStock(oldThreeColorStock());
  assert.equal(normalized.white[17], 30);
  assert.equal(normalized.black[18], 40);
  assert.equal(normalized.gray[18], 0);
  assert.equal(
    Object.values(normalized.gray).reduce((sum, value) => sum + value, 0),
    0,
  );
});

test("gray orders deduct and cancellation restores the same stock", () => {
  const stock = normalizeStock(oldThreeColorStock());
  stock.gray[18] = 10;
  const shipped = allocateOrder(stock, [{ color: "gray", size: 18, qty: 5 }]);
  assert.equal(shipped.stock.gray[18], 5);
  assert.deepEqual(shipped.items, [{ color: "gray", size: 18, qty: 5 }]);
  assert.equal(addItemsToStock(shipped.stock, shipped.items).gray[18], 10);
});

test("old box maps gain safe defaults for gray", () => {
  const oldBoxes = defaultBoxes();
  delete oldBoxes.gray;
  const boxes = ensureBoxes(oldBoxes);
  assert.equal(boxes.gray[14], 1);
  assert.equal(boxes.gray[28], 1);
});

test("text order parser recognizes gray in Russian and English", () => {
  assert.deepEqual(parseOrderText("Серые\n18-10", "pairs"), [{ color: "gray", size: 18, qty: 10 }]);
  assert.deepEqual(parseOrderText("gray 19-2", "packs"), [{ color: "gray", size: 19, qty: 10 }]);
});

test("text order parser recognizes every Russian color heading", () => {
  assert.deepEqual(
    parseOrderText("Белые\n17-5\nЧерные\n18-5\nСерые\n19-5\nЗолотые\n20-5", "pairs"),
    [
      { color: "white", size: 17, qty: 5 },
      { color: "black", size: 18, qty: 5 },
      { color: "gray", size: 19, qty: 5 },
      { color: "gold", size: 20, qty: 5 },
    ],
  );
});

test("worker summary keeps accruals, payments and outstanding debt separate", () => {
  const state = {
    cash: [
      {
        id: "payment-1",
        kind: "worker",
        workerId: "worker-1",
        amount: 400_000,
      },
      {
        id: "unlinked-payment",
        kind: "worker",
        amount: 50_000,
      },
    ],
    payables: [
      {
        id: "accrual-1",
        workerId: "worker-1",
        amount: 1_000_000,
        paidSum: 400_000,
      },
    ],
  };
  assert.equal(workerAccrued(state, "worker-1"), 1_000_000);
  assert.equal(workerPaid(state, "worker-1"), 400_000);
  assert.equal(workerOwed(state, "worker-1"), 600_000);
});
