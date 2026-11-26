import test from "node:test";
import assert from "node:assert/strict";
import { periodRange, shiftPeriod, periodTitle, inPeriod } from "../src/lib/period.ts";

test("неделя с понедельника по воскресенье, месяц и год", () => {
  assert.deepEqual(periodRange({ kind: "week", anchor: "2026-11-26" }), {
    from: "2026-11-23",
    to: "2026-11-29",
  });
  assert.deepEqual(periodRange({ kind: "month", anchor: "2026-02-10" }), {
    from: "2026-02-01",
    to: "2026-02-28",
  });
  assert.deepEqual(periodRange({ kind: "year", anchor: "2026-11-26" }), {
    from: "2026-01-01",
    to: "2026-12-31",
  });
  assert.equal(periodRange({ kind: "all", anchor: "2026-11-26" }), null);
});

test("листание и подписи", () => {
  assert.equal(shiftPeriod({ kind: "month", anchor: "2026-12-31" }, 1).anchor, "2027-01-01");
  assert.equal(periodTitle({ kind: "month", anchor: "2026-11-05" }), "Ноябрь 2026");
  assert.equal(periodTitle({ kind: "week", anchor: "2026-11-26" }), "23.11 – 29.11.2026");
  assert.ok(inPeriod("2026-11-30", periodRange({ kind: "month", anchor: "2026-11-01" })));
  assert.ok(!inPeriod("2026-12-01", periodRange({ kind: "month", anchor: "2026-11-01" })));
});
