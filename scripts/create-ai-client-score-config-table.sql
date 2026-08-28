-- Tabla de configuración del objetivo único de optimización por cliente.
-- Este archivo es código fuente: no se ejecuta automáticamente.

create table if not exists public.ai_client_score_config (
  client_id uuid primary key references public.clientes(id) on delete cascade,
  objective text not null,
  updated_at timestamptz not null default now()
);

alter table public.ai_client_score_config enable row level security;

drop policy if exists "ai_client_score_config_select" on public.ai_client_score_config;
create policy "ai_client_score_config_select" on public.ai_client_score_config
  for select using (auth.uid() is not null);

drop policy if exists "ai_client_score_config_insert" on public.ai_client_score_config;
create policy "ai_client_score_config_insert" on public.ai_client_score_config
  for insert with check (auth.uid() is not null);

drop policy if exists "ai_client_score_config_update" on public.ai_client_score_config;
create policy "ai_client_score_config_update" on public.ai_client_score_config
  for update using (auth.uid() is not null);
