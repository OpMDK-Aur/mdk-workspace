-- Aurelia: campos que trae la "Matriz de seguimiento - Clientes Aurelia" y no estaban en la base.
-- NO ejecutar sin autorización. Base de producción.
-- Solo agrega columnas opcionales (NULL, sin default) a una tabla chica y crea una tabla nueva y vacía.
-- En Postgres agregar una columna NULL sin default es instantáneo: no reescribe la tabla.

SET statement_timeout = '15s';
SET lock_timeout = '3s';

-- 1. Seguimiento NPS: frecuencia, próxima encuesta y comentario de cada encuesta, y la próxima acción.
ALTER TABLE public.aurelia_onboarding_seguimiento
  ADD COLUMN IF NOT EXISTS nps_frecuencia text CHECK (nps_frecuencia IN ('semanal', 'quincenal', 'mensual')),
  ADD COLUMN IF NOT EXISTS encuesta_1_proxima date,
  ADD COLUMN IF NOT EXISTS encuesta_1_comentario text CHECK (char_length(encuesta_1_comentario) <= 4000),
  ADD COLUMN IF NOT EXISTS encuesta_2_proxima date,
  ADD COLUMN IF NOT EXISTS encuesta_2_comentario text CHECK (char_length(encuesta_2_comentario) <= 4000),
  ADD COLUMN IF NOT EXISTS encuesta_3_proxima date,
  ADD COLUMN IF NOT EXISTS encuesta_3_comentario text CHECK (char_length(encuesta_3_comentario) <= 4000),
  ADD COLUMN IF NOT EXISTS encuesta_4_proxima date,
  ADD COLUMN IF NOT EXISTS encuesta_4_comentario text CHECK (char_length(encuesta_4_comentario) <= 4000),
  ADD COLUMN IF NOT EXISTS proxima_accion text CHECK (char_length(proxima_accion) <= 2000),
  ADD COLUMN IF NOT EXISTS estado_accion text CHECK (estado_accion IN ('pendiente', 'resolviendo', 'resuelto'));

-- 2. Revisión de uso de la plataforma (hoja "Revisión de uso de Aurelia" + columnas de relevamiento de la Matriz).
--    Una fila por cliente y fecha de revisión, para poder ver cómo evoluciona el uso.
CREATE TABLE IF NOT EXISTS public.aurelia_revision_uso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aurelia_client_id text NOT NULL,
  aurelia_client_name text,
  fecha_revision date,
  configuracion_inicial text,
  canales_conectados text,
  embudo text,
  oportunidades text,
  tareas text,
  usuarios text,
  ultimo_ingreso text,
  smart_tags text,
  agente_sofia text,
  agente_lucas text,
  agente_tobias text,
  agente_axel text,
  uso_conversaciones text,
  metricas text,
  consumo_creditos text,
  observaciones text,
  autor_id uuid REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aurelia_revision_uso_cliente_idx ON public.aurelia_revision_uso (aurelia_client_id, fecha_revision DESC);

-- Sin políticas: solo el servidor (service role) lee y escribe, igual que las demás tablas de Aurelia.
ALTER TABLE public.aurelia_revision_uso ENABLE ROW LEVEL SECURITY;
