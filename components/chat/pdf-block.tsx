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
      // Descargar desde el endpoint unificado que usa el mismo generador que "Confirmar y generar PDF"
      const response = await fetch('/api/agentes/analista/download-pdf/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: config.name || 'Cliente',
          plan: config.subtitle?.includes('Estratégico') ? 'estrategico' : 'esencial',
          periodLabel: 'Período de análisis',
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
