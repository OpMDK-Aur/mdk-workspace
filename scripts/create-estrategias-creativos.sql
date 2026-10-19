-- Ejecuciones del agente "Estrategia de creativos" (Meta Ads › Carga masiva).
-- Tabla nueva y vacía: no toca datos existentes ni bloquea otras tablas.
set statement_timeout = '15s';

create table if not exists public.estrategias_creativos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  creado_por uuid,
  created_at timestamptz not null default now(),
  input jsonb not null,
  personas jsonb not null
);

create index if not exists estrategias_creativos_cliente_created_idx
  on public.estrategias_creativos (cliente_id, created_at desc);

alter table public.estrategias_creativos enable row level security;

drop policy if exists "estrategias_creativos_select" on public.estrategias_creativos;
create policy "estrategias_creativos_select" on public.estrategias_creativos
  for select to authenticated using (true);

drop policy if exists "estrategias_creativos_insert" on public.estrategias_creativos;
create policy "estrategias_creativos_insert" on public.estrategias_creativos
  for insert to authenticated with check (creado_por = auth.uid());

drop policy if exists "estrategias_creativos_update" on public.estrategias_creativos;
create policy "estrategias_creativos_update" on public.estrategias_creativos
  for update to authenticated using (true) with check (true);
