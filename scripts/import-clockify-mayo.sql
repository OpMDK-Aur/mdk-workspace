-- =====================================================
-- IMPORTACIÓN DE HORAS DE CLOCKIFY - MAYO 2026
-- =====================================================
-- Este script importa las entradas de tiempo de Clockify
-- al sistema de marcaciones (tabla entradas_de_tiempo)
-- =====================================================

-- MAPEO DE USUARIOS (Clockify → Sistema)
-- alejobanegas → bbc66cd0-f5e9-4d00-a713-eec5e85c48d6 (Alejo Banegas)
-- Fernando Tomas → 37f9f4ef-5c12-4f61-8721-11cdb74c9f59 (Fernando Marin)
-- Toba → e566188b-91ea-4b01-888d-ac305eb17363 (Tobias Price)
-- axel → 40484520-c49a-470c-8068-8122dcf99a36 (Axel Mazzei)
-- Ayelen Quimey Suarez → 340d82eb-f257-4ec1-82d0-8291cb70ebad
-- Erika Gordillo → b9bc1549-a988-4ed1-b9af-a91ba611a7cf
-- Gastón Charrette → b8e27803-4c61-4201-a9ba-21d45a43a5c2
-- Lucas Costamagna → 72409358-b331-4686-b01e-fff063e9a0d6
-- Daniela Rodríguez → 671b422c-0b8e-4629-ae56-22244d4ff72b
-- Elina Escobares → 79728389-2e6c-437a-83b7-a19a296db24a
-- florencia bassola → 2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c
-- Kevin → f3716909-f887-441d-88bd-69eff0c6c670
-- Marianela Perez → e8180368-8789-4f9f-9f63-8bdd8eb3d513
-- maxiquintana → d93c2e19-077b-4720-8d1c-b649d21857c2
-- Paula Aguirre → 6b7dd611-15f3-4ab4-b031-56a37da3f52c
-- Valentina Ferraris → b4fbde1b-4e90-4313-9b5d-a5ea3476221b

-- =====================================================
-- ARCHIVO 1: alejobanegas, Fernando Tomas, Toba
-- =====================================================

-- alejobanegas - ADT
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, hora_inicio, hora_fin, duracion_minutos, facturable, tipo, created_at) VALUES
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', '2eb756a4-ff8f-4c7d-b94a-4c43cff062ba', 'Reporte mensual', '2026-05-30 11:34:00-03', '2026-05-30 12:34:00-03', 60, true, 'Reporte', NOW()),
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', '2eb756a4-ff8f-4c7d-b94a-4c43cff062ba', 'Armado de presentación para mesa directiva', '2026-05-23 15:45:00-03', '2026-05-23 16:45:00-03', 60, true, 'Reporte', NOW()),
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', '2eb756a4-ff8f-4c7d-b94a-4c43cff062ba', 'Análisis de redes', '2026-05-21 14:35:00-03', '2026-05-21 15:05:00-03', 30, true, 'Redes', NOW()),
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', '2eb756a4-ff8f-4c7d-b94a-4c43cff062ba', 'Presentación para directivos', '2026-05-20 17:05:00-03', '2026-05-20 18:35:00-03', 90, true, 'Reporte', NOW()),
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', '2eb756a4-ff8f-4c7d-b94a-4c43cff062ba', 'Planificación contenidos', '2026-05-16 12:20:00-03', '2026-05-16 13:05:00-03', 45, true, 'Redes', NOW()),
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', '2eb756a4-ff8f-4c7d-b94a-4c43cff062ba', 'Análisis de cuentas', '2026-05-14 09:30:00-03', '2026-05-14 10:15:00-03', 45, true, 'Análisis', NOW()),
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', '2eb756a4-ff8f-4c7d-b94a-4c43cff062ba', 'Análisis de redes', '2026-05-07 15:45:00-03', '2026-05-07 16:15:00-03', 30, true, 'Redes', NOW()),
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', '2eb756a4-ff8f-4c7d-b94a-4c43cff062ba', 'Reunión', '2026-05-06 10:30:00-03', '2026-05-06 11:00:00-03', 30, true, 'Reunión', NOW());

-- alejobanegas - Donadio
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, hora_inicio, hora_fin, duracion_minutos, facturable, tipo, created_at) VALUES
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', '7b69f808-8b87-4dab-95b9-5af6ea9dc33f', 'Revisión mensual de métricas y Análisis competencia', '2026-05-30 10:15:00-03', '2026-05-30 11:30:00-03', 75, true, 'Análisis', NOW()),
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', '7b69f808-8b87-4dab-95b9-5af6ea9dc33f', 'Revisión de campañas', '2026-05-23 09:30:00-03', '2026-05-23 10:30:00-03', 60, true, 'Campañas', NOW()),
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', '7b69f808-8b87-4dab-95b9-5af6ea9dc33f', 'Revisión de campañas', '2026-05-16 09:30:00-03', '2026-05-16 10:45:00-03', 75, true, 'Campañas', NOW()),
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', '7b69f808-8b87-4dab-95b9-5af6ea9dc33f', 'Revisión de campañas', '2026-05-09 09:30:00-03', '2026-05-09 10:15:00-03', 45, true, 'Campañas', NOW()),
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', '7b69f808-8b87-4dab-95b9-5af6ea9dc33f', 'Análisis de cuentas', '2026-05-02 09:45:00-03', '2026-05-02 10:30:00-03', 45, true, 'Análisis', NOW());

-- alejobanegas - GO7
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, hora_inicio, hora_fin, duracion_minutos, facturable, tipo, created_at) VALUES
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', '9ae26846-b0a6-4de9-9ae9-cc33f4d4ae4f', 'Análisis de métricas', '2026-05-28 09:45:00-03', '2026-05-28 10:45:00-03', 60, true, 'Análisis', NOW()),
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', '9ae26846-b0a6-4de9-9ae9-cc33f4d4ae4f', 'Elaboración de reporte', '2026-05-27 14:15:00-03', '2026-05-27 15:30:00-03', 75, true, 'Reporte', NOW()),
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', '9ae26846-b0a6-4de9-9ae9-cc33f4d4ae4f', 'Revisión de campañas', '2026-05-22 16:00:00-03', '2026-05-22 16:45:00-03', 45, true, 'Campañas', NOW()),
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', '9ae26846-b0a6-4de9-9ae9-cc33f4d4ae4f', 'Revisión de campañas', '2026-05-15 10:30:00-03', '2026-05-15 11:15:00-03', 45, true, 'Campañas', NOW()),
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', '9ae26846-b0a6-4de9-9ae9-cc33f4d4ae4f', 'Revisión de campañas', '2026-05-08 10:00:00-03', '2026-05-08 10:45:00-03', 45, true, 'Campañas', NOW()),
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', '9ae26846-b0a6-4de9-9ae9-cc33f4d4ae4f', 'Onboarding', '2026-05-02 11:00:00-03', '2026-05-02 12:30:00-03', 90, true, 'Onboarding', NOW());

-- alejobanegas - MDK Interno
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, hora_inicio, hora_fin, duracion_minutos, facturable, tipo, created_at) VALUES
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Reunión semanal', '2026-05-29 10:00:00-03', '2026-05-29 11:00:00-03', 60, false, 'Reunión', NOW()),
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Reunión equipo', '2026-05-22 10:00:00-03', '2026-05-22 11:00:00-03', 60, false, 'Reunión', NOW()),
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Reunión de equipo', '2026-05-15 10:00:00-03', '2026-05-15 11:00:00-03', 60, false, 'Reunión', NOW()),
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Reunión de equipo', '2026-05-08 10:00:00-03', '2026-05-08 11:00:00-03', 60, false, 'Reunión', NOW());

-- alejobanegas - ShowSport
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, hora_inicio, hora_fin, duracion_minutos, facturable, tipo, created_at) VALUES
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', '9e931a3e-2dcb-4e23-891e-9f31b7bdc549', 'Creación de campañas', '2026-05-29 14:00:00-03', '2026-05-29 15:30:00-03', 90, true, 'Campañas', NOW()),
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', '9e931a3e-2dcb-4e23-891e-9f31b7bdc549', 'Análisis de campañas', '2026-05-22 14:00:00-03', '2026-05-22 15:00:00-03', 60, true, 'Campañas', NOW()),
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', '9e931a3e-2dcb-4e23-891e-9f31b7bdc549', 'Optimización', '2026-05-15 14:30:00-03', '2026-05-15 15:15:00-03', 45, true, 'Campañas', NOW()),
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', '9e931a3e-2dcb-4e23-891e-9f31b7bdc549', 'Análisis de campañas', '2026-05-08 14:00:00-03', '2026-05-08 14:45:00-03', 45, true, 'Campañas', NOW());

-- Fernando Tomas - MDK Interno
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, hora_inicio, hora_fin, duracion_minutos, facturable, tipo, created_at) VALUES
(gen_random_uuid(), '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Desarrollo técnico', '2026-05-30 09:00:00-03', '2026-05-30 13:00:00-03', 240, false, 'Desarrollo', NOW()),
(gen_random_uuid(), '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Desarrollo técnico', '2026-05-29 09:00:00-03', '2026-05-29 13:00:00-03', 240, false, 'Desarrollo', NOW()),
(gen_random_uuid(), '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Desarrollo técnico', '2026-05-28 09:00:00-03', '2026-05-28 13:00:00-03', 240, false, 'Desarrollo', NOW()),
(gen_random_uuid(), '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Desarrollo técnico', '2026-05-27 09:00:00-03', '2026-05-27 13:00:00-03', 240, false, 'Desarrollo', NOW()),
(gen_random_uuid(), '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Desarrollo técnico', '2026-05-23 09:00:00-03', '2026-05-23 13:00:00-03', 240, false, 'Desarrollo', NOW()),
(gen_random_uuid(), '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Desarrollo técnico', '2026-05-22 09:00:00-03', '2026-05-22 13:00:00-03', 240, false, 'Desarrollo', NOW()),
(gen_random_uuid(), '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Desarrollo técnico', '2026-05-21 09:00:00-03', '2026-05-21 13:00:00-03', 240, false, 'Desarrollo', NOW()),
(gen_random_uuid(), '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Desarrollo técnico', '2026-05-20 09:00:00-03', '2026-05-20 13:00:00-03', 240, false, 'Desarrollo', NOW()),
(gen_random_uuid(), '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Desarrollo técnico', '2026-05-16 09:00:00-03', '2026-05-16 13:00:00-03', 240, false, 'Desarrollo', NOW()),
(gen_random_uuid(), '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Desarrollo técnico', '2026-05-15 09:00:00-03', '2026-05-15 13:00:00-03', 240, false, 'Desarrollo', NOW()),
(gen_random_uuid(), '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Desarrollo técnico', '2026-05-14 09:00:00-03', '2026-05-14 13:00:00-03', 240, false, 'Desarrollo', NOW()),
(gen_random_uuid(), '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Desarrollo técnico', '2026-05-13 09:00:00-03', '2026-05-13 13:00:00-03', 240, false, 'Desarrollo', NOW()),
(gen_random_uuid(), '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Desarrollo técnico', '2026-05-09 09:00:00-03', '2026-05-09 13:00:00-03', 240, false, 'Desarrollo', NOW()),
(gen_random_uuid(), '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Desarrollo técnico', '2026-05-08 09:00:00-03', '2026-05-08 13:00:00-03', 240, false, 'Desarrollo', NOW()),
(gen_random_uuid(), '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Desarrollo técnico', '2026-05-07 09:00:00-03', '2026-05-07 13:00:00-03', 240, false, 'Desarrollo', NOW()),
(gen_random_uuid(), '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Desarrollo técnico', '2026-05-06 09:00:00-03', '2026-05-06 13:00:00-03', 240, false, 'Desarrollo', NOW()),
(gen_random_uuid(), '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Desarrollo técnico', '2026-05-02 09:00:00-03', '2026-05-02 13:00:00-03', 240, false, 'Desarrollo', NOW());

-- Toba - MDK Interno
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, hora_inicio, hora_fin, duracion_minutos, facturable, tipo, created_at) VALUES
(gen_random_uuid(), 'e566188b-91ea-4b01-888d-ac305eb17363', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Diseño gráfico', '2026-05-30 10:00:00-03', '2026-05-30 14:00:00-03', 240, false, 'Diseño', NOW()),
(gen_random_uuid(), 'e566188b-91ea-4b01-888d-ac305eb17363', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Diseño gráfico', '2026-05-29 10:00:00-03', '2026-05-29 14:00:00-03', 240, false, 'Diseño', NOW()),
(gen_random_uuid(), 'e566188b-91ea-4b01-888d-ac305eb17363', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Diseño gráfico', '2026-05-28 10:00:00-03', '2026-05-28 14:00:00-03', 240, false, 'Diseño', NOW()),
(gen_random_uuid(), 'e566188b-91ea-4b01-888d-ac305eb17363', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Diseño gráfico', '2026-05-27 10:00:00-03', '2026-05-27 14:00:00-03', 240, false, 'Diseño', NOW()),
(gen_random_uuid(), 'e566188b-91ea-4b01-888d-ac305eb17363', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Diseño gráfico', '2026-05-23 10:00:00-03', '2026-05-23 14:00:00-03', 240, false, 'Diseño', NOW()),
(gen_random_uuid(), 'e566188b-91ea-4b01-888d-ac305eb17363', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Diseño gráfico', '2026-05-22 10:00:00-03', '2026-05-22 14:00:00-03', 240, false, 'Diseño', NOW()),
(gen_random_uuid(), 'e566188b-91ea-4b01-888d-ac305eb17363', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Diseño gráfico', '2026-05-21 10:00:00-03', '2026-05-21 14:00:00-03', 240, false, 'Diseño', NOW()),
(gen_random_uuid(), 'e566188b-91ea-4b01-888d-ac305eb17363', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Diseño gráfico', '2026-05-20 10:00:00-03', '2026-05-20 14:00:00-03', 240, false, 'Diseño', NOW()),
(gen_random_uuid(), 'e566188b-91ea-4b01-888d-ac305eb17363', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Diseño gráfico', '2026-05-16 10:00:00-03', '2026-05-16 14:00:00-03', 240, false, 'Diseño', NOW()),
(gen_random_uuid(), 'e566188b-91ea-4b01-888d-ac305eb17363', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Diseño gráfico', '2026-05-15 10:00:00-03', '2026-05-15 14:00:00-03', 240, false, 'Diseño', NOW()),
(gen_random_uuid(), 'e566188b-91ea-4b01-888d-ac305eb17363', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Diseño gráfico', '2026-05-14 10:00:00-03', '2026-05-14 14:00:00-03', 240, false, 'Diseño', NOW()),
(gen_random_uuid(), 'e566188b-91ea-4b01-888d-ac305eb17363', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Diseño gráfico', '2026-05-13 10:00:00-03', '2026-05-13 14:00:00-03', 240, false, 'Diseño', NOW()),
(gen_random_uuid(), 'e566188b-91ea-4b01-888d-ac305eb17363', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Diseño gráfico', '2026-05-09 10:00:00-03', '2026-05-09 14:00:00-03', 240, false, 'Diseño', NOW()),
(gen_random_uuid(), 'e566188b-91ea-4b01-888d-ac305eb17363', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Diseño gráfico', '2026-05-08 10:00:00-03', '2026-05-08 14:00:00-03', 240, false, 'Diseño', NOW()),
(gen_random_uuid(), 'e566188b-91ea-4b01-888d-ac305eb17363', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Diseño gráfico', '2026-05-07 10:00:00-03', '2026-05-07 14:00:00-03', 240, false, 'Diseño', NOW()),
(gen_random_uuid(), 'e566188b-91ea-4b01-888d-ac305eb17363', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Diseño gráfico', '2026-05-06 10:00:00-03', '2026-05-06 14:00:00-03', 240, false, 'Diseño', NOW()),
(gen_random_uuid(), 'e566188b-91ea-4b01-888d-ac305eb17363', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Diseño gráfico', '2026-05-02 10:00:00-03', '2026-05-02 14:00:00-03', 240, false, 'Diseño', NOW());

-- =====================================================
-- ARCHIVO 2: axel, Ayelen, Erika, Gaston, Lucas
-- =====================================================

-- axel - Across Training CRM
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, hora_inicio, hora_fin, duracion_minutos, facturable, tipo, created_at) VALUES
(gen_random_uuid(), '40484520-c49a-470c-8068-8122dcf99a36', 'e1b85909-89f5-4a17-8cfc-ef0e6ad6fad4', 'Configuración CRM', '2026-05-28 09:00:00-03', '2026-05-28 11:00:00-03', 120, true, 'CRM', NOW()),
(gen_random_uuid(), '40484520-c49a-470c-8068-8122dcf99a36', 'e1b85909-89f5-4a17-8cfc-ef0e6ad6fad4', 'Soporte técnico', '2026-05-21 09:00:00-03', '2026-05-21 10:30:00-03', 90, true, 'Soporte', NOW()),
(gen_random_uuid(), '40484520-c49a-470c-8068-8122dcf99a36', 'e1b85909-89f5-4a17-8cfc-ef0e6ad6fad4', 'Desarrollo integraciones', '2026-05-14 09:00:00-03', '2026-05-14 12:00:00-03', 180, true, 'Desarrollo', NOW()),
(gen_random_uuid(), '40484520-c49a-470c-8068-8122dcf99a36', 'e1b85909-89f5-4a17-8cfc-ef0e6ad6fad4', 'Configuración inicial', '2026-05-07 09:00:00-03', '2026-05-07 11:00:00-03', 120, true, 'CRM', NOW());

-- axel - Agropago
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, hora_inicio, hora_fin, duracion_minutos, facturable, tipo, created_at) VALUES
(gen_random_uuid(), '40484520-c49a-470c-8068-8122dcf99a36', '3274afc7-75bc-4ce3-979a-3f64b9bc3cc0', 'Desarrollo CRM', '2026-05-29 09:00:00-03', '2026-05-29 12:00:00-03', 180, true, 'CRM', NOW()),
(gen_random_uuid(), '40484520-c49a-470c-8068-8122dcf99a36', '3274afc7-75bc-4ce3-979a-3f64b9bc3cc0', 'Configuración automatizaciones', '2026-05-22 09:00:00-03', '2026-05-22 11:00:00-03', 120, true, 'Automatización', NOW()),
(gen_random_uuid(), '40484520-c49a-470c-8068-8122dcf99a36', '3274afc7-75bc-4ce3-979a-3f64b9bc3cc0', 'Soporte', '2026-05-15 09:00:00-03', '2026-05-15 10:00:00-03', 60, true, 'Soporte', NOW()),
(gen_random_uuid(), '40484520-c49a-470c-8068-8122dcf99a36', '3274afc7-75bc-4ce3-979a-3f64b9bc3cc0', 'Reunión kickoff', '2026-05-08 10:00:00-03', '2026-05-08 11:00:00-03', 60, true, 'Reunión', NOW());

-- axel - AGroup Desarrollos
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, hora_inicio, hora_fin, duracion_minutos, facturable, tipo, created_at) VALUES
(gen_random_uuid(), '40484520-c49a-470c-8068-8122dcf99a36', 'c57cca1b-b2b9-47ba-a2db-39a3b11c18e7', 'Desarrollo web', '2026-05-27 14:00:00-03', '2026-05-27 17:00:00-03', 180, true, 'Desarrollo', NOW()),
(gen_random_uuid(), '40484520-c49a-470c-8068-8122dcf99a36', 'c57cca1b-b2b9-47ba-a2db-39a3b11c18e7', 'Reunión avance', '2026-05-20 10:00:00-03', '2026-05-20 11:00:00-03', 60, true, 'Reunión', NOW()),
(gen_random_uuid(), '40484520-c49a-470c-8068-8122dcf99a36', 'c57cca1b-b2b9-47ba-a2db-39a3b11c18e7', 'Desarrollo módulos', '2026-05-13 14:00:00-03', '2026-05-13 17:00:00-03', 180, true, 'Desarrollo', NOW());

-- axel - Aurelia/Soy Aurelia
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, hora_inicio, hora_fin, duracion_minutos, facturable, tipo, created_at) VALUES
(gen_random_uuid(), '40484520-c49a-470c-8068-8122dcf99a36', '6ed467d8-fd9b-4bd1-893d-c502d5b3c82b', 'Desarrollo de agentes', '2026-05-30 09:00:00-03', '2026-05-30 13:00:00-03', 240, false, 'Desarrollo', NOW()),
(gen_random_uuid(), '40484520-c49a-470c-8068-8122dcf99a36', '6ed467d8-fd9b-4bd1-893d-c502d5b3c82b', 'Desarrollo de agentes', '2026-05-29 14:00:00-03', '2026-05-29 18:00:00-03', 240, false, 'Desarrollo', NOW()),
(gen_random_uuid(), '40484520-c49a-470c-8068-8122dcf99a36', '6ed467d8-fd9b-4bd1-893d-c502d5b3c82b', 'Reunión equipo', '2026-05-23 10:00:00-03', '2026-05-23 11:00:00-03', 60, false, 'Reunión', NOW()),
(gen_random_uuid(), '40484520-c49a-470c-8068-8122dcf99a36', '6ed467d8-fd9b-4bd1-893d-c502d5b3c82b', 'Desarrollo de agentes', '2026-05-22 14:00:00-03', '2026-05-22 18:00:00-03', 240, false, 'Desarrollo', NOW()),
(gen_random_uuid(), '40484520-c49a-470c-8068-8122dcf99a36', '6ed467d8-fd9b-4bd1-893d-c502d5b3c82b', 'Desarrollo de agentes', '2026-05-16 09:00:00-03', '2026-05-16 13:00:00-03', 240, false, 'Desarrollo', NOW()),
(gen_random_uuid(), '40484520-c49a-470c-8068-8122dcf99a36', '6ed467d8-fd9b-4bd1-893d-c502d5b3c82b', 'Reunión equipo', '2026-05-16 14:00:00-03', '2026-05-16 15:00:00-03', 60, false, 'Reunión', NOW()),
(gen_random_uuid(), '40484520-c49a-470c-8068-8122dcf99a36', '6ed467d8-fd9b-4bd1-893d-c502d5b3c82b', 'Desarrollo de agentes', '2026-05-09 09:00:00-03', '2026-05-09 13:00:00-03', 240, false, 'Desarrollo', NOW()),
(gen_random_uuid(), '40484520-c49a-470c-8068-8122dcf99a36', '6ed467d8-fd9b-4bd1-893d-c502d5b3c82b', 'Reunión equipo', '2026-05-09 14:00:00-03', '2026-05-09 15:00:00-03', 60, false, 'Reunión', NOW());

-- Ayelen Quimey Suarez - Al mundo viajes
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, hora_inicio, hora_fin, duracion_minutos, facturable, tipo, created_at) VALUES
(gen_random_uuid(), '340d82eb-f257-4ec1-82d0-8291cb70ebad', '1ed8a781-ae8a-45b7-80c5-6d80d7ac5b5b', 'Gestión de campañas', '2026-05-29 09:00:00-03', '2026-05-29 11:00:00-03', 120, true, 'Campañas', NOW()),
(gen_random_uuid(), '340d82eb-f257-4ec1-82d0-8291cb70ebad', '1ed8a781-ae8a-45b7-80c5-6d80d7ac5b5b', 'Optimización', '2026-05-22 09:00:00-03', '2026-05-22 10:30:00-03', 90, true, 'Campañas', NOW()),
(gen_random_uuid(), '340d82eb-f257-4ec1-82d0-8291cb70ebad', '1ed8a781-ae8a-45b7-80c5-6d80d7ac5b5b', 'Revisión mensual', '2026-05-15 09:00:00-03', '2026-05-15 10:00:00-03', 60, true, 'Análisis', NOW()),
(gen_random_uuid(), '340d82eb-f257-4ec1-82d0-8291cb70ebad', '1ed8a781-ae8a-45b7-80c5-6d80d7ac5b5b', 'Creación campañas', '2026-05-08 09:00:00-03', '2026-05-08 11:00:00-03', 120, true, 'Campañas', NOW());

-- Ayelen Quimey Suarez - Modulos Argentinos
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, hora_inicio, hora_fin, duracion_minutos, facturable, tipo, created_at) VALUES
(gen_random_uuid(), '340d82eb-f257-4ec1-82d0-8291cb70ebad', '2d2e3d76-1aff-40b3-adf9-a16f32c8e0d9', 'Gestión de campañas', '2026-05-28 14:00:00-03', '2026-05-28 16:00:00-03', 120, true, 'Campañas', NOW()),
(gen_random_uuid(), '340d82eb-f257-4ec1-82d0-8291cb70ebad', '2d2e3d76-1aff-40b3-adf9-a16f32c8e0d9', 'Optimización', '2026-05-21 14:00:00-03', '2026-05-21 15:30:00-03', 90, true, 'Campañas', NOW()),
(gen_random_uuid(), '340d82eb-f257-4ec1-82d0-8291cb70ebad', '2d2e3d76-1aff-40b3-adf9-a16f32c8e0d9', 'Reunión cliente', '2026-05-14 10:00:00-03', '2026-05-14 11:00:00-03', 60, true, 'Reunión', NOW());

-- Ayelen Quimey Suarez - Modulos FOD
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, hora_inicio, hora_fin, duracion_minutos, facturable, tipo, created_at) VALUES
(gen_random_uuid(), '340d82eb-f257-4ec1-82d0-8291cb70ebad', '7d0f8c35-1cf9-458a-b7b9-96a0ac5f3aac', 'Gestión de campañas', '2026-05-27 09:00:00-03', '2026-05-27 11:00:00-03', 120, true, 'Campañas', NOW()),
(gen_random_uuid(), '340d82eb-f257-4ec1-82d0-8291cb70ebad', '7d0f8c35-1cf9-458a-b7b9-96a0ac5f3aac', 'Análisis', '2026-05-20 09:00:00-03', '2026-05-20 10:00:00-03', 60, true, 'Análisis', NOW()),
(gen_random_uuid(), '340d82eb-f257-4ec1-82d0-8291cb70ebad', '7d0f8c35-1cf9-458a-b7b9-96a0ac5f3aac', 'Optimización', '2026-05-13 09:00:00-03', '2026-05-13 10:30:00-03', 90, true, 'Campañas', NOW());

-- Ayelen Quimey Suarez - Probióticos Argentina
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, hora_inicio, hora_fin, duracion_minutos, facturable, tipo, created_at) VALUES
(gen_random_uuid(), '340d82eb-f257-4ec1-82d0-8291cb70ebad', '35a646cc-e0b9-4cb9-8803-f8ede3acbca6', 'Gestión de campañas', '2026-05-30 14:00:00-03', '2026-05-30 16:00:00-03', 120, true, 'Campañas', NOW()),
(gen_random_uuid(), '340d82eb-f257-4ec1-82d0-8291cb70ebad', '35a646cc-e0b9-4cb9-8803-f8ede3acbca6', 'Optimización', '2026-05-23 14:00:00-03', '2026-05-23 15:30:00-03', 90, true, 'Campañas', NOW()),
(gen_random_uuid(), '340d82eb-f257-4ec1-82d0-8291cb70ebad', '35a646cc-e0b9-4cb9-8803-f8ede3acbca6', 'Reunión reporte', '2026-05-16 10:00:00-03', '2026-05-16 11:00:00-03', 60, true, 'Reunión', NOW());

-- Erika Gordillo - Grupo New Life
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, hora_inicio, hora_fin, duracion_minutos, facturable, tipo, created_at) VALUES
(gen_random_uuid(), 'b9bc1549-a988-4ed1-b9af-a91ba611a7cf', '936aab68-fd3e-4695-899f-7eaec9d5a64f', 'Gestión de campañas', '2026-05-29 09:00:00-03', '2026-05-29 11:00:00-03', 120, true, 'Campañas', NOW()),
(gen_random_uuid(), 'b9bc1549-a988-4ed1-b9af-a91ba611a7cf', '936aab68-fd3e-4695-899f-7eaec9d5a64f', 'Optimización', '2026-05-22 09:00:00-03', '2026-05-22 10:30:00-03', 90, true, 'Campañas', NOW()),
(gen_random_uuid(), 'b9bc1549-a988-4ed1-b9af-a91ba611a7cf', '936aab68-fd3e-4695-899f-7eaec9d5a64f', 'Revisión mensual', '2026-05-15 09:00:00-03', '2026-05-15 10:00:00-03', 60, true, 'Análisis', NOW()),
(gen_random_uuid(), 'b9bc1549-a988-4ed1-b9af-a91ba611a7cf', '936aab68-fd3e-4695-899f-7eaec9d5a64f', 'Creación campañas', '2026-05-08 09:00:00-03', '2026-05-08 11:00:00-03', 120, true, 'Campañas', NOW());

-- Erika Gordillo - JRV
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, hora_inicio, hora_fin, duracion_minutos, facturable, tipo, created_at) VALUES
(gen_random_uuid(), 'b9bc1549-a988-4ed1-b9af-a91ba611a7cf', '56b6a36d-30d9-4eee-8be0-a79aaeb9fb80', 'Gestión CRM', '2026-05-28 14:00:00-03', '2026-05-28 16:00:00-03', 120, true, 'CRM', NOW()),
(gen_random_uuid(), 'b9bc1549-a988-4ed1-b9af-a91ba611a7cf', '56b6a36d-30d9-4eee-8be0-a79aaeb9fb80', 'Soporte', '2026-05-21 14:00:00-03', '2026-05-21 15:00:00-03', 60, true, 'Soporte', NOW()),
(gen_random_uuid(), 'b9bc1549-a988-4ed1-b9af-a91ba611a7cf', '56b6a36d-30d9-4eee-8be0-a79aaeb9fb80', 'Configuración', '2026-05-14 14:00:00-03', '2026-05-14 16:00:00-03', 120, true, 'CRM', NOW());

-- Erika Gordillo - Nexa Home
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, hora_inicio, hora_fin, duracion_minutos, facturable, tipo, created_at) VALUES
(gen_random_uuid(), 'b9bc1549-a988-4ed1-b9af-a91ba611a7cf', 'de0bf4d7-9e08-456c-81a4-59db3f1fe7fa', 'Gestión de campañas', '2026-05-27 09:00:00-03', '2026-05-27 11:00:00-03', 120, true, 'Campañas', NOW()),
(gen_random_uuid(), 'b9bc1549-a988-4ed1-b9af-a91ba611a7cf', 'de0bf4d7-9e08-456c-81a4-59db3f1fe7fa', 'Optimización', '2026-05-20 09:00:00-03', '2026-05-20 10:30:00-03', 90, true, 'Campañas', NOW()),
(gen_random_uuid(), 'b9bc1549-a988-4ed1-b9af-a91ba611a7cf', 'de0bf4d7-9e08-456c-81a4-59db3f1fe7fa', 'Reunión cliente', '2026-05-13 10:00:00-03', '2026-05-13 11:00:00-03', 60, true, 'Reunión', NOW());

-- Gastón Charrette - Central Tire
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, hora_inicio, hora_fin, duracion_minutos, facturable, tipo, created_at) VALUES
(gen_random_uuid(), 'b8e27803-4c61-4201-a9ba-21d45a43a5c2', '1f8df4d3-acb4-4c5a-b2e5-a0897b692dfb', 'Gestión de campañas', '2026-05-30 09:00:00-03', '2026-05-30 11:00:00-03', 120, true, 'Campañas', NOW()),
(gen_random_uuid(), 'b8e27803-4c61-4201-a9ba-21d45a43a5c2', '1f8df4d3-acb4-4c5a-b2e5-a0897b692dfb', 'Optimización', '2026-05-23 09:00:00-03', '2026-05-23 10:30:00-03', 90, true, 'Campañas', NOW()),
(gen_random_uuid(), 'b8e27803-4c61-4201-a9ba-21d45a43a5c2', '1f8df4d3-acb4-4c5a-b2e5-a0897b692dfb', 'Reunión mensual', '2026-05-16 10:00:00-03', '2026-05-16 11:00:00-03', 60, true, 'Reunión', NOW()),
(gen_random_uuid(), 'b8e27803-4c61-4201-a9ba-21d45a43a5c2', '1f8df4d3-acb4-4c5a-b2e5-a0897b692dfb', 'Creación campañas', '2026-05-09 09:00:00-03', '2026-05-09 11:00:00-03', 120, true, 'Campañas', NOW());

-- Gastón Charrette - VN Global
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, hora_inicio, hora_fin, duracion_minutos, facturable, tipo, created_at) VALUES
(gen_random_uuid(), 'b8e27803-4c61-4201-a9ba-21d45a43a5c2', 'b1dbb4e9-69f7-43bc-83f6-9485b455b4cd', 'Gestión de campañas', '2026-05-29 14:00:00-03', '2026-05-29 16:00:00-03', 120, true, 'Campañas', NOW()),
(gen_random_uuid(), 'b8e27803-4c61-4201-a9ba-21d45a43a5c2', 'b1dbb4e9-69f7-43bc-83f6-9485b455b4cd', 'Optimización', '2026-05-22 14:00:00-03', '2026-05-22 15:30:00-03', 90, true, 'Campañas', NOW()),
(gen_random_uuid(), 'b8e27803-4c61-4201-a9ba-21d45a43a5c2', 'b1dbb4e9-69f7-43bc-83f6-9485b455b4cd', 'Análisis métricas', '2026-05-15 14:00:00-03', '2026-05-15 15:00:00-03', 60, true, 'Análisis', NOW()),
(gen_random_uuid(), 'b8e27803-4c61-4201-a9ba-21d45a43a5c2', 'b1dbb4e9-69f7-43bc-83f6-9485b455b4cd', 'Reunión kickoff', '2026-05-08 10:00:00-03', '2026-05-08 11:00:00-03', 60, true, 'Reunión', NOW());

-- Lucas Costamagna - Líder Coach
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, hora_inicio, hora_fin, duracion_minutos, facturable, tipo, created_at) VALUES
(gen_random_uuid(), '72409358-b331-4686-b01e-fff063e9a0d6', 'c3434404-3fdb-4dca-ab71-0938d1e82f28', 'Gestión de campañas', '2026-05-28 09:00:00-03', '2026-05-28 11:00:00-03', 120, true, 'Campañas', NOW()),
(gen_random_uuid(), '72409358-b331-4686-b01e-fff063e9a0d6', 'c3434404-3fdb-4dca-ab71-0938d1e82f28', 'Optimización', '2026-05-21 09:00:00-03', '2026-05-21 10:30:00-03', 90, true, 'Campañas', NOW()),
(gen_random_uuid(), '72409358-b331-4686-b01e-fff063e9a0d6', 'c3434404-3fdb-4dca-ab71-0938d1e82f28', 'Reunión cliente', '2026-05-14 10:00:00-03', '2026-05-14 11:00:00-03', 60, true, 'Reunión', NOW()),
(gen_random_uuid(), '72409358-b331-4686-b01e-fff063e9a0d6', 'c3434404-3fdb-4dca-ab71-0938d1e82f28', 'Creación campañas', '2026-05-07 09:00:00-03', '2026-05-07 11:00:00-03', 120, true, 'Campañas', NOW());

-- =====================================================
-- ARCHIVO 3: Daniela, Elina, Florencia, Kevin, Marianela, Maxi, Paula, Valentina
-- =====================================================

-- Daniela Rodríguez - Augusto Daghero Prevención
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, hora_inicio, hora_fin, duracion_minutos, facturable, tipo, created_at) VALUES
(gen_random_uuid(), '671b422c-0b8e-4629-ae56-22244d4ff72b', '614e6ee0-26f9-46b7-89bb-51e5df03e48d', 'Gestión de redes', '2026-05-29 09:00:00-03', '2026-05-29 11:00:00-03', 120, true, 'Redes', NOW()),
(gen_random_uuid(), '671b422c-0b8e-4629-ae56-22244d4ff72b', '614e6ee0-26f9-46b7-89bb-51e5df03e48d', 'Creación contenidos', '2026-05-22 09:00:00-03', '2026-05-22 11:00:00-03', 120, true, 'Redes', NOW()),
(gen_random_uuid(), '671b422c-0b8e-4629-ae56-22244d4ff72b', '614e6ee0-26f9-46b7-89bb-51e5df03e48d', 'Planificación', '2026-05-15 09:00:00-03', '2026-05-15 10:00:00-03', 60, true, 'Redes', NOW()),
(gen_random_uuid(), '671b422c-0b8e-4629-ae56-22244d4ff72b', '614e6ee0-26f9-46b7-89bb-51e5df03e48d', 'Reunión cliente', '2026-05-08 10:00:00-03', '2026-05-08 11:00:00-03', 60, true, 'Reunión', NOW());

-- Daniela Rodríguez - Del Sur Autos
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, hora_inicio, hora_fin, duracion_minutos, facturable, tipo, created_at) VALUES
(gen_random_uuid(), '671b422c-0b8e-4629-ae56-22244d4ff72b', '4ace8fe5-1b15-4e47-aadc-b49a11d3dfd2', 'Gestión de redes', '2026-05-28 14:00:00-03', '2026-05-28 16:00:00-03', 120, true, 'Redes', NOW()),
(gen_random_uuid(), '671b422c-0b8e-4629-ae56-22244d4ff72b', '4ace8fe5-1b15-4e47-aadc-b49a11d3dfd2', 'Creación contenidos', '2026-05-21 14:00:00-03', '2026-05-21 16:00:00-03', 120, true, 'Redes', NOW()),
(gen_random_uuid(), '671b422c-0b8e-4629-ae56-22244d4ff72b', '4ace8fe5-1b15-4e47-aadc-b49a11d3dfd2', 'Diseño piezas', '2026-05-14 14:00:00-03', '2026-05-14 15:30:00-03', 90, true, 'Diseño', NOW());

-- Daniela Rodríguez - Metal Design
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, hora_inicio, hora_fin, duracion_minutos, facturable, tipo, created_at) VALUES
(gen_random_uuid(), '671b422c-0b8e-4629-ae56-22244d4ff72b', '67d24124-c7fa-426e-8bb8-d10cee6ece6e', 'Gestión de redes', '2026-05-27 09:00:00-03', '2026-05-27 11:00:00-03', 120, true, 'Redes', NOW()),
(gen_random_uuid(), '671b422c-0b8e-4629-ae56-22244d4ff72b', '67d24124-c7fa-426e-8bb8-d10cee6ece6e', 'Creación contenidos', '2026-05-20 09:00:00-03', '2026-05-20 11:00:00-03', 120, true, 'Redes', NOW()),
(gen_random_uuid(), '671b422c-0b8e-4629-ae56-22244d4ff72b', '67d24124-c7fa-426e-8bb8-d10cee6ece6e', 'Diseño piezas', '2026-05-13 09:00:00-03', '2026-05-13 10:30:00-03', 90, true, 'Diseño', NOW());

-- Elina Escobares - Dr. Jorge Esnaola
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, hora_inicio, hora_fin, duracion_minutos, facturable, tipo, created_at) VALUES
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '5ee01501-5afc-4d0f-8dc9-5da3f3f39c37', 'Gestión de redes', '2026-05-30 09:00:00-03', '2026-05-30 11:00:00-03', 120, true, 'Redes', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '5ee01501-5afc-4d0f-8dc9-5da3f3f39c37', 'Creación contenidos', '2026-05-23 09:00:00-03', '2026-05-23 11:00:00-03', 120, true, 'Redes', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '5ee01501-5afc-4d0f-8dc9-5da3f3f39c37', 'Planificación mensual', '2026-05-16 09:00:00-03', '2026-05-16 10:30:00-03', 90, true, 'Redes', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '5ee01501-5afc-4d0f-8dc9-5da3f3f39c37', 'Reunión cliente', '2026-05-09 10:00:00-03', '2026-05-09 11:00:00-03', 60, true, 'Reunión', NOW());

-- Elina Escobares - Papelera Cumbre
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, hora_inicio, hora_fin, duracion_minutos, facturable, tipo, created_at) VALUES
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', 'd2848fe8-4d47-4e4a-948d-c5cb34e0106f', 'Gestión de redes', '2026-05-29 14:00:00-03', '2026-05-29 16:00:00-03', 120, true, 'Redes', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', 'd2848fe8-4d47-4e4a-948d-c5cb34e0106f', 'Creación contenidos', '2026-05-22 14:00:00-03', '2026-05-22 16:00:00-03', 120, true, 'Redes', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', 'd2848fe8-4d47-4e4a-948d-c5cb34e0106f', 'Diseño piezas', '2026-05-15 14:00:00-03', '2026-05-15 15:30:00-03', 90, true, 'Diseño', NOW());

-- florencia bassola - MDK Interno
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, hora_inicio, hora_fin, duracion_minutos, facturable, tipo, created_at) VALUES
(gen_random_uuid(), '2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Administración', '2026-05-30 09:00:00-03', '2026-05-30 13:00:00-03', 240, false, 'Administración', NOW()),
(gen_random_uuid(), '2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Administración', '2026-05-29 09:00:00-03', '2026-05-29 13:00:00-03', 240, false, 'Administración', NOW()),
(gen_random_uuid(), '2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Administración', '2026-05-28 09:00:00-03', '2026-05-28 13:00:00-03', 240, false, 'Administración', NOW()),
(gen_random_uuid(), '2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Administración', '2026-05-27 09:00:00-03', '2026-05-27 13:00:00-03', 240, false, 'Administración', NOW()),
(gen_random_uuid(), '2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Administración', '2026-05-23 09:00:00-03', '2026-05-23 13:00:00-03', 240, false, 'Administración', NOW()),
(gen_random_uuid(), '2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Administración', '2026-05-22 09:00:00-03', '2026-05-22 13:00:00-03', 240, false, 'Administración', NOW()),
(gen_random_uuid(), '2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Administración', '2026-05-21 09:00:00-03', '2026-05-21 13:00:00-03', 240, false, 'Administración', NOW()),
(gen_random_uuid(), '2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Administración', '2026-05-20 09:00:00-03', '2026-05-20 13:00:00-03', 240, false, 'Administración', NOW()),
(gen_random_uuid(), '2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Administración', '2026-05-16 09:00:00-03', '2026-05-16 13:00:00-03', 240, false, 'Administración', NOW()),
(gen_random_uuid(), '2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Administración', '2026-05-15 09:00:00-03', '2026-05-15 13:00:00-03', 240, false, 'Administración', NOW()),
(gen_random_uuid(), '2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Administración', '2026-05-14 09:00:00-03', '2026-05-14 13:00:00-03', 240, false, 'Administración', NOW()),
(gen_random_uuid(), '2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Administración', '2026-05-13 09:00:00-03', '2026-05-13 13:00:00-03', 240, false, 'Administración', NOW()),
(gen_random_uuid(), '2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Administración', '2026-05-09 09:00:00-03', '2026-05-09 13:00:00-03', 240, false, 'Administración', NOW()),
(gen_random_uuid(), '2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Administración', '2026-05-08 09:00:00-03', '2026-05-08 13:00:00-03', 240, false, 'Administración', NOW()),
(gen_random_uuid(), '2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Administración', '2026-05-07 09:00:00-03', '2026-05-07 13:00:00-03', 240, false, 'Administración', NOW()),
(gen_random_uuid(), '2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Administración', '2026-05-06 09:00:00-03', '2026-05-06 13:00:00-03', 240, false, 'Administración', NOW()),
(gen_random_uuid(), '2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c', '91f89865-3eb7-4b39-b47f-0d019e02c329', 'Administración', '2026-05-02 09:00:00-03', '2026-05-02 13:00:00-03', 240, false, 'Administración', NOW());

-- Kevin - ADT
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, hora_inicio, hora_fin, duracion_minutos, facturable, tipo, created_at) VALUES
(gen_random_uuid(), 'f3716909-f887-441d-88bd-69eff0c6c670', '2eb756a4-ff8f-4c7d-b94a-4c43cff062ba', 'Gestión de campañas', '2026-05-30 09:00:00-03', '2026-05-30 11:00:00-03', 120, true, 'Campañas', NOW()),
(gen_random_uuid(), 'f3716909-f887-441d-88bd-69eff0c6c670', '2eb756a4-ff8f-4c7d-b94a-4c43cff062ba', 'Optimización', '2026-05-23 09:00:00-03', '2026-05-23 10:30:00-03', 90, true, 'Campañas', NOW()),
(gen_random_uuid(), 'f3716909-f887-441d-88bd-69eff0c6c670', '2eb756a4-ff8f-4c7d-b94a-4c43cff062ba', 'Revisión métricas', '2026-05-16 09:00:00-03', '2026-05-16 10:00:00-03', 60, true, 'Análisis', NOW()),
(gen_random_uuid(), 'f3716909-f887-441d-88bd-69eff0c6c670', '2eb756a4-ff8f-4c7d-b94a-4c43cff062ba', 'Creación campañas', '2026-05-09 09:00:00-03', '2026-05-09 11:00:00-03', 120, true, 'Campañas', NOW());

-- Kevin - Central Tire
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, hora_inicio, hora_fin, duracion_minutos, facturable, tipo, created_at) VALUES
(gen_random_uuid(), 'f3716909-f887-441d-88bd-69eff0c6c670', '1f8df4d3-acb4-4c5a-b2e5-a0897b692dfb', 'Gestión de campañas', '2026-05-29 14:00:00-03', '2026-05-29 16:00:00-03', 120, true, 'Campañas', NOW()),
(gen_random_uuid(), 'f3716909-f887-441d-88bd-69eff0c6c670', '1f8df4d3-acb4-4c5a-b2e5-a0897b692dfb', 'Optimización', '2026-05-22 14:00:00-03', '2026-05-22 15:30:00-03', 90, true, 'Campañas', NOW()),
(gen_random_uuid(), 'f3716909-f887-441d-88bd-69eff0c6c670', '1f8df4d3-acb4-4c5a-b2e5-a0897b692dfb', 'Análisis', '2026-05-15 14:00:00-03', '2026-05-15 15:00:00-03', 60, true, 'Análisis', NOW());

-- Marianela Perez - Dr. Jorge Esnaola
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, hora_inicio, hora_fin, duracion_minutos, facturable, tipo, created_at) VALUES
(gen_random_uuid(), 'e8180368-8789-4f9f-9f63-8bdd8eb3d513', '5ee01501-5afc-4d0f-8dc9-5da3f3f39c37', 'Gestión de campañas', '2026-05-28 09:00:00-03', '2026-05-28 11:00:00-03', 120, true, 'Campañas', NOW()),
(gen_random_uuid(), 'e8180368-8789-4f9f-9f63-8bdd8eb3d513', '5ee01501-5afc-4d0f-8dc9-5da3f3f39c37', 'Optimización', '2026-05-21 09:00:00-03', '2026-05-21 10:30:00-03', 90, true, 'Campañas', NOW()),
(gen_random_uuid(), 'e8180368-8789-4f9f-9f63-8bdd8eb3d513', '5ee01501-5afc-4d0f-8dc9-5da3f3f39c37', 'Reunión cliente', '2026-05-14 10:00:00-03', '2026-05-14 11:00:00-03', 60, true, 'Reunión', NOW()),
(gen_random_uuid(), 'e8180368-8789-4f9f-9f63-8bdd8eb3d513', '5ee01501-5afc-4d0f-8dc9-5da3f3f39c37', 'Creación campañas', '2026-05-07 09:00:00-03', '2026-05-07 11:00:00-03', 120, true, 'Campañas', NOW());

-- Marianela Perez - Líder Coach
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, hora_inicio, hora_fin, duracion_minutos, facturable, tipo, created_at) VALUES
(gen_random_uuid(), 'e8180368-8789-4f9f-9f63-8bdd8eb3d513', 'c3434404-3fdb-4dca-ab71-0938d1e82f28', 'Gestión de campañas', '2026-05-27 14:00:00-03', '2026-05-27 16:00:00-03', 120, true, 'Campañas', NOW()),
(gen_random_uuid(), 'e8180368-8789-4f9f-9f63-8bdd8eb3d513', 'c3434404-3fdb-4dca-ab71-0938d1e82f28', 'Optimización', '2026-05-20 14:00:00-03', '2026-05-20 15:30:00-03', 90, true, 'Campañas', NOW()),
(gen_random_uuid(), 'e8180368-8789-4f9f-9f63-8bdd8eb3d513', 'c3434404-3fdb-4dca-ab71-0938d1e82f28', 'Análisis', '2026-05-13 14:00:00-03', '2026-05-13 15:00:00-03', 60, true, 'Análisis', NOW());

-- maxiquintana - VN Global
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, hora_inicio, hora_fin, duracion_minutos, facturable, tipo, created_at) VALUES
(gen_random_uuid(), 'd93c2e19-077b-4720-8d1c-b649d21857c2', 'b1dbb4e9-69f7-43bc-83f6-9485b455b4cd', 'Desarrollo web', '2026-05-30 09:00:00-03', '2026-05-30 13:00:00-03', 240, true, 'Desarrollo', NOW()),
(gen_random_uuid(), 'd93c2e19-077b-4720-8d1c-b649d21857c2', 'b1dbb4e9-69f7-43bc-83f6-9485b455b4cd', 'Desarrollo web', '2026-05-29 09:00:00-03', '2026-05-29 13:00:00-03', 240, true, 'Desarrollo', NOW()),
(gen_random_uuid(), 'd93c2e19-077b-4720-8d1c-b649d21857c2', 'b1dbb4e9-69f7-43bc-83f6-9485b455b4cd', 'Desarrollo web', '2026-05-28 09:00:00-03', '2026-05-28 13:00:00-03', 240, true, 'Desarrollo', NOW()),
(gen_random_uuid(), 'd93c2e19-077b-4720-8d1c-b649d21857c2', 'b1dbb4e9-69f7-43bc-83f6-9485b455b4cd', 'Desarrollo web', '2026-05-27 09:00:00-03', '2026-05-27 13:00:00-03', 240, true, 'Desarrollo', NOW()),
(gen_random_uuid(), 'd93c2e19-077b-4720-8d1c-b649d21857c2', 'b1dbb4e9-69f7-43bc-83f6-9485b455b4cd', 'Desarrollo web', '2026-05-23 09:00:00-03', '2026-05-23 13:00:00-03', 240, true, 'Desarrollo', NOW()),
(gen_random_uuid(), 'd93c2e19-077b-4720-8d1c-b649d21857c2', 'b1dbb4e9-69f7-43bc-83f6-9485b455b4cd', 'Desarrollo web', '2026-05-22 09:00:00-03', '2026-05-22 13:00:00-03', 240, true, 'Desarrollo', NOW()),
(gen_random_uuid(), 'd93c2e19-077b-4720-8d1c-b649d21857c2', 'b1dbb4e9-69f7-43bc-83f6-9485b455b4cd', 'Desarrollo web', '2026-05-21 09:00:00-03', '2026-05-21 13:00:00-03', 240, true, 'Desarrollo', NOW()),
(gen_random_uuid(), 'd93c2e19-077b-4720-8d1c-b649d21857c2', 'b1dbb4e9-69f7-43bc-83f6-9485b455b4cd', 'Desarrollo web', '2026-05-20 09:00:00-03', '2026-05-20 13:00:00-03', 240, true, 'Desarrollo', NOW());

-- Paula Aguirre - ADT
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, hora_inicio, hora_fin, duracion_minutos, facturable, tipo, created_at) VALUES
(gen_random_uuid(), '6b7dd611-15f3-4ab4-b031-56a37da3f52c', '2eb756a4-ff8f-4c7d-b94a-4c43cff062ba', 'Gestión de redes', '2026-05-29 09:00:00-03', '2026-05-29 11:00:00-03', 120, true, 'Redes', NOW()),
(gen_random_uuid(), '6b7dd611-15f3-4ab4-b031-56a37da3f52c', '2eb756a4-ff8f-4c7d-b94a-4c43cff062ba', 'Creación contenidos', '2026-05-22 09:00:00-03', '2026-05-22 11:00:00-03', 120, true, 'Redes', NOW()),
(gen_random_uuid(), '6b7dd611-15f3-4ab4-b031-56a37da3f52c', '2eb756a4-ff8f-4c7d-b94a-4c43cff062ba', 'Planificación', '2026-05-15 09:00:00-03', '2026-05-15 10:00:00-03', 60, true, 'Redes', NOW()),
(gen_random_uuid(), '6b7dd611-15f3-4ab4-b031-56a37da3f52c', '2eb756a4-ff8f-4c7d-b94a-4c43cff062ba', 'Reunión cliente', '2026-05-08 10:00:00-03', '2026-05-08 11:00:00-03', 60, true, 'Reunión', NOW());

-- Paula Aguirre - Donadio
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, hora_inicio, hora_fin, duracion_minutos, facturable, tipo, created_at) VALUES
(gen_random_uuid(), '6b7dd611-15f3-4ab4-b031-56a37da3f52c', '7b69f808-8b87-4dab-95b9-5af6ea9dc33f', 'Gestión de redes', '2026-05-28 14:00:00-03', '2026-05-28 16:00:00-03', 120, true, 'Redes', NOW()),
(gen_random_uuid(), '6b7dd611-15f3-4ab4-b031-56a37da3f52c', '7b69f808-8b87-4dab-95b9-5af6ea9dc33f', 'Creación contenidos', '2026-05-21 14:00:00-03', '2026-05-21 16:00:00-03', 120, true, 'Redes', NOW()),
(gen_random_uuid(), '6b7dd611-15f3-4ab4-b031-56a37da3f52c', '7b69f808-8b87-4dab-95b9-5af6ea9dc33f', 'Diseño piezas', '2026-05-14 14:00:00-03', '2026-05-14 15:30:00-03', 90, true, 'Diseño', NOW());

-- Valentina Ferraris - Go7
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, hora_inicio, hora_fin, duracion_minutos, facturable, tipo, created_at) VALUES
(gen_random_uuid(), 'b4fbde1b-4e90-4313-9b5d-a5ea3476221b', '9ae26846-b0a6-4de9-9ae9-cc33f4d4ae4f', 'Gestión de redes', '2026-05-30 09:00:00-03', '2026-05-30 11:00:00-03', 120, true, 'Redes', NOW()),
(gen_random_uuid(), 'b4fbde1b-4e90-4313-9b5d-a5ea3476221b', '9ae26846-b0a6-4de9-9ae9-cc33f4d4ae4f', 'Creación contenidos', '2026-05-23 09:00:00-03', '2026-05-23 11:00:00-03', 120, true, 'Redes', NOW()),
(gen_random_uuid(), 'b4fbde1b-4e90-4313-9b5d-a5ea3476221b', '9ae26846-b0a6-4de9-9ae9-cc33f4d4ae4f', 'Planificación', '2026-05-16 09:00:00-03', '2026-05-16 10:00:00-03', 60, true, 'Redes', NOW()),
(gen_random_uuid(), 'b4fbde1b-4e90-4313-9b5d-a5ea3476221b', '9ae26846-b0a6-4de9-9ae9-cc33f4d4ae4f', 'Reunión cliente', '2026-05-09 10:00:00-03', '2026-05-09 11:00:00-03', 60, true, 'Reunión', NOW());

-- Valentina Ferraris - ShowSport
INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, hora_inicio, hora_fin, duracion_minutos, facturable, tipo, created_at) VALUES
(gen_random_uuid(), 'b4fbde1b-4e90-4313-9b5d-a5ea3476221b', '9e931a3e-2dcb-4e23-891e-9f31b7bdc549', 'Gestión de redes', '2026-05-29 14:00:00-03', '2026-05-29 16:00:00-03', 120, true, 'Redes', NOW()),
(gen_random_uuid(), 'b4fbde1b-4e90-4313-9b5d-a5ea3476221b', '9e931a3e-2dcb-4e23-891e-9f31b7bdc549', 'Creación contenidos', '2026-05-22 14:00:00-03', '2026-05-22 16:00:00-03', 120, true, 'Redes', NOW()),
(gen_random_uuid(), 'b4fbde1b-4e90-4313-9b5d-a5ea3476221b', '9e931a3e-2dcb-4e23-891e-9f31b7bdc549', 'Diseño piezas', '2026-05-15 14:00:00-03', '2026-05-15 15:30:00-03', 90, true, 'Diseño', NOW());

-- =====================================================
-- FIN DE IMPORTACIÓN
-- =====================================================
-- Total de entradas insertadas: ~170
-- Usuarios: 16
-- Clientes: ~20
-- =====================================================
