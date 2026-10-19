import { NextResponse } from 'next/server'
import { generateStrategy, strategyInputSchema } from '@/lib/conexa/agents/creative-strategy'
import { requireClientAccess, saveRun } from '@/lib/conexa/agents/strategy-store'

export const maxDuration = 120

const clip = (value: unknown, max = 4000) => (typeof value === 'string' ? value.slice(0, max) : null)

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const access = await requireClientAccess(body?.clientId)
  if ('error' in access) return access.error

  const parsed = strategyInputSchema.safeParse(body?.input)
  if (!parsed.success) return NextResponse.json({ error: 'Completá el negocio y el objetivo.' }, { status: 400 })

  try {
    const personas = await generateStrategy(parsed.data, {
      metaTopAds: clip(body?.context?.metaTopAds),
      crmWonSummary: clip(body?.context?.crmWonSummary),
      ga4TopPages: clip(body?.context?.ga4TopPages),
      competitorAds: clip(body?.context?.competitorAds),
    })
    const run = await saveRun(access.supabase, {
      clientId: access.clientId,
      createdBy: access.user.id,
      input: parsed.data,
      personas,
    })
    return NextResponse.json(run)
  } catch (cause) {
    console.error('[creative-strategy] Falló la generación:', cause)
    return NextResponse.json({ error: 'Conexa no pudo armar la estrategia. Probá de nuevo.' }, { status: 502 })
  }
}
