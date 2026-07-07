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
  // Nuevos campos: la IA los completa con los datos reales del cliente
  clientName?: string
  plan?: string
  periodLabel?: string
  responsable?: string
}

interface PdfBlockProps {
  config: PdfData
  messageContent?: string
}

export function PdfBlock({ config, messageContent }: PdfBlockProps) {
  const [loading, setLoading] = useState(false)
  const { name, subtitle } = config
  const title = config.title || 'Informe de Análisis'

  const fileName = name?.endsWith('.pdf') ? name : `${name || 'informe'}.pdf`

  const handleDownload = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/agentes/analista/download-pdf/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Usamos los campos reales que ahora manda la IA en el bloque ```pdf.
          // Si por algún motivo faltan (respuesta vieja sin estos campos),
          // caemos a valores explícitos que avisan del problema en vez de
          // adivinar mal como antes.
          clientName: config.clientName || 'Cliente no especificado',
          plan: config.plan || 'Esencial',
          periodLabel: config.periodLabel || 'Período no especificado',
          responsable: config.responsable || '',
          markdown: messageContent || '',
          fileName: fileName,
        }),
      })

      if (!response.ok) {
        throw new Error(`Error al descargar PDF: ${response.status}`)
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('[v0] PDF download error:', e)
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