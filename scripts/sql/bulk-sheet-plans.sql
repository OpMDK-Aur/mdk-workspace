-- Carga masiva desde Google Sheet: interpretación por cliente, alias de cuentas, planes y trazabilidad de creativos.
-- NO se ejecuta automáticamente. Revisar y correr manualmente con autorización.
-- Solo crea tablas nuevas (vacías) e índices sobre ellas: no toca tablas existentes ni hace backfill.

set statement_timeout = '15s';

create table if not exists public.sheet_interpretations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clientes(id) on delete cascade,
  headers_hash text not null,
  headers text[] not null,
  interpretation jsonb not null,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (client_id, headers_hash)
);

create table if not exists public.account_aliases (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clientes(id) on delete cascade,
  alias text not null,
  ad_account_id text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (client_id, alias)
);

create table if not exists public.bulk_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clientes(id) on delete cascade,
  sheet_url text not null,
  spreadsheet_id text not null,
  interpretation_id uuid references public.sheet_interpretations(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'executing', 'finished')),
  context jsonb not null,
  overrides jsonb not null default '{}'::jsonb,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bulk_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.bulk_plans(id) on delete cascade,
  item_key text not null,
  row_number int not null,
  idempotency_key text not null unique,
  state text not null check (state in ('ready', 'needs_confirmation', 'blocked', 'executing', 'done', 'error')),
  reason text,
  payload jsonb,
  result jsonb,
  meta_campaign_id text,
  meta_adset_id text,
  meta_ad_id text,
  meta_creative_id text,
  error text,
  updated_at timestamptz not null default now(),
  unique (plan_id, item_key)
);

create table if not exists public.ad_creative_sources (
  id uuid primary key default gen_random_uuid(),
  ad_account_id text not null,
  ad_id text not null,
  creative_id text,
  drive_file_id text not null,
  drive_modified_time timestamptz,
  format text not null,
  created_at timestamptz not null default now(),
  unique (ad_id, drive_file_id)
);

create index if not exists bulk_plans_client_idx on public.bulk_plans (client_id, created_at desc);
create index if not exists bulk_plan_items_plan_idx on public.bulk_plan_items (plan_id);
create index if not exists ad_creative_sources_account_idx on public.ad_creative_sources (ad_account_id);
create index if not exists ad_creative_sources_drive_idx on public.ad_creative_sources (drive_file_id);

-- Solo el backend (service role) lee y escribe: RLS activo y sin políticas para anon/authenticated.
alter table public.sheet_interpretations enable row level security;
alter table public.account_aliases enable row level security;
alter table public.bulk_plans enable row level security;
alter table public.bulk_plan_items enable row level security;
alter table public.ad_creative_sources enable row level security;
