// Respuestas simuladas para el chat de demo de Conexa. Se elige por
// coincidencia de palabra clave sobre la pregunta del usuario; si no hay
// coincidencia, se devuelve una respuesta genérica.
export type AccountsContext = {
  metaAccountIds?: (string | null | undefined)[]
  googleAccountIds?: (string | null | undefined)[]
  analyticsPropertyId?: string | null
  tagManagerContainerId?: string | null
}

type MockResponseRule = {
  keywords: string[]
  /** Algunas respuestas (cuentas conectadas) no dependen de un período. */
  requiresPeriod?: boolean
  response: string | ((accounts?: AccountsContext) => string)
}

// Algunos campos de cuentas conectadas guardan varios IDs en un solo string
// separado por comas (p. ej. "197...,990...,205..."), en línea con la misma
// normalización que ya usa el resto de la vista de Conexa.
function normalizeAccountIds(values: (string | null | undefined)[]) {
  return [...new Set(values.filter(Boolean).flatMap((value) => String(value).split(',').map((id) => id.trim()).filter(Boolean)))]
}

function buildAccountsResponse(accounts?: AccountsContext): string {
  const meta = normalizeAccountIds(accounts?.metaAccountIds ?? [])
  const google = normalizeAccountIds(accounts?.googleAccountIds ?? [])
  if (meta.length === 0 && google.length === 0) {
    return 'Todavía no tengo ninguna cuenta publicitaria conectada para este cliente. Podés vincularla desde la sección Conexiones.'
  }
  const lines = [
    `- **Meta Ads**: ${meta.length > 0 ? `cuenta ${meta.join(', ')}` : 'sin cuenta conectada'}`,
    `- **Google Ads**: ${google.length > 0 ? `cuenta ${google.join(', ')}` : 'sin cuenta conectada'}`,
  ]
  if (accounts?.analyticsPropertyId) lines.push(`- **Google Analytics**: propiedad ${accounts.analyticsPropertyId}`)
  if (accounts?.tagManagerContainerId) lines.push(`- **Tag Manager**: contenedor ${accounts.tagManagerContainerId}`)
  return `Las cuentas conectadas para este cliente son:\n\n${lines.join('\n')}`
}

// El orden importa: se evalúan de arriba hacia abajo y se usa la primera que
// matchea. Las reglas combinadas (que requieren varias palabras clave a la
// vez) van primero para no perderse detrás de una regla genérica de un solo
// término (p. ej. "leads por campaña y ventas" no debe caer en la regla
// genérica de "lead").
const RULES: MockResponseRule[] = [
  {
    keywords: ['cuenta publicitaria', 'cuenta de meta', 'cuenta de google', 'cuenta de anuncios', 'qué cuenta', 'que cuenta', 'cuál cuenta', 'cual cuenta', 'id de cuenta', 'account id'],
    requiresPeriod: false,
    response: buildAccountsResponse,
  },
  {
    keywords: ['campaña', 'campana'],
    response:
      'Desglose por campaña en el período seleccionado:\n\n' +
      '- **Prospecting Salud**: 52 leads → 16 ventas (CPL $2.180)\n' +
      '- **Remarketing General**: 41 leads → 14 ventas (CPL $1.640)\n' +
      '- **Awareness Q3**: 35 leads → 4 ventas (CPL $3.050)\n\n' +
      'Remarketing General tiene la mejor tasa de conversión a venta (34%). Te recomiendo revisar la segmentación de Awareness Q3, que concentra el CPL más alto y la conversión más baja.',
  },
  {
    keywords: ['invers', 'gasto', 'spend', 'presupuesto'],
    response:
      'La inversión en el período fue de $1.240.500 en Meta Ads y $860.200 en Google Ads, un total de $2.100.700. El CPL promedio combinado es de $16.400.',
  },
  {
    keywords: ['lead'],
    response:
      'En el período seleccionado ingresaron 128 leads al CRM. Meta Ads es la principal fuente (62%), seguido de Google Ads (28%). El resto proviene de tráfico orgánico y referidos.',
  },
  {
    keywords: ['venta', 'ventas'],
    response:
      'Se registraron 34 ventas en el período, con una tasa de conversión de lead a venta del 26,5%. La campaña "Remarketing General" concentra el 40% de las ventas totales.',
  },
  {
    keywords: ['tracking', 'pixel', 'evento'],
    response:
      'El tracking está funcionando correctamente: el pixel de Meta y el tag de conversión de Google están activos. Se detectaron 3 eventos "Lead" sin atribución de fuente en los últimos 7 días.',
  },
]

const GENERIC_RESPONSE =
  'Todavía no tengo datos suficientes para responder eso con precisión. Probá preguntando por leads, campañas, ventas o tracking del cliente seleccionado.'

const PERIOD_KEYWORDS = [
  'hoy',
  'ayer',
  'semana',
  'mes',
  'año',
  'anio',
  'trimestre',
  'período',
  'periodo',
  'desde',
  'entre',
  'último',
  'ultimo',
  'últimos',
  'ultimos',
]

const ASK_PERIOD_RESPONSE =
  '¿Para qué período querés que revise esa información? Por ejemplo, podés decirme "esta semana", "el mes pasado" o un rango de fechas puntual.'

export function getMockResponse(question: string, accounts?: AccountsContext): string {
  const normalized = question.toLowerCase()
  const rule = RULES.find((item) => item.keywords.some((keyword) => normalized.includes(keyword)))
  if (!rule) return GENERIC_RESPONSE
  const requiresPeriod = rule.requiresPeriod ?? true
  if (requiresPeriod) {
    const hasPeriod = PERIOD_KEYWORDS.some((keyword) => normalized.includes(keyword))
    if (!hasPeriod) return ASK_PERIOD_RESPONSE
  }
  return typeof rule.response === 'function' ? rule.response(accounts) : rule.response
}
