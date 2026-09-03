alter table if exists public.crm_contacts
  add column if not exists created_at timestamptz;

alter table if exists public.crm_messages
  add column if not exists created_at timestamptz;

alter table if exists public.crm_opportunities
  add column if not exists created_at timestamptz;

update public.crm_contacts set created_at = crm_created_at where created_at is null;
update public.crm_messages set created_at = crm_created_at where created_at is null;
update public.crm_opportunities set created_at = crm_created_at where created_at is null;
