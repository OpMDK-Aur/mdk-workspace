-- Script para agregar 'no_realizado' al constraint de estados de tareas
-- Ejecutar en Supabase SQL Editor

-- 1. Primero eliminar el constraint existente
ALTER TABLE tareas DROP CONSTRAINT IF EXISTS tareas_estado_check;

-- 2. Agregar el nuevo constraint con 'no_realizado' incluido
ALTER TABLE tareas ADD CONSTRAINT tareas_estado_check 
CHECK (estado IN ('pendiente', 'resolviendo', 'demorada', 'pausada', 'pendiente_aprobacion', 'resuelto', 'no_realizado'));

-- Verificar que el constraint se creó correctamente
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'tareas'::regclass AND contype = 'c';
