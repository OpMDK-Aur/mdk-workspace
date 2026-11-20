-- Transcripciones de reuniones por cliente (Google Docs de Meet o cargadas a mano).
-- Tabla nueva: no toca ni bloquea tablas existentes.
set statement_timeout = '15s';
set lock_timeout = '5s';

create table if not exists public.transcripciones_clientes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  titulo text not null,
  fecha_reunion timestamptz,
  contenido text not null,
  fuente text not null check (fuente in ('google_docs', 'manual')),
  google_doc_id text,
  google_doc_url text,
  tarea_id uuid references public.tareas(id) on delete set null,
  comentario_id uuid references public.comentarios_clientes(id) on delete set null,
  subido_por uuid references public.colaboradores(id) on delete set null,
  created_at timestamptz not null default now()
);

-- El mismo documento no se carga dos veces en el mismo cliente.
create unique index if not exists transcripciones_clientes_cliente_doc_key
  on public.transcripciones_clientes (cliente_id, google_doc_id)
  where google_doc_id is not null;

create index if not exists transcripciones_clientes_cliente_fecha_idx
  on public.transcripciones_clientes (cliente_id, fecha_reunion desc);

-- Sin políticas: el acceso es solo desde el servidor (service role), que valida
-- sesión y acceso al cliente antes de leer o escribir.
alter table public.transcripciones_clientes enable row level security;
