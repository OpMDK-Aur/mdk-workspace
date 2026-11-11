import { generateText, Output } from 'ai'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { DASHBOARD_DIMENSION_CATALOG, DASHBOARD_METRIC_CATALOG, DASHBOARD_PLATFORM_COLUMN_CATALOG, DashboardAssistantSchema, validateDashboardConfig } from '@/lib/conexa/dashboard-presets'
import { canAccessClient, canAccessDashboard, requireDashboardUser } from '@/lib/conexa/dashboard-api'
import { isUuid } from '@/lib/tasks/subtasks-api'

export const maxDuration = 45

const inputSchema = z.object({
  clientId: z.string().uuid(),
  dashboardId: z.string().uuid().nullable(),
  clientName: z.string().max(180),
  message: z.string().trim().min(1).max(4000),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) })).max(12),
  period: z.string().max(100),
  platformMetrics: z.record(z.string(), z.array(z.object({ label: z.string().max(100), value: z.number().finite() }))).default({}),
  platformData: z.unknown().optional(),
  currentConfig: z.unknown().nullable().optional(),
})

const SYSTEM_PROMPT = `Sos Conexa, asistente del Dashboard de MDK. Tu único alcance de escritura es proponer una configuración de tableros de métricas; no podés ejecutar acciones ni cambiar campañas, anuncios, presupuestos, conexiones, CRM, clientes, usuarios ni otros módulos.

Respondé siempre en español rioplatense, claro y breve. Si el usuario pide una acción fuera de alcance, rechazala con claridad y no propongas un cambio. Para responder preguntas de datos, usá solo el contexto recibido; si el valor no está presente, decí que no está disponible y no lo inventes. No infieras métricas ni dimensiones que no estén disponibles.

Si el usuario pide modificar un tablero, primero verificá que estén claros la métrica, plataforma, período y tipo de bloque. Si falta alguno de esos datos, kind=clarification, hacé una pregunta puntual y config=null. Cuando esté claro, devolvé kind=proposal, resumen breve y config completa. La configuración debe tener version 1, el período solicitado o el período activo, y entre 1 y 16 bloques. Cada bloque requiere id único, type (kpi, line, bar, funnel o table), title, platform, metric (una etiqueta exacta del catálogo recibido o null), dimension (clave conocida o null) y columns (claves disponibles del catálogo). No inventes etiquetas de métricas; el campo metric debe coincidir exactamente con una etiqueta recibida para esa plataforma.

En una propuesta solo previsualizás el cambio. La interfaz pedirá confirmación para crear un tablero nuevo o actualizar uno guardado. El tablero predeterminado no se puede sobrescribir. Para consultas y conversaciones que no implican cambios, kind=answer y config=null. No incluyas JSON dentro del texto: el objeto se entrega en config.`

export async function POST(request: Request) {
  const auth = await requireDashboardUser()
  if (auth.error || !auth.user) return auth.error ?? NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const raw = await request.json().catch(() => null)
  const parsedInput = inputSchema.safeParse(raw)
  if (!parsedInput.success) return NextResponse.json({ error: 'El mensaje o contexto del Dashboard no es válido.' }, { status: 400 })
  const input = parsedInput.data
  if (!await canAccessClient(auth.supabase, input.clientId)) return NextResponse.json({ error: 'No tenés acceso a este cliente.' }, { status: 404 })
  if (input.dashboardId && !isUuid(input.dashboardId)) return NextResponse.json({ error: 'Tablero inválido.' }, { status: 400 })
  if (input.dashboardId && !await canAccessDashboard(auth.supabase, input.clientId, input.dashboardId)) return NextResponse.json({ error: 'No tenés acceso a este tablero.' }, { status: 404 })

  const context = JSON.stringify({
    cliente: input.clientName,
    período: input.period,
    métricasDisponibles: input.platformMetrics,
    catálogoPorPlataforma: { métricas: DASHBOARD_METRIC_CATALOG, dimensiones: DASHBOARD_DIMENSION_CATALOG, columnas: DASHBOARD_PLATFORM_COLUMN_CATALOG },
    datosActuales: input.platformData,
    configuraciónActual: input.currentConfig,
  }).slice(0, 32_000)
  const conversation = [...input.history, { role: 'user' as const, content: input.message }]
  const prompt = `${conversation.map((item) => `${item.role === 'user' ? 'Usuario' : 'Conexa'}: ${item.content}`).join('\n\n')}\n\nContexto actual del cliente y sus plataformas:\n${context}`

  try {
    const { output } = await generateText({
      model: 'openai/gpt-6-luna',
      output: Output.object({ schema: DashboardAssistantSchema }),
      system: SYSTEM_PROMPT,
      prompt,
      maxOutputTokens: 1200,
      abortSignal: request.signal,
    })
    if (!output) return NextResponse.json({ error: 'Conexa no pudo preparar una respuesta válida.' }, { status: 502 })
    let responseOutput = output
    if (output.kind === 'proposal') {
      const validation = validateDashboardConfig(output.config, input.platformMetrics)
      if (!output.config || !validation.success) {
        responseOutput = { kind: 'clarification', text: 'No pude validar una o más métricas contra los datos conectados. Decime qué métrica disponible querés usar.', summary: null, config: null }
      }
    } else if (output.config !== null) {
      responseOutput = { kind: 'clarification', text: 'Necesito precisar el cambio antes de modificar la vista previa.', summary: null, config: null }
    }

    const userInsert = { client_id: input.clientId, dashboard_id: input.dashboardId, user_id: auth.user.id, role: 'user', content: input.message }
    const assistantInsert = { client_id: input.clientId, dashboard_id: input.dashboardId, user_id: auth.user.id, role: 'assistant', content: JSON.stringify(responseOutput) }
    const { error: saveError } = await auth.supabase.from('dashboard_chat_messages').insert([userInsert, assistantInsert])
    if (saveError) return NextResponse.json({ error: 'No se pudo guardar la conversación. Verificá que las tablas del Dashboard estén instaladas.' }, { status: 503 })
    return NextResponse.json(responseOutput)
  } catch (error) {
    console.error('[conexa-dashboard] assistant failed', error)
    return NextResponse.json({ error: 'Conexa no pudo responder ahora.' }, { status: 502 })
  }
}
