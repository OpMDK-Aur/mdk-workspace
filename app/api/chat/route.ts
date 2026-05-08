import {
  consumeStream,
  convertToModelMessages,
  streamText,
  UIMessage,
  tool,
} from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 30

export async function POST(req: Request) {
  const { messages, clientId }: { messages: UIMessage[]; clientId?: string } = await req.json()

  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  let clientContext = ''
  if (clientId) {
    const { data: client } = await supabase
      .from('clientes')
      .select('*')
      .eq('id', clientId)
      .single()
    
    if (client) {
      clientContext = `
Contexto del cliente actual:
- Nombre: ${client.business_name}
- Plan: ${client.plan}
- Estado: ${client.status || 'No definido'}
- Fee MDK: $${client.fee_mdk?.toLocaleString() || 'N/A'}
- Google Ads ID: ${client.google_ads_customer_id || 'No configurado'}
- Meta Ads ID: ${client.meta_ads_account_id || 'No configurado'}
`
    }
  }

  const { data: allClients } = await supabase
    .from('clientes')
    .select('nombre_del_negocio, semaforo_id, plan, fee_mdk')
    .order('fee_mdk', { ascending: false })
    .limit(10)

  const clientsOverview = allClients
    ?.map(c => `- ${c.nombre_del_negocio}: ${c.plan}, Fee: $${c.fee_mdk?.toLocaleString() || 'N/A'}`)
    .join('\n') || ''

  const systemPrompt = `Eres el Asistente MDK, un asistente de IA especializado en análisis de marketing digital y publicidad paga (Paid Media) para una agencia de marketing.

Tu rol es ayudar a los Project Managers a:
1. Analizar el rendimiento de campañas de Google Ads y Meta Ads
2. Identificar problemas y oportunidades de optimización
3. Generar reportes y scorecards
4. Responder preguntas sobre métricas como ROAS, CPC, CTR, conversiones e inversión
5. Alertar sobre clientes que requieren atención

Responde siempre en español, de forma profesional pero amigable.
Usa datos específicos cuando los tengas disponibles.
Si no tienes datos reales, indica que estás usando estimaciones.

${clientContext}

Resumen de clientes principales:
${clientsOverview}

Fecha actual: ${new Date().toLocaleDateString('es-AR', { 
  weekday: 'long', 
  year: 'numeric', 
  month: 'long', 
  day: 'numeric' 
})}`

  const modelMessages = await convertToModelMessages(messages)

  const result = streamText({
    model: 'anthropic/claude-opus-4.6',
    system: systemPrompt,
    messages: modelMessages,
    abortSignal: req.signal,
    tools: {
      analyzeClient: tool({
        description: 'Analiza el rendimiento de un cliente específico basándose en sus campañas',
        inputSchema: z.object({
          clientName: z.string().describe('Nombre del cliente a analizar'),
          metric: z.enum(['roas', 'cpc', 'ctr', 'spend', 'conversions']).describe('Métrica principal a analizar'),
        }),
        execute: async ({ clientName, metric }) => {
          const metrics = {
            roas:        { value: 3.4,    trend: -0.2, benchmark: 3.5 },
            cpc:         { value: 45.20,  trend: 5.3,  benchmark: 40 },
            ctr:         { value: 2.8,    trend: 0.1,  benchmark: 2.5 },
            spend:       { value: 210000, trend: 12,   benchmark: 200000 },
            conversions: { value: 156,    trend: -8,   benchmark: 170 },
          }
          return {
            client: clientName,
            metric,
            ...metrics[metric],
            recommendation: metric === 'roas' && metrics.roas.value < metrics.roas.benchmark
              ? 'Revisar segmentación de audiencias y optimizar creativos'
              : 'Rendimiento dentro de parámetros normales',
          }
        },
      }),
      generateReport: tool({
        description: 'Genera un borrador de reporte para un cliente',
        inputSchema: z.object({
          clientName: z.string().describe('Nombre del cliente'),
          reportType: z.enum(['weekly', 'monthly', 'scorecard']).describe('Tipo de reporte'),
        }),
        execute: async ({ clientName, reportType }) => {
          const reportTypes = { weekly: 'Reporte Semanal', monthly: 'Reporte Mensual', scorecard: 'Scorecard de Performance' }
          return {
            title: `${reportTypes[reportType]} - ${clientName}`,
            status: 'draft',
            sections: ['Resumen Ejecutivo', 'KPIs Principales', 'Análisis de Campañas', 'Recomendaciones'],
            generatedAt: new Date().toISOString(),
          }
        },
      }),
      createAlert: tool({
        description: 'Crea una alerta para un cliente que requiere atención',
        inputSchema: z.object({
          clientName: z.string().describe('Nombre del cliente'),
          alertType: z.enum(['roas_drop', 'budget_exceeded', 'conversion_drop', 'general']).describe('Tipo de alerta'),
          message: z.string().describe('Mensaje de la alerta'),
        }),
        execute: async ({ clientName, alertType, message }) => ({
          client: clientName,
          type: alertType,
          message,
          createdAt: new Date().toISOString(),
          priority: alertType === 'roas_drop' ? 'high' : 'medium',
        }),
      }),
    },
  })

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    consumeSseStream: consumeStream,
  })
}
