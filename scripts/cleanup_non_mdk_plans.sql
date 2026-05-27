-- Script para limpiar el campo plan de clientes que no son MDK
-- Solo los clientes de la unidad MDK pueden tener plan asignado

UPDATE clientes 
SET plan = NULL 
WHERE unidad_negocio IS NULL 
   OR unidad_negocio != 'MDK';

-- Verificar el resultado
SELECT 
  nombre_del_negocio, 
  unidad_negocio, 
  plan 
FROM clientes 
ORDER BY unidad_negocio, nombre_del_negocio;
