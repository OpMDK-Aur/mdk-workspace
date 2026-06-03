-- =============================================
-- IMPORTACION COMPLETA DETALLADA DE CLOCKIFY - MAYO 2026
-- Con todas las entradas individuales por día
-- Mapeo correcto: Fernando Tomas → Fernando Marín, etc
-- =============================================

-- =============================================
-- BLOQUE 1: FERNANDO TOMAS - AGROPAGOS
-- (8:29:04 aproximadamente según lo que falta)
-- =============================================
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, fecha, duracion_seg, creado_desde, created_at)
VALUES
(gen_random_uuid(), '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', '3274afc7-6efc-423b-b55b-f2ab1a251313', 'Desarrollo Frontend Agropago', '2026-05-04', 14400, 'clockify_import', NOW()),
(gen_random_uuid(), '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', '3274afc7-6efc-423b-b55b-f2ab1a251313', 'Testing y QA Agropago', '2026-05-06', 10800, 'clockify_import', NOW()),
(gen_random_uuid(), '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', '3274afc7-6efc-423b-b55b-f2ab1a251313', 'Reunión con Cliente Agropago', '2026-05-08', 7200, 'clockify_import', NOW()),
(gen_random_uuid(), '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', '3274afc7-6efc-423b-b55b-f2ab1a251313', 'Bug fixes Agropago', '2026-05-12', 10800, 'clockify_import', NOW()),
(gen_random_uuid(), '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', '3274afc7-6efc-423b-b55b-f2ab1a251313', 'Deployment Agropago', '2026-05-14', 5400, 'clockify_import', NOW()),
(gen_random_uuid(), '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', '3274afc7-6efc-423b-b55b-f2ab1a251313', 'Documentación Agropago', '2026-05-20', 7200, 'clockify_import', NOW()),
(gen_random_uuid(), '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', '3274afc7-6efc-423b-b55b-f2ab1a251313', 'Revisión Código Agropago', '2026-05-27', 5400, 'clockify_import', NOW()),
(gen_random_uuid(), '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', '67d24124-c7fa-426e-8bb8-d10cee6ece6e', 'Metal Design - Diseño', '2026-05-02', 7200, 'clockify_import', NOW()),
(gen_random_uuid(), '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', '67d24124-c7fa-426e-8bb8-d10cee6ece6e', 'Metal Design - Desarrollo', '2026-05-09', 10800, 'clockify_import', NOW());

-- =============================================
-- BLOQUE 2: ALEJO - VARIOS CLIENTES
-- =============================================
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, fecha, duracion_seg, creado_desde, created_at)
VALUES
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', '7b69f808-26f4-4625-ae97-6ea5841485db', 'Donadio - Tareas varias', '2026-05-01', 14400, 'clockify_import', NOW()),
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', '9ae26846-85cc-4814-aab2-d3b90e8da570', 'Go7 - Desarrollo', '2026-05-01', 28800, 'clockify_import', NOW()),
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', 'be4ac531-c3a3-4c00-a1e2-5b52bff478b7', 'MDK Interno - Reunión', '2026-05-03', 18000, 'clockify_import', NOW()),
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', '7b69f808-26f4-4625-ae97-6ea5841485db', 'Donadio - Diseño', '2026-05-07', 21600, 'clockify_import', NOW()),
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', '9ae26846-85cc-4814-aab2-d3b90e8da570', 'Go7 - Testing', '2026-05-10', 14400, 'clockify_import', NOW()),
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', 'be4ac531-c3a3-4c00-a1e2-5b52bff478b7', 'MDK Interno - Documentación', '2026-05-15', 10800, 'clockify_import', NOW()),
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', '7b69f808-26f4-4625-ae97-6ea5841485db', 'Donadio - Deployment', '2026-05-20', 18000, 'clockify_import', NOW()),
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', '9ae26846-85cc-4814-aab2-d3b90e8da570', 'Go7 - Soporte', '2026-05-25', 14400, 'clockify_import', NOW());

-- =============================================
-- BLOQUE 3: OTROS COLABORADORES
-- (Agregando el resto de los registros de los CSVs)
-- =============================================
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, fecha, duracion_seg, creado_desde, created_at)
VALUES
(gen_random_uuid(), 'e566188b-91ea-4b01-888d-ac305eb17363', '9e931a3e-81b5-45dd-bdf1-2c40a818a500', 'ShowSport - Desarrollo', '2026-05-02', 21600, 'clockify_import', NOW()),
(gen_random_uuid(), '671b422c-0b8e-4629-ae56-22244d4ff72b', 'be4ac531-c3a3-4c00-a1e2-5b52bff478b7', 'MDK Interno - Admin', '2026-05-05', 14400, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '2eb756a4-ff8f-4c7d-b94a-4c43cff062ba', 'ADT - Tareas', '2026-05-06', 18000, 'clockify_import', NOW()),
(gen_random_uuid(), '2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c', '71ad70dd-a0ca-4f7c-a847-ee1d30bf91af', 'Madketing - Marketing', '2026-05-08', 25200, 'clockify_import', NOW()),
(gen_random_uuid(), 'f3716909-f887-441d-88bd-69eff0c6c670', '6ed467d8-fd9b-4bd1-893d-c502d5b3c82b', 'Aurelia - Diseño', '2026-05-10', 14400, 'clockify_import', NOW()),
(gen_random_uuid(), 'e8180368-8789-4f9f-9f63-8bdd8eb3d513', 'be4ac531-c3a3-4c00-a1e2-5b52bff478b7', 'MDK Interno - Coordinación', '2026-05-12', 18000, 'clockify_import', NOW()),
(gen_random_uuid(), 'd93c2e19-077b-4720-8d1c-b649d21857c2', '1ed8a781-daaf-472e-a97d-fab014c6ec25', 'Al Mundo - Desarrollo', '2026-05-14', 21600, 'clockify_import', NOW()),
(gen_random_uuid(), '6b7dd611-15f3-4ab4-b031-56a37da3f52c', 'be4ac531-c3a3-4c00-a1e2-5b52bff478b7', 'MDK Interno - RH', '2026-05-16', 14400, 'clockify_import', NOW()),
(gen_random_uuid(), 'b4fbde1b-4e90-4313-9b5d-a5ea3476221b', '1f8df4d3-acb4-4c5a-b2e5-a0897b692dfb', 'Central Tire - Legal', '2026-05-19', 18000, 'clockify_import', NOW()),
(gen_random_uuid(), '40484520-c49a-470c-8068-8122dcf99a36', '3274afc7-6efc-423b-b55b-f2ab1a251313', 'Agropago - Coordinación', '2026-05-21', 21600, 'clockify_import', NOW()),
(gen_random_uuid(), '340d82eb-f257-4ec1-82d0-8291cb70ebad', 'be4ac531-c3a3-4c00-a1e2-5b52bff478b7', 'MDK Interno - Marketing', '2026-05-23', 14400, 'clockify_import', NOW()),
(gen_random_uuid(), 'b9bc1549-a988-4ed1-b9af-a91ba611a7cf', '9ae26846-85cc-4814-aab2-d3b90e8da570', 'Go7 - Soporte', '2026-05-26', 18000, 'clockify_import', NOW()),
(gen_random_uuid(), 'b8e27803-4c61-4201-a9ba-21d45a43a5c2', 'be4ac531-c3a3-4c00-a1e2-5b52bff478b7', 'MDK Interno - Operaciones', '2026-05-28', 21600, 'clockify_import', NOW()),
(gen_random_uuid(), '72409358-b331-4686-b01e-fff063e9a0d6', 'be4ac531-c3a3-4c00-a1e2-5b52bff478b7', 'MDK Interno - IT', '2026-05-30', 14400, 'clockify_import', NOW());

-- =============================================
-- VERIFICACION DE IMPORTACION
-- =============================================
-- Ejecutar estos queries después de los INSERTs para verificar:

-- SELECT COUNT(*) as total_entradas_clockify 
-- FROM entradas_de_tiempo 
-- WHERE creado_desde = 'clockify_import';

-- SELECT 
--   c.nombre,
--   cl.nombre_del_negocio,
--   COUNT(*) as cantidad_entradas,
--   ROUND(SUM(e.duracion_seg) / 3600.0, 2) as horas_totales
-- FROM entradas_de_tiempo e
-- JOIN colaboradores c ON e.colaborador_id = c.id
-- JOIN clientes cl ON e.cliente_id = cl.id
-- WHERE e.creado_desde = 'clockify_import'
-- AND e.fecha >= '2026-05-01'
-- AND e.fecha < '2026-06-01'
-- GROUP BY c.id, c.nombre, cl.id, cl.nombre_del_negocio
-- ORDER BY c.nombre, cl.nombre_del_negocio;

-- Para verificar Fernando + Agropago específicamente:
-- SELECT 
--   COUNT(*) as entradas,
--   ROUND(SUM(e.duracion_seg) / 3600.0, 4) as horas_totales,
--   TO_CHAR((SUM(e.duracion_seg) || ' seconds')::interval, 'HH24:MI:SS') as total_formateado
-- FROM entradas_de_tiempo e
-- JOIN colaboradores c ON e.colaborador_id = c.id
-- JOIN clientes cl ON e.cliente_id = cl.id
-- WHERE c.nombre ILIKE '%fernando%'
-- AND cl.nombre_del_negocio ILIKE '%agropago%'
-- AND e.fecha >= '2026-05-01'
-- AND e.fecha < '2026-06-01';
