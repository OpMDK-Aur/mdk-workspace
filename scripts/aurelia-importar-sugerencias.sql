-- Importa los pedidos de "Sugerencias de Soy Aurelia CRM.xlsx" (hoja Pedidos) como tareas de desarrollo.
-- NO ejecutar sin autorización. Base de producción.
-- Inserta 51 filas en public.aurelia_tareas_desarrollo (tabla chica, sin bloqueos sobre otras tablas).
-- Es idempotente: no vuelve a insertar una tarea si ya existe otra con el mismo título.
-- Mapeo de Estado: Pendiente de aprobación -> backlog, En desarrollo -> desarrollo, Aplicado -> produccion.
-- No se importan los Negados: FB-028 Filtrar conversaciones según estado de oportunidad (Negado); FB-038 Mejorar depuración y contexto en mensajes de Tobías (Negado).

SET statement_timeout = '15s';
SET lock_timeout = '3s';

INSERT INTO public.aurelia_tareas_desarrollo (titulo, descripcion, etapa, categoria, aurelia_client_name, posicion)
SELECT v.titulo, v.descripcion, v.etapa, 'sugerencia', v.clientes, extract(epoch FROM now()) + v.orden
FROM (VALUES
  ('Ampliar límite de plantillas configurables', '[FB-027] Panel / agente: Herramienta · Implica agente: No', 'produccion', NULL, 0),
  ('Permitir campos personalizados', '[FB-007] Panel / agente: Contactos · Implica agente: No
Clientes: Grupo Prestafácil', 'desarrollo', 'Grupo Prestafácil', 1),
  ('Marcar conversaciones como no leídas', '[FB-001] Panel / agente: Conversaciones · Implica agente: No
Clientes: Rocca P.; DEL SUR; Medicardio', 'backlog', 'Rocca P.; DEL SUR; Medicardio', 2),
  ('Incorporar sonido en notificaciones a asesores', '[FB-002] Panel / agente: Herramienta · Implica agente: No
Clientes: Rocca P.; Integra C.', 'backlog', 'Rocca P.; Integra C.', 3),
  ('Editar mensajes programados sin cancelarlos', '[FB-003] Panel / agente: Herramienta · Implica agente: No
Clientes: Rocca P.', 'backlog', 'Rocca P.', 4),
  ('Separar visualmente las notas e identificar autor y fecha', '[FB-004] Panel / agente: Contactos · Implica agente: No
Clientes: Interno; Rocca P.; Integra C.', 'backlog', 'Interno; Rocca P.; Integra C.', 5),
  ('Mostrar mensajes programados en el reloj de oportunidades', '[FB-005] Panel / agente: Herramienta · Implica agente: No
Clientes: Rocca P.
Ejemplo: El reloj actualmente muestra tareas pendientes; debería incluir mensajes programados.', 'backlog', 'Rocca P.', 6),
  ('Ofrecer cancelar mensajes programados al cerrar una oportunidad', '[FB-006] Panel / agente: Herramienta · Implica agente: No
Clientes: Rocca P.
Ejemplo: Cuando la oportunidad pase a Ganado o Perdido, mostrar la opción de cancelar mensajes programados.', 'backlog', 'Rocca P.', 7),
  ('Consultar métricas en rangos mayores a 30 días', '[FB-008] Panel / agente: Dashboard · Implica agente: No
Clientes: Rocca P.', 'backlog', 'Rocca P.', 8),
  ('Filtrar contactos por fecha', '[FB-009] Panel / agente: Contactos · Implica agente: No
Clientes: Interno', 'backlog', 'Interno', 9),
  ('Exportar más campos de información', '[FB-010] Panel / agente: Herramienta · Implica agente: No
Ejemplo: Incluir notas y etiquetas en la exportación.', 'backlog', NULL, 10),
  ('Filtrar mediante temperatura del agente Tobías', '[FB-011] Panel / agente: Tobías · Implica agente: Sí', 'backlog', NULL, 11),
  ('Auditar desempeño del agente Sofía desde Axel', '[FB-012] Panel / agente: Sofía; Axel · Implica agente: Sí
Clientes: Dynatecphone
Ejemplo: Evaluar a Sofía y su rendimiento como un asesor más.', 'backlog', 'Dynatecphone', 12),
  ('Crear o reabrir oportunidades al reingresar un contacto', '[FB-013] Panel / agente: Lucas; Tobías · Implica agente: Sí
Clientes: Integra C.
Ejemplo: Si un contacto responde a Tobías y reingresa, Lucas debe crear una oportunidad o reabrirla según corresponda.
Observaciones: El texto original dice «re-abrir la oportunidad si estaba abierta»; requiere aclarar la condición.', 'backlog', 'Integra C.', 13),
  ('Distinguir respuestas positivas y negativas en reportes de Tobías', '[FB-014] Panel / agente: Tobías · Implica agente: Sí
Clientes: Rocca P.', 'backlog', 'Rocca P.', 14),
  ('Reconocer cierres descalificados desde Sofía', '[FB-015] Panel / agente: Sofía · Implica agente: Sí
Clientes: POTRO; Círculo O.; Integra C.; ICS
Ejemplo: Contemplar cierres de conversación como descalificados.', 'backlog', 'POTRO; Círculo O.; Integra C.; ICS', 15),
  ('Asignar usuarios sin selección aleatoria', '[FB-016] Panel / agente: Sofía · Implica agente: No
Clientes: Integra C.
Ejemplo: En selecciones múltiples de usuarios, permitir asignación 1 a 1 o balanceada.', 'backlog', 'Integra C.', 16),
  ('Enviar mensajes con Enter al pegar textos o archivos', '[FB-017] Panel / agente: Herramienta · Implica agente: No
Clientes: Interno', 'backlog', 'Interno', 17),
  ('Filtrar mensajes programados por asesor', '[FB-018] Panel / agente: Herramienta · Implica agente: No
Clientes: Interno', 'backlog', 'Interno', 18),
  ('Programar mensajes recurrentes individuales por cliente', '[FB-019] Panel / agente: Conversaciones · Implica agente: No
Clientes: ELECTRO NORTE', 'backlog', 'ELECTRO NORTE', 19),
  ('Registrar nombre de anuncio en entradas desde campañas de WhatsApp', '[FB-020] · Implica agente: No
Clientes: Interno
Ejemplo: Incorporar nombre del anuncio como sucede con los ingresos mediante webhook.', 'backlog', 'Interno', 20),
  ('Filtrar acciones por embudo en Tobías', '[FB-021] Panel / agente: Tobías · Implica agente: Sí
Clientes: Interno', 'backlog', 'Interno', 21),
  ('Reenviar mensajes de conversación', '[FB-022] Panel / agente: Conversaciones · Implica agente: No
Clientes: ELECTRO NORTE', 'backlog', 'ELECTRO NORTE', 22),
  ('Definir funcionalidad solicitada para mensajes de conversación', '[FB-023] Panel / agente: Conversaciones · Implica agente: No
Clientes: Interno
Ejemplo: Texto original: «Poder mensajes de la conversación».
Observaciones: Pedido incompleto; confirmar acción requerida.', 'backlog', 'Interno', 23),
  ('Filtrar conversaciones por etiquetas que no contiene', '[FB-024] Panel / agente: Conversaciones · Implica agente: No
Clientes: Purukle
Ejemplo: Filtro «no contiene» para Tag.', 'backlog', 'Purukle', 24),
  ('Mostrar recuento de mensajes según filtros', '[FB-025] Panel / agente: Conversaciones · Implica agente: No
Clientes: Círculo O.', 'backlog', 'Círculo O.', 25),
  ('Diferenciar criterios de análisis de Lucas por canal o agente', '[FB-026] Panel / agente: Lucas · Implica agente: Sí
Ejemplo: Calificación distinta para clientes con más de una gestión de ventas o que comercializan dos unidades de producto.', 'backlog', NULL, 26),
  ('Contraer oportunidades de forma masiva', '[FB-029] Panel / agente: Oportunidades · Implica agente: No
Clientes: Rocca P.
Ejemplo: Aplicar visualización de oportunidad «encogida» a varias oportunidades, en vez de una por una.', 'backlog', 'Rocca P.', 27),
  ('Sincronizar asignación manual de conversación y oportunidad', '[FB-030] Panel / agente: Herramienta · Implica agente: No
Clientes: ICS
Ejemplo: Si se asigna manualmente una conversación, asignar automáticamente su oportunidad al mismo usuario.', 'backlog', 'ICS', 28),
  ('Activar acciones automáticas de Tobías por condiciones de embudo', '[FB-031] Panel / agente: Tobías · Implica agente: Sí
Clientes: Newpanel
Ejemplo: Si una oportunidad lleva 15 días en Presupuesto sin respuesta, Tobías envía un mensaje automáticamente a contactos que cumplen el criterio, sin configurar campañas semanales.', 'backlog', 'Newpanel', 29),
  ('Incluir Notas como panel junto a Tareas y Mensajes programados', '[FB-032] Panel / agente: Contactos · Implica agente: No
Clientes: Rocca P.', 'backlog', 'Rocca P.', 30),
  ('Importar etiquetas', '[FB-033] Panel / agente: Herramienta · Implica agente: No
Clientes: Coach Estético', 'backlog', 'Coach Estético', 31),
  ('Analizar movimientos de oportunidades de forma masiva', '[FB-034] Panel / agente: Lucas · Implica agente: Sí
Clientes: Grupo Prestafácil
Ejemplo: Como la funcionalidad de análisis masivo disponible desde Contactos.
Observaciones: Mención de Lucas como referencia funcional; validar si es el agente responsable.', 'backlog', 'Grupo Prestafácil', 32),
  ('Crear conversaciones manualmente sin acceso general a contactos', '[FB-035] Panel / agente: Conversaciones · Implica agente: No
Clientes: ICS
Ejemplo: Como alternativa, separar visualmente los contactos para gestionar permisos.', 'backlog', 'ICS', 33),
  ('Cambiar estado de oportunidad desde la vista de lista', '[FB-036] Panel / agente: Oportunidades · Implica agente: No
Ejemplo: No limitarlo al cambio por etapa.', 'backlog', NULL, 34),
  ('Mostrar métricas totales de etiquetas sin depender de Lucas', '[FB-037] Panel / agente: Lucas · Implica agente: Sí
Clientes: Rocca P.
Observaciones: Lucas aparece como dependencia actual, no necesariamente como responsable de la mejora.', 'backlog', 'Rocca P.', 35),
  ('Limitar la atención de Sofía a horarios configurados', '[FB-039] Panel / agente: Sofía · Implica agente: Sí', 'backlog', NULL, 36),
  ('Contemplar turnos laborales en Axel', '[FB-040] Panel / agente: Axel · Implica agente: Sí
Ejemplo: Turno Mañana y Turno Tarde.', 'backlog', NULL, 37),
  ('Derivar conversaciones con Sofía según turno horario', '[FB-041] Panel / agente: Sofía · Implica agente: Sí
Ejemplo: Turno Mañana y Turno Tarde.', 'backlog', NULL, 38),
  ('Pedir motivo de baja al perder oportunidades, desde cualquier origen', '[FB-042] Panel / agente: Sofía · Implica agente: Sí
Ejemplo: Solicitar el motivo de baja cuando se envíe a Perdida, sin importar desde dónde se cambie de estado.
Observaciones: Excluye movimientos realizados por Lucas.', 'backlog', NULL, 39),
  ('Enviar mensajes separados desde Sofía', '[FB-043] Panel / agente: Sofía · Implica agente: Sí
Clientes: Marittima; Círculo O.', 'backlog', 'Marittima; Círculo O.', 40),
  ('"Cosas que sí hacer" en Sofía en el formulario', '[FB-044] Panel / agente: Sofía · Implica agente: Sí
Clientes: Himalaya
Ejemplo: Dentro del formulario de configuración simple, que se pueda sumar indicación que sí quieren que el agente realice. Así como estan los "No hacer, ni decir"
Observaciones: Por ej: Siempre saluda en la priemr interacción, usa emois casualmente, etc,ect', 'backlog', 'Himalaya', 41),
  ('Archivar una oportunidad desde el atajo de la conversación', '[FB-045] Panel / agente: Herramienta · Implica agente: No
Ejemplo: Desde el acceso directo a la oportunidad dentro de una conversación, permitir archivarla sin ingresar al panel de Oportunidades.', 'backlog', NULL, 42),
  ('Mostrar estimación del tiempo restante para finalizar los envíos de Tobías', '[FB-046] Panel / agente: Tobías · Implica agente: Sí
Ejemplo: Calcular y mostrar cuántos días u horas faltan para completar una campaña de envíos, en función del tamaño total de la base, los días habilitados y los horarios de envío.
Observaciones: Considerar los contactos pendientes de envío y las restricciones de frecuencia o capacidad de envío, si corresponden.', 'backlog', NULL, 43),
  ('Visualizar grupos de WhatsApp en el panel de conversaciones', '[FB-047] Panel / agente: Conversaciones · Implica agente: No
Clientes: Lening Indumentaria
Ejemplo: Permitir visualizar dentro de Aurelia las conversaciones de grupos de WhatsApp.
Observaciones: Pedido de compatibilidad y visualización de chats grupales de WhatsApp.', 'backlog', 'Lening Indumentaria', 44),
  ('Acciones masivas en embudos (actualizar estado, etapa)', '[FB-048] Panel / agente: Embudos · Implica agente: No
Clientes: Solicitud interna
Ejemplo: Hoy ya existe un botón de "mover oportunidades" por lo tanto sería mejorar este botón y agregar estado, embudos. Y deben filtrar', 'backlog', 'Solicitud interna', 45),
  ('Filtro por etapa en embudos (por etapa, estado, etiqueta)', '[FB-049] Panel / agente: Embudos · Implica agente: No
Clientes: Solicitud interna
Ejemplo: Es necesario filtrar para realizar acciones masivas y extraer reportes.', 'backlog', 'Solicitud interna', 46),
  ('Exportar conversaciones', '[FB-050] Panel / agente: Conversaciones
Clientes: Dynatecphone, VN Claro
Ejemplo: Filtrar conversaciones en áreas de call center para poder enviarlos al área de calidad/herramientas internas', 'backlog', 'Dynatecphone, VN Claro', 47),
  ('Diferenciar mensajes salientes por emisor o por etapa y estado para movimientos automáticos', '[FB-051] Panel / agente: Lucas · Implica agente: Sí
Clientes: ICS
Ejemplo: Opción 1: distinguir si un mensaje saliente fue enviado por un vendedor o por un agente de IA. Opción 2: identificar la etapa y el estado de la oportunidad en el momento del envío. Ej.: Nuevo / Nuevo frente a Presupuesto / Nuevo o Ganado.
Observaciones: Ambas alternativas buscan mejorar los criterios de Lucas para el movimiento automático de etapas y evitar interpretar como equivalentes mensajes salientes de distintos emisores o contextos. Son alternativas de solución al mismo pedido.', 'backlog', 'ICS', 48),
  ('Configurar excepciones por etiquetas para las acciones automáticas de Lucas', '[FB-052] Panel / agente: Lucas · Implica agente: Sí
Clientes: Varios clientes (sin especificar)
Ejemplo: Si una oportunidad o contacto tiene una etiqueta determinada, Lucas no debe ejecutar el movimiento automático de etapa/estado ni aplicar una nueva etiqueta, según la excepción configurada.
Observaciones: Permitir definir etiquetas que bloqueen acciones específicas de Lucas. Las excepciones deben ser configurables por tipo de acción, sin desactivar las demás automatizaciones.', 'backlog', 'Varios clientes (sin especificar)', 49),
  ('Excluir oportunidades de etapas específicas en campañas de recontacto de Tobías', '[FB-053] Panel / agente: Tobías · Implica agente: Sí
Clientes: ICS (sugerencia interna)
Ejemplo: Al configurar una campaña de recontacto, excluir los contactos cuyas oportunidades estén en la etapa «Perdido no potencial», aunque cumplan los demás filtros de selección.
Observaciones: Sugerencia interna aplicable a ICS. Permitir exclusiones por etapa del embudo para evitar recontactar oportunidades que no corresponden.', 'backlog', 'ICS (sugerencia interna)', 50)
) AS v(titulo, descripcion, etapa, clientes, orden)
WHERE NOT EXISTS (
  SELECT 1 FROM public.aurelia_tareas_desarrollo t WHERE lower(t.titulo) = lower(v.titulo)
);
