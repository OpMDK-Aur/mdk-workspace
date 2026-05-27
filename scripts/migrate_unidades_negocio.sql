-- =====================================================
-- MIGRACION: Unidades de Negocio Multiple + Eliminar Status
-- =====================================================
-- Este script:
-- 1. Agrega la columna unidades_negocio (array) a la tabla clientes
-- 2. Migra los datos de unidad_negocio (singular) a unidades_negocio (array)
-- 3. Limpia el campo plan para clientes que NO tienen MDK
-- 4. Elimina la columna status (ya no se usa, solo semaforo_unidades)
-- =====================================================

-- PASO 1: Agregar columna unidades_negocio como array de texto
ALTER TABLE clientes 
ADD COLUMN IF NOT EXISTS unidades_negocio TEXT[] DEFAULT '{}';

-- PASO 2: Migrar datos de unidad_negocio (singular) a unidades_negocio (array)
UPDATE clientes 
SET unidades_negocio = ARRAY[unidad_negocio]
WHERE unidad_negocio IS NOT NULL 
  AND (unidades_negocio IS NULL OR unidades_negocio = '{}');

-- PASO 3: Limpiar el plan para clientes que NO tienen MDK en sus unidades
UPDATE clientes 
SET plan = NULL 
WHERE NOT ('MDK' = ANY(unidades_negocio))
  AND plan IS NOT NULL;

-- PASO 4: Limpiar semaforo_unidades para que solo tenga las unidades asignadas
-- (Esto limpia semaforos de unidades que el cliente ya no tiene)
UPDATE clientes 
SET semaforo_unidades = (
  SELECT jsonb_object_agg(key, value)
  FROM jsonb_each(semaforo_unidades::jsonb)
  WHERE key = ANY(unidades_negocio)
)
WHERE semaforo_unidades IS NOT NULL;

-- PASO 5: (OPCIONAL) Eliminar la columna status ya que usamos semaforo_unidades
-- Descomentar si estas seguro de querer eliminarla
-- ALTER TABLE clientes DROP COLUMN IF EXISTS status;

-- =====================================================
-- VERIFICACION - Ejecuta estas queries para verificar
-- =====================================================

-- Ver clientes con sus unidades y semaforos
SELECT 
  nombre_del_negocio,
  unidades_negocio,
  semaforo_unidades,
  plan,
  CASE 
    WHEN 'MDK' = ANY(unidades_negocio) THEN 'Si'
    ELSE 'No'
  END as tiene_mdk
FROM clientes
ORDER BY nombre_del_negocio;

-- Contar clientes por cantidad de unidades
SELECT 
  array_length(unidades_negocio, 1) as cantidad_unidades,
  COUNT(*) as clientes
FROM clientes
GROUP BY array_length(unidades_negocio, 1)
ORDER BY cantidad_unidades;

-- Verificar que solo clientes MDK tienen plan
SELECT nombre_del_negocio, unidades_negocio, plan
FROM clientes
WHERE plan IS NOT NULL 
  AND NOT ('MDK' = ANY(unidades_negocio));
-- Este query NO deberia devolver filas si todo esta correcto
