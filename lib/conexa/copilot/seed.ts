import type { Decision, Learning, Play, Recommendation } from './types'

const daysAgo = (days: number) => {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString()
}

export function seedPlays(): Play[] {
  return [
    { id: 'play-remarketing', kind: 'Reasignar a remarketing', move: 'mover presupuesto de prospecting frío a audiencias que ya interactuaron', impact: '-18% CPL estimado' },
    { id: 'play-calidad-lead', kind: 'Calidad de lead', move: 'priorizar el formulario con más ventas cerradas en el CRM', impact: '+12% tasa de cierre' },
  ]
}

export function seedRecommendations(clientId: string): Recommendation[] {
  const base = { clientId, status: 'pending' as const, version: 1 }
  return [
    {
      ...base, id: `${clientId}-r1`, playId: 'play-remarketing', type: 'Presupuesto', platform: 'meta', priority: 'alta',
      entity: 'Campaña · Prospecting Frío AR', title: 'Bajar el presupuesto diario de Prospecting Frío',
      summary: 'El conjunto gasta el 42% del presupuesto y trae el 11% de las ventas del período.',
      why: 'CPL de $4.120, 1,8 veces el promedio de la cuenta, con el 42% del gasto.',
      sources: [
        { k: 'Performance', t: 'CPL $4.120, 1,8 veces el promedio', f: 'Meta Ads' },
        { k: 'Performance', t: '11% de las ventas con el 42% del gasto', f: 'CRM' },
        { k: 'Historial', t: 'Una baja similar en agosto redujo el CPL un 21%', f: 'Decisiones' },
        { k: 'Objetivo', t: 'Ventas sobre volumen de leads', f: 'Cliente' },
      ],
      before: '$ 85.000 / día', after: '$ 55.000 / día', diff: '-$ 30.000 / día', impact: '-14% CPL de la cuenta',
      how: 'Meta Marketing API · actualiza daily_budget',
    },
    {
      ...base, id: `${clientId}-r2`, playId: 'play-remarketing', type: 'Presupuesto', platform: 'meta', priority: 'alta',
      entity: 'Campaña · Remarketing 30 días', title: 'Subir el presupuesto de Remarketing 30 días',
      summary: 'La campaña está limitada por presupuesto y es la de mejor costo por venta.',
      why: 'Costo por venta de $18.300, el más bajo de la cuenta, y se corta antes de las 18 h.',
      sources: [
        { k: 'Performance', t: 'Costo por venta $18.300, el más bajo de la cuenta', f: 'Meta Ads' },
        { k: 'Performance', t: 'Agota el presupuesto antes de las 18 h', f: 'Meta Ads' },
        { k: 'Competencia', t: 'Dos competidores aumentaron la frecuencia en remarketing', f: 'Biblioteca de anuncios' },
      ],
      before: '$ 20.000 / día', after: '$ 45.000 / día', diff: '+$ 25.000 / día', impact: '+9 ventas / semana',
      how: 'Meta Marketing API · actualiza daily_budget',
    },
    {
      ...base, id: `${clientId}-r3`, playId: 'play-calidad-lead', type: 'Formulario', platform: 'meta', priority: 'media',
      entity: 'Anuncio · Formulario Cotización Rápida', title: 'Reemplazar el formulario corto por el calificado',
      summary: 'El formulario corto trae volumen pero casi no cierra ventas.',
      why: 'El formulario corto cierra 2,1% de los leads; el calificado, 7,4%.',
      sources: [
        { k: 'Performance', t: 'Cierre 2,1% vs 7,4% del formulario calificado', f: 'CRM' },
        { k: 'Historial', t: 'El cliente pidió menos leads y más calificados en septiembre', f: 'Decisiones' },
      ],
      before: 'Cotización Rápida (3 campos)', after: 'Cotización Calificada (6 campos)', diff: '+3 preguntas', impact: '+12% tasa de cierre',
      how: 'Meta Marketing API · actualiza lead_gen_form_id del creativo',
    },
    {
      ...base, id: `${clientId}-r4`, type: 'Puja', platform: 'google-ads', priority: 'media',
      entity: 'Campaña · Search Marca', title: 'Bajar el CPC máximo en Search Marca',
      summary: 'La campaña de marca paga clics caros sin competencia en la subasta.',
      why: 'Cuota de impresiones del 97% pagando $410 por clic, 2,3 veces lo necesario.',
      sources: [
        { k: 'Performance', t: 'Cuota de impresiones 97% con CPC $410', f: 'Google Ads' },
        { k: 'Competencia', t: 'Sin competidores en la subasta de la marca', f: 'Estadísticas de subasta' },
      ],
      before: 'CPC máx. $ 450', after: 'CPC máx. $ 220', diff: '-$ 230', impact: '-$ 96.000 / mes',
      how: 'Google Ads API · actualiza cpc_bid_micros',
    },
    {
      ...base, id: `${clientId}-r5`, type: 'Etapa', platform: 'crm', priority: 'baja',
      entity: 'Pipeline · Ventas', title: 'Mover leads sin respuesta a "Recontactar"',
      summary: 'Hay leads sin actividad que siguen contando como abiertos.',
      why: '64 leads llevan más de 10 días sin contacto en "Nuevo".',
      sources: [
        { k: 'Performance', t: '64 leads sin actividad hace más de 10 días', f: 'CRM' },
        { k: 'Contexto', t: 'El equipo de ventas recontacta los martes', f: 'Contexto del cliente' },
      ],
      before: 'Etapa: Nuevo', after: 'Etapa: Recontactar', diff: '64 leads', impact: '+5 oportunidades recuperadas',
      how: 'CRM API · actualiza pipeline_stage',
    },
    {
      ...base, id: `${clientId}-r6`, type: 'Evento', platform: 'tracking', priority: 'alta',
      entity: 'GTM · Etiqueta Lead Meta', title: 'Corregir el disparo duplicado del evento Lead',
      summary: 'El evento Lead se dispara dos veces por envío.',
      why: 'GA4 registra 1,9 eventos Lead por envío real del formulario.',
      sources: [
        { k: 'Performance', t: '1,9 eventos Lead por envío', f: 'GA4' },
        { k: 'Performance', t: 'Dos activadores sobre el mismo formulario', f: 'GTM' },
      ],
      before: '2 activadores', after: '1 activador (form_submit)', diff: '-1 activador', impact: 'Conversiones reales en Meta',
      how: 'GTM API · pausa el activador duplicado',
    },
  ]
}

export function seedDecisions(clientId: string): Decision[] {
  return [
    {
      id: `${clientId}-d1`, recId: 'hist-1', date: daysAgo(3), by: 'Agustina P.', decision: 'Aprobada', title: 'Pausar el conjunto Intereses Amplios', platform: 'meta', type: 'Estado',
      recommended: 'Pausar', executed: 'Pausar', before: 'Activo', after: 'Pausado', revertible: true,
      result: { state: 'measuring', day: 3, metric: 'CPL -9% hasta ahora' },
    },
    {
      id: `${clientId}-d2`, recId: 'hist-2', date: daysAgo(12), by: 'Martín G.', decision: 'Editada y aprobada', title: 'Mover presupuesto a Remarketing', platform: 'meta', type: 'Presupuesto',
      recommended: '+$ 30.000 / día', executed: '+$ 20.000 / día', before: '$ 15.000 / día', after: '$ 35.000 / día', revertible: false,
      result: { state: 'ok', metric: 'CPL -21%' },
    },
    {
      id: `${clientId}-d3`, recId: 'hist-3', date: daysAgo(20), by: 'Agustina P.', decision: 'Rechazada', title: 'Ampliar la segmentación a todo el país', platform: 'meta', type: 'Segmentación',
      recommended: 'Argentina completa', revertible: false, result: { state: 'none' },
    },
    {
      id: `${clientId}-d4`, recId: 'hist-4', date: daysAgo(26), by: 'Martín G.', decision: 'Aprobada', title: 'Agregar negativas genéricas en Search', platform: 'google-ads', type: 'Palabras clave',
      recommended: '+18 negativas', executed: '+18 negativas', before: '42 negativas', after: '60 negativas', revertible: false,
      result: { state: 'bad', metric: 'Conversiones -6%' },
    },
  ]
}

export function seedLearnings(clientId: string): Learning[] {
  return [
    { id: `${clientId}-l1`, date: daysAgo(12), text: 'Mover presupuesto de Prospecting a Remarketing bajó el CPL en 2 de 2 casos.' },
    { id: `${clientId}-l2`, date: daysAgo(20), text: 'El cliente prefiere no ampliar la segmentación fuera de AMBA.' },
    { id: `${clientId}-l3`, date: daysAgo(26), text: 'Las negativas genéricas en Search recortaron conversiones: revisarlas una por una.' },
  ]
}
