'use client'

import { useState } from 'react'
import { Download, FileText, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PdfTable {
  title?: string
  headers: string[]
  rows: (string | number)[][]
}

interface PdfSection {
  heading?: string
  text?: string
  bullets?: string[]
  table?: PdfTable
}

interface PdfData {
  name?: string
  title?: string
  subtitle?: string
  sections?: PdfSection[]
}

interface PdfBlockProps {
  config: PdfData
  /** Full assistant message content, used to build the PDF body reliably */
  messageContent?: string
}

type Block =
  | { kind: 'text'; value: string }
  | { kind: 'chart'; value: Record<string, unknown> }

// Strip basic markdown so the PDF text is clean
function cleanMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '\u2022 ')
    .trim()
}

// Parse the full message into ordered text + chart blocks (ignore file/image/pdf fences)
function parseMessage(content: string): Block[] {
  const blocks: Block[] = []
  const regex = /```(chart|file|image|pdf)\n([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const txt = content.slice(lastIndex, match.index).trim()
      if (txt) blocks.push({ kind: 'text', value: txt })
    }
    if (match[1] === 'chart') {
      try {
        blocks.push({ kind: 'chart', value: JSON.parse(match[2].trim()) })
      } catch {
        // ignore malformed chart
      }
    }
    lastIndex = regex.lastIndex
  }
  if (lastIndex < content.length) {
    const txt = content.slice(lastIndex).trim()
    if (txt) blocks.push({ kind: 'text', value: txt })
  }
  return blocks
}

export function PdfBlock({ config, messageContent }: PdfBlockProps) {
  const [loading, setLoading] = useState(false)
  const { name, subtitle } = config
  const title = config.title || 'Informe de Análisis'

  const fileName = name?.endsWith('.pdf') ? name : `${name || 'informe'}.pdf`

  const handleDownload = async () => {
    setLoading(true)
    try {
      const { default: jsPDF } = await import('jspdf')
      const autoTable = (await import('jspdf-autotable')).default

      const doc = new jsPDF({ unit: 'pt', format: 'a4' })
      const pageWidth = doc.internal.pageSize.getWidth()
      const marginX = 40
      let y = 56

      const accent: [number, number, number] = [127, 119, 221]
      const dark: [number, number, number] = [30, 30, 35]
      const gray: [number, number, number] = [110, 110, 120]

      const ensureSpace = (needed: number) => {
        const pageHeight = doc.internal.pageSize.getHeight()
        if (y + needed > pageHeight - 48) {
          doc.addPage()
          y = 56
        }
      }

      // Title
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(20)
      doc.setTextColor(...dark)
      doc.text(title, marginX, y)
      y += 22

      if (subtitle) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(11)
        doc.setTextColor(...gray)
        doc.text(subtitle, marginX, y)
        y += 18
      }

      // Accent divider
      doc.setDrawColor(...accent)
      doc.setLineWidth(2)
      doc.line(marginX, y, pageWidth - marginX, y)
      y += 24

      const addParagraph = (raw: string) => {
        const text = cleanMarkdown(raw)
        if (!text) return
        // Render line by line so bullets/headings keep structure
        for (const line of text.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed) {
            y += 8
            continue
          }
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(10.5)
          doc.setTextColor(...dark)
          const wrapped = doc.splitTextToSize(trimmed, pageWidth - marginX * 2)
          ensureSpace(wrapped.length * 14)
          doc.text(wrapped, marginX, y)
          y += wrapped.length * 14 + 4
        }
        y += 6
      }

      const addChartTable = (chart: Record<string, unknown>) => {
        const chartTitle = typeof chart.title === 'string' ? chart.title : 'Gráfico'
        const data = Array.isArray(chart.data) ? (chart.data as Array<Record<string, unknown>>) : []
        if (data.length === 0) return

        ensureSpace(40)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(13)
        doc.setTextColor(...accent)
        doc.text(chartTitle, marginX, y)
        y += 16

        // Derive columns from the data keys
        const keys = Object.keys(data[0])
        const headers = keys.map((k) => {
          if (k === (chart.xKey as string)) return 'Categoría'
          if (k === (chart.yKey as string)) return 'Valor'
          return k.charAt(0).toUpperCase() + k.slice(1)
        })
        const rows = data.map((d) => keys.map((k) => String(d[k] ?? '')))

        autoTable(doc, {
          startY: y,
          head: [headers],
          body: rows,
          margin: { left: marginX, right: marginX },
          styles: { fontSize: 9.5, cellPadding: 6 },
          headStyles: { fillColor: accent, textColor: [255, 255, 255], fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [245, 244, 252] },
          theme: 'grid',
        })
        // @ts-expect-error lastAutoTable is added by the plugin at runtime
        y = (doc.lastAutoTable?.finalY ?? y) + 18
      }

      // 1) Build the body from the full message (text + charts) — this guarantees content
      const blocks = messageContent ? parseMessage(messageContent) : []
      let renderedSomething = false
      for (const block of blocks) {
        if (block.kind === 'text') {
          addParagraph(block.value)
          renderedSomething = true
        } else if (block.kind === 'chart') {
          addChartTable(block.value)
          renderedSomething = true
        }
      }

      // 2) Also render any explicit sections the model provided
      for (const section of config.sections ?? []) {
        if (section.heading) {
          ensureSpace(30)
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(13)
          doc.setTextColor(...accent)
          doc.text(section.heading, marginX, y)
          y += 18
          renderedSomething = true
        }
        if (section.text) {
          addParagraph(section.text)
          renderedSomething = true
        }
        if (section.bullets?.length) {
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(10.5)
          doc.setTextColor(...dark)
          for (const bullet of section.bullets) {
            const lines = doc.splitTextToSize(cleanMarkdown(bullet), pageWidth - marginX * 2 - 14)
            ensureSpace(lines.length * 14)
            doc.text('\u2022', marginX, y)
            doc.text(lines, marginX + 14, y)
            y += lines.length * 14 + 2
          }
          y += 6
          renderedSomething = true
        }
        if (section.table?.headers?.length) {
          ensureSpace(60)
          autoTable(doc, {
            startY: y,
            head: [section.table.headers],
            body: section.table.rows.map((r) => r.map((c) => String(c))),
            margin: { left: marginX, right: marginX },
            styles: { fontSize: 9.5, cellPadding: 6 },
            headStyles: { fillColor: accent, textColor: [255, 255, 255], fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [245, 244, 252] },
            theme: 'grid',
          })
          // @ts-expect-error lastAutoTable is added by the plugin at runtime
          y = (doc.lastAutoTable?.finalY ?? y) + 18
          renderedSomething = true
        }
      }

      // Fallback so the PDF is never empty
      if (!renderedSomething) {
        addParagraph('No se incluyó contenido adicional en este informe.')
      }

      // Footer with generation date + page numbers
      const pageCount = doc.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(...gray)
        const footer = `Generado el ${new Date().toLocaleDateString('es-ES')} \u2014 Página ${i} de ${pageCount}`
        doc.text(footer, marginX, doc.internal.pageSize.getHeight() - 24)
      }

      doc.save(fileName)
    } catch (e) {
      console.error('[v0] Error generating PDF:', e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="my-4 p-4 rounded-lg border bg-card flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-10 w-10 rounded-lg bg-[#7F77DD]/10 flex items-center justify-center shrink-0">
          <FileText className="h-5 w-5 text-[#7F77DD]" />
        </div>
        <div className="min-w-0">
          <p className="font-medium truncate">{fileName}</p>
          <p className="text-sm text-muted-foreground truncate">{subtitle || 'Documento PDF'}</p>
        </div>
      </div>
      <Button onClick={handleDownload} disabled={loading} variant="outline" size="sm" className="gap-2 shrink-0">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {loading ? 'Generando...' : 'Descargar PDF'}
      </Button>
    </div>
  )
}
