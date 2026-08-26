-- Sidebar de "chats activos": índice para listar conversaciones por usuario
-- ordenadas por actividad reciente, y columna para archivar conversaciones
-- viejas sin borrarlas.

alter table public.ai_conversations
  add column if not exists archived boolean not null default false;

create index if not exists ai_conversations_user_updated_idx
  on public.ai_conversations (user_id, updated_at desc)
  where archived = false;
