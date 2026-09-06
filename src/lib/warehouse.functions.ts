import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import type { WarehouseState } from "@/lib/types";
import { authMiddleware } from "@/lib/auth/middleware";

const SNAPSHOT_ID = "helious";

async function ensureTable() {
  const sql = await getSql();
  await sql`
    create table if not exists warehouse_snapshot (
      id text primary key,
      payload jsonb not null,
      updated_at timestamptz not null default now(),
      revision bigint not null default 0
    )
  `;
  await sql`alter table warehouse_snapshot add column if not exists revision bigint not null default 0`;
  await sql`
    create table if not exists warehouse_legacy_claim (
      snapshot_id text primary key,
      user_id text not null unique
    )
  `;
  return sql;
}

function isWarehouseState(value: unknown): value is WarehouseState {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<WarehouseState>;
  return Boolean(s.stock && s.clients && s.orders && s.costs);
}

export const loadWarehouse = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await ensureTable();
    const scopedId = `${SNAPSHOT_ID}:${context.userId}`;

    // Only one verified account may claim the old unscoped snapshot. This keeps
    // the migration non-destructive without exposing it to every account.
    await sql`
      insert into warehouse_legacy_claim (snapshot_id, user_id)
      values (${SNAPSHOT_ID}, ${context.userId})
      on conflict (snapshot_id) do nothing
    `;
    await sql`
      insert into warehouse_snapshot (id, payload, updated_at, revision)
      select ${scopedId}, payload, updated_at, greatest(revision, 1)
      from warehouse_snapshot
      where id = ${SNAPSHOT_ID}
        and exists (
          select 1 from warehouse_legacy_claim
          where snapshot_id = ${SNAPSHOT_ID} and user_id = ${context.userId}
        )
      on conflict (id) do nothing
    `;

    const rows = await sql<{ payload: unknown; updated_at: string; revision: string | number }>`
      select payload, updated_at, revision from warehouse_snapshot where id = ${scopedId}
    `;
    const row = rows[0];
    if (!row) return { state: null, updatedAt: null as string | null, revision: 0 };
    const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
    if (!isWarehouseState(payload))
      return { state: null, updatedAt: null as string | null, revision: 0 };
    return { state: payload, updatedAt: row.updated_at, revision: Number(row.revision) || 0 };
  });

export const saveWarehouse = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!data || typeof data !== "object") throw new Error("Пустые данные");
    const d = data as { state?: unknown; baseRevision?: unknown };
    if (!isWarehouseState(d.state)) throw new Error("Неверные данные склада");
    if (!Number.isInteger(d.baseRevision) || Number(d.baseRevision) < 0)
      throw new Error("Неверная версия данных");
    return { state: d.state, baseRevision: Number(d.baseRevision) };
  })
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const sql = await ensureTable();
    const scopedId = `${SNAPSHOT_ID}:${context.userId}`;
    const json = JSON.stringify(data.state);
    const saved = await sql<{ updated_at: string; revision: string | number }>`
      insert into warehouse_snapshot (id, payload, updated_at, revision)
      values (${scopedId}, ${json}::jsonb, now(), 1)
      on conflict (id) do update set
        payload = excluded.payload,
        updated_at = now(),
        revision = warehouse_snapshot.revision + 1
      where warehouse_snapshot.revision = ${data.baseRevision}
      returning updated_at, revision
    `;
    if (saved[0]) {
      return {
        ok: true as const,
        conflict: false as const,
        updatedAt: saved[0].updated_at,
        revision: Number(saved[0].revision),
      };
    }

    const current = await sql<{ payload: unknown; updated_at: string; revision: string | number }>`
      select payload, updated_at, revision from warehouse_snapshot where id = ${scopedId}
    `;
    const row = current[0];
    const payload = typeof row?.payload === "string" ? JSON.parse(row.payload) : row?.payload;
    return {
      ok: false as const,
      conflict: true as const,
      state: isWarehouseState(payload) ? payload : null,
      updatedAt: row?.updated_at ?? null,
      revision: Number(row?.revision) || 0,
    };
  });
