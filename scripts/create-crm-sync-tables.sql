create table if not exists public.crm_sync_events (
  event_id text primary key,
  event_type text not null check (event_type in ('INSERT', 'UPDATE')),
  table_name text not null check (table_name in ('contacts', 'conversations', 'messages', 'opportunities')),
  external_id text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'received' check (status in ('received', 'processed', 'failed')),
  error_message text
);

create table if not exists public.crm_contacts (
  external_id text primary key,
  client_id uuid,
  contact_data jsonb not null default '{}'::jsonb,
  source text,
  status text,
  crm_created_at timestamptz,
  crm_updated_at timestamptz,
  synced_at timestamptz not null default now()
);

create table if not exists public.crm_conversations (
  external_id text primary key,
  client_id uuid,
  contact_external_id text,
  conversation_data jsonb not null default '{}'::jsonb,
  channel text,
  status text,
  crm_created_at timestamptz,
  crm_updated_at timestamptz,
  synced_at timestamptz not null default now()
);

create table if not exists public.crm_messages (
  external_id text primary key,
  client_id uuid,
  conversation_external_id text,
  contact_external_id text,
  message_data jsonb not null default '{}'::jsonb,
  source_id text,
  referral_metadata jsonb not null default '{}'::jsonb,
  direction text,
  author text,
  crm_created_at timestamptz,
  crm_updated_at timestamptz,
  synced_at timestamptz not null default now()
);

create table if not exists public.crm_opportunities (
  external_id text primary key,
  client_id uuid,
  contact_external_id text,
  opportunity_data jsonb not null default '{}'::jsonb,
  stage text,
  status text,
  value numeric,
  source text,
  crm_created_at timestamptz,
  crm_updated_at timestamptz,
  synced_at timestamptz not null default now()
);

create index if not exists crm_contacts_client_idx on public.crm_contacts (client_id, crm_updated_at desc);
create index if not exists crm_conversations_client_idx on public.crm_conversations (client_id, crm_updated_at desc);
create index if not exists crm_messages_conversation_idx on public.crm_messages (conversation_external_id, crm_created_at asc);
create index if not exists crm_messages_client_idx on public.crm_messages (client_id, crm_created_at desc);
create index if not exists crm_messages_source_id_idx on public.crm_messages (client_id, source_id) where source_id is not null;
create index if not exists crm_opportunities_client_idx on public.crm_opportunities (client_id, crm_created_at desc);

alter table public.crm_sync_events enable row level security;
alter table public.crm_contacts enable row level security;
alter table public.crm_conversations enable row level security;
alter table public.crm_messages enable row level security;
alter table public.crm_opportunities enable row level security;

revoke all on public.crm_sync_events, public.crm_contacts, public.crm_conversations, public.crm_messages, public.crm_opportunities from anon, authenticated;

grant all on public.crm_sync_events, public.crm_contacts, public.crm_conversations, public.crm_messages, public.crm_opportunities to service_role;

insert into public.crm_sync_events (event_id, event_type, table_name, external_id)
values ('__schema_check__', 'INSERT', 'contacts', '__schema_check__')
on conflict (event_id) do nothing;
delete from public.crm_sync_events where event_id = '__schema_check__';

-- Configure four Database Webhooks in the CRM project for INSERT and UPDATE,
-- pointing to /api/webhooks/crm/sync with x-crm-webhook-secret.
-- Configure CRM_WEBHOOK_SECRET in the internal project.
