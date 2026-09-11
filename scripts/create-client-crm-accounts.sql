create table if not exists public.client_crm_accounts (
  client_id uuid not null references public.clientes(id) on delete cascade,
  crm_type text not null,
  crm_account_id text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (client_id, crm_type, crm_account_id)
);

create index if not exists client_crm_accounts_lookup_idx
  on public.client_crm_accounts (crm_type, crm_account_id, active);

alter table public.client_crm_accounts enable row level security;
revoke all on public.client_crm_accounts from anon, authenticated;
grant all on public.client_crm_accounts to service_role;

-- La app usa Server Actions autenticadas; si se consulta desde el navegador,
-- crear políticas RLS específicas para el rol y el modelo de autorización vigente.
