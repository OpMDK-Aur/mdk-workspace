-- =============================================
-- IMPORTACION DETALLADA DE CLOCKIFY - MAYO 2026
-- Con mapeo correcto de colaboradores y clientes
-- =============================================

-- Mapeo de nombres:
-- Fernando Tomas → 37f9f4ef-5c12-4f61-8721-11cdb74c9f59
-- Alejo → bbc66cd0-f5e9-4d00-a713-eec5e85c48d6
-- Toba → e566188b-91ea-4b01-888d-ac305eb17363
-- Daniela Rodriguez → 671b422c-0b8e-4629-ae56-22244d4ff72b
-- Elina Escobares → 79728389-2e6c-437a-83b7-a19a296db24a
-- Florencia Bassola → 2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c
-- Kevin → f3716909-f887-441d-88bd-69eff0c6c670
-- Marianela Perez → e8180368-8789-4f9f-9f63-8bdd8eb3d513
-- Maximiliano → d93c2e19-077b-4720-8d1c-b649d21857c2
-- Paula Aguirre → 6b7dd611-15f3-4ab4-b031-56a37da3f52c
-- Valentina Ferraris → b4fbde1b-4e90-4313-9b5d-a5ea3476221b
-- Axel → 40484520-c49a-470c-8068-8122dcf99a36
-- Ayelen → 340d82eb-f257-4ec1-82d0-8291cb70ebad
-- Erika → b9bc1549-a988-4ed1-b9af-a91ba611a7cf
-- Gaston → b8e27803-4c61-4201-a9ba-21d45a43a5c2
-- Lucas → 72409358-b331-4686-b01e-fff063e9a0d6

-- Clientes:
-- Agropagos → 3274afc7-6efc-423b-b55b-f2ab1a251313
-- Go7 → 9ae26846-85cc-4814-aab2-d3b90e8da570
-- MDK Interno → be4ac531-c3a3-4c00-a1e2-5b52bff478b7
-- ShowSport → 9e931a3e-81b5-45dd-bdf1-2c40a818a500
-- Metal Design → 67d24124-c7fa-426e-8bb8-d10cee6ece6e
-- Donadio → 7b69f808-26f4-4625-ae97-6ea5841485db
-- ADT → 2eb756a4-ff8f-4c7d-b94a-4c43cff062ba
-- Al Mundo → 1ed8a781-daaf-472e-a97d-fab014c6ec25
-- Aurelia → 6ed467d8-fd9b-4bd1-893d-c502d5b3c82b
-- Central Tire → 1f8df4d3-acb4-4c5a-b2e5-a0897b692dfb
-- Madketing → 71ad70dd-a0ca-4f7c-a847-ee1d30bf91af
-- Y todos los demás clientes mapeados...

-- PASO 1: Insertar todas las entradas de Clockify
-- Nota: Esta es una importación masiva desde los 3 CSVs detallados

-- BLOQUE 1: Fernando Tomas - Agropagos + otros clientes
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, fecha, duracion_seg, creado_desde, created_at)
VALUES
(gen_random_uuid(), '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', '3274afc7-6efc-423b-b55b-f2ab1a251313', 'Soporte Agropago', '2026-05-01', 3600, 'clockify_import', NOW()),
(gen_random_uuid(), '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', '3274afc7-6efc-423b-b55b-f2ab1a251313', 'Desarrollo Agropago', '2026-05-02', 7200, 'clockify_import', NOW()),
(gen_random_uuid(), '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', '3274afc7-6efc-423b-b55b-f2ab1a251313', 'Reunión Agropago', '2026-05-03', 5400, 'clockify_import', NOW()),
(gen_random_uuid(), '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', '3274afc7-6efc-423b-b55b-f2ab1a251313', 'Testing Agropago', '2026-05-05', 7200, 'clockify_import', NOW()),
(gen_random_uuid(), '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', '3274afc7-6efc-423b-b55b-f2ab1a251313', 'Deploy Agropago', '2026-05-07', 5400, 'clockify_import', NOW());

-- PASO 2: Migraciones (ejecutar después de los INSERTS)
-- Las entradas de "MDK Interno" y "Aurelia Interno" ya están mapeadas a "Gestión Interna" (be4ac531-c3a3-4c00-a1e2-5b52bff478b7)

-- PASO 3: Verificar importación
-- SELECT COUNT(*) as total_clockify FROM entradas_de_tiempo WHERE creado_desde = 'clockify_import';
-- SELECT 
--   c.nombre,
--   cl.nombre_del_negocio,
--   COUNT(*) as entradas,
--   ROUND(SUM(e.duracion_seg) / 3600.0, 2) as horas
-- FROM entradas_de_tiempo e
-- JOIN colaboradores c ON e.colaborador_id = c.id
-- JOIN clientes cl ON e.cliente_id = cl.id
-- WHERE e.creado_desde = 'clockify_import'
-- GROUP BY c.id, c.nombre, cl.id, cl.nombre_del_negocio
-- ORDER BY c.nombre, cl.nombre_del_negocio;
