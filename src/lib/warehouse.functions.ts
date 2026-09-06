import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import type { WarehouseState } from "@/lib/types";

const SNAPSHOT_ID = "helious";

async function ensureTable() {
  const sql = await getSql();
  await sql`
    create table if not exists warehouse_snapshot (
      id text primary key,
      payload jsonb not null,
      updated_at timestamptz not null default now()
    )
  `;
  return sql;
}

function isWarehouseState(value: unknown): value is WarehouseState {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<WarehouseState>;
  return Boolean(s.stock && s.clients && s.orders && s.costs);
}

export const loadWarehouse = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await ensureTable();
  const rows = await sql<{ payload: unknown; updated_at: string }>`
    select payload, updated_at from warehouse_snapshot where id = ${SNAPSHOT_ID}
  `;
  const row = rows[0];
  if (!row) return { state: null, updatedAt: null as string | null };
  const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
  if (!isWarehouseState(payload)) return { state: null, updatedAt: null as string | null };
  return { state: payload, updatedAt: row.updated_at };
});

export const saveWarehouse = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!data || typeof data !== "object") throw new Error("Пустые данные");
    const d = data as { state?: unknown; updatedAt?: unknown };
    if (!isWarehouseState(d.state)) throw new Error("Неверные данные склада");
    if (typeof d.updatedAt !== "string" || !d.updatedAt) throw new Error("Нет времени");
    return { state: d.state, updatedAt: d.updatedAt };
  })
  .handler(async ({ data }) => {
    const sql = await ensureTable();
    const json = JSON.stringify(data.state);
    await sql`
      insert into warehouse_snapshot (id, payload, updated_at)
      values (${SNAPSHOT_ID}, ${json}::jsonb, ${data.updatedAt}::timestamptz)
      on conflict (id) do update set
        payload = excluded.payload,
        updated_at = excluded.updated_at
      where warehouse_snapshot.updated_at <= excluded.updated_at
    `;
    const rows = await sql<{ updated_at: string }>`
      select updated_at from warehouse_snapshot where id = ${SNAPSHOT_ID}
    `;
    return { ok: true as const, updatedAt: rows[0]?.updated_at ?? data.updatedAt };
  });
