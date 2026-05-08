-- Desactiva los tipos de tarea genéricos (sin departamento) excepto Reunión, Entrega y Revisión
-- Estos tipos se muestran para todos los usuarios pero no son necesarios

UPDATE tipo_de_tareas 
SET activo = false 
WHERE departamento_id IS NULL 
AND nombre IN ('Administración', 'Desarrollo', 'Soporte');

-- Verificar los cambios
SELECT id, nombre, activo, departamento_id 
FROM tipo_de_tareas 
WHERE departamento_id IS NULL;
