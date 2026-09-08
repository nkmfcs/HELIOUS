-- Warehouse snapshots. New rows use a verified-user-scoped id; the legacy
-- unscoped row can be claimed once during migration (see 0003).
create table if not exists warehouse_snapshot (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
