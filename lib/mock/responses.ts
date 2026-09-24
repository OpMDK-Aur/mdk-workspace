// Respuestas simuladas para el chat de demo de Conexa. Se elige por
// coincidencia de palabra clave sobre la pregunta del usuario; si no hay
// coincidencia, se devuelve una respuesta genérica.
type MockResponseRule = { keywords: string[]; response: string }

const RULES: MockResponseRule[] = [
  {
    keywords: ['lead'],
    response:
      'En el período seleccionado ingresaron 128 leads al CRM. Meta Ads es la principal fuente (62%), seguido de Google Ads (28%). El resto proviene de tráfico orgánico y referidos.',
  },
  {
    keywords: ['campaña', 'campana'],
    response:
      'Las campañas con mejor desempeño en el período fueron "Prospecting Salud" (CPL $2.180) y "Remarketing General" (CPL $1.640). Te recomiendo revisar la segmentación de "Awareness Q3", que muestra el CPL más alto.',
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

export function getMockResponse(question: string): string {
  const normalized = question.toLowerCase()
  const rule = RULES.find((item) => item.keywords.some((keyword) => normalized.includes(keyword)))
  if (!rule) return GENERIC_RESPONSE
  const hasPeriod = PERIOD_KEYWORDS.some((keyword) => normalized.includes(keyword))
  return hasPeriod ? rule.response : ASK_PERIOD_RESPONSE
}
