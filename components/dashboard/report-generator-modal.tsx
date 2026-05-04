'use client'

// Report Generator Modal - Madky Growth Marketing Specialist
import { useState, useRef, useEffect } from 'react'
import { useChat } from '@ai-sdk/react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Loader2, Send, Copy, Check, Sparkles, TrendingUp, Target, Lightbulb, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Client, DashboardFilters, ScorecardRow } from '@/lib/types'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface ReportGeneratorModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clients: Client[]
  filters: DashboardFilters
  scorecardRows: ScorecardRow[]
}

export function ReportGeneratorModal({
  open,
  onOpenChange,
  clients,
  filters,
  scorecardRows,
}: ReportGeneratorModalProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)

  // Build context from current data
  const targetClients = filters.clientIds.length > 0
    ? clients.filter(c => filters.clientIds.includes(c.id))
    : clients

  const platformLabel = filters.platform === 'all' ? 'Todas las plataformas' : 
    filters.platform === 'meta' ? 'Meta Ads' : 'Google Ads'

  const dateRangeLabel = `${format(new Date(filters.dateRange.start), 'dd MMM yyyy', { locale: es })} - ${format(new Date(filters.dateRange.end), 'dd MMM yyyy', { locale: es })}`

  // Aggregate metrics from scorecard
  const clientRows = scorecardRows.filter(r => !r.campaignId)
  const totalSpend = clientRows.reduce((sum, r) => sum + r.spend, 0)
  const totalLeads = clientRows.reduce((sum, r) => sum + r.leads, 0)
  const totalImpressions = clientRows.reduce((sum, r) => sum + r.impressions, 0)
  const totalClicks = clientRows.reduce((sum, r) => sum + r.clicks, 0)
  const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : 0
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0

  // Build initial prompt with all context
  const buildInitialPrompt = () => {
    const clientsInfo = targetClients.map(c => {
      const clientData = clientRows.filter(r => r.clientId === c.id)
      const clientSpend = clientData.reduce((sum, r) => sum + r.spend, 0)
      const clientLeads = clientData.reduce((sum, r) => sum + r.leads, 0)
      const clientCpl = clientLeads > 0 ? clientSpend / clientLeads : 0
      return `- ${c.business_name}: $${clientSpend.toLocaleString('es-AR')} invertido, ${clientLeads} leads, CPL $${clientCpl.toFixed(2)}`
    }).join('\n')

    return `Genera un reporte ejecutivo de performance de campañas publicitarias.

**Periodo:** ${dateRangeLabel}
**Plataforma:** ${platformLabel}
**Clientes analizados:** ${targetClients.length}

**Metricas Globales:**
- Inversion total: $${totalSpend.toLocaleString('es-AR')}
- Leads totales: ${totalLeads.toLocaleString('es-AR')}
- CPL promedio: $${avgCpl.toFixed(2)}
- CTR promedio: ${avgCtr.toFixed(2)}%
- Impresiones: ${totalImpressions.toLocaleString('es-AR')}
- Clics: ${totalClicks.toLocaleString('es-AR')}

**Desglose por cliente:**
${clientsInfo}

Por favor genera:
1. Resumen ejecutivo (2-3 oraciones)
2. Analisis de metricas principales con insights
3. Top 3 oportunidades de mejora
4. Recomendaciones concretas de optimizacion
5. Proximos pasos sugeridos

Usa formato markdown para estructurar el reporte.`
  }

  const { messages, append, isLoading, setMessages } = useChat({
    api: '/api/dashboard/report',
    id: 'report-generator',
    body: {
      filters,
      clientIds: targetClients.map(c => c.id),
    },
    onError: (error) => {
      console.error('[v0] Report generation error:', error)
    },
  })

  // Auto-start when modal opens
  useEffect(() => {
    if (open && !hasStarted && targetClients.length > 0 && scorecardRows.length > 0) {
      console.log('[v0] Report modal: Starting report generation')
      setHasStarted(true)
      const prompt = buildInitialPrompt()
      console.log('[v0] Report modal: Prompt built, appending...')
      append({
        role: 'user',
        content: prompt,
      })
    }
  }, [open, hasStarted, targetClients.length, scorecardRows.length])

  // Reset when modal closes
  useEffect(() => {
    if (!open) {
      setHasStarted(false)
      setMessages([])
    }
  }, [open, setMessages])

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleCopy = () => {
    const lastAssistant = messages.filter(m => m.role === 'assistant').pop()
    if (lastAssistant) {
      navigator.clipboard.writeText(lastAssistant.content as string)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const lastAssistantMessage = messages.filter(m => m.role === 'assistant').pop()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-lg">Madky - Reporte de Performance</DialogTitle>
                <p className="text-sm text-muted-foreground">Growth Marketing Specialist Sr.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {platformLabel}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {dateRangeLabel}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        {/* Quick Stats */}
        <div className="px-6 py-3 border-b bg-muted/30 grid grid-cols-4 gap-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <BarChart3 className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Inversion</p>
              <p className="text-sm font-semibold">${totalSpend.toLocaleString('es-AR')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center">
              <Target className="h-4 w-4 text-green-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Leads</p>
              <p className="text-sm font-semibold">{totalLeads.toLocaleString('es-AR')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-orange-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">CPL Prom</p>
              <p className="text-sm font-semibold">${avgCpl.toFixed(2)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Lightbulb className="h-4 w-4 text-blue-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">CTR Prom</p>
              <p className="text-sm font-semibold">{avgCtr.toFixed(2)}%</p>
            </div>
          </div>
        </div>

        {/* Chat Area */}
        <ScrollArea ref={scrollRef} className="flex-1 px-6 py-4">
          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.length === 0 && !isLoading && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="h-16 w-16 rounded-full bg-gradient-to-br from-teal-500/20 to-cyan-500/20 flex items-center justify-center mb-4">
                  <Sparkles className="h-8 w-8 text-teal-500" />
                </div>
                <p className="text-lg font-medium">Preparando analisis...</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Madky esta recopilando datos de {targetClients.length} cliente{targetClients.length !== 1 ? 's' : ''}
                </p>
              </div>
            )}

            {messages.filter(m => m.role === 'assistant').map((message) => (
              <div key={message.id} className="flex gap-3">
                <Avatar className="h-8 w-8 shrink-0 mt-1">
                  <AvatarFallback className="bg-gradient-to-br from-teal-500 to-cyan-500 text-white text-xs">
                    M
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">Madky</span>
                    <Badge variant="secondary" className="text-[10px] h-4">Growth Marketing Sr.</Badge>
                  </div>
                  <div className="prose prose-sm prose-invert max-w-none [&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base [&_h1]:mt-4 [&_h2]:mt-3 [&_h3]:mt-2 [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5 [&_strong]:text-foreground">
                    <div dangerouslySetInnerHTML={{ __html: formatMarkdown(message.content as string) }} />
                  </div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-3">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="bg-gradient-to-br from-teal-500 to-cyan-500 text-white text-xs">
                    M
                  </AvatarFallback>
                </Avatar>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Analizando datos y generando reporte...</span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Actions */}
        <div className="px-6 py-4 border-t bg-muted/30 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Reporte generado con IA basado en datos de {platformLabel}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              disabled={!lastAssistantMessage || isLoading}
              className="gap-2"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                  Copiado
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copiar reporte
                </>
              )}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setMessages([])
                setHasStarted(false)
                setTimeout(() => {
                  setHasStarted(true)
                  append({
                    role: 'user',
                    content: buildInitialPrompt(),
                  })
                }, 100)
              }}
              disabled={isLoading}
              className="gap-2"
            >
              <Sparkles className="h-4 w-4" />
              Regenerar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Simple markdown to HTML converter
function formatMarkdown(text: string): string {
  return text
    // Headers
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Unordered lists
    .replace(/^\s*[-*]\s+(.*)$/gim, '<li>$1</li>')
    // Ordered lists
    .replace(/^\d+\.\s+(.*)$/gim, '<li>$1</li>')
    // Wrap consecutive list items
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    // Line breaks
    .replace(/\n/g, '<br />')
    // Clean up extra breaks inside lists
    .replace(/<\/li><br \/>/g, '</li>')
    .replace(/<ul><br \/>/g, '<ul>')
}
