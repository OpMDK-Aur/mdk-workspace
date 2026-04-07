import { NextRequest, NextResponse } from 'next/server'
import { generateText, Output } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const ColumnSchema = z.object({
  columns: z.array(z.object({
    key: z.string(),
    label: z.string(),
    visible: z.boolean(),
    format: z.enum(['currency', 'number', 'percent', 'text', 'days']),
  })),
  explanation: z.string().nullable(),
})

const AVAILABLE_COLUMNS = [
  { key: 'budget', label: 'Presupuesto', format: 'currency', description: 'Presupuesto asignado a la campaña' },
  { key: 'daysToEnd', label: 'Dias para finalizar presupuesto', format: 'days', description: 'Dias estimados hasta agotar presupuesto al ritmo actual' },
  { key: 'leads', label: 'Leads / Resultados', format: 'number', description: 'Suma de conversiones/resultados de todas las campañas' },
  { key: 'leadType', label: 'Tipo de resultado', format: 'text', description: 'Indica si son Leads, Conversaciones iniciadas o Conversiones' },
  { key: 'cpl', label: 'CPL', format: 'currency', description: 'Costo por lead' },
  { key: 'ctr', label: 'CTR', format: 'percent', description: 'Click through rate' },
  { key: 'impressions', label: 'Impresiones', format: 'number', description: 'Total de impresiones' },
  { key: 'clicks', label: 'Clicks', format: 'number', description: 'Total de clicks' },
  { key: 'spend', label: 'Inversion', format: 'currency', description: 'Gasto total en el periodo' },
]

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { prompt, currentColumns } = await request.json()

    if (!prompt) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 })
    }

    const systemPrompt = `Eres un asistente experto en dashboards de Paid Media (Meta Ads y Google Ads) para una agencia de marketing llamada MDK.
Tu tarea es ayudar a configurar las columnas visibles en una tabla Scorecard de campañas publicitarias.

Las columnas disponibles son:
${AVAILABLE_COLUMNS.map(c => `- ${c.key} (${c.label}): ${c.description}`).join('\n')}

Configuracion actual de columnas:
${JSON.stringify(currentColumns, null, 2)}

El usuario quiere modificar las columnas. Devuelve la configuracion completa de TODAS las columnas disponibles con visible: true o false segun lo que pidio el usuario.
Incluye una breve explicacion en espanol de lo que cambiaste.`

    const result = await generateText({
      model: 'openai/gpt-4o-mini',
      system: systemPrompt,
      prompt: `Solicitud del usuario: "${prompt}"`,
      output: Output.object({ schema: ColumnSchema }),
    })

    return NextResponse.json(result.object)
  } catch (error) {
    console.error('Scorecard AI Error:', error)
    return NextResponse.json({ error: 'Failed to process AI request' }, { status: 500 })
  }
}
