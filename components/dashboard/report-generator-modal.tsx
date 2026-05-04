'use client'

// Report Generator Modal - Madky Growth Marketing Specialist
import { useState, useRef, useEffect } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, UIMessage } from 'ai'
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

// Helper to extract text from UIMessage parts
function getMessageText(message: UIMessage): string {
  if (!message.parts || !Array.isArray(message.parts)) return ''
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('')
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

  const clientIdsRef = useRef(targetClients.map(c => c.id))
  
  // Keep ref updated
  useEffect(() => {
    clientIdsRef.current = targetClients.map(c => c.id)
  }, [targetClients])

  const { messages, sendMessage, status, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/dashboard/report',
      prepareSendMessagesRequest: ({ messages }) => ({
        body: {
          messages,
          filters,
          clientIds: clientIdsRef.current,
        },
      }),
    }),
  })
  
  const isLoading = status === 'streaming' || status === 'submitted'

  // Auto-start when modal opens
  useEffect(() => {
    if (open && !hasStarted && targetClients.length > 0 && scorecardRows.length > 0) {
      setHasStarted(true)
      const prompt = buildInitialPrompt()
      sendMessage({ text: prompt })
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
      navigator.clipboard.writeText(getMessageText(lastAssistant))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const lastAssistantMessage = messages.filter(m => m.role === 'assistant').pop()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0 gap-0 bg-background/95 backdrop-blur-sm border-border/50">
        <DialogHeader className="px-6 py-5 border-b border-border/50 shrink-0 bg-gradient-to-r from-teal-500/5 to-cyan-500/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-teal-500/20">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl font-semibold">Madky - Reporte de Performance</DialogTitle>
                <p className="text-sm text-muted-foreground mt-0.5">Growth Marketing Specialist Sr.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs bg-background/50 border-border/50">
                {platformLabel}
              </Badge>
              <Badge variant="outline" className="text-xs bg-background/50 border-border/50">
                {dateRangeLabel}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        {/* Quick Stats */}
        <div className="px-6 py-4 border-b border-border/50 bg-muted/20 grid grid-cols-4 gap-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Inversion</p>
              <p className="text-base font-bold text-foreground">${totalSpend.toLocaleString('es-AR')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-green-500/20 to-green-500/10 flex items-center justify-center">
              <Target className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Leads</p>
              <p className="text-base font-bold text-foreground">{totalLeads.toLocaleString('es-AR')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-500/10 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">CPL Prom</p>
              <p className="text-base font-bold text-foreground">${avgCpl.toFixed(2)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-500/10 flex items-center justify-center">
              <Lightbulb className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">CTR Prom</p>
              <p className="text-base font-bold text-foreground">{avgCtr.toFixed(2)}%</p>
            </div>
          </div>
        </div>

        {/* Chat Area */}
        <ScrollArea ref={scrollRef} className="flex-1 px-8 py-6">
          <div className="space-y-6 max-w-none">
            {messages.length === 0 && !isLoading && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-teal-500/20 to-cyan-500/20 flex items-center justify-center mb-6 shadow-lg">
                  <Sparkles className="h-10 w-10 text-teal-500" />
                </div>
                <p className="text-xl font-semibold">Preparando analisis...</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Madky esta recopilando datos de {targetClients.length} cliente{targetClients.length !== 1 ? 's' : ''}
                </p>
              </div>
            )}

            {messages.filter(m => m.role === 'assistant').map((message) => (
              <div key={message.id} className="flex gap-4">
                <Avatar className="h-10 w-10 shrink-0 mt-1 ring-2 ring-teal-500/20">
                  <AvatarFallback className="bg-gradient-to-br from-teal-500 to-cyan-500 text-white text-sm font-medium">
                    M
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-3 min-w-0 overflow-hidden">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-base">Madky</span>
                    <Badge variant="secondary" className="text-[10px] h-5 px-2 bg-teal-500/10 text-teal-400 border-0">Growth Marketing Sr.</Badge>
                  </div>
                  <div className="prose prose-base prose-invert max-w-full overflow-hidden break-words
                    [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-8 [&_h1]:mb-4 [&_h1]:text-foreground [&_h1]:border-b [&_h1]:border-border/50 [&_h1]:pb-2
                    [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:text-foreground
                    [&_h3]:text-lg [&_h3]:font-medium [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-foreground
                    [&_p]:my-3 [&_p]:leading-relaxed [&_p]:text-foreground/90 [&_p]:break-words
                    [&_ul]:my-3 [&_ul]:space-y-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:overflow-hidden
                    [&_ol]:my-3 [&_ol]:space-y-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:overflow-hidden
                    [&_li]:text-foreground/90 [&_li]:leading-relaxed [&_li]:break-words
                    [&_strong]:text-foreground [&_strong]:font-semibold
                    [&_em]:text-foreground/80
                  ">
                    <div className="overflow-hidden" dangerouslySetInnerHTML={{ __html: formatMarkdown(getMessageText(message)) }} />
                  </div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-4">
                <Avatar className="h-10 w-10 shrink-0 ring-2 ring-teal-500/20">
                  <AvatarFallback className="bg-gradient-to-br from-teal-500 to-cyan-500 text-white text-sm font-medium">
                    M
                  </AvatarFallback>
                </Avatar>
                <div className="flex items-center gap-3 py-2">
                  <Loader2 className="h-5 w-5 animate-spin text-teal-500" />
                  <span className="text-base text-muted-foreground">Analizando datos y generando reporte...</span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-border/50 bg-gradient-to-r from-muted/30 to-muted/20 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Reporte generado con IA basado en datos de {platformLabel}
          </p>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="default"
              onClick={handleCopy}
              disabled={!lastAssistantMessage || isLoading}
              className="gap-2 h-9"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-green-500" />
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
              size="default"
              onClick={() => {
                setMessages([])
                setHasStarted(false)
                setTimeout(() => {
                  setHasStarted(true)
                  sendMessage({ text: buildInitialPrompt() })
                }, 100)
              }}
              disabled={isLoading}
              className="gap-2 h-9 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white border-0"
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
