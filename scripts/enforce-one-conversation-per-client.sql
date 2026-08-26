-- Garantiza un único chat activo por (usuario, cliente).
-- 1) Archiva duplicados dejando solo la conversación más reciente de cada
--    par (user_id, client_id) como activa.
-- 2) Agrega un índice único parcial que impide crear una segunda
--    conversación activa para el mismo cliente (protege contra condiciones
--    de carrera si dos requests llegan al mismo tiempo).

with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, client_id
      order by updated_at desc
    ) as rn
  from public.ai_conversations
  where archived = false
)
update public.ai_conversations c
set archived = true
from ranked r
where c.id = r.id
  and r.rn > 1;

create unique index if not exists ai_conversations_one_active_per_client
  on public.ai_conversations (user_id, client_id)
  where archived = false;
