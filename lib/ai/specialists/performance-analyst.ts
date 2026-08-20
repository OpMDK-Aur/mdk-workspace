import { createOpenAI } from '@ai-sdk/openai'
import { generateText, Output } from 'ai'
import {
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

function buildPrompt(context: ExecutionContext, snapshots: PaidMediaSnapshot[]) {
  return JSON.stringify({
    tarea: 'Analiza la performance de paid media con evidencia disponible. No inventes benchmarks ni datos faltantes.',
    entidad: {
      client_id: context.clientId,
      platform: snapshots.length === 1 ? snapshots[0].platform : 'mixed',
      account_ids: snapshots.map((snapshot) => snapshot.account_id),
      campaign_ids: snapshots.flatMap((snapshot) => snapshot.campaigns.map((campaign) => typeof campaign.id === 'string' ? campaign.id : null).filter((id): id is string => Boolean(id))),
      period: snapshots[0].period,
    },
    snapshots,
    reglas: [
      'Devuelve exclusivamente el objeto que cumple SpecialistOutputSchema.',
      'Usa agent_slug performance-analyst.',
      'Todos los arrays deben existir aunque estén vacíos.',
      'Cada recomendación debe referenciar finding_ids y evidence_ids existentes o usar arrays vacíos.',
      'Si faltan benchmarks, tracking o contexto causal, marca suficiencia parcial o insuficiente y explica el faltante.',
      'No conviertas clics o impresiones en leads.',
      'No mezcles importes de monedas distintas.',
    ],
  })
}

export async function runPerformanceAnalyst({
  context,
  snapshots,
  model,
}: {
  context: ExecutionContext
  snapshots: PaidMediaSnapshot[]
  model: string
}): Promise<SpecialistOutput> {
  const parsedSnapshots = snapshots.map((snapshot) => PaidMediaSnapshotSchema.parse(snapshot))
  const result = await generateText({
    model: getModel(model),
    system: [
      'Sos Performance Analyst de un sistema de agentes de marketing.',
      'Trabajá únicamente con los snapshots entregados por el backend.',
      'No inventes datos, benchmarks, causas ni identificadores.',
      `Usá agent_config_version ${PERFORMANCE_ANALYST_CONFIG_VERSION}.`,
    ].join('\n'),
    prompt: buildPrompt(context, parsedSnapshots),
    output: Output.object({ schema: SpecialistOutputSchema }),
  })
  return SpecialistOutputSchema.parse(result.output)
}
