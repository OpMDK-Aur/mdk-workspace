import { createClient } from '@/lib/supabase/server'
import { consumeStream, convertToModelMessages, streamText, type UIMessage } from 'ai'

export const maxDuration = 60

// Helper to fetch metrics from internal APIs
async function fetchAccountMetrics(
  platform: 'meta' | 'google',
  accountId: string,
  baseUrl: string
): Promise<{ spend: number; leads: number; cpl: number; impressions: number; clicks: number } | null> {
  try {
    const endpoint = platform === 'meta' 
      ? `${baseUrl}/api/ads/meta?account_id=${accountId}&date_range=last_7d`
      : `${baseUrl}/api/ads/google?customer_id=${accountId}&date_range=last_7d`
    
    const response = await fetch(endpoint)
    if (!response.ok) return null
    
    const data = await response.json()
    return {
      spend: data.totals?.spend ?? 0,
      leads: data.totals?.leads ?? 0,
      cpl: data.totals?.cpl ?? 0,
      impressions: data.totals?.impressions ?? 0,
      clicks: data.totals?.clicks ?? 0,
    }
  } catch (error) {
    console.error(`Error fetching ${platform} metrics for ${accountId}:`, error)
    return null
  }
}

export async function POST(req: Request) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const { clientId, tipo, cuentas } = await req.json()

    // Get agent config
    const { data: agentConfig } = await supabase
      .from('agentes_config')
      .select('*')
      .eq('slug', 'redactor')
      .single()

    if (!agentConfig) {
      return new Response('Agent not found', { status: 404 })
    }

    // Get client data with ad account IDs
    const { data: client } = await supabase
      .from('clientes')
      .select('*, meta_ads_account_ids, google_ads_customer_ids')
      .eq('id', clientId)
      .single()

    if (!client) {
      return new Response('Client not found', { status: 404 })
    }

    // Get client memoria
    const { data: memoria } = await supabase
      .from('cliente_memoria')
      .select('*')
      .eq('cliente_id', clientId)
      .order('created_at', { ascending: false })
      .limit(5)

    // Build base URL for internal API calls
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : process.env.NEXTAUTH_URL || 'http://localhost:3000'

    // Fetch metrics for selected accounts
    const metricsByAccount: Array<{
      account: string
      platform: string
      spend: number
      leads: number
      cpl: number
      impressions: number
      clicks: number
    }> = []

    // Determine which accounts to fetch based on selection
    const selectedCuentas = cuentas && cuentas.length > 0 ? cuentas : []
    
    // Fetch Meta accounts metrics
    const metaAccounts = client.meta_ads_account_ids || []
    for (const accountId of metaAccounts) {
      if (selectedCuentas.length === 0 || selectedCuentas.includes(accountId)) {
        const metrics = await fetchAccountMetrics('meta', accountId, baseUrl)
        if (metrics) {
          metricsByAccount.push({
            account: accountId,
            platform: 'Meta Ads',
            ...metrics
          })
        }
      }
    }

    // Fetch Google accounts metrics
    const googleAccounts = client.google_ads_customer_ids || []
    for (const accountId of googleAccounts) {
      if (selectedCuentas.length === 0 || selectedCuentas.includes(accountId)) {
        const metrics = await fetchAccountMetrics('google', accountId, baseUrl)
        if (metrics) {
          metricsByAccount.push({
            account: accountId,
            platform: 'Google Ads',
            ...metrics
          })
        }
      }
    }

    // Build context
    const clienteMemoriaText = memoria?.map(m => `- ${m.contenido}`).join('\n') || 'Sin historial'
    
    // Build metrics text from real account data
    let metricasText = 'Sin metricas disponibles'
    if (metricsByAccount.length > 0) {
      const totalSpend = metricsByAccount.reduce((sum, m) => sum + m.spend, 0)
      const totalLeads = metricsByAccount.reduce((sum, m) => sum + m.leads, 0)
      const totalCpl = totalLeads > 0 ? totalSpend / totalLeads : 0
      const totalImpressions = metricsByAccount.reduce((sum, m) => sum + m.impressions, 0)
      const totalClicks = metricsByAccount.reduce((sum, m) => sum + m.clicks, 0)

      metricasText = `RESUMEN GLOBAL (últimos 7 días):
- Inversión total: $${totalSpend.toFixed(2)}
- Leads/Conversiones totales: ${totalLeads}
- CPL promedio: $${totalCpl.toFixed(2)}
- Impresiones: ${totalImpressions.toLocaleString()}
- Clics: ${totalClicks.toLocaleString()}

DESGLOSE POR CUENTA:
${metricsByAccount.map(m => 
  `• ${m.platform} (${m.account}): $${m.spend.toFixed(2)} invertido, ${m.leads} leads, CPL: $${m.cpl.toFixed(2)}`
).join('\n')}`
    }

    const tipoMensaje = tipo === 'inicio' ? 'inicio de semana' : 'cierre de semana'
    const cuentasText = metricsByAccount.length > 0 
      ? `Cuentas analizadas: ${metricsByAccount.map(m => `${m.platform} (${m.account})`).join(', ')}`
      : 'Sin cuentas publicitarias configuradas'

    const systemPrompt = `${agentConfig.system_prompt}

CONTEXTO:
- Cliente: ${client.nombre_del_negocio}
- Tipo de mensaje: ${tipoMensaje}
- ${cuentasText}

HISTORIAL DEL CLIENTE:
${clienteMemoriaText}

METRICAS DE CUENTAS PUBLICITARIAS:
${metricasText}

Genera un mensaje de WhatsApp para ${tipoMensaje}. Maximo ${(agentConfig.parametros as any)?.max_palabras || 300} palabras.
`

    const userMessage: UIMessage[] = [{ 
      id: crypto.randomUUID(),
      role: 'user', 
      content: `Genera el mensaje de ${tipoMensaje} para ${client.nombre_del_negocio}`,
      parts: [{ type: 'text', text: `Genera el mensaje de ${tipoMensaje} para ${client.nombre_del_negocio}` }]
    }]
    const modelMessages = await convertToModelMessages(userMessage)

    const result = streamText({
      model: 'openai/gpt-4o-mini',
      system: systemPrompt,
      messages: modelMessages,
      abortSignal: req.signal,
    })

    // Log execution
    supabase.from('agentes_log').insert({
      agente: 'redactor',
      ejecutado_por: user.id,
      cliente_id: clientId,
      clientes_auditados: 1,
      estado: 'ok',
    }).then(() => {})

    return result.toUIMessageStreamResponse({
      originalMessages: userMessage,
      consumeSseStream: consumeStream,
    })
  } catch (error) {
    console.error('Error in redactor agent:', error)
    return new Response('Internal error', { status: 500 })
  }
}
