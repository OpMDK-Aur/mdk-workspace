-- Unidad de negocio Aurelia: separación por unidad + tiempo por cliente del CRM.
-- NO ejecutar sin autorización. Base de producción.

SET statement_timeout = '15s';
SET lock_timeout = '3s';

-- 1. Unidad(es) a la que pertenece cada colaborador. Con un DEFAULT constante,
--    Postgres 11+ agrega la columna sin reescribir la tabla: todos los
--    colaboradores actuales quedan en MDK y Master sigue viendo todo.
ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS unidades_negocio text[] NOT NULL DEFAULT ARRAY['MDK']::text[];

-- 2. Registros de tiempo sobre clientes del CRM de Aurelia, separados de
--    entradas_de_tiempo (MDK). aurelia_client_id es el id de `clients` del CRM.
CREATE TABLE IF NOT EXISTS public.entradas_de_tiempo_aurelia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  aurelia_client_id text NOT NULL,
  aurelia_client_name text,
  descripcion text,
  fecha date NOT NULL,
  iniciado_en timestamptz NOT NULL DEFAULT now(),
  finalizado_en timestamptz,
  duracion_seg integer CHECK (duracion_seg IS NULL OR duracion_seg >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entradas_tiempo_aurelia_cliente_fecha_idx ON public.entradas_de_tiempo_aurelia (aurelia_client_id, fecha);
CREATE INDEX IF NOT EXISTS entradas_tiempo_aurelia_colaborador_fecha_idx ON public.entradas_de_tiempo_aurelia (colaborador_id, fecha);
-- Un solo timer corriendo por colaborador.
CREATE UNIQUE INDEX IF NOT EXISTS entradas_tiempo_aurelia_un_timer_activo ON public.entradas_de_tiempo_aurelia (colaborador_id) WHERE finalizado_en IS NULL;

-- 3. Sin políticas: solo el servidor (service role) lee y escribe, después de
--    validar en la app que el usuario pertenece a Aurelia o es Master.
ALTER TABLE public.entradas_de_tiempo_aurelia ENABLE ROW LEVEL SECURITY;
