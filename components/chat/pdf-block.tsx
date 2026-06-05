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
  title: string
  subtitle?: string
  sections?: PdfSection[]
}

export function PdfBlock({ config }: { config: PdfData }) {
  const [loading, setLoading] = useState(false)
  const { name, title, subtitle, sections = [] } = config

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

      const ensureSpace = (needed: number) => {
        const pageHeight = doc.internal.pageSize.getHeight()
        if (y + needed > pageHeight - 48) {
          doc.addPage()
          y = 56
        }
      }

      for (const section of sections) {
        if (section.heading) {
          ensureSpace(30)
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(13)
          doc.setTextColor(...accent)
          doc.text(section.heading, marginX, y)
          y += 18
        }

        if (section.text) {
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(10.5)
          doc.setTextColor(...dark)
          const lines = doc.splitTextToSize(section.text, pageWidth - marginX * 2)
          ensureSpace(lines.length * 14)
          doc.text(lines, marginX, y)
          y += lines.length * 14 + 6
        }

        if (section.bullets && section.bullets.length > 0) {
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(10.5)
          doc.setTextColor(...dark)
          for (const bullet of section.bullets) {
            const lines = doc.splitTextToSize(bullet, pageWidth - marginX * 2 - 14)
            ensureSpace(lines.length * 14)
            doc.text('\u2022', marginX, y)
            doc.text(lines, marginX + 14, y)
            y += lines.length * 14 + 2
          }
          y += 6
        }

        if (section.table && section.table.headers?.length) {
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
        }
      }

      // Footer with generation date
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
