import test from "node:test";
import assert from "node:assert/strict";
import { reallocateWorkerPayments } from "../src/lib/worker-pay.ts";

const acc = (id, date, amount, extra = {}) => ({
  id,
  person: "Саид",
  amount,
  paidSum: 0,
  note: "",
  date,
  workerId: "said",
  ...extra,
});
const pay = (date, amount, extra = {}) => ({
  kind: "worker",
  workerId: "said",
  date,
  amount,
  createdAt: `${date}T10:00:00Z`,
  ...extra,
});
const left = (rows) => rows.reduce((n, p) => n + p.amount - p.paidSum, 0);

test("Саид: после удаления старых записей и лишней выплаты остаётся 4 335 000", () => {
  const payables = [
    acc("debt", "2026-11-05", 1_995_000),
    acc("pack", "2026-11-05", 105_000),
    ...[
      ["2026-11-08", 210],
      ["2026-11-08", 100],
      ["2026-11-11", 255],
      ["2026-11-13", 350],
      ["2026-11-15", 225],
      ["2026-11-18", 460],
      ["2026-11-20", 130],
      ["2026-11-21", 150],
      ["2026-11-24", 210],
    ].map(([date, pairs], i) => acc(`p${i}`, date, pairs * 1500, { pairs, rate: 1500 })),
  ];
  const result = reallocateWorkerPayments(payables, [pay("2026-11-15", 900_000)], "said");
  assert.equal(left(result), 4_335_000);
  assert.equal(result[0].paidSum, 900_000);
});

test("выплата по кнопке «Закрыть» сначала идёт в своё начисление, чужих работников не трогает", () => {
  const other = { ...acc("x", "2026-01-01", 500), workerId: "other", paidSum: 200 };
  const result = reallocateWorkerPayments(
    [acc("a", "2026-11-01", 1000), acc("b", "2026-11-02", 1000), other],
    [pay("2026-11-03", 1200, { payableId: "b" }), pay("2026-11-03", 999, { workerId: "other" })],
    "said",
  );
  assert.deepEqual(
    result.map((p) => p.paidSum),
    [200, 1000, 200],
  );
});

test("переплата остаётся авансом и гасит следующее начисление", () => {
  const before = [acc("a", "2026-11-01", 1000)];
  const after = reallocateWorkerPayments([...before, acc("b", "2026-11-10", 1500)], [pay("2026-11-02", 1800)], "said");
  assert.deepEqual(after.map((p) => p.paidSum), [1000, 800]);
  assert.equal(left(after), 700);
});
