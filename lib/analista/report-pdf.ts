import { PDFDocument as PDFLibDocument, StandardFonts, rgb, PDFFont, PDFPage, RGB } from 'pdf-lib'
import fs from 'fs'
import path from 'path'

export interface ReportPdfInput {
  clientName: string
  plan?: string | null
  periodLabel: string
  responsable?: string
  markdown: string
  fileName?: string
}

// ============================================================
// COLORES DE MARCA — PLAN ESENCIAL
// ============================================================
const WHITE = rgb(1, 1, 1)
const CARD_BLACK = rgb(17 / 255, 17 / 255, 17 / 255)
const PORTADA_BG = rgb(10 / 255, 5 / 255, 0 / 255)
const TOTAL_ROW_BG = rgb(255 / 255, 237 / 255, 204 / 255)
const TEXT_DARK = rgb(0.12, 0.12, 0.12)
const ORANGE = rgb(255 / 255, 127 / 255, 0 / 255)
const GREEN = rgb(45 / 255, 155 / 255, 111 / 255)

// ============================================================
// COLORES ADICIONALES — PLAN ESTRATÉGICO
// ============================================================
const DARK_CARD = rgb(34 / 255, 34 / 255, 34 / 255) // #222222
const GREEN_HIGHLIGHT = rgb(209 / 255, 250 / 255, 229 / 255) // #d1fae5
const PORTADA_ESTR_BG_LEFT = rgb(4 / 255, 2 / 255, 0 / 255)
const PORTADA_ESTR_BG_RIGHT = rgb(40 / 255, 38 / 255, 36 / 255)
const WHITE_TEXT = rgb(1, 1, 1)

const NO_INFO = 'Dato no provisto'

// ============================================================
// TIPOS — PLAN ESENCIAL
// ============================================================
interface CampanaRow {
  nombre: string
  inversion: string
  leads: string
  cpl: string
  vsAnt: string
}

interface EsencialData {
  clientName: string
  periodo: string
  responsable: string
  objetivoPauta: string
  conclusionGeneral: string
  leadsGenerados: string
  leadsObjetivo: string
  cplPromedio: string
  cplObjetivo: string
  cumplimientoPct: string
  inversionTotal: string
  leadsTotalPeriodo: string
  cplPromedioCampanas: string
  vsPeriodoAnterior: string
  campanas: CampanaRow[]
  totalRow: CampanaRow
  cambiosCampanas: string[]
  optimizacionesAplicadas: string[]
  testsEjecutados: string[]
  leadsPautaCRM: string
  diferenciaPlataforma: string
  cuelloBotella: string
  oportunidades: string
  funciono: string[]
  noFunciono: string[]
  ajusteMesSiguiente: string
  testearMesSiguiente: string
  requerimientosCliente: string
}

// ============================================================
// TIPOS — PLAN ESTRATÉGICO
// ============================================================
interface CampanaRowFull {
  nombre: string
  inversion: string
  leads: string
  cpl: string
  cpc: string
  ctr: string
}

interface FunnelRow {
  etapa: string
  zona1: string
  zona1pct: string
  zona2: string
  zona2pct: string
  total: string
  totalPct: string
}

interface EstrategicoData {
  clientName: string
  periodo: string
  ejecutivo: string

  leads: string
  cpl: string
  ventas: string
  inversion: string
  cumplimientoEstado: string
  cumplimientoPct: string
  objetivoPeriodo: string
  contextoMes: string
  conclusionGeneral: string

  estrategia: string
  operaciones: string
  testing: string
  optimizacion: string

  analisisCreativo: string

  metaAdsCampanas: CampanaRowFull[]
  metaAdsTotal: CampanaRowFull
  googleAdsCampanas: CampanaRowFull[]
  googleAdsTotal: CampanaRowFull

  cambiosCampanas: string[]
  optimizacionesAplicadas: string[]
  testsEjecutados: string[]

  funnel: FunnelRow[]
  cuellosBotella: string

  tiempoRespuesta: string
  registroCampos: string
  tiempoPorEtapa: string
  calidadRespuesta: string
  recontacto: string

  costoPorVenta: string
  inversionVsFacturacion: string
  ahorroOptimizacion: string

  benchmarkInterno: string
  comparacionHistorica: string
  contextoCompetitivo: string

  saturacionAudiencias: string
  dependenciaCanales: string
  riesgosOperativos: string
  alertasTempranas: string

  definicionObjetivos: string
  accionesInmediatas: string
  ajustesEstrategicos: string
  nuevasImplementaciones: string
  recomendacionesCliente: string
}

// ============================================================
// PARSER HELPERS (compartidos por Esencial y Estratégico)
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
  return m ? m[1].trim() : NO_INFO
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

function extractMarkdownTable(block: string): CampanaRow[] {
  const lines = block.split('\n').filter((l) => l.trim().startsWith('|'))
  const rows: CampanaRow[] = []
  for (const line of lines) {
    const cells = line
      .split('|')
      .map((c) => c.trim())
      .filter((c) => c.length > 0)
    if (cells.length < 4) continue
    if (/^-+$/.test(cells[0].replace(/\s/g, ''))) continue
    if (/campa[ñn]a/i.test(cells[0])) continue
    rows.push({
      nombre: cells[0] || NO_INFO,
      inversion: cells[1] || NO_INFO,
      leads: cells[2] || NO_INFO,
      cpl: cells[3] || NO_INFO,
      vsAnt: cells[4] || NO_INFO,
    })
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
    if (/campa[ñn]a/i.test(cells[0])) continue
    rows.push({
      nombre: cells[0] || NO_INFO,
      inversion: cells[1] || NO_INFO,
      leads: cells[2] || NO_INFO,
      cpl: cells[3] || NO_INFO,
      cpc: cells[4] || NO_INFO,
      ctr: cells[5] || NO_INFO,
    })
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
    rows.push({
      etapa: cells[0] || NO_INFO,
      zona1: cells[1] || NO_INFO,
      zona1pct: cells[2] || NO_INFO,
      zona2: cells[3] || NO_INFO,
      zona2pct: cells[4] || NO_INFO,
      total: cells[5] || NO_INFO,
      totalPct: cells[6] || NO_INFO,
    })
  }
  return rows
}

// ============================================================
// PARSER — PLAN ESENCIAL
// ============================================================
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
    clientName,
    periodo,
    responsable: responsable || NO_INFO,

    objetivoPauta: between(seccion01, /OBJETIVO DE LA PAUTA/i, [/CONCLUSI[OÓ]N GENERAL/i]),
    conclusionGeneral: between(seccion01, /CONCLUSI[OÓ]N GENERAL/i, [/CUMPLIMIENTO DE OBJETIVO/i]),
    leadsGenerados: extractBold(seccion01, 'Leads'),
    leadsObjetivo: (seccion01.match(/objetivo:\s*(\d+)/i) || [])[1] || NO_INFO,
    cplPromedio: extractBold(seccion01, 'CPL'),
    cplObjetivo: (seccion01.match(/objetivo:\s*\$?([\d.,]+)/i) || [])[1] || NO_INFO,
    cumplimientoPct: (seccion01.match(/(\d{1,3}%)\s*(del objetivo|cumplimiento)/i) || [])[1] || NO_INFO,

    inversionTotal: extractBold(seccion02, 'Inversi[oó]n( total)?'),
    leadsTotalPeriodo: extractBold(seccion02, 'Leads( generados)?'),
    cplPromedioCampanas: extractBold(seccion02, 'CPL( promedio)?'),
    vsPeriodoAnterior: extractBold(seccion02, 'Variaci[oó]n'),
    campanas: extractMarkdownTable(seccion02).filter((r) => !/^total$/i.test(r.nombre)),
    totalRow: extractMarkdownTable(seccion02).find((r) => /^total$/i.test(r.nombre)) || {
      nombre: 'TOTAL', inversion: NO_INFO, leads: NO_INFO, cpl: NO_INFO, vsAnt: NO_INFO,
    },

    cambiosCampanas: extractBullets(cambiosBlock),
    optimizacionesAplicadas: extractBullets(optimizacionesBlock),
    testsEjecutados: extractBullets(testsBlock),

    leadsPautaCRM: extractBold(seccion04, 'Leads por pauta( en CRM)?'),
    diferenciaPlataforma: extractBold(seccion04, 'Diferencia( vs plataforma)?'),
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
    clientName,
    periodo,
    ejecutivo: ejecutivo || NO_INFO,

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
// HELPER DE DIBUJO (compartido)
// ============================================================
function coverAndDraw(
  page: PDFPage,
  pageHeight: number,
  opts: {
    x: number; top: number; bottom: number; width: number
    text: string; font: PDFFont; size: number; color: RGB
    coverColor: RGB; align?: 'left' | 'center'
    maxWidth?: number; lineHeight?: number
  }
) {
  const { x, top, bottom, width, text, font, size, color, coverColor, align = 'left', maxWidth, lineHeight } = opts
  const padY = 3
  const rectY = pageHeight - bottom - padY
  const rectHeight = (bottom - top) + padY * 2

  page.drawRectangle({ x: x - 2, y: rectY, width: width + 4, height: rectHeight, color: coverColor })

  const wrapWidth = maxWidth ?? width
  const words = text.split(/\s+/)
  const lines: string[] = []
  let currentLine = ''
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word
    if (font.widthOfTextAtSize(testLine, size) > wrapWidth && currentLine) {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = testLine
    }
  }
  if (currentLine) lines.push(currentLine)

  const lh = lineHeight ?? size * 1.3
  let yPos = pageHeight - top - size
  for (const line of lines) {
    const lineWidth = font.widthOfTextAtSize(line, size)
    const drawX = align === 'center' ? x + (width - lineWidth) / 2 : x
    page.drawText(line, { x: drawX, y: yPos, size, font, color })
    yPos -= lh
  }
}

// ============================================================
// GENERADOR — PLAN ESENCIAL
// ============================================================
async function fillEsencialTemplate(input: ReportPdfInput): Promise<Buffer> {
  const templatePath = path.join(process.cwd(), 'public', 'Informe_Esencial_MDK.pdf')
  const templateBytes = fs.readFileSync(templatePath)
  const pdfDoc = await PDFLibDocument.load(templateBytes)

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const data = parseEsencialMarkdown(input.markdown, input.clientName, input.periodLabel, input.responsable || NO_INFO)
  const pages = pdfDoc.getPages()
  const H = pages[0].getHeight() // 405

  // ---------- PÁGINA 1: PORTADA ----------
  {
    const p = pages[0]
    coverAndDraw(p, H, { x: 66.5, top: 385.2, bottom: 396.3, width: 93.6, text: data.clientName, font, size: 10, color: WHITE, coverColor: PORTADA_BG })
    coverAndDraw(p, H, { x: 213.6, top: 385.2, bottom: 396.3, width: 53.1, text: data.periodo, font, size: 10, color: WHITE, coverColor: PORTADA_BG })
    coverAndDraw(p, H, { x: 342.2, top: 385.2, bottom: 396.3, width: 43.7, text: data.responsable, font, size: 10, color: WHITE, coverColor: PORTADA_BG })
  }

  // ---------- PÁGINA 2: RESUMEN DEL PERÍODO ----------
  {
    const p = pages[1]
    coverAndDraw(p, H, { x: 36, top: 102.1, bottom: 126.4, width: 305, maxWidth: 300, text: data.objetivoPauta, font, size: 9, color: TEXT_DARK, coverColor: WHITE })
    coverAndDraw(p, H, { x: 388.9, top: 102.1, bottom: 113.2, width: 243.3, maxWidth: 240, text: data.conclusionGeneral, font, size: 9, color: TEXT_DARK, coverColor: WHITE })
    coverAndDraw(p, H, { x: 95, top: 256.1, bottom: 290.1, width: 100, text: data.leadsGenerados, font: fontBold, size: 30, color: ORANGE, coverColor: WHITE, align: 'center' })
    coverAndDraw(p, H, { x: 300, top: 256.1, bottom: 290.1, width: 130, text: `$${data.cplPromedio}`, font: fontBold, size: 26, color: ORANGE, coverColor: WHITE, align: 'center' })
    coverAndDraw(p, H, { x: 520, top: 256.1, bottom: 290.1, width: 130, text: `${data.cumplimientoPct}`, font: fontBold, size: 30, color: GREEN, coverColor: WHITE, align: 'center' })
  }

  // ---------- PÁGINA 3: RESULTADOS DE CAMPAÑAS ----------
  {
    const p = pages[2]
    coverAndDraw(p, H, { x: 55, top: 80.6, bottom: 104.6, width: 90, text: `$${data.inversionTotal}`, font: fontBold, size: 20, color: WHITE, coverColor: CARD_BLACK, align: 'center' })
    coverAndDraw(p, H, { x: 230, top: 80.6, bottom: 104.6, width: 80, text: data.leadsTotalPeriodo, font: fontBold, size: 20, color: WHITE, coverColor: CARD_BLACK, align: 'center' })
    coverAndDraw(p, H, { x: 400, top: 80.6, bottom: 104.6, width: 80, text: `$${data.cplPromedioCampanas}`, font: fontBold, size: 20, color: WHITE, coverColor: CARD_BLACK, align: 'center' })
    coverAndDraw(p, H, { x: 555, top: 80.6, bottom: 104.6, width: 115, text: data.vsPeriodoAnterior, font: fontBold, size: 20, color: WHITE, coverColor: CARD_BLACK, align: 'center' })

    const rowTops = [207.2, 238.9, 270.6]
    data.campanas.slice(0, 3).forEach((c, i) => {
      const top = rowTops[i]
      const bottom = top + 11
      coverAndDraw(p, H, { x: 97.6, top, bottom, width: 130, text: c.nombre, font, size: 10, color: TEXT_DARK, coverColor: rgb(240 / 255, 240 / 255, 240 / 255) })
      coverAndDraw(p, H, { x: 280, top, bottom, width: 90, text: `$${c.inversion}`, font, size: 10, color: TEXT_DARK, coverColor: rgb(240 / 255, 240 / 255, 240 / 255), align: 'center' })
      coverAndDraw(p, H, { x: 405, top, bottom, width: 60, text: c.leads, font, size: 10, color: TEXT_DARK, coverColor: rgb(240 / 255, 240 / 255, 240 / 255), align: 'center' })
      coverAndDraw(p, H, { x: 520, top, bottom, width: 80, text: `$${c.cpl}`, font, size: 10, color: TEXT_DARK, coverColor: rgb(240 / 255, 240 / 255, 240 / 255), align: 'center' })
      coverAndDraw(p, H, { x: 625, top, bottom, width: 50, text: c.vsAnt, font, size: 10, color: TEXT_DARK, coverColor: rgb(240 / 255, 240 / 255, 240 / 255), align: 'center' })
    })

    const t = data.totalRow
    coverAndDraw(p, H, { x: 97.6, top: 302.3, bottom: 313.3, width: 130, text: 'TOTAL', font: fontBold, size: 10, color: TEXT_DARK, coverColor: TOTAL_ROW_BG })
    coverAndDraw(p, H, { x: 280, top: 302.3, bottom: 313.3, width: 90, text: `$${t.inversion}`, font: fontBold, size: 10, color: TEXT_DARK, coverColor: TOTAL_ROW_BG, align: 'center' })
    coverAndDraw(p, H, { x: 405, top: 302.3, bottom: 313.3, width: 60, text: t.leads, font: fontBold, size: 10, color: TEXT_DARK, coverColor: TOTAL_ROW_BG, align: 'center' })
    coverAndDraw(p, H, { x: 520, top: 302.3, bottom: 313.3, width: 80, text: `$${t.cpl}`, font: fontBold, size: 10, color: TEXT_DARK, coverColor: TOTAL_ROW_BG, align: 'center' })
    coverAndDraw(p, H, { x: 625, top: 302.3, bottom: 313.3, width: 50, text: t.vsAnt, font: fontBold, size: 10, color: TEXT_DARK, coverColor: TOTAL_ROW_BG, align: 'center' })
  }

  // ---------- PÁGINA 4: ACCIONES REALIZADAS ----------
  {
    const p = pages[3]
    const cols: { x: number; width: number; items: string[] }[] = [
      { x: 36, width: 230, items: data.cambiosCampanas },
      { x: 268, width: 230, items: data.optimizacionesAplicadas },
      { x: 512, width: 165, items: data.testsEjecutados },
    ]
    for (const col of cols) {
      const text = col.items.map((i) => `• ${i}`).join('   ')
      coverAndDraw(p, H, { x: col.x, top: 100, bottom: 185, width: col.width, maxWidth: col.width - 5, text, font, size: 9, color: TEXT_DARK, coverColor: WHITE, lineHeight: 13 })
    }
  }

  // ---------- PÁGINA 5: ANÁLISIS DEL FUNNEL ----------
  {
    const p = pages[4]
    coverAndDraw(p, H, { x: 25, top: 119.9, bottom: 147.8, width: 100, text: data.leadsPautaCRM, font: fontBold, size: 24, color: ORANGE, coverColor: CARD_BLACK, align: 'center' })
    coverAndDraw(p, H, { x: 380, top: 119.9, bottom: 147.8, width: 150, text: data.diferenciaPlataforma, font: fontBold, size: 24, color: ORANGE, coverColor: CARD_BLACK, align: 'center' })
    coverAndDraw(p, H, { x: 36, top: 217.4, bottom: 228.4, width: 630, maxWidth: 625, text: data.cuelloBotella, font, size: 9, color: TEXT_DARK, coverColor: WHITE })
    coverAndDraw(p, H, { x: 36, top: 307.4, bottom: 318.5, width: 630, maxWidth: 625, text: data.oportunidades, font, size: 9, color: TEXT_DARK, coverColor: WHITE })
  }

  // ---------- PÁGINA 6: QUÉ FUNCIONÓ / QUÉ NO ----------
  {
    const p = pages[5]
    const funcionoText = data.funciono.map((i) => `• ${i}`).join('   ')
    const noFuncionoText = data.noFunciono.map((i) => `• ${i}`).join('   ')
    coverAndDraw(p, H, { x: 36, top: 105, bottom: 197, width: 340, maxWidth: 335, text: funcionoText, font, size: 9, color: TEXT_DARK, coverColor: WHITE, lineHeight: 13 })
    coverAndDraw(p, H, { x: 388, top: 105, bottom: 197, width: 290, maxWidth: 285, text: noFuncionoText, font, size: 9, color: TEXT_DARK, coverColor: WHITE, lineHeight: 13 })
  }

  // ---------- PÁGINA 7: PLAN DEL MES SIGUIENTE ----------
  {
    const p = pages[6]
    coverAndDraw(p, H, { x: 90, top: 102, bottom: 140, width: 435, maxWidth: 430, text: data.ajusteMesSiguiente, font, size: 9, color: TEXT_DARK, coverColor: WHITE, lineHeight: 13 })
    coverAndDraw(p, H, { x: 90, top: 206.6, bottom: 245, width: 435, maxWidth: 430, text: data.testearMesSiguiente, font, size: 9, color: TEXT_DARK, coverColor: WHITE, lineHeight: 13 })
    coverAndDraw(p, H, { x: 90, top: 311, bottom: 349, width: 435, maxWidth: 430, text: data.requerimientosCliente, font, size: 9, color: TEXT_DARK, coverColor: WHITE, lineHeight: 13 })
  }

  const pdfBytes = await pdfDoc.save()
  return Buffer.from(pdfBytes)
}

// ============================================================
// GENERADOR — PLAN ESTRATÉGICO
// ============================================================
async function fillEstrategicoTemplate(input: ReportPdfInput): Promise<Buffer> {
  const templatePath = path.join(process.cwd(), 'public', 'Informe_Estrategico_MDK.pdf')
  const templateBytes = fs.readFileSync(templatePath)
  const pdfDoc = await PDFLibDocument.load(templateBytes)

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const data = parseEstrategicoMarkdown(input.markdown, input.clientName, input.periodLabel, input.responsable || NO_INFO)
  const pages = pdfDoc.getPages()
  const H = pages[0].getHeight()

  // ---------- PÁGINA 1: PORTADA ----------
  {
    const p = pages[0]
    coverAndDraw(p, H, { x: 66.5, top: 385.2, bottom: 396.3, width: 43.7, text: data.clientName, font, size: 10, color: WHITE_TEXT, coverColor: PORTADA_ESTR_BG_LEFT })
    coverAndDraw(p, H, { x: 163.6, top: 385.2, bottom: 396.3, width: 53.1, text: data.periodo, font, size: 10, color: WHITE_TEXT, coverColor: PORTADA_ESTR_BG_LEFT })
    coverAndDraw(p, H, { x: 276.5, top: 385.2, bottom: 396.3, width: 43.7, text: data.ejecutivo, font, size: 10, color: WHITE_TEXT, coverColor: PORTADA_ESTR_BG_RIGHT })
  }

  // ---------- PÁGINA 2: RESUMEN EJECUTIVO ----------
  {
    const p = pages[1]
    coverAndDraw(p, H, { x: 30, top: 74.1, bottom: 98.1, width: 130, text: data.leads, font: fontBold, size: 24, color: WHITE_TEXT, coverColor: CARD_BLACK, align: 'center' })
    coverAndDraw(p, H, { x: 195, top: 74.1, bottom: 98.1, width: 140, text: `$${data.cpl}`, font: fontBold, size: 24, color: WHITE_TEXT, coverColor: CARD_BLACK, align: 'center' })
    coverAndDraw(p, H, { x: 365, top: 74.1, bottom: 98.1, width: 135, text: data.ventas, font: fontBold, size: 24, color: WHITE_TEXT, coverColor: CARD_BLACK, align: 'center' })
    coverAndDraw(p, H, { x: 540, top: 74.1, bottom: 98.1, width: 140, text: `$${data.inversion}`, font: fontBold, size: 24, color: WHITE_TEXT, coverColor: CARD_BLACK, align: 'center' })
    coverAndDraw(p, H, { x: 125, top: 149.9, bottom: 161.0, width: 260, text: `${data.cumplimientoEstado} — ${data.cumplimientoPct} del objetivo alcanzado`, font: fontBold, size: 10, color: TEXT_DARK, coverColor: ORANGE, maxWidth: 480 })
    coverAndDraw(p, H, { x: 37.4, top: 223.0, bottom: 234.1, width: 630, maxWidth: 625, text: data.objetivoPeriodo, font, size: 9, color: TEXT_DARK, coverColor: WHITE })
    coverAndDraw(p, H, { x: 37.4, top: 279.2, bottom: 290.2, width: 630, maxWidth: 625, text: data.contextoMes, font, size: 9, color: TEXT_DARK, coverColor: WHITE })
    coverAndDraw(p, H, { x: 37.4, top: 335.4, bottom: 346.4, width: 630, maxWidth: 625, text: data.conclusionGeneral, font, size: 9, color: TEXT_DARK, coverColor: WHITE })
  }

  // ---------- PÁGINA 3: ¿EN QUÉ ESTUVIMOS TRABAJANDO? ----------
  {
    const p = pages[2]
    const cols = [
      { x: 34, text: data.estrategia },
      { x: 210, text: data.operaciones },
      { x: 385, text: data.testing },
      { x: 560, text: data.optimizacion },
    ]
    for (const col of cols) {
      coverAndDraw(p, H, { x: col.x, top: 160, bottom: 211, width: 160, maxWidth: 155, text: col.text, font, size: 9, color: WHITE_TEXT, coverColor: DARK_CARD, lineHeight: 13 })
    }
  }

  // ---------- PÁGINA 4: TESTING Y OPTIMIZACIÓN CREATIVA ----------
  // Nota: los recuadros "[Insertar imagen del anuncio]" quedan sin tocar —
  // requerirían insertar imágenes reales (con pdfDoc.embedJpg/embedPng), no texto.
  {
    const p = pages[3]
    coverAndDraw(p, H, { x: 39.6, top: 341.1, bottom: 352.2, width: 630, maxWidth: 625, text: data.analisisCreativo, font, size: 9, color: TEXT_DARK, coverColor: WHITE })
  }

  // ---------- PÁGINA 5: PERFORMANCE DE CAMPAÑAS ----------
  {
    const p = pages[4]
    const colX = { nombre: 83.2, inversion: 250.2, leads: 356.7, cpl: 455.4, cpc: 556.2, ctr: 648.6 }
    const colW = { nombre: 130, inversion: 90, leads: 60, cpl: 80, cpc: 80, ctr: 60 }

    const drawRow = (row: CampanaRowFull, top: number, bottom: number, bg: RGB, bold = false) => {
      const f = bold ? fontBold : font
      coverAndDraw(p, H, { x: colX.nombre, top, bottom, width: colW.nombre, text: row.nombre, font: f, size: 9, color: TEXT_DARK, coverColor: bg })
      coverAndDraw(p, H, { x: colX.inversion, top, bottom, width: colW.inversion, text: `$${row.inversion}`, font: f, size: 9, color: TEXT_DARK, coverColor: bg, align: 'center' })
      coverAndDraw(p, H, { x: colX.leads, top, bottom, width: colW.leads, text: row.leads, font: f, size: 9, color: TEXT_DARK, coverColor: bg, align: 'center' })
      coverAndDraw(p, H, { x: colX.cpl, top, bottom, width: colW.cpl, text: `$${row.cpl}`, font: f, size: 9, color: TEXT_DARK, coverColor: bg, align: 'center' })
      coverAndDraw(p, H, { x: colX.cpc, top, bottom, width: colW.cpc, text: `$${row.cpc}`, font: f, size: 9, color: TEXT_DARK, coverColor: bg, align: 'center' })
      coverAndDraw(p, H, { x: colX.ctr, top, bottom, width: colW.ctr, text: row.ctr, font: f, size: 9, color: TEXT_DARK, coverColor: bg, align: 'center' })
    }

    const metaRowTops = [116.0, 142.7, 169.4]
    data.metaAdsCampanas.slice(0, 3).forEach((row, i) => drawRow(row, metaRowTops[i], metaRowTops[i] + 11, rgb(240 / 255, 240 / 255, 240 / 255)))
    drawRow(data.metaAdsTotal, 196.0, 207.1, TOTAL_ROW_BG, true)

    const googleRowTops = [287.1, 317.4]
    data.googleAdsCampanas.slice(0, 2).forEach((row, i) => drawRow(row, googleRowTops[i], googleRowTops[i] + 11, rgb(240 / 255, 240 / 255, 240 / 255)))
    drawRow(data.googleAdsTotal, 347.6, 358.7, TOTAL_ROW_BG, true)
  }

  // ---------- PÁGINA 6: ACCIONES REALIZADAS ----------
  {
    const p = pages[5]
    const cols: { x: number; width: number; items: string[] }[] = [
      { x: 36, width: 230, items: data.cambiosCampanas },
      { x: 268, width: 230, items: data.optimizacionesAplicadas },
      { x: 512, width: 165, items: data.testsEjecutados },
    ]
    for (const col of cols) {
      const text = col.items.map((i) => `• ${i}`).join('   ')
      coverAndDraw(p, H, { x: col.x, top: 100, bottom: 172, width: col.width, maxWidth: col.width - 5, text, font, size: 9, color: TEXT_DARK, coverColor: WHITE, lineHeight: 13 })
    }
  }

  // ---------- PÁGINA 7: FUNNEL COMERCIAL ----------
  {
    const p = pages[6]
    const colX = { etapa: 62, zona1: 183.9, zona1pct: 254.5, zona2: 331.6, zona2pct: 402.1, total: 490.0, totalPct: 591.1 }
    const rowTops = [107.8, 140.9, 174.1, 207.2, 240.3, 273.4]
    const etapaLabels = ['Leads', 'MQL', 'Contacto', 'SQL', 'Presupuesto', 'Venta']

    data.funnel.slice(0, 6).forEach((row, i) => {
      const top = rowTops[i]
      const bottom = top + 11
      const isVenta = i === 5
      const rowBg = rgb(240 / 255, 240 / 255, 240 / 255)
      const highlightBg = GREEN_HIGHLIGHT
      const font_ = isVenta ? fontBold : font

      coverAndDraw(p, H, { x: colX.etapa, top, bottom, width: 100, text: row.etapa || etapaLabels[i], font: font_, size: 9, color: TEXT_DARK, coverColor: rowBg })
      coverAndDraw(p, H, { x: colX.zona1, top, bottom, width: 60, text: row.zona1, font: font_, size: 9, color: TEXT_DARK, coverColor: rowBg, align: 'center' })
      coverAndDraw(p, H, { x: colX.zona1pct, top, bottom, width: 55, text: row.zona1pct, font: font_, size: 9, color: TEXT_DARK, coverColor: rowBg, align: 'center' })
      coverAndDraw(p, H, { x: colX.zona2, top, bottom, width: 60, text: row.zona2, font: font_, size: 9, color: TEXT_DARK, coverColor: rowBg, align: 'center' })
      coverAndDraw(p, H, { x: colX.zona2pct, top, bottom, width: 55, text: row.zona2pct, font: font_, size: 9, color: TEXT_DARK, coverColor: rowBg, align: 'center' })
      coverAndDraw(p, H, { x: colX.total, top, bottom, width: 60, text: row.total, font: font_, size: 9, color: TEXT_DARK, coverColor: isVenta ? highlightBg : rowBg, align: 'center' })
      coverAndDraw(p, H, { x: colX.totalPct, top, bottom, width: 60, text: row.totalPct, font: font_, size: 9, color: TEXT_DARK, coverColor: isVenta ? highlightBg : rowBg, align: 'center' })
    })

    coverAndDraw(p, H, { x: 39.6, top: 336.8, bottom: 347.9, width: 630, maxWidth: 625, text: data.cuellosBotella, font, size: 9, color: TEXT_DARK, coverColor: WHITE })
  }

  // ---------- PÁGINA 8: GESTIÓN COMERCIAL EN CRM ----------
  {
    const p = pages[7]
    coverAndDraw(p, H, { x: 34, top: 100.7, bottom: 138.2, width: 230, maxWidth: 225, text: data.tiempoRespuesta, font, size: 9, color: TEXT_DARK, coverColor: WHITE, lineHeight: 13 })
    coverAndDraw(p, H, { x: 270, top: 100.7, bottom: 138.2, width: 230, maxWidth: 225, text: data.registroCampos, font, size: 9, color: TEXT_DARK, coverColor: WHITE, lineHeight: 13 })
    coverAndDraw(p, H, { x: 505, top: 100.7, bottom: 138.2, width: 175, maxWidth: 170, text: data.tiempoPorEtapa, font, size: 9, color: TEXT_DARK, coverColor: WHITE, lineHeight: 13 })
    coverAndDraw(p, H, { x: 34, top: 260.6, bottom: 285, width: 335, maxWidth: 330, text: data.calidadRespuesta, font, size: 9, color: TEXT_DARK, coverColor: WHITE, lineHeight: 13 })
    coverAndDraw(p, H, { x: 400, top: 260.6, bottom: 285, width: 280, maxWidth: 275, text: data.recontacto, font, size: 9, color: TEXT_DARK, coverColor: WHITE, lineHeight: 13 })
  }

  // ---------- PÁGINA 9: IMPACTO ECONÓMICO ESTIMADO ----------
  {
    const p = pages[8]
    coverAndDraw(p, H, { x: 40, top: 100.1, bottom: 140.0, width: 180, text: `$${data.costoPorVenta}`, font: fontBold, size: 26, color: ORANGE, coverColor: DARK_CARD, align: 'center' })
    coverAndDraw(p, H, { x: 270, top: 100.1, bottom: 140.0, width: 190, text: `${data.inversionVsFacturacion}x`, font: fontBold, size: 26, color: ORANGE, coverColor: DARK_CARD, align: 'center' })
    coverAndDraw(p, H, { x: 505, top: 100.1, bottom: 140.0, width: 180, text: `$${data.ahorroOptimizacion}`, font: fontBold, size: 26, color: ORANGE, coverColor: DARK_CARD, align: 'center' })
  }

  // ---------- PÁGINA 10: BENCHMARK Y CONTEXTO COMPETITIVO ----------
  {
    const p = pages[9]
    coverAndDraw(p, H, { x: 34, top: 102.1, bottom: 139.6, width: 415, maxWidth: 410, text: data.benchmarkInterno, font, size: 9, color: TEXT_DARK, coverColor: WHITE, lineHeight: 13 })
    coverAndDraw(p, H, { x: 505, top: 102.1, bottom: 139.6, width: 175, maxWidth: 170, text: data.comparacionHistorica, font, size: 9, color: TEXT_DARK, coverColor: WHITE, lineHeight: 13 })
    // Nota: verificar visualmente contra la plantilla real — la 3ra columna
    // (Contexto Competitivo) podría necesitar ajuste de x/width.
    coverAndDraw(p, H, { x: 745, top: 102.1, bottom: 139.6, width: 175, maxWidth: 170, text: data.contextoCompetitivo, font, size: 9, color: TEXT_DARK, coverColor: WHITE, lineHeight: 13 })
  }

  // ---------- PÁGINA 11: RIESGOS Y ALERTAS ----------
  {
    const p = pages[10]
    coverAndDraw(p, H, { x: 36, top: 100.7, bottom: 125, width: 500, maxWidth: 495, text: data.saturacionAudiencias, font, size: 9, color: WHITE_TEXT, coverColor: DARK_CARD, lineHeight: 13 })
    coverAndDraw(p, H, { x: 570, top: 100.7, bottom: 125, width: 100, maxWidth: 95, text: data.dependenciaCanales, font, size: 9, color: WHITE_TEXT, coverColor: DARK_CARD, lineHeight: 13 })
    coverAndDraw(p, H, { x: 36, top: 264.2, bottom: 289, width: 500, maxWidth: 495, text: data.riesgosOperativos, font, size: 9, color: WHITE_TEXT, coverColor: DARK_CARD, lineHeight: 13 })
    coverAndDraw(p, H, { x: 570, top: 264.2, bottom: 289, width: 100, maxWidth: 95, text: data.alertasTempranas, font, size: 9, color: WHITE_TEXT, coverColor: DARK_CARD, lineHeight: 13 })
  }

  // ---------- PÁGINA 12: PLAN DE ACCIÓN ----------
  {
    const p = pages[11]
    coverAndDraw(p, H, { x: 77, top: 100.7, bottom: 151.4, width: 220, maxWidth: 215, text: data.definicionObjetivos, font, size: 9, color: TEXT_DARK, coverColor: WHITE, lineHeight: 13 })
    coverAndDraw(p, H, { x: 308.9, top: 100.7, bottom: 151.4, width: 335, maxWidth: 330, text: data.accionesInmediatas, font, size: 9, color: TEXT_DARK, coverColor: WHITE, lineHeight: 13 })
    coverAndDraw(p, H, { x: 655.6, top: 100.7, bottom: 151.4, width: 40, maxWidth: 35, text: data.ajustesEstrategicos, font, size: 9, color: TEXT_DARK, coverColor: WHITE, lineHeight: 13 })
    coverAndDraw(p, H, { x: 77, top: 260.6, bottom: 285, width: 460, maxWidth: 455, text: data.nuevasImplementaciones, font, size: 9, color: TEXT_DARK, coverColor: WHITE, lineHeight: 13 })
    coverAndDraw(p, H, { x: 587.6, top: 260.6, bottom: 285, width: 90, maxWidth: 85, text: data.recomendacionesCliente, font, size: 9, color: TEXT_DARK, coverColor: WHITE, lineHeight: 13 })
  }

  const pdfBytes = await pdfDoc.save()
  return Buffer.from(pdfBytes)
}

// ============================================================
// GENERADOR PRINCIPAL
// ============================================================
export async function generateReportPdf(input: ReportPdfInput): Promise<Buffer> {
  const isEstrategico = (input.plan || '').toLowerCase().includes('estrat')

  if (isEstrategico) {
    return fillEstrategicoTemplate(input)
  }

  return fillEsencialTemplate(input)
}