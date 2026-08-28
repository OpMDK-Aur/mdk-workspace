-- Migra la configuración de optimización desde tres descripciones independientes
-- hacia un único objetivo de cuenta.
--
-- Se conserva la información anterior dentro de objective como respaldo textual
-- para no perder configuraciones existentes. Luego se eliminan las columnas
-- antiguas porque la aplicación ya no las utiliza.

alter table public.ai_client_score_config
  add column if not exists objective text;

update public.ai_client_score_config
set objective = concat(
  'Objetivo derivado de la configuración anterior. ',
  'Baja: ', low_description, ' ',
  'Intermedia: ', intermediate_description, ' ',
  'Buena: ', high_description
)
where objective is null;

alter table public.ai_client_score_config
  alter column objective set not null;

alter table public.ai_client_score_config
  drop column if exists low_description,
  drop column if exists intermediate_description,
  drop column if exists high_description;
