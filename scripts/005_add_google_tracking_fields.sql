alter table public.clientes
  add column if not exists analytics_property_id text,
  add column if not exists tag_manager_container_id text;
