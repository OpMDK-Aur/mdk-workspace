alter table if exists public.crm_messages
  add column if not exists source_id text,
  add column if not exists referral_metadata jsonb not null default '{}'::jsonb;

create index if not exists crm_messages_source_id_idx
  on public.crm_messages (client_id, source_id)
  where source_id is not null;
