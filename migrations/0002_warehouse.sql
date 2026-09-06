-- One shared warehouse snapshot for the whole business (not per-user).
create table if not exists warehouse_snapshot (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
