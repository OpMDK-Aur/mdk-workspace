import { createOpenAI } from '@ai-sdk/openai'
import { generateText, Output } from 'ai'
import { z } from 'zod'
import {
  buildCampaignComparisons,
  PERFORMANCE_ANALYST_CONFIG_VERSION,
  SpecialistOutputSchema,
  normalizeSpecialistOutput,
  PaidMediaSnapshotSchema,
  type PaidMediaChangeEvent,
  type PaidMediaSnapshot,
  PaidMediaChangeEventSchema,
  type SpecialistOutput,
} from '../contracts/performance-analyst'
import type { ExecutionContext } from '../types'

function getModel(model: string) {
  const gateway = createOpenAI({
    apiKey: process.env.AI_GATEWAY_API_KEY,
    baseURL: 'https://ai-gateway.vercel.sh/v1',
  })
  return gateway.chat(model)
}

function buildPrompt(context: ExecutionContext, currentSnapshots: PaidMediaSnapshot[], comparisonSnapshots: PaidMediaSnapshot[], changeHistory: PaidMediaChangeEvent[]) {
  const comparisonByAccount = new Map(comparisonSnapshots.map((snapshot) => [`${snapshot.platform}:${snapshot.account_id}`, snapshot]))
  const deltas = currentSnapshots.map((snapshot) => {
    const previous = comparisonByAccount.get(`${snapshot.platform}:${snapshot.account_id}`)
    if (!previous) return { platform: snapshot.platform, account_id: snapshot.account_id, status: 'missing_comparison' }
    const metrics = Object.fromEntries(Object.keys(snapshot.metrics).map((key) => {
      const current = Number(snapshot.metrics[key]); const comparison = Number(previous.metrics[key]); const delta = current - comparison
      return [key, { current, comparison, delta, delta_pct: comparison === 0 ? null : (delta / Math.abs(comparison)) * 100 }]
    }))
    return { platform: snapshot.platform, account_id: snapshot.account_id, status: 'comparable', metrics }
  })
  const relevantChangeHistory = changeHistory.filter((event) => event.changed_fields.some((field) => field.field_category !== 'other'))
  return JSON.stringify({
    tarea: 'Analiza la performance de paid media con evidencia disponible. No inventes benchmarks ni datos faltantes.',
    entidad: {
      client_id: context.clientId,
      platform: currentSnapshots.length === 1 ? currentSnapshots[0].platform : 'mixed',
      account_ids: [...new Set(currentSnapshots.map((snapshot) => snapshot.account_id))],
      campaign_ids: currentSnapshots.flatMap((snapshot) => snapshot.campaigns.map((campaign) => typeof campaign.id === 'string' ? campaign.id : null).filter((id): id is string => Boolean(id))),
      period: currentSnapshots[0].period,
    },
    currentSnapshots,
    comparisonSnapshots,
    changeHistory: relevantChangeHistory,
    deltas,
    campaignComparisons: buildCampaignComparisons(currentSnapshots, comparisonSnapshots),
    reglas: [
      'Devuelve exclusivamente un objeto JSON con claves canónicas en inglés: agent_slug, config_version, entity, period, sufficiency, missing, confidence, evidence, findings, recommendations y caveats. No inventes campos ni datos.',
      'Usa agent_slug performance-analyst.',
      'Todos los arrays deben existir aunque estén vacíos.',
      'Cada recomendación debe referenciar finding_ids y evidence_ids existentes o usar arrays vacíos.',
      'Si faltan benchmarks, tracking o contexto causal, marca suficiencia parcial o insuficiente y explica el faltante.',
      'No conviertas clics o impresiones en leads.',
      'No mezcles importes de monedas distintas.',
      'Cuando exista comparisonSnapshots, prioriza deltas y explica qué componente soporta la variación; distingue correlación de causalidad.',
      'Apareá campañas por id: solo current = new, solo comparison = not_active_current. No interpretes automáticamente una campaña nueva como buena o mala.',
      'Si result_type cambia entre períodos, marca incompatibilidad y no compares el costo como si fuera el mismo KPI. En Google results es conversions agregado de plataforma.',
      'Si no existe comparisonSnapshots para una pregunta de variación, declara que falta comparativo y no afirmes que una métrica aumentó o bajó.',
      'Usa changeHistory como evidencia observada de cambios de presupuesto, estado, campañas, anuncios, grupos, assets o segmentación. Priorizá presupuesto, puja, target CPA/ROAS, estado, conversiones, targeting y calendario; no enumeres todo el changelog.',
      'No confundas un cambio observado con causalidad: solo proponé una relación causal como hipótesis si coincide temporalmente con la variación y señalá la incertidumbre.',
      'Compará change_history del período actual contra el comparativo cuando ambos existan. Si change_history_available es false, declaralo explícitamente sin bloquear el análisis de métricas.',
      'Si el historial está disponible pero vacío, indicá que no se observaron cambios en el período consultado; no inventes valores anterior/nuevo.',
    ],
  })
}

export async function runPerformanceAnalyst({
  context,
  snapshots,
  comparisonSnapshots = [],
  changeHistory = [],
  model,
}: {
  context: ExecutionContext
  snapshots: PaidMediaSnapshot[]
  comparisonSnapshots?: PaidMediaSnapshot[]
  changeHistory?: PaidMediaChangeEvent[]
  model: string
}): Promise<SpecialistOutput> {
  const parsedSnapshots = snapshots.map((snapshot) => PaidMediaSnapshotSchema.parse(snapshot))
  const parsedComparisonSnapshots = comparisonSnapshots.map((snapshot) => PaidMediaSnapshotSchema.parse(snapshot))
  const parsedChangeHistory = changeHistory.map((event) => PaidMediaChangeEventSchema.parse(event))
  const result = await generateText({
    model: getModel(model),
    abortSignal: AbortSignal.timeout(20_000),
    system: [
      'Sos Performance Analyst de un sistema de agentes de marketing.',
      'Trabajá únicamente con los snapshots entregados por el backend.',
      'No inventes datos, benchmarks, causas ni identificadores.',
      `Usá agent_config_version ${PERFORMANCE_ANALYST_CONFIG_VERSION}.`,
    ].join('\n'),
    prompt: buildPrompt(context, parsedSnapshots, parsedComparisonSnapshots, parsedChangeHistory),
    output: Output.object({ schema: z.record(z.string(), z.unknown()) }),
  })
  const normalized = normalizeSpecialistOutput(result.output)
  const parsed = SpecialistOutputSchema.safeParse(normalized)
  if (!parsed.success) {
    console.error('[performance-output-invalid]', {
      agentSlug: 'performance_analyst',
      configVersion: PERFORMANCE_ANALYST_CONFIG_VERSION,
      model,
      issues: parsed.error.issues.map((issue) => ({ path: issue.path, code: issue.code, message: issue.message })),
    })
    throw new Error(`SPECIALIST_SCHEMA_INVALID: ${parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ')}`)
  }
  return parsed.data
}
