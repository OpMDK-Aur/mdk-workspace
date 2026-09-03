alter table public.crm_messages
  add column if not exists message_type text;

alter table public.crm_messages
  add column if not exists delivered_at timestamptz;
