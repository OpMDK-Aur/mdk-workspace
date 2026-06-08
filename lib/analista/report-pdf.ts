// Generador de PDF con la plantilla de marca MDK para los informes del Analista.
// Se adapta al plan del cliente (Esencial / Estratégico), arma portada + índice
// y renderiza el contenido del informe en slides numeradas (formato landscape).

type RGB = [number, number, number]

const BRAND_ORANGE: RGB = [255, 122, 0]
const DARK: RGB = [28, 28, 32]
const GRAY: RGB = [110, 110, 120]
const LIGHT_BG: RGB = [255, 244, 235]
const WHITE: RGB = [255, 255, 255]

export interface ReportPdfInput {
  clientName: string
  plan?: string | null
  periodLabel: string
  responsable?: string
  /** Contenido markdown del informe (mensaje del Analista) */
  markdown: string
  fileName?: string
}

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'table'; headers: string[]; rows: string[][] }
  | { kind: 'chart'; headers: string[]; rows: string[][]; title: string }

const ESENCIAL_INDEX = [
  '01  Resumen del Período',
  '02  Resultados de Campañas',
  '03  Acciones Realizadas',
  '04  Análisis del Funnel (síntesis)',
  '05  Qué Funcionó / Qué No',
  '06  Plan del Mes Siguiente',
]

const ESTRATEGICO_INDEX = [
  '01  Resumen Ejecutivo',
  '02  ¿En qué estuvimos trabajando?',
  '03  Testing y Optimización Creativa',
  '04  Performance de Campañas',
  '05  Acciones Realizadas',
  '06  Impacto en el Negocio (Funnel)',
  '07  Gestión Comercial en CRM',
  '08  Impacto Económico Estimado',
  '09  Benchmark y Contexto Competitivo',
  '10  Riesgos y Alertas',
  '11  Plan de Acción',
]

function cleanInline(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/\[(.*?)\]$$.*?$$/g, '$1')
    .trim()
}

// Parse a markdown table starting at index i; returns the parsed table + next index
function parseTable(lines: string[], start: number): { table: Block; next: number } | null {
  const headerLine = lines[start]
  const sepLine = lines[start + 1]
  if (!headerLine?.includes('|') || !sepLine || !/^\s*\|?[\s:|-]+\|?\s*$/.test(sepLine)) {
    return null
  }
  const splitRow = (line: string) =>
    line
      .replace(/^\s*\|/, '')
      .replace(/\|\s*$/, '')
      .split('|')
      .map((c) => cleanInline(c.trim()))

  const headers = splitRow(headerLine)
  const rows: string[][] = []
  let i = start + 2
  while (i < lines.length && lines[i].includes('|')) {
    const cells = splitRow(lines[i])
    if (cells.some((c) => c.length > 0)) rows.push(cells)
    i++
  }
  return { table: { kind: 'table', headers, rows }, next: i }
}

function parseMarkdown(markdown: string): Block[] {
  const blocks: Block[] = []
  // Extract chart fences first, replacing them with placeholders
  const charts: Block[] = []
  const withoutCharts = markdown.replace(/```chart\n([\s\S]*?)```/g, (_, json) => {
    try {
      const cfg = JSON.parse(json.trim())
      const data = Array.isArray(cfg.data) ? (cfg.data as Array<Record<string, unknown>>) : []
      if (data.length > 0) {
        const keys = Object.keys(data[0])
        const headers = keys.map((k) => k.charAt(0).toUpperCase() + k.slice(1))
        const rows = data.map((d) => keys.map((k) => String(d[k] ?? '')))
        charts.push({
          kind: 'chart',
          title: typeof cfg.title === 'string' ? cfg.title : 'Gráfico',
          headers,
          rows,
        })
        return `\n@@CHART_${charts.length - 1}@@\n`
      }
    } catch {
      // ignore malformed chart
    }
    return ''
  })

  // Strip other code fences (file/image/pdf) so they don't leak into the PDF
  const cleaned = withoutCharts.replace(/```(file|image|pdf)\n[\s\S]*?```/g, '')

  const lines = cleaned.split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) {
      i++
      continue
    }

    const chartMatch = trimmed.match(/^@@CHART_(\d+)@@$/)
    if (chartMatch) {
      const idx = parseInt(chartMatch[1], 10)
      if (charts[idx]) blocks.push(charts[idx])
      i++
      continue
    }

    // Markdown table
    if (trimmed.includes('|') && lines[i + 1] && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      const parsed = parseTable(lines, i)
      if (parsed) {
        blocks.push(parsed.table)
        i = parsed.next
        continue
      }
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      blocks.push({ kind: 'heading', level: headingMatch[1].length, text: cleanInline(headingMatch[2]) })
      i++
      continue
    }

    const bulletMatch = trimmed.match(/^[-*•]\s+(.*)$/)
    if (bulletMatch) {
      blocks.push({ kind: 'bullet', text: cleanInline(bulletMatch[1]) })
      i++
      continue
    }

    // Treat short bold-only lines as headings (e.g. "**Resumen del período**")
    const boldOnly = trimmed.match(/^\*\*(.+)\*\*:?$/)
    if (boldOnly && boldOnly[1].length < 60) {
      blocks.push({ kind: 'heading', level: 3, text: cleanInline(boldOnly[1]) })
      i++
      continue
    }

    blocks.push({ kind: 'paragraph', text: cleanInline(trimmed) })
    i++
  }

  return blocks
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
  const reportTitle = isEstrategico ? 'INFORME ESTRATÉGICO DE RESULTADOS' : 'INFORME DE RESULTADOS'
  const footerLabel = isEstrategico
    ? 'MDK  ·  Informe Estratégico de Resultados'
    : 'MDK  ·  Informe de Resultados — Plan Esencial'
  const index = isEstrategico ? ESTRATEGICO_INDEX : ESENCIAL_INDEX

  const { default: jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const logo = await loadLogo()

  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 48
  const contentBottom = pageHeight - 56
  let y = 0

  // ---------- Cover ----------
  doc.setFillColor(...DARK)
  doc.rect(0, 0, pageWidth, pageHeight, 'F')
  // Orange accent band
  doc.setFillColor(...BRAND_ORANGE)
  doc.rect(0, pageHeight - 64, pageWidth, 64, 'F')

  if (logo) {
    try {
      doc.addImage(logo, 'JPEG', marginX, 48, 90, 90)
    } catch {
      // ignore image failure
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(40)
  doc.setTextColor(...WHITE)
  const titleLines = doc.splitTextToSize(reportTitle, pageWidth - marginX * 2)
  doc.text(titleLines, marginX, 220)

  doc.setFontSize(16)
  doc.setTextColor(...BRAND_ORANGE)
  doc.text(planLabel, marginX, 220 + titleLines.length * 42 + 8)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  doc.setTextColor(...WHITE)
  const metaParts = [
    `Cliente: ${clientName}`,
    `Período: ${periodLabel}`,
    responsable ? `Responsable: ${responsable}` : null,
  ].filter(Boolean) as string[]
  doc.text(metaParts.join('     '), marginX, pageHeight - 86)

  // ---------- Contents ----------
  doc.addPage()
  doc.setFillColor(...WHITE)
  doc.rect(0, 0, pageWidth, pageHeight, 'F')
  doc.setFillColor(...BRAND_ORANGE)
  doc.rect(0, 0, 8, pageHeight, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(26)
  doc.setTextColor(...DARK)
  doc.text('CONTENIDO', marginX, 80)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(14)
  let cy = 130
  for (const item of index) {
    doc.setTextColor(...DARK)
    doc.text(item, marginX, cy)
    doc.setDrawColor(...BRAND_ORANGE)
    doc.setLineWidth(0.5)
    doc.line(marginX, cy + 8, pageWidth - marginX, cy + 8)
    cy += 34
  }

  // ---------- Content slides ----------
  const blocks = parseMarkdown(markdown)

  const drawSlideChrome = () => {
    doc.setFillColor(...WHITE)
    doc.rect(0, 0, pageWidth, pageHeight, 'F')
    doc.setFillColor(...BRAND_ORANGE)
    doc.rect(0, 0, 8, pageHeight, 'F')
    // Footer
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...GRAY)
    doc.text(footerLabel, marginX, pageHeight - 28)
    doc.text('madketing.io', pageWidth - marginX, pageHeight - 28, { align: 'right' })
  }

  const newSlide = () => {
    doc.addPage()
    drawSlideChrome()
    y = 70
  }

  const ensure = (needed: number) => {
    if (y + needed > contentBottom) newSlide()
  }

  newSlide()

  for (const block of blocks) {
    switch (block.kind) {
      case 'heading': {
        if (block.level <= 2) {
          // Major section -> start a fresh slide with a banner
          if (y > 90) newSlide()
          doc.setFillColor(...LIGHT_BG)
          doc.rect(marginX - 12, y - 22, pageWidth - marginX * 2 + 24, 38, 'F')
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(18)
          doc.setTextColor(...BRAND_ORANGE)
          doc.text(block.text.toUpperCase(), marginX, y + 4)
          y += 40
        } else {
          ensure(28)
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(13)
          doc.setTextColor(...DARK)
          const lines = doc.splitTextToSize(block.text, pageWidth - marginX * 2)
          doc.text(lines, marginX, y)
          y += lines.length * 16 + 6
        }
        break
      }
      case 'paragraph': {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(11)
        doc.setTextColor(...DARK)
        const lines = doc.splitTextToSize(block.text, pageWidth - marginX * 2)
        ensure(lines.length * 15)
        doc.text(lines, marginX, y)
        y += lines.length * 15 + 6
        break
      }
      case 'bullet': {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(11)
        doc.setTextColor(...DARK)
        const lines = doc.splitTextToSize(block.text, pageWidth - marginX * 2 - 18)
        ensure(lines.length * 15)
        doc.setTextColor(...BRAND_ORANGE)
        doc.text('•', marginX, y)
        doc.setTextColor(...DARK)
        doc.text(lines, marginX + 16, y)
        y += lines.length * 15 + 4
        break
      }
      case 'chart':
      case 'table': {
        if (block.kind === 'chart') {
          ensure(40)
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(13)
          doc.setTextColor(...BRAND_ORANGE)
          doc.text(block.title, marginX, y)
          y += 14
        }
        ensure(70)
        autoTable(doc, {
          startY: y,
          head: [block.headers],
          body: block.rows,
          margin: { left: marginX, right: marginX },
          styles: { fontSize: 9.5, cellPadding: 6, textColor: DARK },
          headStyles: { fillColor: BRAND_ORANGE, textColor: WHITE, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: LIGHT_BG },
          theme: 'grid',
          // Bold the TOTAL row if present
          didParseCell: (data) => {
            const raw = data.row.raw as unknown
            const firstCell = Array.isArray(raw) ? raw[0] : ''
            const first = String(firstCell ?? '').toUpperCase()
            if (data.section === 'body' && first.includes('TOTAL')) {
              data.cell.styles.fontStyle = 'bold'
              data.cell.styles.fillColor = [255, 230, 210]
            }
          },
        })
        // @ts-expect-error lastAutoTable is added by the plugin at runtime
        y = (doc.lastAutoTable?.finalY ?? y) + 16
        break
      }
    }
  }

  // ---------- Page numbers on content slides ----------
  const pageCount = doc.getNumberOfPages()
  for (let i = 3; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(22)
    doc.setTextColor(...BRAND_ORANGE)
    doc.text(String(i - 2).padStart(2, '0'), pageWidth - marginX, 60, { align: 'right' })
  }

  const safeName =
    input.fileName ||
    `Informe ${clientName} - ${periodLabel}`.replace(/[^\p{L}\p{N}\s\-_]/gu, '').trim()
  doc.save(`${safeName}.pdf`)
}
