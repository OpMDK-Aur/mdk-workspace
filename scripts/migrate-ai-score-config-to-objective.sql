begin;

alter table public.ai_client_score_config
  add column if not exists objective text;

update public.ai_client_score_config
set objective =
  'Optimizar la eficiencia y aumentar las conversiones calificadas sin desperdiciar presupuesto.'
where objective is null
   or trim(objective) = '';

alter table public.ai_client_score_config
  alter column objective set not null;

commit;
