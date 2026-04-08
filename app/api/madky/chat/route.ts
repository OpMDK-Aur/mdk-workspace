import {
  convertToModelMessages,
  streamText,
  stepCountIs,
  UIMessage,
} from 'ai'
import { MADKY_SYSTEM_PROMPT } from '@/lib/madky-prompt'
import { madkyTools } from '@/lib/madky/tools'

export const maxDuration = 60

interface ClientContext {
  clientId?: string
  clientName?: string
  plan?: string
  status?: string
  // Platform IDs for tools to use
  metaAdsId?: string
  googleAdsId?: string
}

/**
 * Build enhanced system prompt with client context
 * This gives the AI information about which platforms are available
 * and what IDs to use when calling tools
 */
function buildSystemPrompt(clientContext?: ClientContext): string {
  if (!clientContext?.clientId) {
    return MADKY_SYSTEM_PROMPT + `

## Estado Actual
No hay un cliente seleccionado. Pedile al usuario que seleccione un cliente para poder analizar sus datos.`
  }

  const platformInfo = []
  if (clientContext.metaAdsId) {
    platformInfo.push(`- **Meta Ads:** Conectado (Account ID: ${clientContext.metaAdsId})`)
  } else {
    platformInfo.push(`- **Meta Ads:** No conectado`)
  }
  
  if (clientContext.googleAdsId) {
    platformInfo.push(`- **Google Ads:** Conectado (Customer ID: ${clientContext.googleAdsId})`)
  } else {
    platformInfo.push(`- **Google Ads:** No conectado`)
  }

  return MADKY_SYSTEM_PROMPT + `

## Cliente Actual
- **Nombre:** ${clientContext.clientName || 'Sin nombre'}
- **ID:** ${clientContext.clientId}
- **Plan:** ${clientContext.plan || 'No especificado'}
- **Estado:** ${clientContext.status || 'Activo'}

## Plataformas Disponibles
${platformInfo.join('\n')}

## Instrucciones de Herramientas
1. Al inicio de cada conversación o cuando necesites datos actualizados, usa \`getClientInfo\` para obtener información completa del cliente y sus plataformas conectadas.
2. Para métricas de Meta Ads (Facebook/Instagram), usa \`getMetaAdsMetrics\` con el accountId: ${clientContext.metaAdsId || 'NO DISPONIBLE'}
3. Para métricas de Google Ads, usa \`getGoogleAdsMetrics\` con el customerId: ${clientContext.googleAdsId || 'NO DISPONIBLE'}
4. Para datos del CRM (oportunidades, contactos), usa \`getCRMOpportunities\` o \`getCRMContacts\` con el clientId: ${clientContext.clientId}
5. Siempre usa los IDs exactos proporcionados arriba cuando llames a las herramientas.
6. Si una plataforma no está conectada, informá al usuario en lugar de intentar consultarla.`
}

export async function POST(req: Request) {
  const body = await req.json()
  const { messages, clientContext }: { 
    messages: UIMessage[]
    clientContext?: ClientContext
  } = body

  // Build the enhanced system prompt
  const systemPrompt = buildSystemPrompt(clientContext)

  // Use streamText with tools and stopWhen for multi-step tool execution
  const result = streamText({
    model: 'anthropic/claude-sonnet-4-20250514',
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    tools: madkyTools,
    stopWhen: stepCountIs(10), // Maximum 10 tool calls per conversation turn
    abortSignal: req.signal,
  })

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
  })
}
