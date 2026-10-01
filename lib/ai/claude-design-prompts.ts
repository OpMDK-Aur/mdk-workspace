export type ReportPlan = 'esencial' | 'estrategico'

interface SlideSpec {
  number: string
  title: string
  fields: string[]
}

const ESENCIAL_SLIDES: SlideSpec[] = [
  {
    number: '01',
    title: 'Resumen del período',
    fields: [
      'Objetivo de la pauta (texto)',
      'Tabla "Cumplimiento de objetivo": filas Leads generados / CPL promedio / Cumplimiento, columnas Objetivo y Resultado del período',
      'Conclusión general (2-3 oraciones)',
    ],
  },
  {
    number: '02',
    title: 'Resultados de campañas',
    fields: [
      'Totales del período: Inversión total, Leads generados, CPL promedio, Vs. período anterior (CPL %)',
      'Tabla por campaña: Campaña | Inversión | Leads | CPL | Vs. anterior (CPL), con fila TOTAL',
    ],
  },
  {
    number: '03',
    title: 'Acciones realizadas',
    fields: ['Cambios en campañas (bullets)', 'Optimizaciones aplicadas (bullets)', 'Tests ejecutados (bullets con resultado)'],
  },
  {
    number: '04',
    title: 'Análisis del funnel — síntesis',
    fields: [
      'Leads por pauta en CRM vs leads en plataforma y % de diferencia (margen aceptable < 20%). Si la cuenta no tiene CRM integrado, indicarlo y omitir el cruce',
      'Cuello de botella (texto)',
      'Oportunidades detectadas (texto)',
      'Aclaración fija: "El análisis profundo del pipeline corresponde al Plan Estratégico."',
    ],
  },
  {
    number: '05',
    title: 'Qué funcionó / qué no',
    fields: ['Lo que funcionó (bullets con dato)', 'Lo que no funcionó (bullets con dato)'],
  },
  {
    number: '06',
    title: 'Plan del mes siguiente',
    fields: ['01 Qué se va a ajustar', '02 Qué se va a testear', '03 Requerimientos al cliente'],
  },
]

const ESTRATEGICO_SLIDES: SlideSpec[] = [
  {
    number: '01',
    title: 'Resumen ejecutivo',
    fields: [
      'KPIs grandes: Leads, CPL, Ventas, Inversión',
      'Barra de cumplimiento: estado (Logrado / Parcial / No logrado) + % del objetivo',
      'Objetivo del período, Contexto del mes, Conclusión general',
    ],
  },
  {
    number: '02',
    title: '¿En qué estuvimos trabajando?',
    fields: ['Los 4 pilares del mes: Estrategia, Operaciones, Testing, Optimización (un párrafo cada uno)'],
  },
  {
    number: '03',
    title: 'Testing y optimización creativa',
    fields: [
      'Hasta 3 creativos (A, B, C) con nombre de concepto y CPL',
      'Espacio para captura de cada anuncio (placeholder de imagen subible)',
      'Análisis: ganador en volumen vs ganador en calidad/ventas',
    ],
  },
  {
    number: '04',
    title: 'Performance de campañas',
    fields: [
      'Una tabla por plataforma (Meta Ads, Google Ads): Campaña | Inversión | Leads | CPL | CPC | CTR, con fila TOTAL por plataforma',
    ],
  },
  {
    number: '05',
    title: 'Acciones realizadas',
    fields: ['Cambios en campañas', 'Optimizaciones aplicadas', 'Tests ejecutados (con resultado)'],
  },
  {
    number: '06',
    title: 'Impacto en el negocio — funnel',
    fields: [
      'Tabla de funnel comercial por etapa (Leads, MQL, Contacto, SQL, Presupuesto, Venta) con cantidad y % por segmento/zona y total',
      'Cuellos de botella: dónde está la mayor caída y cuántos leads se pierden',
    ],
  },
  {
    number: '07',
    title: 'Gestión comercial en CRM',
    fields: ['Tiempo de respuesta', 'Registro y campos', 'Tiempo por etapa', 'Calidad de respuesta', 'Recontacto'],
  },
  {
    number: '08',
    title: 'Impacto económico estimado',
    fields: ['Costo por venta estimado', 'Inversión vs facturación (ROAS/múltiplo)', 'Ahorro por optimización vs período anterior'],
  },
  {
    number: '09',
    title: 'Benchmark y contexto competitivo',
    fields: ['Benchmark interno MDK del rubro', 'Comparación histórica (últimos 3 meses)', 'Contexto competitivo'],
  },
  {
    number: '10',
    title: 'Riesgos y alertas',
    fields: ['Saturación de audiencias', 'Dependencia de canales', 'Riesgos operativos / comerciales', 'Alertas tempranas'],
  },
  {
    number: '11',
    title: 'Plan de acción — mes siguiente',
    fields: ['01 Objetivos y pauta', '02 Acciones inmediatas', '03 Ajustes estratégicos', '04 Nuevas implementaciones', '05 Recomendaciones al cliente'],
  },
]

export function normalizeReportPlan(rawPlan: unknown): ReportPlan | null {
  if (typeof rawPlan !== 'string' || !rawPlan.trim()) return null
  const plan = rawPlan.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  // Premium incluye todo el alcance del Estratégico, por eso comparte plantilla.
  if (plan.includes('estrat') || plan.includes('premium')) return 'estrategico'
  if (plan.includes('esencial')) return 'esencial'
  return null
}

export function buildClaudeDesignBrief(plan: ReportPlan) {
  const isEstrategico = plan === 'estrategico'
  const slides = isEstrategico ? ESTRATEGICO_SLIDES : ESENCIAL_SLIDES
  const planLabel = isEstrategico ? 'Plan Estratégico' : 'Plan Esencial'
  const documentTitle = isEstrategico ? 'MDK · Informe Estratégico de Resultados' : 'MDK · Informe de Resultados'
  const cover = isEstrategico
    ? 'Portada: etiqueta "PLAN ESTRATÉGICO", título "INFORME ESTRATÉGICO", bajada "Cierre de [mes] · análisis completo de pauta, funnel y negocio.", índice de CONTENIDO con las 11 secciones en dos columnas y bloque con CLIENTE, PERÍODO y EJECUTIVO.'
    : 'Portada: etiqueta "PLAN ESENCIAL", título "INFORME DE RESULTADOS", bajada "Cierre de [mes] · reporte operativo de campañas.", índice de CONTENIDO con las 6 secciones y bloque con CLIENTE, PERÍODO y RESPONSABLE.'

  return {
    plan,
    plan_label: planLabel,
    document_title: documentTitle,
    slide_count: slides.length,
    design_header: [
      `Generá la plantilla de presentación "${documentTitle} — ${planLabel}" de MDK (madketing.io) con los datos de abajo, una slide por sección, formato 16:9 apaisado.`,
      cover,
      'Cada slide lleva un encabezado con el número y nombre de la sección en versalitas espaciadas (ej. "0 1 · RESUMEN DEL PERÍODO"), el número grande de la sección y un pie fijo "MDK · [Cliente] — [Período]" a la izquierda y "madketing.io" a la derecha.',
      'Los KPIs principales van destacados en tarjetas con número grande y etiqueta corta; las tablas llevan fila TOTAL resaltada. Usá exactamente los textos y números provistos; no inventes datos.',
      'Las líneas que empiezan con "⟶ NOTA PARA DISEÑO" son instrucciones para vos, no se muestran en la slide. Los campos marcados "⟶ PENDIENTE" o "⟶ sin dato" se dejan como espacio visible para completar.',
    ].join('\n'),
    slides: slides.map((slide) => ({ heading: `## ${slide.number} · ${slide.title}`, fields: slide.fields })),
    closing_sections: [
      '## Resumen de pendientes antes de cierre de arte (lista numerada con slide de referencia)',
      '**Fuente de datos:** plataformas, cuentas y período consultados (+ inputs del equipo si los hubo).',
    ],
  }
}
