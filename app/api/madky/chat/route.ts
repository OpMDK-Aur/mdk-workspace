import {
  consumeStream,
  convertToModelMessages,
  streamText,
  UIMessage,
} from 'ai'
import { MADKY_SYSTEM_PROMPT } from '@/lib/madky-prompt'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

interface ClientContext {
  clientId?: string
  clientName?: string
  plan?: string
  status?: string
}

// Fetch client data from the database
async function fetchClientData(clientId: string) {
  const supabase = await createClient()
  
  // Fetch client details
  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single()

  if (!client) return null

  // Fetch recent ads data for this client (last 30 days)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const startDate = thirtyDaysAgo.toISOString().split('T')[0]
  const endDate = new Date().toISOString().split('T')[0]

  const { data: adsData } = await supabase
    .from('ads_daily')
    .select('*')
    .eq('client_id', clientId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false })

  // Calculate summary metrics
  const totalSpend = adsData?.reduce((sum, d) => sum + (d.spend || 0), 0) || 0
  const totalImpressions = adsData?.reduce((sum, d) => sum + (d.impressions || 0), 0) || 0
  const totalClicks = adsData?.reduce((sum, d) => sum + (d.clicks || 0), 0) || 0
  const totalLeads = adsData?.reduce((sum, d) => sum + (d.leads || 0), 0) || 0
  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : 0
  const cpl = totalLeads > 0 ? (totalSpend / totalLeads) : 0

  // Group by platform
  const byPlatform: Record<string, { spend: number; leads: number; impressions: number; clicks: number }> = {}
  adsData?.forEach(d => {
    const platform = d.platform || 'unknown'
    if (!byPlatform[platform]) {
      byPlatform[platform] = { spend: 0, leads: 0, impressions: 0, clicks: 0 }
    }
    byPlatform[platform].spend += d.spend || 0
    byPlatform[platform].leads += d.leads || 0
    byPlatform[platform].impressions += d.impressions || 0
    byPlatform[platform].clicks += d.clicks || 0
  })

  return {
    client: {
      name: client.business_name,
      plan: client.plan,
      status: client.status,
      fee_mdk: client.fee_mdk,
      fee_aurelia: client.fee_aurelia,
      meta_ads_id: client.meta_ads_id,
      google_ads_id: client.google_ads_id,
    },
    metrics: {
      period: `${startDate} a ${endDate}`,
      totalSpend: totalSpend.toFixed(2),
      totalImpressions,
      totalClicks,
      totalLeads,
      ctr: ctr.toFixed(2) + '%',
      cpl: cpl.toFixed(2),
      byPlatform,
    },
    recentDays: adsData?.slice(0, 7) || [],
  }
}

export async function POST(req: Request) {
  const body = await req.json()
  const { messages, clientContext }: { 
    messages: UIMessage[]
    clientContext?: ClientContext
  } = body

  console.log('[v0] Madky API received clientContext:', JSON.stringify(clientContext))

  // Fetch real client data if clientId is provided
  let clientData = null
  if (clientContext?.clientId) {
    clientData = await fetchClientData(clientContext.clientId)
    console.log('[v0] Madky API fetched client data:', clientData ? 'Found' : 'Not found', clientData?.client?.name)
  } else {
    console.log('[v0] Madky API: No clientId provided')
  }

  // Build context message with real data
  let contextMessage = ''
  if (clientData) {
    contextMessage = `

## Datos del Cliente Actual
**Cliente:** ${clientData.client.name}
**Plan:** ${clientData.client.plan || 'No especificado'}
**Estado:** ${clientData.client.status || 'Activo'}
**Fee MDK:** ${clientData.client.fee_mdk ? `$${clientData.client.fee_mdk}` : 'No configurado'}
**Fee Aurelia:** ${clientData.client.fee_aurelia ? `$${clientData.client.fee_aurelia}` : 'No configurado'}

## Métricas de Rendimiento (${clientData.metrics.period})
- **Inversión Total:** $${clientData.metrics.totalSpend}
- **Impresiones:** ${clientData.metrics.totalImpressions.toLocaleString()}
- **Clics:** ${clientData.metrics.totalClicks.toLocaleString()}
- **Leads:** ${clientData.metrics.totalLeads}
- **CTR:** ${clientData.metrics.ctr}
- **CPL:** $${clientData.metrics.cpl}

## Desglose por Plataforma
${Object.entries(clientData.metrics.byPlatform).map(([platform, data]) => {
  const pCpl = data.leads > 0 ? (data.spend / data.leads).toFixed(2) : 'N/A'
  return `### ${platform.toUpperCase()}
- Inversión: $${data.spend.toFixed(2)}
- Leads: ${data.leads}
- CPL: $${pCpl}
- Impresiones: ${data.impressions.toLocaleString()}
- Clics: ${data.clicks.toLocaleString()}`
}).join('\n\n')}

## Rendimiento Últimos 7 Días
${clientData.recentDays.map(d => `- ${d.date}: $${(d.spend || 0).toFixed(2)} invertidos, ${d.leads || 0} leads`).join('\n')}

## Plataformas Conectadas
- Meta Ads: ${clientData.client.meta_ads_id ? 'Conectado (ID: ' + clientData.client.meta_ads_id + ')' : 'No conectado'}
- Google Ads: ${clientData.client.google_ads_id ? 'Conectado (ID: ' + clientData.client.google_ads_id + ')' : 'No conectado'}
`
  } else if (clientContext?.clientName) {
    contextMessage = `\n\n## Contexto\nEl usuario está preguntando sobre el cliente: **${clientContext.clientName}**\nNota: No se encontraron datos de rendimiento para este cliente en el sistema.`
  }

  const result = streamText({
    model: 'anthropic/claude-sonnet-4-20250514',
    system: MADKY_SYSTEM_PROMPT + contextMessage,
    messages: await convertToModelMessages(messages),
    abortSignal: req.signal,
  })

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onFinish: async ({ isAborted }) => {
      if (isAborted) return
    },
    consumeSseStream: consumeStream,
  })
}
