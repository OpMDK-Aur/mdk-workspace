import { generateText, Output } from 'ai'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { DASHBOARD_DIMENSION_CATALOG, DASHBOARD_METRIC_CATALOG, DASHBOARD_PLATFORMS, DASHBOARD_PLATFORM_COLUMN_CATALOG, DashboardAssistantSchema, validateDashboardConfig } from '@/lib/conexa/dashboard-presets'
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
  platforms: z.array(z.object({ key: z.enum(DASHBOARD_PLATFORMS), name: z.string().max(100), connected: z.boolean() })).max(5).default([]),
  platformData: z.unknown().optional(),
  currentConfig: z.unknown().nullable().optional(),
})

const SYSTEM_PROMPT = `Sos Conexa, asistente del Dashboard de MDK. Tu único permiso de escritura es cambiar la configuración visual de los tableros de métricas mediante propuestas JSON. No ejecutes acciones en Meta, Google, GA4, Tag Manager ni CRM; no cambies campañas, anuncios, presupuestos, conexiones, datos del CRM, clientes, usuarios ni otros módulos.

Respondé en español rioplatense, claro y breve. Para consultas de lectura, usá solo los datos del contexto y no inventes valores. Si un pedido es externo al Dashboard, rechazalo y explicá que solo podés cambiar qué información aparece en el tablero.

Los pedidos de mostrar, ocultar, sacar o volver a incluir una plataforma son cambios válidos del tablero, NO son pedidos para desconectar esa plataforma. Identificá la clave exacta usando el catálogo de plataformas y proponé el cambio sin pedir aclaraciones cuando el referente sea claro (por ejemplo, Google Ads = google). Para ocultar agregá la clave a hiddenPlatforms; para volver a mostrarla quitá esa clave. Si configuraciónActual.useDefaultLayout es true, conservá useDefaultLayout=true y los bloques vacíos: así se mantiene el tablero actual y solo se oculta la fuente solicitada. No reemplaces el diseño actual por una tarjeta vacía ni inventes bloques en ese caso. Para un tablero de bloques, preservá sus bloques y cambiá solo lo solicitado. Para ocultar un bloque, agregá su id a hiddenBlockIds; para mostrarlo, quitá ese id.

La configuración completa siempre lleva version=1, period, useDefaultLayout (boolean), hiddenPlatforms (claves del catálogo), hiddenBlockIds (ids existentes) y blocks (0 a 16). Los bloques requieren id único, type, title, platform, metric exacta del catálogo o null, dimension y columns válidos. No inventes métricas, dimensiones, columnas o ids. Antes de proponer otros cambios, preguntá por cualquier dato realmente ambiguo: plataforma, métrica, período, dimensión o tipo de bloque.

Para todo cambio devolvé kind=proposal, un resumen y la configuración completa. Es solo una vista previa: el usuario elegirá crear un tablero nuevo o aplicar a uno guardado y luego confirmar el guardado. El tablero por defecto nunca se sobrescribe. Para consultas sin cambios devolvé kind=answer y config=null. No incluyas JSON dentro del texto; el objeto se entrega en config.`

export async function POST(request: Request) {
  const auth = await requireDashboardUser(request)
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
    plataformas: input.platforms,
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
