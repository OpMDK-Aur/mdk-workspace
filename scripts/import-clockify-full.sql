-- =============================================
-- IMPORTACION COMPLETA CORREGIDA DE CLOCKIFY - MAYO 2026
-- =============================================
-- Este script importa TODOS los datos de los 3 archivos CSV de Clockify
-- Corrige la omisión de Fernando Tomas en Agropagos
-- =============================================

INSERT INTO entradas_de_tiempo (id, colaborador_id, cliente_id, descripcion, fecha, duracion_seg, creado_desde, created_at)
VALUES

-- CSV (3): FERNANDO TOMAS, ALEJO, TOBA
(gen_random_uuid(), '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', '3274afc7-6efc-423b-b55b-f2ab1a251313', 'Agropagos', '2026-05-01', 30544, 'clockify_import', NOW()),
(gen_random_uuid(), '37f9f4ef-5c12-4f61-8721-11cdb74c9f59', '67d24124-c7fa-426e-8bb8-d10cee6ece6e', 'Metal Design', '2026-05-01', 1635, 'clockify_import', NOW()),
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', '7b69f808-26f4-4625-ae97-6ea5841485db', 'Donadio', '2026-05-01', 4169, 'clockify_import', NOW()),
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', '9ae26846-85cc-4814-aab2-d3b90e8da570', 'GO7', '2026-05-01', 18900, 'clockify_import', NOW()),
(gen_random_uuid(), 'bbc66cd0-f5e9-4d00-a713-eec5e85c48d6', 'be4ac531-c3a3-4c00-a1e2-5b52bff478b7', 'MDk Interno', '2026-05-01', 84385, 'clockify_import', NOW()),
(gen_random_uuid(), 'e566188b-91ea-4b01-888d-ac305eb17363', '9e931a3e-81b5-45dd-bdf1-2c40a818a500', 'ShowSport', '2026-05-01', 7200, 'clockify_import', NOW()),

-- CSV (4): DANIELA RODRIGUEZ
(gen_random_uuid(), '671b422c-0b8e-4629-ae56-22244d4ff72b', 'be4ac531-c3a3-4c00-a1e2-5b52bff478b7', 'Reunión Interna', '2026-05-01', 2544, 'clockify_import', NOW()),
(gen_random_uuid(), '671b422c-0b8e-4629-ae56-22244d4ff72b', 'be4ac531-c3a3-4c00-a1e2-5b52bff478b7', 'Tareas Operativas', '2026-05-01', 2990, 'clockify_import', NOW()),
(gen_random_uuid(), '671b422c-0b8e-4629-ae56-22244d4ff72b', 'bae8b148-bd0b-4250-a8c3-6bc4c277b02f', 'Nobis Salud - Optimización de Campañas', '2026-05-01', 7639, 'clockify_import', NOW()),
(gen_random_uuid(), '671b422c-0b8e-4629-ae56-22244d4ff72b', 'c6d25e75-9187-4dea-ba0c-c06d6ae462e7', 'Pire Rayen - Optimización de Campañas', '2026-05-01', 15260, 'clockify_import', NOW()),
(gen_random_uuid(), '671b422c-0b8e-4629-ae56-22244d4ff72b', 'c6d25e75-9187-4dea-ba0c-c06d6ae462e7', 'Pire Rayen - Reunión de Scorecard', '2026-05-01', 2989, 'clockify_import', NOW()),
(gen_random_uuid(), '671b422c-0b8e-4629-ae56-22244d4ff72b', 'c6d25e75-9187-4dea-ba0c-c06d6ae462e7', 'Pire Rayen - Tareas Operativas', '2026-05-01', 2425, 'clockify_import', NOW()),
(gen_random_uuid(), '671b422c-0b8e-4629-ae56-22244d4ff72b', '4abf8d75-e4b7-4402-bc2a-711da8289159', 'Roller Pro - Armado de Informes', '2026-05-01', 13886, 'clockify_import', NOW()),
(gen_random_uuid(), '671b422c-0b8e-4629-ae56-22244d4ff72b', '4abf8d75-e4b7-4402-bc2a-711da8289159', 'Roller Pro - Control de Cuenta', '2026-05-01', 122, 'clockify_import', NOW()),
(gen_random_uuid(), '671b422c-0b8e-4629-ae56-22244d4ff72b', '4abf8d75-e4b7-4402-bc2a-711da8289159', 'Roller Pro - Optimización de Campañas', '2026-05-01', 6306, 'clockify_import', NOW()),
(gen_random_uuid(), '671b422c-0b8e-4629-ae56-22244d4ff72b', '4abf8d75-e4b7-4402-bc2a-711da8289159', 'Roller Pro - Tareas Operativas', '2026-05-01', 1414, 'clockify_import', NOW()),

-- CSV (4): ELINA ESCOBARES - ADT
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '2eb756a4-ff8f-4c7d-b94a-4c43cff062ba', 'ADT - Armado de Informes', '2026-05-01', 11265, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '2eb756a4-ff8f-4c7d-b94a-4c43cff062ba', 'ADT - Contacto con clientes', '2026-05-01', 1692, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '2eb756a4-ff8f-4c7d-b94a-4c43cff062ba', 'ADT - Control de Cuenta', '2026-05-01', 1424, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '2eb756a4-ff8f-4c7d-b94a-4c43cff062ba', 'ADT - Control de saldo', '2026-05-01', 624, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '2eb756a4-ff8f-4c7d-b94a-4c43cff062ba', 'ADT - Mensaje Cierre de Semana', '2026-05-01', 765, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '2eb756a4-ff8f-4c7d-b94a-4c43cff062ba', 'ADT - Mensaje Inicio de Semana', '2026-05-01', 1172, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '2eb756a4-ff8f-4c7d-b94a-4c43cff062ba', 'ADT - Optimización de Campañas', '2026-05-01', 8628, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '2eb756a4-ff8f-4c7d-b94a-4c43cff062ba', 'ADT - Reunión Cierre de Mes', '2026-05-01', 3976, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '2eb756a4-ff8f-4c7d-b94a-4c43cff062ba', 'ADT - Tareas Operativas', '2026-05-01', 5637, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '2eb756a4-ff8f-4c7d-b94a-4c43cff062ba', 'ADT - Trabajos a Medida', '2026-05-01', 1618, 'clockify_import', NOW()),

-- CSV (4): ELINA ESCOBARES - Al mundo
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '1ed8a781-daaf-472e-a97d-fab014c6ec25', 'Al mundo - Armado de Informes', '2026-05-01', 3943, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '1ed8a781-daaf-472e-a97d-fab014c6ec25', 'Al mundo - Mensaje Cierre de Semana', '2026-05-01', 646, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '1ed8a781-daaf-472e-a97d-fab014c6ec25', 'Al mundo - Mensaje Inicio de Semana', '2026-05-01', 612, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '1ed8a781-daaf-472e-a97d-fab014c6ec25', 'Al mundo - Optimización de Campañas', '2026-05-01', 6217, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '1ed8a781-daaf-472e-a97d-fab014c6ec25', 'Al mundo - Reunión mensual', '2026-05-01', 1247, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '1ed8a781-daaf-472e-a97d-fab014c6ec25', 'Al mundo - Sincro Creativa', '2026-05-01', 1412, 'clockify_import', NOW()),

-- CSV (4): ELINA ESCOBARES - Aurelia (Soy Aurelia)
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '6ed467d8-fd9b-4bd1-893d-c502d5b3c82b', 'Aurelia - Armado de Informes', '2026-05-01', 9163, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '6ed467d8-fd9b-4bd1-893d-c502d5b3c82b', 'Aurelia - Contacto con clientes', '2026-05-01', 1393, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '6ed467d8-fd9b-4bd1-893d-c502d5b3c82b', 'Aurelia - Control de Cuenta', '2026-05-01', 357, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '6ed467d8-fd9b-4bd1-893d-c502d5b3c82b', 'Aurelia - Control de saldo', '2026-05-01', 528, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '6ed467d8-fd9b-4bd1-893d-c502d5b3c82b', 'Aurelia - Mensaje Inicio de Semana', '2026-05-01', 475, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '6ed467d8-fd9b-4bd1-893d-c502d5b3c82b', 'Aurelia - Optimización de Campañas', '2026-05-01', 24427, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '6ed467d8-fd9b-4bd1-893d-c502d5b3c82b', 'Aurelia - Reunión Interna', '2026-05-01', 1749, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '6ed467d8-fd9b-4bd1-893d-c502d5b3c82b', 'Aurelia - Reunión mensual', '2026-05-01', 1156, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '6ed467d8-fd9b-4bd1-893d-c502d5b3c82b', 'Aurelia - Sincro Creativa', '2026-05-01', 1796, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '6ed467d8-fd9b-4bd1-893d-c502d5b3c82b', 'Aurelia - Tareas Operativas', '2026-05-01', 472, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '6ed467d8-fd9b-4bd1-893d-c502d5b3c82b', 'Aurelia - Testing de Trackeo', '2026-05-01', 2339, 'clockify_import', NOW()),

-- CSV (4): ELINA ESCOBARES - Central Tire
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '1f8df4d3-acb4-4c5a-b2e5-a0897b692dfb', 'Central Tire - Armado de Informes', '2026-05-01', 9575, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '1f8df4d3-acb4-4c5a-b2e5-a0897b692dfb', 'Central Tire - Control de Cuenta', '2026-05-01', 620, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '1f8df4d3-acb4-4c5a-b2e5-a0897b692dfb', 'Central Tire - Informe de Cierre', '2026-05-01', 1104, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '1f8df4d3-acb4-4c5a-b2e5-a0897b692dfb', 'Central Tire - Mensaje Cierre de Semana', '2026-05-01', 1345, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '1f8df4d3-acb4-4c5a-b2e5-a0897b692dfb', 'Central Tire - Mensaje Inicio de Semana', '2026-05-01', 294, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '1f8df4d3-acb4-4c5a-b2e5-a0897b692dfb', 'Central Tire - Optimización de Campañas', '2026-05-01', 10431, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '1f8df4d3-acb4-4c5a-b2e5-a0897b692dfb', 'Central Tire - Reunión Cierre de Mes', '2026-05-01', 2931, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '1f8df4d3-acb4-4c5a-b2e5-a0897b692dfb', 'Central Tire - Sincro Creativa', '2026-05-01', 798, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '1f8df4d3-acb4-4c5a-b2e5-a0897b692dfb', 'Central Tire - Tareas Operativas', '2026-05-01', 1291, 'clockify_import', NOW()),

-- CSV (4): ELINA ESCOBARES - Madketing
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '71ad70dd-a0ca-4f7c-a847-ee1d30bf91af', 'Madketing - Mensaje Inicio de Semana', '2026-05-01', 359, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '71ad70dd-a0ca-4f7c-a847-ee1d30bf91af', 'Madketing - Optimización de Campañas', '2026-05-01', 8072, 'clockify_import', NOW()),

-- CSV (4): ELINA ESCOBARES - MDK Interno
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', 'be4ac531-c3a3-4c00-a1e2-5b52bff478b7', 'MDK Interno - Control de Cuenta', '2026-05-01', 1263, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', 'be4ac531-c3a3-4c00-a1e2-5b52bff478b7', 'MDK Interno - Reunión Interna', '2026-05-01', 14929, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', 'be4ac531-c3a3-4c00-a1e2-5b52bff478b7', 'MDK Interno - Tareas Operativas', '2026-05-01', 5962, 'clockify_import', NOW()),

-- CSV (4): ELINA ESCOBARES - Modulos Argentinos y FOD
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '2d2e3d76-2705-49d7-9294-8d32fbde0cbd', 'Modulos Argentinos - Control de saldo', '2026-05-01', 449, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '2d2e3d76-2705-49d7-9294-8d32fbde0cbd', 'Modulos Argentinos - Mensaje Inicio', '2026-05-01', 1174, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '7d0f8c35-8d13-480e-8f15-f37acccd724e', 'Modulos FOD - Cambios Básico', '2026-05-01', 1271, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '7d0f8c35-8d13-480e-8f15-f37acccd724e', 'Modulos FOD - Mensaje Inicio', '2026-05-01', 1143, 'clockify_import', NOW()),

-- CSV (4): ELINA ESCOBARES - Probioticos Argentina
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '35a646cc-feb7-4ced-b7c5-01731825f5a1', 'Probioticos - Activación de Cliente', '2026-05-01', 17732, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '35a646cc-feb7-4ced-b7c5-01731825f5a1', 'Probioticos - Contacto con clientes', '2026-05-01', 1463, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '35a646cc-feb7-4ced-b7c5-01731825f5a1', 'Probioticos - Reunión Con Clientes', '2026-05-01', 2609, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '35a646cc-feb7-4ced-b7c5-01731825f5a1', 'Probioticos - Sincro Creativa', '2026-05-01', 9267, 'clockify_import', NOW()),
(gen_random_uuid(), '79728389-2e6c-437a-83b7-a19a296db24a', '35a646cc-feb7-4ced-b7c5-01731825f5a1', 'Probioticos - Tareas Operativas', '2026-05-01', 317, 'clockify_import', NOW()),

-- CSV (4): FLORENCIA BASSOLA
(gen_random_uuid(), '2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c', '2eb756a4-ff8f-4c7d-b94a-4c43cff062ba', 'ADT - Diseño Piezas', '2026-05-01', 636, 'clockify_import', NOW()),
(gen_random_uuid(), '2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c', '1ed8a781-daaf-472e-a97d-fab014c6ec25', 'Al mundo - Diseño Videos', '2026-05-01', 9956, 'clockify_import', NOW()),
(gen_random_uuid(), '2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c', '319bb748-60c8-460c-9362-480c5ffdfa92', 'Biblos - Tareas Operativas', '2026-05-01', 164, 'clockify_import', NOW()),
(gen_random_uuid(), '2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c', '1f8df4d3-acb4-4c5a-b2e5-a0897b692dfb', 'Central Tire - Diseño Piezas', '2026-05-01', 573, 'clockify_import', NOW()),
(gen_random_uuid(), '2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c', 'cfc25e2e-a3f0-42fa-b5f1-127471c91497', 'Corralon Tronador - Cambios Básico', '2026-05-01', 1846, 'clockify_import', NOW()),
(gen_random_uuid(), '2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c', 'cfc25e2e-a3f0-42fa-b5f1-127471c91497', 'Corralon Tronador - Diseño Piezas', '2026-05-01', 10880, 'clockify_import', NOW()),
(gen_random_uuid(), '2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c', 'e67eb6bd-00f5-4c2a-ad5b-35cc9beed6ae', 'Diez y Asociados - Diseño Piezas', '2026-05-01', 2181, 'clockify_import', NOW()),
(gen_random_uuid(), '2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c', '8e9655de-91aa-454b-88d3-ed5245524fef', 'Marchesini - Tareas Operativas', '2026-05-01', 2700, 'clockify_import', NOW()),
(gen_random_uuid(), '2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c', '8e9655de-91aa-454b-88d3-ed5245524fef', 'Marchesini - Trabajos a Medida', '2026-05-01', 15491, 'clockify_import', NOW()),
(gen_random_uuid(), '2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c', '5f42e52e-3213-4c06-b105-e337fc88569a', 'ICS - Tareas Operativas', '2026-05-01', 4957, 'clockify_import', NOW()),
(gen_random_uuid(), '2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c', '38bb55aa-a84e-4374-84c6-1e1b6d35c5a7', 'Inmobiliaria Zamora - Diseño Piezas', '2026-05-01', 21543, 'clockify_import', NOW()),
(gen_random_uuid(), '2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c', '38bb55aa-a84e-4374-84c6-1e1b6d35c5a7', 'Inmobiliaria Zamora - Diseño Videos', '2026-05-01', 26766, 'clockify_import', NOW()),
(gen_random_uuid(), '2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c', 'be4ac531-c3a3-4c00-a1e2-5b52bff478b7', 'MDK Interno - Diseño Piezas', '2026-05-01', 14655, 'clockify_import', NOW()),
(gen_random_uuid(), '2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c', 'be4ac531-c3a3-4c00-a1e2-5b52bff478b7', 'MDK Interno - Reunión Interna', '2026-05-01', 1450, 'clockify_import', NOW()),
(gen_random_uuid(), '2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c', 'be4ac531-c3a3-4c00-a1e2-5b52bff478b7', 'MDK Interno - Tareas Operativas', '2026-05-01', 19899, 'clockify_import', NOW()),
(gen_random_uuid(), '2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c', 'd2aa9d22-2e3f-4a49-9514-f5b07f2860fb', 'Medicardio - Diseño Videos', '2026-05-01', 29824, 'clockify_import', NOW()),
(gen_random_uuid(), '2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c', 'b1dbb4e9-69f7-43bc-83f6-9485b455b4cd', 'VN Global - Diseño Piezas', '2026-05-01', 7284, 'clockify_import', NOW()),
(gen_random_uuid(), '2d33bba1-f9f8-4cf1-b4c9-ed26165bb93c', 'b1dbb4e9-69f7-43bc-83f6-9485b455b4cd', 'VN Global - Tareas Operativas', '2026-05-01', 1296, 'clockify_import', NOW()),

-- CSV (4): KEVIN BARDA
(gen_random_uuid(), 'f3716909-f887-441d-88bd-69eff0c6c670', 'bae8b148-bd0b-4250-a8c3-6bc4c277b02f', 'Nobis - Optimización', '2026-05-01', 7919, 'clockify_import', NOW()),

-- CSV (4): MARIANELA PEREZ
(gen_random_uuid(), 'e8180368-8789-4f9f-9f63-8bdd8eb3d513', 'cfc25e2e-a3f0-42fa-b5f1-127471c91497', 'Corralon - Contacto con clientes', '2026-05-01', 840, 'clockify_import', NOW()),
(gen_random_uuid(), 'e8180368-8789-4f9f-9f63-8bdd8eb3d513', 'cfc25e2e-a3f0-42fa-b5f1-127471c91497', 'Corralon - Tareas Operativas', '2026-05-01', 10229, 'clockify_import', NOW()),
(gen_random_uuid(), 'e8180368-8789-4f9f-9f63-8bdd8eb3d513', '36422031-6a15-4a30-bfdf-b8574538981b', 'Dechifit - Reunión mensual', '2026-05-01', 1780, 'clockify_import', NOW()),
(gen_random_uuid(), 'e8180368-8789-4f9f-9f63-8bdd8eb3d513', '36422031-6a15-4a30-bfdf-b8574538981b', 'Dechifit - Tareas Operativas', '2026-05-01', 15182, 'clockify_import', NOW()),
(gen_random_uuid(), 'e8180368-8789-4f9f-9f63-8bdd8eb3d513', '38bb55aa-a84e-4374-84c6-1e1b6d35c5a7', 'Inmobiliaria - Optimización', '2026-05-01', 2234, 'clockify_import', NOW()),
(gen_random_uuid(), 'e8180368-8789-4f9f-9f63-8bdd8eb3d513', '38bb55aa-a84e-4374-84c6-1e1b6d35c5a7', 'Inmobiliaria - Tareas Operativas', '2026-05-01', 3320, 'clockify_import', NOW()),
(gen_random_uuid(), 'e8180368-8789-4f9f-9f63-8bdd8eb3d513', 'be4ac531-c3a3-4c00-a1e2-5b52bff478b7', 'MDK Interno - Activación', '2026-05-01', 3931, 'clockify_import', NOW()),
(gen_random_uuid(), 'e8180368-8789-4f9f-9f63-8bdd8eb3d513', 'be4ac531-c3a3-4c00-a1e2-5b52bff478b7', 'MDK Interno - Reunión Interna', '2026-05-01', 10440, 'clockify_import', NOW()),
(gen_random_uuid(), 'e8180368-8789-4f9f-9f63-8bdd8eb3d513', 'be4ac531-c3a3-4c00-a1e2-5b52bff478b7', 'MDK Interno - Tareas Operativas', '2026-05-01', 337, 'clockify_import', NOW()),
(gen_random_uuid(), 'e8180368-8789-4f9f-9f63-8bdd8eb3d513', 'd836db69-acec-40b3-a927-d8fe2ade8677', 'Nona Blanca - Tareas Operativas', '2026-05-01', 1152, 'clockify_import', NOW()),
(gen_random_uuid(), 'e8180368-8789-4f9f-9f63-8bdd8eb3d513', 'e3f081ae-2bfc-4931-a1b7-301f3020674b', 'Sit Mobili - Tareas Operativas', '2026-05-01', 1420, 'clockify_import', NOW()),

-- CSV (4): MAXIMILIANO QUINTANA
(gen_random_uuid(), 'd93c2e19-077b-4720-8d1c-b649d21857c2', '319bb748-60c8-460c-9362-480c5ffdfa92', 'Biblos', '2026-05-01', 9860, 'clockify_import', NOW()),
(gen_random_uuid(), 'd93c2e19-077b-4720-8d1c-b649d21857c2', '319bb748-60c8-460c-9362-480c5ffdfa92', 'Biblos - Control', '2026-05-01', 1800, 'clockify_import', NOW()),
(gen_random_uuid(), 'd93c2e19-077b-4720-8d1c-b649d21857c2', '319bb748-60c8-460c-9362-480c5ffdfa92', 'Biblos - Reunión', '2026-05-01', 1260, 'clockify_import', NOW()),
(gen_random_uuid(), 'd93c2e19-077b-4720-8d1c-b649d21857c2', '319bb748-60c8-460c-9362-480c5ffdfa92', 'Biblos - Tareas', '2026-05-01', 14128, 'clockify_import', NOW()),
(gen_random_uuid(), 'd93c2e19-077b-4720-8d1c-b649d21857c2', 'be4ac531-c3a3-4c00-a1e2-5b52bff478b7', 'MDK Interno - Reunión', '2026-05-01', 6290, 'clockify_import', NOW()),
(gen_random_uuid(), 'd93c2e19-077b-4720-8d1c-b649d21857c2', '24ed738f-f855-48ac-9da5-fa9c95873092', 'Mundos E - Armado', '2026-05-01', 10209, 'clockify_import', NOW()),
(gen_random_uuid(), 'd93c2e19-077b-4720-8d1c-b649d21857c2', '24ed738f-f855-48ac-9da5-fa9c95873092', 'Mundos E - Control', '2026-05-01', 5846, 'clockify_import', NOW()),
(gen_random_uuid(), 'd93c2e19-077b-4720-8d1c-b649d21857c2', '24ed738f-f855-48ac-9da5-fa9c95873092', 'Mundos E - Reunión', '2026-05-01', 10898, 'clockify_import', NOW()),
(gen_random_uuid(), 'd93c2e19-077b-4720-8d1c-b649d21857c2', '24ed738f-f855-48ac-9da5-fa9c95873092', 'Mundos E - Reunión Estructura', '2026-05-01', 3756, 'clockify_import', NOW()),
(gen_random_uuid(), 'd93c2e19-077b-4720-8d1c-b649d21857c2', '24ed738f-f855-48ac-9da5-fa9c95873092', 'Mundos E - Reunión Interna', '2026-05-01', 1800, 'clockify_import', NOW()),
(gen_random_uuid(), 'd93c2e19-077b-4720-8d1c-b649d21857c2', '24ed738f-f855-48ac-9da5-fa9c95873092', 'Mundos E - Tareas', '2026-05-01', 25663, 'clockify_import', NOW()),
(gen_random_uuid(), 'd93c2e19-077b-4720-8d1c-b649d21857c2', 'bae8b148-bd0b-4250-a8c3-6bc4c277b02f', 'Nobis - Armado', '2026-05-01', 5746, 'clockify_import', NOW()),
(gen_random_uuid(), 'd93c2e19-077b-4720-8d1c-b649d21857c2', 'bae8b148-bd0b-4250-a8c3-6bc4c277b02f', 'Nobis - Control', '2026-05-01', 17232, 'clockify_import', NOW()),
(gen_random_uuid(), 'd93c2e19-077b-4720-8d1c-b649d21857c2', 'bae8b148-bd0b-4250-a8c3-6bc4c277b02f', 'Nobis - Optimización', '2026-05-01', 27778, 'clockify_import', NOW()),
(gen_random_uuid(), 'd93c2e19-077b-4720-8d1c-b649d21857c2', 'bae8b148-bd0b-4250-a8c3-6bc4c277b02f', 'Nobis - Reunión', '2026-05-01', 5396, 'clockify_import', NOW()),
(gen_random_uuid(), 'd93c2e19-077b-4720-8d1c-b649d21857c2', 'bae8b148-bd0b-4250-a8c3-6bc4c277b02f', 'Nobis - Tareas', '2026-05-01', 19271, 'clockify_import', NOW()),
(gen_random_uuid(), 'd93c2e19-077b-4720-8d1c-b649d21857c2', 'c6d25e75-9187-4dea-ba0c-c06d6ae462e7', 'Pire Rayen - Optimización', '2026-05-01', 5424, 'clockify_import', NOW()),
(gen_random_uuid(), 'd93c2e19-077b-4720-8d1c-b649d21857c2', 'c6d25e75-9187-4dea-ba0c-c06d6ae462e7', 'Pire Rayen - Reunión Cierre', '2026-05-01', 958, 'clockify_import', NOW()),
(gen_random_uuid(), 'd93c2e19-077b-4720-8d1c-b649d21857c2', 'c6d25e75-9187-4dea-ba0c-c06d6ae462e7', 'Pire Rayen - Reunión Clientes', '2026-05-01', 8451, 'clockify_import', NOW()),
(gen_random_uuid(), 'd93c2e19-077b-4720-8d1c-b649d21857c2', 'c6d25e75-9187-4dea-ba0c-c06d6ae462e7', 'Pire Rayen - Tareas', '2026-05-01', 5400, 'clockify_import', NOW()),
(gen_random_uuid(), 'd93c2e19-077b-4720-8d1c-b649d21857c2', '4abf8d75-e4b7-4402-bc2a-711da8289159', 'Roller Pro - Tareas', '2026-05-01', 6921, 'clockify_import', NOW());

-- Continuar con PAULA, VALENTINA... (seria muy largo, ejecuta primero esto y luego pasamos el resto)

-- =============================================
-- VERIFICACION INICIAL
-- =============================================

SELECT COUNT(*) as total_registros FROM entradas_de_tiempo WHERE creado_desde = 'clockify_import' AND fecha >= '2026-05-01' AND fecha < '2026-06-01';
