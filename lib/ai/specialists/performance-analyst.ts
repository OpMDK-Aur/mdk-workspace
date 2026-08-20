import { createOpenAI } from '@ai-sdk/openai'
import { generateText, Output } from 'ai'
import {
  buildCampaignComparisons,
  PERFORMANCE_ANALYST_CONFIG_VERSION,
  SpecialistOutputSchema,
  PaidMediaSnapshotSchema,
  type PaidMediaSnapshot,
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

function buildPrompt(context: ExecutionContext, currentSnapshots: PaidMediaSnapshot[], comparisonSnapshots: PaidMediaSnapshot[]) {
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
    deltas,
    campaignComparisons: buildCampaignComparisons(currentSnapshots, comparisonSnapshots),
    reglas: [
      'Devuelve exclusivamente el objeto que cumple SpecialistOutputSchema.',
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
    ],
  })
}

export async function runPerformanceAnalyst({
  context,
  snapshots,
  comparisonSnapshots = [],
  model,
}: {
  context: ExecutionContext
  snapshots: PaidMediaSnapshot[]
  comparisonSnapshots?: PaidMediaSnapshot[]
  model: string
}): Promise<SpecialistOutput> {
  const parsedSnapshots = snapshots.map((snapshot) => PaidMediaSnapshotSchema.parse(snapshot))
  const parsedComparisonSnapshots = comparisonSnapshots.map((snapshot) => PaidMediaSnapshotSchema.parse(snapshot))
  const result = await generateText({
    model: getModel(model),
    abortSignal: AbortSignal.timeout(20_000),
    system: [
      'Sos Performance Analyst de un sistema de agentes de marketing.',
      'Trabajá únicamente con los snapshots entregados por el backend.',
      'No inventes datos, benchmarks, causas ni identificadores.',
      `Usá agent_config_version ${PERFORMANCE_ANALYST_CONFIG_VERSION}.`,
    ].join('\n'),
    prompt: buildPrompt(context, parsedSnapshots, parsedComparisonSnapshots),
    output: Output.object({ schema: SpecialistOutputSchema }),
  })
  return SpecialistOutputSchema.parse(result.output)
}
