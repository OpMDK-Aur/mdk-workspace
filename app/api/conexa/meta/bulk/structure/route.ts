import { NextResponse } from 'next/server'
import { normalizeAccountId, publishErrorResponse, resolveBulkClient } from '@/lib/meta-ads/bulk-access'
import { createStructure, type CampaignObjective, type StructureInput } from '@/lib/meta-ads/publish'

export const runtime = 'nodejs'
export const maxDuration = 60

const OBJECTIVES: CampaignObjective[] = ['OUTCOME_TRAFFIC', 'OUTCOME_AWARENESS', 'OUTCOME_ENGAGEMENT', 'OUTCOME_LEADS', 'OUTCOME_SALES']

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as (StructureInput & { clientId: string; pageId?: string }) | null
  if (!body) return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 })

  const access = await resolveBulkClient(body.clientId)
  if ('error' in access) return access.error

  const accountId = normalizeAccountId(String(body.accountId ?? ''))
  if (!access.accountIds.has(accountId)) return NextResponse.json({ error: 'La cuenta publicitaria no pertenece a este cliente.' }, { status: 403 })

  const { adset, campaign } = body
  const name = (value: unknown) => typeof value === 'string' && value.trim().length > 0 && value.length <= 400
  if (!name(adset?.name)) return NextResponse.json({ error: 'Falta el nombre del conjunto.' }, { status: 400 })
  if (campaign?.mode === 'new' && (!name(campaign.name) || !OBJECTIVES.includes(campaign.objective))) return NextResponse.json({ error: 'Faltan el nombre o el objetivo de la campaña.' }, { status: 400 })
  if (campaign?.mode === 'existing' && !/^\d+$/.test(campaign.id)) return NextResponse.json({ error: 'Campaña inválida.' }, { status: 400 })
  if (!(Number(adset.dailyBudget) > 0)) return NextResponse.json({ error: 'El presupuesto diario debe ser mayor a 0.' }, { status: 400 })
  if (!Array.isArray(adset.countries) || !adset.countries.length || adset.countries.some((code) => !/^[A-Z]{2}$/.test(code))) return NextResponse.json({ error: 'Elegí al menos un país.' }, { status: 400 })
  const ageMin = Math.max(18, Math.min(65, Number(adset.ageMin) || 18))
  const ageMax = Math.max(ageMin, Math.min(65, Number(adset.ageMax) || 65))

  const whatsapp = adset.destination === 'WHATSAPP'
  const requestedPageId = body.pageId ? String(body.pageId) : null
  if (requestedPageId && !access.pageIds.includes(requestedPageId)) return NextResponse.json({ error: 'La página elegida no está asignada a este cliente.' }, { status: 403 })
  const pageId = requestedPageId ?? access.pageId ?? undefined
  if (whatsapp && !pageId) return NextResponse.json({ error: 'Para WhatsApp hace falta la página de Facebook del cliente con el número de WhatsApp vinculado.' }, { status: 400 })

  try {
    const result = await createStructure({
      accountId,
      status: body.status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED',
      campaign: campaign.mode === 'new' ? { mode: 'new', name: campaign.name.trim(), objective: campaign.objective } : { mode: 'existing', id: campaign.id },
      adset: { name: adset.name.trim(), dailyBudget: Number(adset.dailyBudget), countries: adset.countries, ageMin, ageMax, genders: ['male', 'female'].includes(adset.genders) ? adset.genders : 'all', pixelId: adset.pixelId && /^\d+$/.test(adset.pixelId) ? adset.pixelId : undefined, ...(whatsapp ? { destination: 'WHATSAPP' as const, pageId } : {}) },
    })
    return NextResponse.json(result)
  } catch (cause) {
    return publishErrorResponse(cause)
  }
}
