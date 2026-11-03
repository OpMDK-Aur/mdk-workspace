-- Review state of each created ad (review list after "Aprobar y crear").
-- Constant default: metadata-only column add on Postgres 11+. The check constraint scans the (small) table once.
set statement_timeout = '5s';
alter table public.bulk_plan_items
  add column if not exists review_status text not null default 'pending'
    check (review_status in ('pending', 'ok', 'excluded')),
  add column if not exists review_note text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid;
