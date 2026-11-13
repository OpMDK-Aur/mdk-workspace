/** Campos del formulario «Contexto del cliente» (tabla ai_client_profile) que el chat puede pedir y completar. Sin dependencias de servidor: lo usa también la UI. */
export const PROFILE_FIELDS = [
  { key: 'industry', label: 'Industria / rubro', kind: 'text', core: true, question: '¿En qué industria o rubro está el cliente?' },
  { key: 'commercial_objective', label: 'Objetivo comercial', kind: 'text', core: true, question: '¿Cuál es el objetivo comercial principal (ventas, leads, reservas, visitas al local…)?' },
  { key: 'product_type', label: 'Qué vende u ofrece', kind: 'text', core: true, question: '¿Qué producto o servicio vende y a qué precio aproximado?' },
  { key: 'primary_conversion_type', label: 'Conversión principal', kind: 'text', core: false, question: '¿Cuál es la conversión que más importa (formulario, WhatsApp, compra online, llamada)?' },
  { key: 'target_cpl', label: 'CPL objetivo', kind: 'number', core: false, question: '¿Cuánto puede pagar como máximo por lead (CPL objetivo)?' },
  { key: 'target_monthly_sales', label: 'Ventas objetivo mensuales', kind: 'number', core: false, question: '¿Cuántas ventas por mes quiere lograr?' },
  { key: 'additional_context', label: 'Contexto adicional', kind: 'text', core: false, question: '¿Hay estacionalidad, zonas, públicos o restricciones que debamos respetar?' },
] as const

export type ProfileFieldKey = (typeof PROFILE_FIELDS)[number]['key']
export const PROFILE_FIELD_KEYS = PROFILE_FIELDS.map((field) => field.key) as [ProfileFieldKey, ...ProfileFieldKey[]]
export const PROFILE_FIELD_LABEL = Object.fromEntries(PROFILE_FIELDS.map((field) => [field.key, field.label])) as Record<ProfileFieldKey, string>
export const COMPETITOR_PREFIX = 'Competencia · '
/** Los competidores que el usuario quita quedan registrados para que Conexa no los vuelva a sugerir. */
export const DISCARDED_COMPETITOR_PREFIX = 'Competencia descartada · '
export const SUGGESTED_COMPETITOR_MARK = 'Sugerido por Conexa'
