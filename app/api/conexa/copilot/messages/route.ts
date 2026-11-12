import { generateText, Output } from 'ai'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { ExecutionContext } from '@/lib/ai/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getToolDefinitions } from '@/lib/ai/tools'
import { dateRange } from '@/lib/conexa/period-range'
import { copilotError, readJson, requireUser } from '@/lib/conexa/copilot/route-helpers'
import { addClientContext, assertClientAccess, createRecommendationDrafts, editRecommendation, getCopilotContext, insertMessages, listMessages, listRecommendations } from '@/lib/conexa/copilot/store'
import type { Recommendation, RecommendationDraft, RecommendationPlatform, RecommendationType } from '@/lib/conexa/copilot/types'

export const maxDuration = 90

const TYPE_VALUES = ['presupuesto', 'creatividades', 'segmentacion', 'estructura', 'tracking', 'crm', 'otro'] as const satisfies readonly RecommendationType[]
const PLATFORM_VALUES = ['meta', 'google_ads', 'ga4', 'tag_manager', 'crm'] as const satisfies readonly RecommendationPlatform[]
const modelSchema = z.object({
  reply: z.string().min(1).max(1600),
  needsClarification: z.boolean(),
  questions: z.array(z.string().min(1).max(240)).max(5),
  contextToSave: z.array(z.string().min(3).max(600)).max(5),
  recommendations: z.array(z.object({
    title: z.string().min(5).max(140),
    platforms: z.array(z.enum(PLATFORM_VALUES)).max(5),
    type: z.enum(TYPE_VALUES),
    priority: z.enum(['alta', 'media', 'baja']),
    description: z.string().min(20).max(900),
    rationale: z.string().min(20).max(1000),
    suggested_actions: z.array(z.string().min(5).max(300)).min(1).max(8),
    expected_impact: z.string().min(5).max(400),
    evidenceIds: z.array(z.string()).min(1).max(12),
  })).max(5),
})

const TOOL_KEYS = ['get_meta_metrics', 'get_google_metrics', 'get_google_analytics_report', 'get_google_tag_manager_report', 'crm_contacts', 'crm_opportunities', 'crm_sales_attribution', 'get_client_memory']
const MAX_SOURCE_CHARS = 1800
const clip = (value: unknown, limit = 320) => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit)
const splitIds = (value: string | null | undefined) => String(value ?? '').split(',').map((id) => id.trim()).filter(Boolean)
const compactValue = (value: unknown, depth = 0): unknown => {
  if (typeof value === 'string') return clip(value, 280)
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value
  if (Array.isArray(value)) return value.slice(0, 12).map((item) => compactValue(item, depth + 1))
  if (value && typeof value === 'object' && depth < 4) return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 24).map(([key, item]) => [key, compactValue(item, depth + 1)]))
  return undefined
}

async function readPlatformData(supabase: SupabaseClient, clientId: string, user: { id: string; email?: string }, client: Record<string, unknown>, accounts: Array<Record<string, unknown>>) {
  const metaArray = Array.isArray(client.meta_ads_account_ids) ? client.meta_ads_account_ids.flatMap((value) => splitIds(String(value))) : []
  const googleArray = Array.isArray(client.google_ads_customer_ids) ? client.google_ads_customer_ids.flatMap((value) => splitIds(String(value))) : []
  const metaIds = [...new Set([...accounts.filter((account) => account.plataforma === 'meta').flatMap((account) => splitIds(String(account.id_cuenta ?? ''))), ...metaArray, ...splitIds(typeof client.meta_ads_account_id === 'string' ? client.meta_ads_account_id : null)].map((id) => id.replace(/^act_/, '')))]
  const googleIds = [...new Set([...accounts.filter((account) => account.plataforma === 'google').flatMap((account) => splitIds(String(account.id_cuenta ?? ''))), ...googleArray, ...splitIds(typeof client.google_ads_customer_id === 'string' ? client.google_ads_customer_id : null)].map((id) => id.replace(/-/g, '')))]
  const platforms: RecommendationPlatform[] = []
  if (metaIds.length) platforms.push('meta')
  if (googleIds.length) platforms.push('google_ads')
  if (client.analytics_property_id) platforms.push('ga4')
  if (client.tag_manager_container_id) platforms.push('tag_manager')
  if (client.crm_type) platforms.push('crm')

  const executionContext: ExecutionContext = {
    userId: user.id,
    userEmail: user.email,
    clientId,
    metaAccountId: metaIds.join(',') || undefined,
    googleCustomerId: googleIds.join(',') || undefined,
    analyticsPropertyId: typeof client.analytics_property_id === 'string' ? client.analytics_property_id : undefined,
  }
  const range = dateRange('Últimos 30 días')
  const definitions = getToolDefinitions(TOOL_KEYS).filter((tool) => {
    if (tool.key === 'get_meta_metrics') return Boolean(executionContext.metaAccountId)
    if (tool.key === 'get_google_metrics') return Boolean(executionContext.googleCustomerId)
    if (tool.key === 'get_google_analytics_report') return Boolean(executionContext.analyticsPropertyId)
    if (tool.key === 'get_google_tag_manager_report') return Boolean(client.tag_manager_container_id)
    if (['crm_contacts', 'crm_opportunities', 'crm_sales_attribution'].includes(tool.key)) return Boolean(client.crm_type)
    return tool.key === 'get_client_memory'
  })
  const byKey = new Map(definitions.map((tool) => [tool.key, tool]))
  const read = async (key: string) => {
    const tool = byKey.get(key) as { execute?: (input: Record<string, string>, context: ExecutionContext) => Promise<unknown> } | undefined
    if (!tool?.execute) return null
    try { return compactValue(await tool.execute(range, executionContext)) } catch (error) { return { available: false, message: error instanceof Error ? clip(error.message, 180) : 'Fuente no disponible' } }
  }
  const data = await Promise.all(PLATFORM_DATA_KEYS.map(async ([key, platform, label]) => ({ key, platform, label, value: await read(key) })))
  return { platforms, data: data.filter((item) => item.value !== null && !(item.value && typeof item.value === 'object' && 'available' in item.value && item.value.available === false)) }
}

const PLATFORM_DATA_KEYS: Array<[string, RecommendationPlatform, string]> = [
  ['get_meta_metrics', 'meta', 'Meta Ads'],
  ['get_google_metrics', 'google_ads', 'Google Ads'],
  ['get_google_analytics_report', 'ga4', 'Google Analytics'],
  ['get_google_tag_manager_report', 'tag_manager', 'Tag Manager'],
  ['crm_contacts', 'crm', 'CRM · Contactos'],
  ['crm_opportunities', 'crm', 'CRM · Oportunidades'],
  ['crm_sales_attribution', 'crm', 'CRM · Ventas'],
  ['get_client_memory', 'crm', 'Memoria de cliente'],
]

export async function GET(request: Request) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const clientId = new URL(request.url).searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'Falta el cliente' }, { status: 400 })
  try {
    await assertClientAccess(auth.supabase, clientId)
    return NextResponse.json({ messages: await listMessages(auth.supabase, clientId, auth.user.id) })
  } catch (error) { return copilotError(error) }
}

export async function POST(request: Request) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const body = await readJson<{ clientId: string; message: string; editingRecommendationId?: string }>(request)
  const parsed = z.object({ clientId: z.string().uuid(), message: z.string().trim().min(1).max(4000), editingRecommendationId: z.string().uuid().optional() }).safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'El mensaje o cliente no es válido.' }, { status: 400 })
  const { clientId, message, editingRecommendationId } = parsed.data

  try {
    const client = await assertClientAccess(auth.supabase, clientId)
    const { data: accountRows, error: accountsError } = await auth.supabase.from('cuentas_publicitarias').select('id_cuenta, plataforma').eq('cliente_id', clientId).eq('activo', true)
    if (accountsError) throw new Error('No se pudieron validar las plataformas vinculadas al cliente.')
    const [context, previousMessages, allRecommendations, platformData] = await Promise.all([
      getCopilotContext(auth.supabase, clientId, String(client.nombre_del_negocio ?? 'Cliente'), []),
      listMessages(auth.supabase, clientId, auth.user.id),
      listRecommendations(auth.supabase, clientId),
      readPlatformData(auth.supabase, clientId, auth.user, client as unknown as Record<string, unknown>, (accountRows ?? []) as Array<Record<string, unknown>>),
    ])
    const connectedPlatforms = platformData.platforms
    let editTarget: Recommendation | null = null
    if (editingRecommendationId) {
      editTarget = allRecommendations.find((item) => item.id === editingRecommendationId && item.status === 'draft') ?? null
      if (!editTarget) throw new Error('La recomendación a editar ya no está en borrador.')
    }
    const userMessage = await insertMessages(auth.supabase, [{ client_id: clientId, user_id: auth.user.id, role: 'user', content: message }])
    const sourceItems = [
      ...(context.profile ? [{ id: 'profile', label: 'Contexto del cliente', excerpt: clip(JSON.stringify(context.profile), MAX_SOURCE_CHARS) }] : []),
      ...context.notes.slice(0, 30).map((note) => ({ id: `context:${note.id}`, label: `Contexto agregado (${note.source})`, excerpt: clip(note.content, 900) })),
      ...context.tasks.map((task) => ({ id: `task:${String(task.id)}`, label: `Tarea · ${clip(task.titulo, 120)}`, excerpt: clip(`${task.estado ?? ''} · ${task.descripcion ?? ''} · prioridad ${task.prioridad ?? 'sin prioridad'}`, MAX_SOURCE_CHARS) })),
      ...context.comments.map((comment) => ({ id: `comment:${String(comment.id)}`, label: `Comentario · ${clip(comment.autor, 80)}`, excerpt: clip(comment.contenido, MAX_SOURCE_CHARS) })),
      ...platformData.data.map((item) => ({ id: `platform:${item.key}`, label: item.label, excerpt: clip(JSON.stringify(item.value), MAX_SOURCE_CHARS) })),
      ...allRecommendations.slice(0, 20).map((item) => ({ id: `recommendation:${item.id}`, label: `Historial · ${item.status} · ${clip(item.title, 120)}`, excerpt: clip(`${item.description} ${item.rationale}`, 700) })),
    ]
    const evidenceById = new Map(sourceItems.map((source) => [source.id, source]))
    const modelInput = {
      client: context.clientName,
      connectedPlatforms,
      profile: context.profile,
      storedContext: context.notes.slice(0, 30).map((note) => ({ source: note.source, content: clip(note.content, 900) })),
      tasks: context.tasks.slice(0, 25).map((task) => ({ id: task.id, title: clip(task.titulo, 160), description: clip(task.descripcion, 420), state: task.estado, priority: task.prioridad, dueDate: task.fecha_vencimiento })),
      clientComments: context.comments.slice(0, 25).map((comment) => ({ id: comment.id, author: clip(comment.autor, 80), content: clip(comment.contenido, 420), createdAt: comment.creado_en })),
      platformReadOnlyData: platformData.data,
      previousRecommendations: allRecommendations.slice(0, 30).map(({ title, status, platforms, type, rationale, expected_impact }) => ({ title: clip(title, 140), status, platforms, type, rationale: clip(rationale, 500), expected_impact: clip(expected_impact, 300) })),
      editingRecommendation: editTarget,
      sourceItems,
      currentUserMessage: message,
    }
    const history = previousMessages.slice(-12).map((item) => ({ role: item.role, content: item.content.slice(0, 2500) }))
    const { output } = await generateText({
      model: 'anthropic/claude-sonnet-4.6',
      system: [
        'Sos Conexa, copiloto de recomendaciones para el equipo de MDK. Respondé en español rioplatense, claro y conciso.',
        'ALCANCE: podés leer contexto, tareas, comentarios, datos de plataformas e historial; preguntar; y proponer recomendaciones como borradores. Nunca publiques, apruebes, descartes, programes, ejecutes ni cambies nada en plataformas o en otras secciones. No modifiques el formulario original de Contexto del cliente. Si te piden una acción fuera de alcance, explicá que solo redactás borradores y sugerí el paso manual correspondiente.',
        'FUNDAMENTO: usá exclusivamente los datos entregados. No inventes métricas, hechos, restricciones ni impacto cuantitativo. Para cada propuesta incluí evidenciaIds válidos de sourceItems; si no hay evidencia concreta, no generes recomendación.',
        'ACLARACIONES: cuando falten datos, haya ambigüedad o una recomendación dependa de una decisión no confirmada, hacé preguntas y devolvé recommendations vacío. Solo generá propuestas después de tener información suficiente.',
        'PLATAFORMAS: las plataformas válidas para una propuesta son únicamente las de connectedPlatforms. Si no hay plataformas conectadas, podés proponer acciones basadas en contexto empresarial con platforms vacío, pero no inventes observaciones de medios.',
        'HISTORIAL: revisá previousRecommendations para evitar repetir propuestas publicadas o descartadas; si el usuario pide editar una tarjeta, proponé una versión corregida, conservá los datos válidos y no inventes evidencia.',
        'CONTEXTO PERSISTENTE: contextToSave debe contener solo fragmentos textuales que aparezcan literalmente dentro de currentUserMessage y que sean datos duraderos del negocio. No guardes preguntas, instrucciones generales ni mensajes del asistente.',
        'Toda recomendación es un borrador para revisión humana. No afirmes que se publicó ni que modificaste una plataforma.',
      ].join('\n'),
      output: Output.object({ schema: modelSchema }),
      prompt: JSON.stringify({ history, context: modelInput }),
    })

    const validDrafts: RecommendationDraft[] = output.recommendations.flatMap((item) => {
      const evidenceIds = [...new Set(item.evidenceIds)].filter((id) => evidenceById.has(id))
      if (!evidenceIds.length) return []
      const platforms = [...new Set(item.platforms)].filter((platform) => connectedPlatforms.includes(platform))
      return [{
        title: item.title.trim(), platforms, type: item.type, priority: item.priority,
        description: item.description.trim(), rationale: item.rationale.trim(),
        suggested_actions: item.suggested_actions.map((action) => action.trim()), expected_impact: item.expected_impact.trim(),
        evidence: evidenceIds.map((id) => ({ id, label: evidenceById.get(id)!.label, excerpt: evidenceById.get(id)!.excerpt })),
      }]
    })
    let editedRecommendation: Recommendation | undefined
    let createdRecommendations: Recommendation[] = []
    if (editTarget && validDrafts[0] && !output.needsClarification) editedRecommendation = await editRecommendation(auth.supabase, clientId, editTarget.id, validDrafts[0])
    else if (!editTarget && !output.needsClarification) createdRecommendations = await createRecommendationDrafts(auth.supabase, clientId, auth.user.id, validDrafts)

    let contextSaved = 0
    for (const item of output.contextToSave) {
      const clean = item.trim()
      if (clean && message.includes(clean)) {
        await addClientContext(auth.supabase, { clientId, content: clean, source: 'chat', userId: auth.user.id })
        contextSaved++
      }
    }
    const reply = [output.reply, ...(output.questions.length ? output.questions.map((question) => `• ${question}`) : [])].join('\n')
    const [assistantMessage] = await insertMessages(auth.supabase, [{ client_id: clientId, user_id: auth.user.id, role: 'assistant', content: reply }])
    return NextResponse.json({ userMessage: userMessage[0], message: assistantMessage, recommendations: createdRecommendations, editedRecommendation, contextSaved, needsClarification: output.needsClarification })
  } catch (error) { return copilotError(error) }
}
