-- Insertar tareas de ejemplo
-- Primero verificamos que existan clientes y colaboradores

-- Obtener IDs existentes para usar en las tareas
DO $$
DECLARE
  v_cliente_id UUID;
  v_colaborador_id UUID;
  v_tipo_tarea_id UUID;
BEGIN
  -- Obtener un cliente existente
  SELECT id INTO v_cliente_id FROM clientes LIMIT 1;
  
  -- Obtener un colaborador existente
  SELECT id INTO v_colaborador_id FROM colaboradores LIMIT 1;
  
  -- Obtener un tipo de tarea existente
  SELECT id INTO v_tipo_tarea_id FROM tipo_de_tareas WHERE activo = true LIMIT 1;

  -- Insertar tareas de ejemplo solo si tenemos los datos necesarios
  IF v_cliente_id IS NOT NULL AND v_colaborador_id IS NOT NULL THEN
    INSERT INTO tareas (titulo, descripcion, cliente_id, asignado_a, tipo_tarea_id, estado, prioridad, created_at, updated_at)
    VALUES 
      ('Landing avalian', 'Crear landing page para cliente Avalian', v_cliente_id, v_colaborador_id, v_tipo_tarea_id, 'pendiente', 'alta', NOW(), NOW()),
      ('Integración a mediad', 'Integrar formulario con CRM', v_cliente_id, v_colaborador_id, v_tipo_tarea_id, 'pendiente', 'alta', NOW(), NOW()),
      ('Configurar Meta Ads', 'Configurar campañas de Meta Ads', v_cliente_id, v_colaborador_id, v_tipo_tarea_id, 'resolviendo', 'media', NOW(), NOW())
    ON CONFLICT DO NOTHING;
    
    RAISE NOTICE 'Tareas insertadas correctamente';
  ELSE
    RAISE NOTICE 'No se encontraron clientes o colaboradores para asociar las tareas';
  END IF;
END $$;

-- Verificar las tareas insertadas
SELECT t.id, t.titulo, t.estado, t.prioridad, c.nombre_del_negocio as cliente, co.nombre as asignado
FROM tareas t
LEFT JOIN clientes c ON t.cliente_id = c.id
LEFT JOIN colaboradores co ON t.asignado_a = co.id;
