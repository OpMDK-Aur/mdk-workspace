-- Tabla para persistir los informes generados por el multiagente de Conexa.
-- Sin esta tabla, los informes generados en el chat solo viven en memoria del
-- navegador y se pierden al actualizar la pantalla.

create table if not exists public.conexa_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clientes(id) on delete cascade,
  client_name text not null,
  title text not null,
  content text not null,
  html text,
  created_at timestamptz not null default now()
);

create index if not exists conexa_reports_client_id_idx on public.conexa_reports(client_id);
create index if not exists conexa_reports_created_at_idx on public.conexa_reports(created_at desc);

alter table public.conexa_reports enable row level security;

drop policy if exists "conexa_reports_select" on public.conexa_reports;
create policy "conexa_reports_select" on public.conexa_reports
  for select using (auth.uid() is not null);

drop policy if exists "conexa_reports_insert" on public.conexa_reports;
create policy "conexa_reports_insert" on public.conexa_reports
  for insert with check (auth.uid() is not null);

drop policy if exists "conexa_reports_delete" on public.conexa_reports;
create policy "conexa_reports_delete" on public.conexa_reports
  for delete using (auth.uid() is not null);
