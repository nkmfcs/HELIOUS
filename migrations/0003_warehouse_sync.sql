-- Optimistic concurrency prevents one device from silently overwriting another.
alter table warehouse_snapshot
  add column if not exists revision bigint not null default 0;

-- Exactly one verified account may claim an old, unscoped `helious` snapshot.
create table if not exists warehouse_legacy_claim (
  snapshot_id text primary key,
  user_id text not null unique
);
