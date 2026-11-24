-- Aurelia · Tareas dev: prioridad y comentarios.
-- Solo toca aurelia_tareas_desarrollo (tabla chica y propia de Aurelia) y crea una tabla nueva vacía.
SET statement_timeout = '15s';
SET lock_timeout = '3s';

-- 1. Prioridad. Con DEFAULT constante, Postgres no reescribe la tabla (cambio solo de metadatos).
ALTER TABLE public.aurelia_tareas_desarrollo
  ADD COLUMN IF NOT EXISTS prioridad boolean NOT NULL DEFAULT false;

-- 2. Comentarios de cada tarea.
CREATE TABLE IF NOT EXISTS public.aurelia_tareas_desarrollo_comentarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id uuid NOT NULL REFERENCES public.aurelia_tareas_desarrollo(id) ON DELETE CASCADE,
  autor_id uuid REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  contenido text NOT NULL CHECK (char_length(contenido) BETWEEN 1 AND 4000),
  editado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aurelia_tareas_desarrollo_comentarios_tarea_idx
  ON public.aurelia_tareas_desarrollo_comentarios (tarea_id, created_at);

-- 3. Sin políticas: solo el servidor (service role) lee y escribe, después de validar el acceso a Aurelia.
ALTER TABLE public.aurelia_tareas_desarrollo_comentarios ENABLE ROW LEVEL SECURITY;
