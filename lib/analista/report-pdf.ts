// Generador de PDF con la plantilla real de marca MDK para los informes del
// Analista (Esencial / Estratégico). Replica la estructura visual de las
// plantillas .pptx oficiales: portada con índice embebido, header negro con
// franja naranja + badge numerado por slide, tarjetas con encabezado negro y
// cuerpo blanco, filas de KPI grandes, tablas con fila total resaltada, y la
// sección "Riesgos y Alertas" en tema oscuro.

type RGB = [number, number, number]

const ORANGE: RGB = [255, 122, 0]
const NEAR_BLACK: RGB = [20, 16, 12]
const CARD_HEADER: RGB = [17, 17, 17]
const BODY_BG: RGB = [242, 241, 239]
const WHITE: RGB = [255, 255, 255]
const DARK_TEXT: RGB = [30, 30, 30]
const GRAY: RGB = [120, 120, 120]
const TOTAL_ROW: RGB = [255, 230, 205]
const GREEN_ROW: RGB = [214, 245, 226]
const GREEN_TEXT: RGB = [30, 140, 80]
const DARK_CARD: RGB = [30, 26, 22]
const DARK_CARD_BORDER: RGB = [55, 50, 45]
const RISK_EMOJI_COLORS: Record<string, RGB> = {
  '🔴': [220, 60, 50],
  '🟠': [255, 150, 40],
  '🟡': [240, 200, 40],
  '⚡': [255, 150, 40],
}

export interface ReportPdfInput {
  clientName: string
  plan?: string | null
  periodLabel: string
  responsable?: string
  /** Contenido markdown del informe (mensaje del Analista) */
  markdown: string
  fileName?: string
}

const ESENCIAL_INDEX = [
  'Resumen del Período',
  'Resultados de Campañas',
  'Acciones Realizadas',
  'Análisis del Funnel (síntesis)',
  'Qué Funcionó / Qué No',
  'Plan del Mes Siguiente',
]

const ESTRATEGICO_INDEX = [
  'Resumen Ejecutivo',
  '¿En qué estuvimos trabajando este mes?',
  'Testing y Optimización Creativa',
  'Performance de Campañas',
  'Acciones Realizadas',
  'Impacto en el Negocio (Funnel)',
  'Gestión Comercial en CRM',
  'Impacto Económico Estimado',
  'Benchmark y Contexto Competitivo',
  'Riesgos y Alertas',
  'Plan de Acción',
]

// Secciones que usan el tema oscuro de tarjetas (como "Riesgos y Alertas")
const DARK_SECTION_MATCH = /riesgo/i

function stripEmoji(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function cleanInline(text: string): string {
  return stripEmoji(
    text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`(.*?)`/g, '$1')
  ).trim()
}

// ---------------------------------------------------------------------------
// Modelo de bloques
// ---------------------------------------------------------------------------

type Item =
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'stat'; label: string; value: string }
  | { kind: 'table'; headers: string[]; rows: string[][] }
  | { kind: 'chart'; title: string; headers: string[]; rows: string[][] }

interface Card {
  icon: string
  title: string
  items: Item[]
}

interface Section {
  title: string
  intro: Item[] // contenido suelto antes de cualquier tarjeta (ej. conclusión general)
  statRow: { label: string; value: string }[] // fila de KPIs grandes si se detecta
  cards: Card[]
}

const EMOJI_RE = /^(\p{Emoji_Presentation}|\p{Extended_Pictographic}|[⚠️✅❌])\s*/u

function splitIconTitle(text: string): { icon: string; title: string } {
  const m = text.match(EMOJI_RE)
  if (m) return { icon: m[1], title: text.slice(m[0].length).trim() }
  return { icon: '', title: text }
}

function parseTableLines(lines: string[], start: number): { headers: string[]; rows: string[][]; next: number } | null {
  const headerLine = lines[start]
  const sepLine = lines[start + 1]
  if (!headerLine?.includes('|') || !sepLine || !/^\s*\|?[\s:|-]+\|?\s*$/.test(sepLine)) return null

  const splitRow = (line: string) =>
    line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => cleanInline(c.trim()))

  const headers = splitRow(headerLine)
  const rows: string[][] = []
  let i = start + 2
  while (i < lines.length && lines[i].includes('|')) {
    const cells = splitRow(lines[i])
    if (cells.some((c) => c.length > 0)) rows.push(cells)
    i++
  }
  return { headers, rows, next: i }
}

// Convierte el markdown completo del informe en secciones (una por "## Título" o "0N TÍTULO")
// Compara una línea de texto contra los títulos oficiales de la plantilla,
// ignorando mayúsculas/acentos/puntuación/numeración — porque el modelo no
// siempre repite el título exactamente igual (mayúsculas, con o sin "##",
// con o sin el número). Es mucho más confiable que adivinar por formato.
function normalizeTitle(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^[\s\d.\-–—)]+/, '') // saca numeración inicial ("01.", "1)", etc.)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function matchIndexTitle(line: string, indexList: string[]): string | null {
  const normLine = normalizeTitle(line)
  if (!normLine || normLine.length > 90) return null
  for (const title of indexList) {
    const normTitle = normalizeTitle(title)
    if (normTitle && (normLine === normTitle || normLine.startsWith(normTitle))) return title
  }
  // fallback más laxo solo para líneas cortas, para reducir falsos positivos
  if (normLine.length <= 60) {
    for (const title of indexList) {
      const normTitle = normalizeTitle(title)
      if (normTitle && normLine.includes(normTitle)) return title
    }
  }
  return null
}

function parseSections(markdown: string, indexList: string[]): Section[] {
  // Saca bloques de chart y los reemplaza por placeholders para no perderlos
  const chartBlocks: { title: string; headers: string[]; rows: string[][] }[] = []
  const withoutCharts = markdown.replace(/```chart\n([\s\S]*?)```/g, (_, json) => {
    try {
      const cfg = JSON.parse(json.trim())
      const data = Array.isArray(cfg.data) ? (cfg.data as Array<Record<string, unknown>>) : []
      if (data.length > 0) {
        const keys = Object.keys(data[0])
        const headers = keys.map((k) => k.charAt(0).toUpperCase() + k.slice(1))
        const rows = data.map((d) => keys.map((k) => String(d[k] ?? '')))
        chartBlocks.push({ title: typeof cfg.title === 'string' ? cfg.title : 'Gráfico', headers, rows })
        return `\n@@CHART_${chartBlocks.length - 1}@@\n`
      }
    } catch {
      // ignore malformed chart
    }
    return ''
  })

  // Saca otros bloques de código (file/image/pdf/faltantes) para que no aparezcan en el PDF
  const cleaned = withoutCharts.replace(/```(file|image|pdf|faltantes)\n[\s\S]*?```/g, '')

  const lines = cleaned.split('\n')
  const sections: Section[] = []
  let current: Section | null = null
  let currentCard: Card | null = null
  const pendingStats: { label: string; value: string }[] = []

  const flushCard = () => {
    if (current && currentCard && (currentCard.items.length > 0 || currentCard.title)) {
      current.cards.push(currentCard)
    }
    currentCard = null
  }
  const flushStats = () => {
    if (current && pendingStats.length >= 2) {
      current.statRow.push(...pendingStats)
    } else if (current) {
      // Muy pocos como para ser una fila de KPIs: van como texto normal
      for (const s of pendingStats) current.intro.push({ kind: 'paragraph', text: `${s.label}: ${s.value}` })
    }
    pendingStats.length = 0
  }
  const pushItem = (item: Item) => {
    if (currentCard) currentCard.items.push(item)
    else if (current) current.intro.push(item)
  }

  let i = 0
  while (i < lines.length) {
    const raw = lines[i]
    const trimmed = raw.trim()

    if (!trimmed) {
      i++
      continue
    }

    const chartMatch = trimmed.match(/^@@CHART_(\d+)@@$/)
    if (chartMatch) {
      flushStats()
      const idx = parseInt(chartMatch[1], 10)
      if (chartBlocks[idx]) pushItem({ kind: 'chart', ...chartBlocks[idx] })
      i++
      continue
    }

    // Tabla markdown
    if (trimmed.includes('|') && lines[i + 1] && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      const parsed = parseTableLines(lines, i)
      if (parsed) {
        flushStats()
        pushItem({ kind: 'table', headers: parsed.headers, rows: parsed.rows })
        i = parsed.next
        continue
      }
    }

    // Encabezado de sección nueva: "## Título", "01 Título", "01. Título",
    // negrita ("**01 Título**"), con o sin mayúsculas — lo validamos contra
    // los títulos reales de la plantilla del plan (ver matchIndexTitle).
    const h2Match = trimmed.match(/^#{1,2}\s+(.*)$/)
    const boldFullLine = trimmed.match(/^\*\*(.+?)\*\*:?\s*$/)
    const candidateTitleText = h2Match ? h2Match[1] : boldFullLine ? boldFullLine[1] : trimmed
    const matchedIndexTitle = matchIndexTitle(candidateTitleText, indexList)
    const isExplicitHeading = !!h2Match

    if (isExplicitHeading || matchedIndexTitle) {
      flushStats()
      flushCard()
      if (current) sections.push(current)
      const title = matchedIndexTitle || cleanInline(candidateTitleText.replace(/^[\d.\s]+/, ''))
      current = { title, intro: [], statRow: [], cards: [] }
      i++
      continue
    }

    if (!current) {
      // Contenido antes de cualquier encabezado detectado (portada/preámbulo): ignorar
      i++
      continue
    }

    // Sub-encabezado de tarjeta: "### Título", línea en negrita con ícono
    // ("🎯 **Título**" / "**🎯 Título**"), o simplemente "🎯 Título" corto sin negrita.
    // EXCEPCIÓN: si la siguiente línea con contenido es una tabla, no es una
    // tarjeta (las tablas se renderizan a ancho completo, no dentro de una tarjeta).
    const h3Match = trimmed.match(/^#{3,6}\s+(.*)$/)
    const boldLine = trimmed.match(/^\*\*(.+?)\*\*:?\s*$/)
    const emojiOnlyMatch = trimmed.match(/^((?:\p{Extended_Pictographic}|\uFE0F|\u200D)+)\s*(.{2,60})$/u)
    const looksLikeTitle = (s: string) => !s.endsWith('.') && s.split(/\s+/).length <= 8

    let nextContentIdx = i + 1
    while (nextContentIdx < lines.length && !lines[nextContentIdx].trim()) nextContentIdx++
    const nextIsTable =
      lines[nextContentIdx]?.includes('|') &&
      lines[nextContentIdx + 1] &&
      /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[nextContentIdx + 1])

    if (
      !nextIsTable &&
      (h3Match ||
        (boldLine && boldLine[1].length < 70 && !boldLine[1].includes(':')) ||
        (emojiOnlyMatch && looksLikeTitle(emojiOnlyMatch[2])))
    ) {
      flushStats()
      flushCard()
      const sourceText = h3Match ? h3Match[1] : boldLine ? boldLine[1] : trimmed
      const { icon, title } = splitIconTitle(sourceText)
      currentCard = { icon, title: cleanInline(title), items: [] }
      i++
      continue
    }
    if (nextIsTable && (h3Match || boldLine || emojiOnlyMatch)) {
      // Es un rótulo de tabla (ej. "META ADS"), no una tarjeta: cerramos
      // cualquier tarjeta abierta y lo dejamos como texto a nivel de sección.
      flushStats()
      flushCard()
      const sourceText = h3Match ? h3Match[1] : boldLine ? boldLine[1] : trimmed
      const { title } = splitIconTitle(sourceText)
      pushItem({ kind: 'paragraph', text: cleanInline(title) })
      i++
      continue
    }

    // Línea tipo "**Label:** valor" -> candidato a fila de KPIs
    const statMatchBold = trimmed.match(/^\*\*([^*]+?):\*\*\s*(.+)$/) || trimmed.match(/^\*\*([^*]+?)\*\*:\s*(.+)$/)
    // Red de seguridad: si el modelo usó viñeta en vez de negrita para un KPI
    // corto (ej. "• Leads: 1453"), lo tratamos igual como candidato a KPI,
    // pero solo si el valor es corto y "numérico" — para no confundirlo con
    // una viñeta descriptiva normal (ej. "Cambio 1: ajuste de presupuesto...").
    const statMatchBullet = trimmed.match(/^[-*•]\s*([^:]{2,40}):\s*(.+)$/)
    const looksNumeric = (v: string) => v.length <= 30 && !v.endsWith('.') && /\d/.test(v)
    const statMatch = statMatchBold || (statMatchBullet && looksNumeric(statMatchBullet[2]) ? statMatchBullet : null)
    if (statMatch && !currentCard) {
      pendingStats.push({ label: cleanInline(statMatch[1]), value: cleanInline(statMatch[2]) })
      i++
      continue
    }
    flushStats()

    const bulletMatch = trimmed.match(/^[-*•]\s+(.*)$/)
    if (bulletMatch) {
      pushItem({ kind: 'bullet', text: cleanInline(bulletMatch[1]) })
      i++
      continue
    }

    pushItem({ kind: 'paragraph', text: cleanInline(trimmed) })
    i++
  }

  flushStats()
  flushCard()
  if (current) sections.push(current)

  return sections
}

async function loadLogo(): Promise<string | null> {
  try {
    const res = await fetch('/images/logo-mdk.jpg')
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export async function generateReportPdf(input: ReportPdfInput): Promise<void> {
  const { clientName, plan, periodLabel, responsable, markdown } = input

  const planNorm = (plan || '').toLowerCase()
  const isEstrategico = planNorm.includes('estrat')
  const planLabel = isEstrategico ? 'PLAN ESTRATÉGICO' : 'PLAN ESENCIAL'
  const reportTitleLines = isEstrategico ? ['INFORME ESTRATÉGICO', 'DE RESULTADOS'] : ['INFORME DE', 'RESULTADOS']
  const footerLabel = isEstrategico
    ? 'MDK  ·  Informe Estratégico de Resultados'
    : 'MDK  ·  Informe de Resultados — Plan Esencial'
  const indexList = isEstrategico ? ESTRATEGICO_INDEX : ESENCIAL_INDEX

  const { default: jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const logo = await loadLogo()

  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 40
  const headerH = 60
  const footerH = 30
  const contentTop = headerH + 24
  const contentBottom = pageHeight - footerH - 10

  // ---------- Portada (índice embebido, como la plantilla real) ----------
  doc.setFillColor(...NEAR_BLACK)
  doc.rect(0, 0, pageWidth, pageHeight, 'F')
  // Panel lateral izquierdo con degradé simulado (bloque naranja oscuro)
  const leftW = pageWidth * 0.35
  doc.setFillColor(120, 60, 20)
  doc.rect(0, 0, leftW, pageHeight, 'F')
  if (logo) {
    try {
      doc.addImage(logo, 'JPEG', leftW / 2 - 55, pageHeight / 2 - 45, 110, 90)
    } catch {
      // ignore
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(32)
  doc.setTextColor(...WHITE)
  reportTitleLines.forEach((line, idx) => doc.text(line, leftW + 32, 110 + idx * 40))
  const titleBottom = 110 + reportTitleLines.length * 40

  doc.setFillColor(...ORANGE)
  doc.rect(leftW + 32, titleBottom + 14, 190, 26, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...WHITE)
  doc.text(planLabel, leftW + 32 + 95, titleBottom + 14 + 17, { align: 'center' })

  const boxTop = titleBottom + 66
  doc.setDrawColor(...ORANGE)
  doc.setLineWidth(1)
  doc.rect(leftW + 32, boxTop, pageWidth - leftW - 64, 26 + indexList.length * 20 + 16)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...ORANGE)
  doc.text('CONTENIDO', leftW + 48, boxTop + 24)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  doc.setTextColor(...WHITE)
  indexList.forEach((item, idx) => {
    doc.text(`${String(idx + 1).padStart(2, '0')}  ${item}`, leftW + 48, boxTop + 50 + idx * 20)
  })

  doc.setFillColor(10, 8, 6)
  doc.rect(0, pageHeight - 34, pageWidth, 34, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  let mx = marginX
  const metaParts: [string, string][] = [['Cliente: ', clientName], ['   Período: ', periodLabel]]
  if (responsable) metaParts.push(['   Responsable: ', responsable])
  for (const [label, value] of metaParts) {
    doc.setTextColor(...ORANGE)
    doc.text(label, mx, pageHeight - 14)
    mx += doc.getTextWidth(label)
    doc.setTextColor(...WHITE)
    doc.text(value, mx, pageHeight - 14)
    mx += doc.getTextWidth(value)
  }

  // ---------- Chrome compartido de las slides de contenido ----------
  let slideNumber = 0
  const drawChrome = (title: string, dark: boolean) => {
    slideNumber++
    doc.setFillColor(...(dark ? NEAR_BLACK : BODY_BG))
    doc.rect(0, 0, pageWidth, pageHeight, 'F')

    // Header negro con franja naranja a la izquierda
    doc.setFillColor(...CARD_HEADER)
    doc.rect(0, 0, pageWidth, headerH, 'F')
    doc.setFillColor(...ORANGE)
    doc.rect(0, 0, 6, headerH, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.setTextColor(...WHITE)
    doc.text(title.toUpperCase(), marginX, headerH / 2 + 5)

    // Badge numerado naranja
    const badgeW = 56
    doc.setFillColor(...ORANGE)
    doc.roundedRect(pageWidth - marginX - badgeW, headerH / 2 - 15, badgeW, 30, 6, 6, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(...WHITE)
    doc.text(String(slideNumber).padStart(2, '0'), pageWidth - marginX - badgeW / 2, headerH / 2 + 5, { align: 'center' })

    // Footer
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...(dark ? [150, 150, 150] : GRAY))
    doc.text(footerLabel, marginX, pageHeight - 12)
    doc.setTextColor(...ORANGE)
    doc.text('madketing.io', pageWidth - marginX, pageHeight - 12, { align: 'right' })
  }

  // ---------- Helpers de dibujo ----------
  const wrapH = (text: string, width: number, size: number) => {
    doc.setFontSize(size)
    return doc.splitTextToSize(text, width) as string[]
  }

  const drawItems = (items: Item[], x: number, yStart: number, width: number, dark = false): number => {
    let y = yStart
    const textColor = dark ? WHITE : DARK_TEXT
    for (const item of items) {
      if (item.kind === 'paragraph') {
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...textColor)
        const lines = wrapH(item.text, width, 10.5)
        doc.text(lines, x, y)
        y += lines.length * 14 + 6
      } else if (item.kind === 'bullet') {
        doc.setFont('helvetica', 'normal')
        const lines = wrapH(item.text, width - 14, 10.5)
        doc.setTextColor(...ORANGE)
        doc.text('•', x, y)
        doc.setTextColor(...textColor)
        doc.text(lines, x + 12, y)
        y += lines.length * 14 + 4
      } else if (item.kind === 'table' || item.kind === 'chart') {
        // Caso borde: una tabla terminó anidada dentro de una tarjeta. No debería
        // pasar (ver lookahead en parseSections), pero por las dudas la mostramos
        // como texto en vez de perderla silenciosamente.
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9.5)
        doc.setTextColor(...textColor)
        doc.text(item.headers.join('  |  '), x, y)
        y += 13
        doc.setFont('helvetica', 'normal')
        for (const row of item.rows) {
          const lines = wrapH(row.join('  |  '), width, 9.5)
          doc.text(lines, x, y)
          y += lines.length * 12 + 3
        }
        y += 6
      }
    }
    return y
  }

  const cardHeight = (card: Card, width: number): number => {
    let h = 34 // header
    doc.setFontSize(10.5)
    for (const item of card.items) {
      if (item.kind === 'paragraph') h += wrapH(item.text, width - 24, 10.5).length * 14 + 6
      if (item.kind === 'bullet') h += wrapH(item.text, width - 38, 10.5).length * 14 + 4
      if (item.kind === 'table' || item.kind === 'chart') {
        h += 13 + item.rows.reduce((acc, row) => acc + wrapH(row.join('  |  '), width - 24, 9.5).length * 12 + 3, 0) + 6
      }
    }
    return h + 16
  }

  const drawCard = (card: Card, x: number, y: number, width: number, height: number, dark: boolean) => {
    if (dark) {
      doc.setFillColor(...DARK_CARD)
      doc.setDrawColor(...DARK_CARD_BORDER)
      doc.rect(x, y, width, height, 'FD')
    } else {
      doc.setFillColor(...WHITE)
      doc.setDrawColor(220, 220, 220)
      doc.rect(x, y, width, height, 'FD')
    }
    // Header de la tarjeta
    doc.setFillColor(...CARD_HEADER)
    doc.rect(x, y, width, 30, 'F')
    let tx = x + 14
    // jsPDF no puede dibujar el glifo de emoji con las fuentes estándar; en su
    // lugar dibujamos un punto de color como marca visual del ícono, usando el
    // emoji original (guardado en card.icon) para elegir el color de riesgo.
    const dotColor = RISK_EMOJI_COLORS[card.icon] ?? ORANGE
    doc.setFillColor(...dotColor)
    doc.circle(tx, y + 15, 3, 'F')
    tx += 10
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    doc.setTextColor(...(card.icon && RISK_EMOJI_COLORS[card.icon] ? dotColor : ORANGE))
    doc.text(card.title.toUpperCase(), tx, y + 20)

    drawItems(card.items, x + 12, y + 48, width - 24, dark)
  }

  const drawStatRow = (stats: { label: string; value: string }[], x: number, y: number, width: number, height: number) => {
    const colW = width / stats.length
    stats.forEach((s, i) => {
      const cx = x + i * colW
      doc.setFillColor(...CARD_HEADER)
      doc.setDrawColor(...ORANGE)
      doc.rect(cx, y, colW - 12, height, 'F')
      doc.setDrawColor(...ORANGE)
      doc.setLineWidth(3)
      doc.line(cx, y, cx + colW - 12, y)

      const isGood = /^[$✅]|^\d/.test(s.value)
      const isPct = s.value.includes('%')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(22)
      doc.setTextColor(...(isPct ? GREEN_TEXT : ORANGE))
      const valLines = doc.splitTextToSize(s.value, colW - 28)
      doc.text(valLines, cx + (colW - 12) / 2, y + height / 2 - 4, { align: 'center' })

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(...WHITE)
      doc.text(s.label.toUpperCase(), cx + (colW - 12) / 2, y + height - 16, { align: 'center', maxWidth: colW - 20 })
    })
  }

  const drawTable = (headers: string[], rows: string[][], x: number, y: number, width: number): number => {
    autoTable(doc, {
      startY: y,
      margin: { left: x, right: pageWidth - x - width },
      tableWidth: width,
      head: [headers],
      body: rows,
      styles: { fontSize: 9, cellPadding: 6, textColor: DARK_TEXT, lineColor: [225, 225, 225] },
      headStyles: { fillColor: CARD_HEADER, textColor: WHITE, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 248, 247] },
      theme: 'grid',
      didParseCell: (data) => {
        if (data.section !== 'body') return
        const raw = data.row.raw as unknown
        const firstCell = String(Array.isArray(raw) ? raw[0] : '').toUpperCase()
        const isLastRow = data.row.index === rows.length - 1
        if (firstCell.includes('TOTAL')) {
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.fillColor = TOTAL_ROW
        } else if (headers.some((h) => /zona/i.test(h)) && isLastRow) {
          // Fila final de la tabla de funnel (Venta) resaltada en verde
          data.cell.styles.fontStyle = 'bold'
          if (data.column.index >= headers.length - 2) data.cell.styles.fillColor = GREEN_ROW
        }
      },
    })
    // @ts-expect-error lastAutoTable es agregado por el plugin en runtime
    return (doc.lastAutoTable?.finalY ?? y) + 16
  }

  // ---------- Render de cada sección ----------
  const sections = parseSections(markdown, indexList)

  // Red de seguridad: si no se detectó ninguna sección (el modelo formateó
  // los títulos de forma inesperada), no generamos un PDF de una sola hoja —
  // metemos todo el contenido en una sección genérica para no perder nada.
  if (sections.length === 0 && markdown.trim()) {
    const fallback = parseSections(`## Informe\n${markdown}`, [])
    if (fallback.length > 0) sections.push(...fallback)
  }

  for (const section of sections) {
    const dark = DARK_SECTION_MATCH.test(section.title)
    doc.addPage()
    drawChrome(section.title, dark)
    let y = contentTop
    const fullWidth = pageWidth - marginX * 2

    if (dark) doc.setTextColor(...WHITE)

    // Intro (texto suelto antes de cualquier tarjeta)
    for (const item of section.intro) {
      if (item.kind === 'table') {
        y = drawTable(item.headers, item.rows, marginX, y, fullWidth)
      } else if (item.kind === 'chart') {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(12)
        doc.setTextColor(...ORANGE)
        doc.text(item.title, marginX, y)
        y += 16
        y = drawTable(item.headers, item.rows, marginX, y, fullWidth)
      } else {
        doc.setFont('helvetica', item.kind === 'bullet' ? 'normal' : 'normal')
        doc.setFontSize(11)
        doc.setTextColor(...(dark ? WHITE : DARK_TEXT))
        const prefix = item.kind === 'bullet' ? '•  ' : ''
        const lines = wrapH(prefix + item.text, fullWidth, 11)
        doc.text(lines, marginX, y)
        y += lines.length * 15 + 6
      }
    }

    // Fila de KPIs grandes
    if (section.statRow.length > 0) {
      const rowH = 80
      drawStatRow(section.statRow, marginX, y, fullWidth, rowH)
      y += rowH + 20
    }

    // Tarjetas en grilla (hasta 3 por fila)
    if (section.cards.length > 0) {
      const perRow = section.cards.length <= 2 ? section.cards.length : 3
      const gap = 16
      const cardW = (fullWidth - gap * (perRow - 1)) / perRow

      let col = 0
      let rowStartY = y
      let rowMaxH = 0
      for (const card of section.cards) {
        const h = Math.max(cardHeight(card, cardW), 120)
        const x = marginX + col * (cardW + gap)

        if (y + h > contentBottom && col === 0) {
          // No entra ni la primera columna: nueva slide de continuación
          doc.addPage()
          drawChrome(section.title, dark)
          y = contentTop
          rowStartY = y
        }

        drawCard(card, x, rowStartY, cardW, h, dark)
        rowMaxH = Math.max(rowMaxH, h)
        col++
        if (col >= perRow) {
          col = 0
          rowStartY += rowMaxH + gap
          rowMaxH = 0
          y = rowStartY
        }
      }
    }
  }

  const safeName =
    input.fileName ||
    `Informe ${clientName} - ${periodLabel}`.replace(/[^\p{L}\p{N}\s\-_]/gu, '').trim()
  doc.save(`${safeName}.pdf`)
}