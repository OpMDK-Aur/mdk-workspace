import { fillTemplate, repeatBlock, findUnresolvedTokens, TemplateRow } from '../pdf-html/template-engine'
import {
  FONT_MONUMENT_BOLD,
  FONT_MONUMENT_REGULAR,
  FONT_NEUE_REGULAR,
  FONT_NEUE_MEDIUM,
  FONT_NEUE_BOLD,
  LOGO_BASE64,
} from './pdf-assets-generated/fonts-and-logo'
import { ESENCIAL_TEMPLATE_HTML } from './pdf-templates-generated/esencial-template-html'
import { ESTRATEGICO_TEMPLATE_HTML } from './pdf-templates-generated/estrategico-template-html'

export interface ReportPdfInput {
  clientName: string
  plan?: string | null
  periodLabel: string
  responsable?: string
  markdown: string
  fileName?: string
}

const NO_INFO = 'Dato no provisto'

// ============================================================
// ASSETS (fuentes + logo) — embebidos como constantes de módulo
//
// NO usamos fs.readFileSync + outputFileTracingIncludes: en este proyecto
// resultó poco confiable en Vercel (ENOENT persistente pese a estar bien
// configurado, probablemente por la estructura de workspace del repo).
// Al importar estas constantes como código TS normal, Next.js las incluye
// en el bundle de la misma forma que cualquier otro import — sin depender
// de ninguna heurística de tracing de archivos.
// ============================================================
function loadAssetTokens(): TemplateRow {
  return {
    FONT_MONUMENT_BOLD,
    FONT_MONUMENT_REGULAR,
    FONT_NEUE_REGULAR,
    FONT_NEUE_MEDIUM,
    FONT_NEUE_BOLD,
    LOGO_BASE64,
  }
}

// ============================================================
// PARSER HELPERS (compartidos)
// ============================================================
function between(text: string, startLabel: RegExp, endLabels: RegExp[]): string {
  const startMatch = text.match(startLabel)
  if (!startMatch || startMatch.index === undefined) return NO_INFO
  const from = startMatch.index + startMatch[0].length
  let end = text.length
  for (const endLabel of endLabels) {
    const m = text.slice(from).match(endLabel)
    if (m && m.index !== undefined) {
      end = Math.min(end, from + m.index)
    }
  }
  const result = text.slice(from, end).trim()
  return result || NO_INFO
}

function extractBold(text: string, label: string): string {
  const re = new RegExp(`\\*\\*${label}[:：]?\\*\\*\\s*([^\\n]+)`, 'i')
  const m = text.match(re)
  if (!m) return NO_INFO
  // Tomamos el ÚLTIMO grupo capturado (siempre corresponde al valor, el
  // "([^\\n]+)" final), no m[1] a secas — si el `label` recibido incluye
  // sus propios paréntesis de grupo opcional (ej. 'Leads( generados)?'),
  // esos correrían el índice del valor y m[1] apuntaría a otra cosa.
  const value = m[m.length - 1]
  return value ? value.trim() : NO_INFO
}

function extractBullets(block: string): string[] {
  const lines = block
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('•') || l.startsWith('-') || l.startsWith('*'))
    .map((l) => l.replace(/^[•\-*]\s*/, '').trim())
    .filter(Boolean)
  return lines.length > 0 ? lines : [NO_INFO]
}

interface CampanaRow { nombre: string; inversion: string; leads: string; cpl: string; vsAnt: string }
interface CampanaRowFull { nombre: string; inversion: string; leads: string; cpl: string; cpc: string; ctr: string }
interface FunnelRow { etapa: string; zona1: string; zona1pct: string; zona2: string; zona2pct: string; total: string; totalPct: string }

function extractMarkdownTable(block: string): CampanaRow[] {
  const lines = block.split('\n').filter((l) => l.trim().startsWith('|'))
  const rows: CampanaRow[] = []
  for (const line of lines) {
    const cells = line.split('|').map((c) => c.trim()).filter((c) => c.length > 0)
    if (cells.length < 4) continue
    if (/^-+$/.test(cells[0].replace(/\s/g, ''))) continue
    if (/^campa[ñn]a$/i.test(cells[0].trim())) continue
    rows.push({ nombre: cells[0] || NO_INFO, inversion: cells[1] || NO_INFO, leads: cells[2] || NO_INFO, cpl: cells[3] || NO_INFO, vsAnt: cells[4] || NO_INFO })
  }
  return rows
}

function extractTableFull(block: string): CampanaRowFull[] {
  const lines = block.split('\n').filter((l) => l.trim().startsWith('|'))
  const rows: CampanaRowFull[] = []
  for (const line of lines) {
    const cells = line.split('|').map((c) => c.trim()).filter((c) => c.length > 0)
    if (cells.length < 5) continue
    if (/^-+$/.test(cells[0].replace(/\s/g, ''))) continue
    if (/^campa[ñn]a$/i.test(cells[0].trim())) continue
    rows.push({ nombre: cells[0] || NO_INFO, inversion: cells[1] || NO_INFO, leads: cells[2] || NO_INFO, cpl: cells[3] || NO_INFO, cpc: cells[4] || NO_INFO, ctr: cells[5] || NO_INFO })
  }
  return rows
}

function extractFunnelTable(block: string): FunnelRow[] {
  const lines = block.split('\n').filter((l) => l.trim().startsWith('|'))
  const rows: FunnelRow[] = []
  for (const line of lines) {
    const cells = line.split('|').map((c) => c.trim()).filter((c) => c.length > 0)
    if (cells.length < 7) continue
    if (/^-+$/.test(cells[0].replace(/\s/g, ''))) continue
    if (/etapa/i.test(cells[0])) continue
    rows.push({ etapa: cells[0] || NO_INFO, zona1: cells[1] || NO_INFO, zona1pct: cells[2] || NO_INFO, zona2: cells[3] || NO_INFO, zona2pct: cells[4] || NO_INFO, total: cells[5] || NO_INFO, totalPct: cells[6] || NO_INFO })
  }
  return rows
}

// ============================================================
// PARSER — PLAN ESENCIAL
// ============================================================
interface EsencialData {
  clientName: string; periodo: string; responsable: string
  objetivoPauta: string; conclusionGeneral: string
  leadsGenerados: string; leadsObjetivo: string; cplPromedio: string; cplObjetivo: string; cumplimientoPct: string
  inversionTotal: string; leadsTotalPeriodo: string; cplPromedioCampanas: string; vsPeriodoAnterior: string
  campanas: CampanaRow[]; totalRow: CampanaRow
  cambiosCampanas: string[]; optimizacionesAplicadas: string[]; testsEjecutados: string[]
  leadsPautaCRM: string; diferenciaPlataforma: string; cuelloBotella: string; oportunidades: string
  funciono: string[]; noFunciono: string[]
  ajusteMesSiguiente: string; testearMesSiguiente: string; requerimientosCliente: string
}

export function parseEsencialMarkdown(markdown: string, clientName: string, periodo: string, responsable: string): EsencialData {
  const cleanMarkdown = markdown.replace(/```pdf[\s\S]*?```/g, '').trim()

  const seccion01 = between(cleanMarkdown, /01[\s\S]*?RESUMEN DEL PER[IÍ]ODO|RESUMEN DEL PER[IÍ]ODO/i, [/02|RESULTADOS DE CAMPA/i])
  const seccion02 = between(cleanMarkdown, /02[\s\S]*?RESULTADOS DE CAMPA[ÑN]AS|RESULTADOS DE CAMPA[ÑN]AS/i, [/03|ACCIONES REALIZADAS/i])
  const seccion03 = between(cleanMarkdown, /03[\s\S]*?ACCIONES REALIZADAS|ACCIONES REALIZADAS/i, [/04|AN[AÁ]LISIS DEL FUNNEL/i])
  const seccion04 = between(cleanMarkdown, /04[\s\S]*?AN[AÁ]LISIS DEL FUNNEL|AN[AÁ]LISIS DEL FUNNEL/i, [/05|QU[EÉ] FUNCION/i])
  const seccion05 = between(cleanMarkdown, /05[\s\S]*?QU[EÉ] FUNCION[OÓ]|QU[EÉ] FUNCION[OÓ]/i, [/06|PLAN DEL MES/i])
  const seccion06 = between(cleanMarkdown, /06[\s\S]*?PLAN DEL MES SIGUIENTE|PLAN DEL MES SIGUIENTE/i, [/$/])

  const cambiosBlock = between(seccion03, /CAMBIOS EN CAMPA[ÑN]AS/i, [/OPTIMIZACIONES APLICADAS/i])
  const optimizacionesBlock = between(seccion03, /OPTIMIZACIONES APLICADAS/i, [/TESTS EJECUTADOS/i])
  const testsBlock = between(seccion03, /TESTS EJECUTADOS/i, [/$/])

  const funcionoBlock = between(seccion05, /LO QUE FUNCION[OÓ]/i, [/LO QUE NO FUNCION[OÓ]/i])
  const noFuncionoBlock = between(seccion05, /LO QUE NO FUNCION[OÓ]/i, [/$/])

  return {
    clientName, periodo, responsable: responsable || NO_INFO,
    objetivoPauta: between(seccion01, /OBJETIVO DE LA PAUTA/i, [/CONCLUSI[OÓ]N GENERAL/i]),
    conclusionGeneral: between(seccion01, /CONCLUSI[OÓ]N GENERAL/i, [/CUMPLIMIENTO DE OBJETIVO/i]),
    leadsGenerados: extractBold(seccion01, 'Leads'),
    leadsObjetivo: (seccion01.match(/objetivo:\s*(\d+)/i) || [])[1] || NO_INFO,
    cplPromedio: extractBold(seccion01, 'CPL'),
    cplObjetivo: (seccion01.match(/objetivo:\s*\$?([\d.,]+)/i) || [])[1] || NO_INFO,
    cumplimientoPct: (seccion01.match(/(\d{1,3}%)\s*(del objetivo|cumplimiento)/i) || [])[1] || NO_INFO,
    inversionTotal: extractBold(seccion02, 'Inversi[oó]n(?: total)?'),
    leadsTotalPeriodo: extractBold(seccion02, 'Leads(?: generados)?'),
    cplPromedioCampanas: extractBold(seccion02, 'CPL(?: promedio)?'),
    vsPeriodoAnterior: extractBold(seccion02, 'Variaci[oó]n'),
    campanas: extractMarkdownTable(seccion02).filter((r) => !/^total$/i.test(r.nombre)),
    totalRow: extractMarkdownTable(seccion02).find((r) => /^total$/i.test(r.nombre)) || { nombre: 'TOTAL', inversion: NO_INFO, leads: NO_INFO, cpl: NO_INFO, vsAnt: NO_INFO },
    cambiosCampanas: extractBullets(cambiosBlock),
    optimizacionesAplicadas: extractBullets(optimizacionesBlock),
    testsEjecutados: extractBullets(testsBlock),
    leadsPautaCRM: extractBold(seccion04, 'Leads por pauta(?: en CRM)?'),
    diferenciaPlataforma: extractBold(seccion04, 'Diferencia(?: vs plataforma)?'),
    cuelloBotella: between(seccion04, /CUELLO DE BOTELLA[^\n]*/i, [/OPORTUNIDADES DETECTADAS/i]),
    oportunidades: between(seccion04, /OPORTUNIDADES DETECTADAS/i, [/$/]),
    funciono: extractBullets(funcionoBlock),
    noFunciono: extractBullets(noFuncionoBlock),
    ajusteMesSiguiente: between(seccion06, /QU[EÉ] SE VA A AJUSTAR/i, [/QU[EÉ] SE VA A TESTEAR/i]),
    testearMesSiguiente: between(seccion06, /QU[EÉ] SE VA A TESTEAR/i, [/REQUERIMIENTOS AL CLIENTE/i]),
    requerimientosCliente: between(seccion06, /REQUERIMIENTOS AL CLIENTE/i, [/$/]),
  }
}

// ============================================================
// PARSER — PLAN ESTRATÉGICO
// ============================================================
interface EstrategicoData {
  clientName: string; periodo: string; ejecutivo: string
  leads: string; cpl: string; ventas: string; inversion: string
  cumplimientoEstado: string; cumplimientoPct: string
  objetivoPeriodo: string; contextoMes: string; conclusionGeneral: string
  estrategia: string; operaciones: string; testing: string; optimizacion: string
  analisisCreativo: string
  metaAdsCampanas: CampanaRowFull[]; metaAdsTotal: CampanaRowFull
  googleAdsCampanas: CampanaRowFull[]; googleAdsTotal: CampanaRowFull
  cambiosCampanas: string[]; optimizacionesAplicadas: string[]; testsEjecutados: string[]
  funnel: FunnelRow[]; cuellosBotella: string
  tiempoRespuesta: string; registroCampos: string; tiempoPorEtapa: string; calidadRespuesta: string; recontacto: string
  costoPorVenta: string; inversionVsFacturacion: string; ahorroOptimizacion: string
  benchmarkInterno: string; comparacionHistorica: string; contextoCompetitivo: string
  saturacionAudiencias: string; dependenciaCanales: string; riesgosOperativos: string; alertasTempranas: string
  definicionObjetivos: string; accionesInmediatas: string; ajustesEstrategicos: string; nuevasImplementaciones: string; recomendacionesCliente: string
}

export function parseEstrategicoMarkdown(markdown: string, clientName: string, periodo: string, ejecutivo: string): EstrategicoData {
  const cleanMarkdown = markdown.replace(/```pdf[\s\S]*?```/g, '').trim()
  const sec = (startRe: RegExp, endRe: RegExp) => between(cleanMarkdown, startRe, [endRe])

  const s01 = sec(/01[\s\S]*?RESUMEN EJECUTIVO|RESUMEN EJECUTIVO/i, /02|¿EN QU[EÉ] ESTUVIMOS/i)
  const s02 = sec(/02[\s\S]*?¿EN QU[EÉ] ESTUVIMOS TRABAJANDO|¿EN QU[EÉ] ESTUVIMOS TRABAJANDO/i, /03|TESTING Y OPTIMIZACI[OÓ]N/i)
  const s03 = sec(/03[\s\S]*?TESTING Y OPTIMIZACI[OÓ]N CREATIVA|TESTING Y OPTIMIZACI[OÓ]N CREATIVA/i, /04|PERFORMANCE DE CAMPA/i)
  const s04 = sec(/04[\s\S]*?PERFORMANCE DE CAMPA[ÑN]AS|PERFORMANCE DE CAMPA[ÑN]AS/i, /05|ACCIONES REALIZADAS/i)
  const s05 = sec(/05[\s\S]*?ACCIONES REALIZADAS|ACCIONES REALIZADAS/i, /06|IMPACTO EN EL NEGOCIO/i)
  const s06 = sec(/06[\s\S]*?IMPACTO EN EL NEGOCIO|IMPACTO EN EL NEGOCIO/i, /07|GESTI[OÓ]N COMERCIAL/i)
  const s07 = sec(/07[\s\S]*?GESTI[OÓ]N COMERCIAL EN CRM|GESTI[OÓ]N COMERCIAL EN CRM/i, /08|IMPACTO ECON[OÓ]MICO/i)
  const s08 = sec(/08[\s\S]*?IMPACTO ECON[OÓ]MICO ESTIMADO|IMPACTO ECON[OÓ]MICO ESTIMADO/i, /09|BENCHMARK/i)
  const s09 = sec(/09[\s\S]*?BENCHMARK Y CONTEXTO|BENCHMARK Y CONTEXTO/i, /10|RIESGOS Y ALERTAS/i)
  const s10 = sec(/10[\s\S]*?RIESGOS Y ALERTAS|RIESGOS Y ALERTAS/i, /11|PLAN DE ACCI[OÓ]N/i)
  const s11 = sec(/11[\s\S]*?PLAN DE ACCI[OÓ]N|PLAN DE ACCI[OÓ]N/i, /$/)

  const metaBlock = between(s04, /META ADS/i, [/GOOGLE ADS/i])
  const googleBlock = between(s04, /GOOGLE ADS/i, [/$/])
  const metaTable = extractTableFull(metaBlock)
  const googleTable = extractTableFull(googleBlock)

  const cambiosBlock = between(s05, /CAMBIOS EN CAMPA[ÑN]AS/i, [/OPTIMIZACIONES APLICADAS/i])
  const optimizacionesBlock = between(s05, /OPTIMIZACIONES APLICADAS/i, [/TESTS EJECUTADOS/i])
  const testsBlock = between(s05, /TESTS EJECUTADOS/i, [/$/])

  const funnelRows = extractFunnelTable(s06)

  return {
    clientName, periodo, ejecutivo: ejecutivo || NO_INFO,
    leads: extractBold(s01, 'Leads'),
    cpl: extractBold(s01, 'CPL'),
    ventas: extractBold(s01, 'Ventas'),
    inversion: extractBold(s01, 'Inversi[oó]n'),
    cumplimientoEstado: (s01.match(/(Logrado|Parcial|No logrado)/i) || [])[1] || NO_INFO,
    cumplimientoPct: (s01.match(/(\d{1,3}%)\s*del objetivo/i) || [])[1] || NO_INFO,
    objetivoPeriodo: between(s01, /Objetivo del per[ií]odo:?/i, [/Contexto del mes:?/i]),
    contextoMes: between(s01, /Contexto del mes:?/i, [/Conclusi[oó]n general:?/i]),
    conclusionGeneral: between(s01, /Conclusi[oó]n general:?/i, [/$/]),
    estrategia: between(s02, /🎯?\s*Estrategia/i, [/⚙️?\s*Operaciones/i]),
    operaciones: between(s02, /⚙️?\s*Operaciones/i, [/🧪?\s*Testing/i]),
    testing: between(s02, /🧪?\s*Testing/i, [/📈?\s*Optimizaci[oó]n/i]),
    optimizacion: between(s02, /📈?\s*Optimizaci[oó]n/i, [/$/]),
    analisisCreativo: between(s03, /An[aá]lisis:?/i, [/$/]),
    metaAdsCampanas: metaTable.filter((r) => !/^total$/i.test(r.nombre)),
    metaAdsTotal: metaTable.find((r) => /^total$/i.test(r.nombre)) || { nombre: 'TOTAL', inversion: NO_INFO, leads: NO_INFO, cpl: NO_INFO, cpc: NO_INFO, ctr: NO_INFO },
    googleAdsCampanas: googleTable.filter((r) => !/^total$/i.test(r.nombre)),
    googleAdsTotal: googleTable.find((r) => /^total$/i.test(r.nombre)) || { nombre: 'TOTAL', inversion: NO_INFO, leads: NO_INFO, cpl: NO_INFO, cpc: NO_INFO, ctr: NO_INFO },
    cambiosCampanas: extractBullets(cambiosBlock),
    optimizacionesAplicadas: extractBullets(optimizacionesBlock),
    testsEjecutados: extractBullets(testsBlock),
    funnel: funnelRows,
    cuellosBotella: between(s06, /Cuellos de botella:?/i, [/$/]),
    tiempoRespuesta: between(s07, /Tiempo de respuesta/i, [/Registro y campos/i]),
    registroCampos: between(s07, /Registro y campos/i, [/Tiempo por etapa/i]),
    tiempoPorEtapa: between(s07, /Tiempo por etapa/i, [/Calidad de respuesta/i]),
    calidadRespuesta: between(s07, /Calidad de respuesta/i, [/Recontacto/i]),
    recontacto: between(s07, /Recontacto/i, [/$/]),
    costoPorVenta: extractBold(s08, 'Costo por venta') !== NO_INFO ? extractBold(s08, 'Costo por venta') : (s08.match(/\$[\d.,]+/) || [])[0] || NO_INFO,
    inversionVsFacturacion: (s08.match(/[\d.,]+x/i) || [])[0] || NO_INFO,
    ahorroOptimizacion: (s08.match(/\$[\d.,]+/g) || [])[1] || NO_INFO,
    benchmarkInterno: between(s09, /BENCHMARK INTERNO MDK/i, [/COMPARACI[OÓ]N HIST[OÓ]RICA/i]),
    comparacionHistorica: between(s09, /COMPARACI[OÓ]N HIST[OÓ]RICA/i, [/CONTEXTO COMPETITIVO/i]),
    contextoCompetitivo: between(s09, /CONTEXTO COMPETITIVO/i, [/$/]),
    saturacionAudiencias: between(s10, /SATURACI[OÓ]N DE AUDIENCIAS/i, [/DEPENDENCIA DE CANALES/i]),
    dependenciaCanales: between(s10, /DEPENDENCIA DE CANALES/i, [/RIESGOS OPERATIVOS/i]),
    riesgosOperativos: between(s10, /RIESGOS OPERATIVOS/i, [/ALERTAS TEMPRANAS/i]),
    alertasTempranas: between(s10, /ALERTAS TEMPRANAS/i, [/$/]),
    definicionObjetivos: between(s11, /DEFINICI[OÓ]N DE OBJETIVOS Y PAUTA/i, [/ACCIONES INMEDIATAS/i]),
    accionesInmediatas: between(s11, /ACCIONES INMEDIATAS/i, [/AJUSTES ESTRAT[EÉ]GICOS/i]),
    ajustesEstrategicos: between(s11, /AJUSTES ESTRAT[EÉ]GICOS/i, [/NUEVAS IMPLEMENTACIONES/i]),
    nuevasImplementaciones: between(s11, /NUEVAS IMPLEMENTACIONES/i, [/RECOMENDACIONES AL CLIENTE/i]),
    recomendacionesCliente: between(s11, /RECOMENDACIONES AL CLIENTE/i, [/$/]),
  }
}

// ============================================================
// RENDER — arma el HTML final a partir de la plantilla + los datos
// ============================================================
export function renderEsencialHtml(data: EsencialData): string {
  let html = ESENCIAL_TEMPLATE_HTML

  html = fillTemplate(html, { ...loadAssetTokens() }, ['FONT_MONUMENT_BOLD', 'FONT_MONUMENT_REGULAR', 'FONT_NEUE_REGULAR', 'FONT_NEUE_MEDIUM', 'FONT_NEUE_BOLD', 'LOGO_BASE64'])

  // IMPORTANTE: los bloques REPEAT se resuelven ANTES que el fillTemplate
  // global de abajo. Si se invirtiera el orden, un token de una sola fila
  // (ej. {{leads}} dentro de la tabla de campañas) podría coincidir por
  // nombre con un token de nivel superior (ej. {{leadsGenerados}} no
  // coincide, pero en otras plantillas SÍ puede haber colisiones de nombre
  // corto) y quedaría pisado con el valor global antes de que repeatBlock
  // pueda rellenarlo con el valor real de esa fila.
  html = repeatBlock(html, 'campanas', data.campanas as unknown as TemplateRow[], { nombre: NO_INFO, inversion: NO_INFO, leads: NO_INFO, cpl: NO_INFO, vsAnt: NO_INFO })
  html = repeatBlock(html, 'cambiosCampanas', data.cambiosCampanas.map((item) => ({ item })))
  html = repeatBlock(html, 'optimizacionesAplicadas', data.optimizacionesAplicadas.map((item) => ({ item })))
  html = repeatBlock(html, 'testsEjecutados', data.testsEjecutados.map((item) => ({ item })))
  html = repeatBlock(html, 'funciono', data.funciono.map((item) => ({ item })))
  html = repeatBlock(html, 'noFunciono', data.noFunciono.map((item) => ({ item })))

  html = fillTemplate(html, {
    clientName: data.clientName,
    periodo: data.periodo,
    responsable: data.responsable,
    objetivoPauta: data.objetivoPauta,
    conclusionGeneral: data.conclusionGeneral,
    leadsGenerados: data.leadsGenerados,
    leadsObjetivo: data.leadsObjetivo,
    cplPromedio: data.cplPromedio,
    cplObjetivo: data.cplObjetivo,
    cumplimientoPct: data.cumplimientoPct,
    inversionTotal: data.inversionTotal,
    leadsTotalPeriodo: data.leadsTotalPeriodo,
    cplPromedioCampanas: data.cplPromedioCampanas,
    vsPeriodoAnterior: data.vsPeriodoAnterior,
    totalInversion: data.totalRow.inversion,
    totalLeads: data.totalRow.leads,
    totalCpl: data.totalRow.cpl,
    totalVsAnt: data.totalRow.vsAnt,
    leadsPautaCRM: data.leadsPautaCRM,
    diferenciaPlataforma: data.diferenciaPlataforma,
    cuelloBotella: data.cuelloBotella,
    oportunidades: data.oportunidades,
    ajusteMesSiguiente: data.ajusteMesSiguiente,
    testearMesSiguiente: data.testearMesSiguiente,
    requerimientosCliente: data.requerimientosCliente,
  })

  const unresolved = findUnresolvedTokens(html)
  if (unresolved.length > 0) console.warn('[report-pdf] Tokens sin resolver (Esencial):', unresolved)

  return html
}

export function renderEstrategicoHtml(data: EstrategicoData): string {
  let html = ESTRATEGICO_TEMPLATE_HTML

  html = fillTemplate(html, { ...loadAssetTokens() }, ['FONT_MONUMENT_BOLD', 'FONT_MONUMENT_REGULAR', 'FONT_NEUE_REGULAR', 'FONT_NEUE_MEDIUM', 'FONT_NEUE_BOLD', 'LOGO_BASE64'])

  // IMPORTANTE — orden crítico: los REPEAT van ANTES que el fillTemplate
  // global de más abajo. Los tokens de fila ({{leads}}, {{cpl}}, {{inversion}}
  // dentro de metaAdsCampanas/googleAdsCampanas) tienen el MISMO nombre que
  // los tokens de nivel superior (data.leads, data.cpl, data.inversion del
  // resumen ejecutivo). Si el fillTemplate global corriera primero, pisaría
  // esos tokens de fila con los valores globales de la cuenta ANTES de que
  // repeatBlock pudiera rellenarlos con el valor real de cada campaña —
  // fue exactamente el bug detectado al testear esta plantilla.
  html = repeatBlock(html, 'metaAdsCampanas', data.metaAdsCampanas as unknown as TemplateRow[], { nombre: NO_INFO, inversion: NO_INFO, leads: NO_INFO, cpl: NO_INFO, cpc: NO_INFO, ctr: NO_INFO })
  html = repeatBlock(html, 'googleAdsCampanas', data.googleAdsCampanas as unknown as TemplateRow[], { nombre: NO_INFO, inversion: NO_INFO, leads: NO_INFO, cpl: NO_INFO, cpc: NO_INFO, ctr: NO_INFO })
  html = repeatBlock(html, 'cambiosCampanas', data.cambiosCampanas.map((item) => ({ item })))
  html = repeatBlock(html, 'optimizacionesAplicadas', data.optimizacionesAplicadas.map((item) => ({ item })))
  html = repeatBlock(html, 'testsEjecutados', data.testsEjecutados.map((item) => ({ item })))

  // Funnel: alternamos fondo por fila y resaltamos la última (Venta) en gris "paper".
  const funnelRows = (data.funnel.length > 0 ? data.funnel : [
    { etapa: 'Leads', zona1: NO_INFO, zona1pct: NO_INFO, zona2: NO_INFO, zona2pct: NO_INFO, total: NO_INFO, totalPct: NO_INFO },
  ]).map((row, i, arr) => ({
    ...row,
    rowBg: i === arr.length - 1 ? 'var(--paper)' : i % 2 === 0 ? 'var(--white)' : 'rgba(20,20,20,.02)',
  }))
  html = repeatBlock(html, 'funnel', funnelRows)

  html = fillTemplate(html, {
    clientName: data.clientName,
    periodo: data.periodo,
    ejecutivo: data.ejecutivo,
    leads: data.leads,
    cpl: data.cpl,
    ventas: data.ventas,
    inversion: data.inversion,
    cumplimientoEstado: data.cumplimientoEstado,
    cumplimientoPct: data.cumplimientoPct,
    objetivoPeriodo: data.objetivoPeriodo,
    contextoMes: data.contextoMes,
    conclusionGeneral: data.conclusionGeneral,
    estrategia: data.estrategia,
    operaciones: data.operaciones,
    testing: data.testing,
    optimizacion: data.optimizacion,
    // Los anuncios A/B/C requieren imágenes reales adjuntas por el usuario;
    // por ahora se deja un placeholder visual (ver nota en report-pdf.ts).
    anuncioA_img: '<span style="font-family:var(--neue);font-size:22px;color:#999;">Sin imagen</span>',
    anuncioB_img: '<span style="font-family:var(--neue);font-size:22px;color:#999;">Sin imagen</span>',
    anuncioC_img: '<span style="font-family:var(--neue);font-size:22px;color:#999;">Sin imagen</span>',
    analisisCreativo: data.analisisCreativo,
    metaTotalInversion: data.metaAdsTotal.inversion,
    metaTotalLeads: data.metaAdsTotal.leads,
    metaTotalCpl: data.metaAdsTotal.cpl,
    metaTotalCpc: data.metaAdsTotal.cpc,
    metaTotalCtr: data.metaAdsTotal.ctr,
    googleTotalInversion: data.googleAdsTotal.inversion,
    googleTotalLeads: data.googleAdsTotal.leads,
    googleTotalCpl: data.googleAdsTotal.cpl,
    googleTotalCpc: data.googleAdsTotal.cpc,
    googleTotalCtr: data.googleAdsTotal.ctr,
    cuellosBotella: data.cuellosBotella,
    tiempoRespuesta: data.tiempoRespuesta,
    registroCampos: data.registroCampos,
    tiempoPorEtapa: data.tiempoPorEtapa,
    calidadRespuesta: data.calidadRespuesta,
    recontacto: data.recontacto,
    costoPorVenta: data.costoPorVenta,
    inversionVsFacturacion: data.inversionVsFacturacion,
    ahorroOptimizacion: data.ahorroOptimizacion,
    benchmarkInterno: data.benchmarkInterno,
    comparacionHistorica: data.comparacionHistorica,
    contextoCompetitivo: data.contextoCompetitivo,
    saturacionAudiencias: data.saturacionAudiencias,
    dependenciaCanales: data.dependenciaCanales,
    riesgosOperativos: data.riesgosOperativos,
    alertasTempranas: data.alertasTempranas,
    definicionObjetivos: data.definicionObjetivos,
    accionesInmediatas: data.accionesInmediatas,
    ajustesEstrategicos: data.ajustesEstrategicos,
    nuevasImplementaciones: data.nuevasImplementaciones,
    recomendacionesCliente: data.recomendacionesCliente,
  }, ['anuncioA_img', 'anuncioB_img', 'anuncioC_img'])

  const unresolved = findUnresolvedTokens(html)
  if (unresolved.length > 0) console.warn('[report-pdf] Tokens sin resolver (Estratégico):', unresolved)

  return html
}

// ============================================================
// RENDER A PDF CON PUPPETEER
// ============================================================
async function getBrowser() {
  // En Vercel (o cualquier entorno serverless) usamos puppeteer-core +
  // @sparticuz/chromium, que trae un binario de Chromium liviano compilado
  // para el runtime de AWS Lambda (el mismo que usa Vercel por debajo).
  // En desarrollo local usamos el paquete `puppeteer` normal, que ya trae
  // su propio Chromium de escritorio — así no hace falta instalar nada
  // aparte para probar en la notebook.
  if (process.env.VERCEL) {
    const chromium = (await import('@sparticuz/chromium')).default
    const puppeteer = await import('puppeteer-core')
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1920, height: 1080 },
      executablePath: await chromium.executablePath(),
      headless: true,
    })
  } else {
    const puppeteer = await import('puppeteer')
    return puppeteer.launch({ headless: true, defaultViewport: { width: 1920, height: 1080 } })
  }
}

async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser()
  try {
    const page = await browser.newPage()
    // 'networkidle0' no es necesario porque todo (fuentes, logo) va embebido
    // como data URI — no hay requests de red que esperar.
    await page.setContent(html, { waitUntil: 'load' })
    // Espera a que las fuentes @font-face terminen de cargar antes de
    // imprimir; si no, a veces la primera página sale con fallback system font.
    await page.evaluateHandle('document.fonts.ready')

    const pdfBytes = await page.pdf({
      width: '1920px',
      height: '1080px',
      printBackground: true,
      preferCSSPageSize: true,
    })
    return Buffer.from(pdfBytes)
  } finally {
    await browser.close()
  }
}

// ============================================================
// GENERADOR PRINCIPAL
// ============================================================
export async function generateReportPdf(input: ReportPdfInput): Promise<Buffer> {
  const isEstrategico = (input.plan || '').toLowerCase().includes('estrat')

  if (isEstrategico) {
    const data = parseEstrategicoMarkdown(input.markdown, input.clientName, input.periodLabel, input.responsable || NO_INFO)
    const html = renderEstrategicoHtml(data)
    return htmlToPdf(html)
  }

  const data = parseEsencialMarkdown(input.markdown, input.clientName, input.periodLabel, input.responsable || NO_INFO)
  const html = renderEsencialHtml(data)
  return htmlToPdf(html)
}