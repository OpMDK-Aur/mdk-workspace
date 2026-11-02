-- Preguntas del plan: respuestas por ítem y nuevo estado needs_answer.
-- NO se ejecuta automáticamente. Revisar y correr manualmente con autorización.
-- bulk_plan_items es una tabla nueva y chica: add column con default constante es solo metadata en Postgres 11+ (sin reescritura).

set statement_timeout = '15s';
set lock_timeout = '5s';

alter table public.bulk_plan_items
  add column if not exists answers jsonb not null default '{}'::jsonb;

alter table public.bulk_plan_items drop constraint if exists bulk_plan_items_state_check;
alter table public.bulk_plan_items
  add constraint bulk_plan_items_state_check
  check (state in ('ready', 'needs_answer', 'needs_confirmation', 'blocked', 'executing', 'done', 'error'));
