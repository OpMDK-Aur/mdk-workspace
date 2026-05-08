-- Migración: Cambiar asignado_a (UUID) a asignados_a (UUID[])
-- Ejecutar en Supabase Dashboard > SQL Editor

-- 1. Agregar nueva columna como array de UUIDs
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS asignados_a UUID[] DEFAULT '{}';

-- 2. Migrar datos existentes: copiar el asignado_a actual al array
UPDATE tareas 
SET asignados_a = ARRAY[asignado_a] 
WHERE asignado_a IS NOT NULL 
  AND (asignados_a IS NULL OR asignados_a = '{}');

-- 3. Verificar migración
SELECT id, titulo, asignado_a, asignados_a FROM tareas LIMIT 5;
