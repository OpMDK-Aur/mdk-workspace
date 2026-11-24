-- Aurelia: seguimiento de onboarding (fechas + 4 encuestas NPS), observaciones
-- por fecha y panel kanban de tareas de desarrollo.
-- NO ejecutar sin autorización. Base de producción.
-- Solo crea 3 tablas nuevas y vacías con sus índices: no toca ni bloquea tablas existentes.

SET statement_timeout = '15s';
SET lock_timeout = '3s';

-- 1. Un registro por cliente del CRM (aurelia_client_id = id de `clients` del CRM).
CREATE TABLE IF NOT EXISTS public.aurelia_onboarding_seguimiento (
  aurelia_client_id text PRIMARY KEY,
  aurelia_client_name text,
  fecha_primer_reunion date,
  fecha_cierre_onboarding date,
  encuesta_1_fecha date,
  encuesta_1_nota smallint CHECK (encuesta_1_nota BETWEEN 0 AND 10),
  encuesta_2_fecha date,
  encuesta_2_nota smallint CHECK (encuesta_2_nota BETWEEN 0 AND 10),
  encuesta_3_fecha date,
  encuesta_3_nota smallint CHECK (encuesta_3_nota BETWEEN 0 AND 10),
  encuesta_4_fecha date,
  encuesta_4_nota smallint CHECK (encuesta_4_nota BETWEEN 0 AND 10),
  actualizado_por uuid REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Observaciones fechadas por cliente, para filtrarlas por período.
CREATE TABLE IF NOT EXISTS public.aurelia_onboarding_observaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aurelia_client_id text NOT NULL,
  aurelia_client_name text,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  comentario text NOT NULL CHECK (char_length(comentario) BETWEEN 1 AND 4000),
  autor_id uuid REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aurelia_observaciones_fecha_idx ON public.aurelia_onboarding_observaciones (fecha DESC);
CREATE INDEX IF NOT EXISTS aurelia_observaciones_cliente_idx ON public.aurelia_onboarding_observaciones (aurelia_client_id, fecha DESC);

-- 3. Tareas de desarrollo en kanban. El Backlog se divide por categoría (error / sugerencia).
CREATE TABLE IF NOT EXISTS public.aurelia_tareas_desarrollo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL CHECK (char_length(titulo) BETWEEN 1 AND 200),
  descripcion text,
  etapa text NOT NULL DEFAULT 'backlog' CHECK (etapa IN ('backlog', 'revision', 'desarrollo', 'testing', 'produccion')),
  categoria text NOT NULL DEFAULT 'sugerencia' CHECK (categoria IN ('error', 'sugerencia')),
  fecha_pedido date NOT NULL DEFAULT CURRENT_DATE,
  fecha_fin date,
  asignado_a uuid REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  creado_por uuid REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  aurelia_client_id text,
  aurelia_client_name text,
  posicion double precision NOT NULL DEFAULT extract(epoch FROM now()),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aurelia_tareas_desarrollo_etapa_idx ON public.aurelia_tareas_desarrollo (etapa, posicion);

-- 4. Sin políticas: solo el servidor (service role) lee y escribe, después de
--    validar en la app que el usuario pertenece a Aurelia o es Master.
ALTER TABLE public.aurelia_onboarding_seguimiento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aurelia_onboarding_observaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aurelia_tareas_desarrollo ENABLE ROW LEVEL SECURITY;
