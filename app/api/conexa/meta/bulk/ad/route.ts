import { NextResponse } from 'next/server'
import { isAllowedAssetUrl, publishErrorResponse, resolveBulkClient } from '@/lib/meta-ads/bulk-access'
import { createAd, getAdsetAccountId, getSourceAdMedia, type AdInput } from '@/lib/meta-ads/publish'

export const runtime = 'nodejs'
export const maxDuration = 90

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as (Omit<AdInput, 'pageId' | 'asset'> & { clientId: string; pageId?: string; asset?: AdInput['asset'] & { sourceAdId?: string } }) | null
  if (!body) return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 })

  const access = await resolveBulkClient(body.clientId)
  if ('error' in access) return access.error
  if (!access.pageId) return NextResponse.json({ error: 'No pudimos detectar la página de Facebook del cliente. Elegila en Configuración de clientes → Página de Facebook.' }, { status: 400 })
  const requestedPageId = body.pageId ? String(body.pageId) : null
  if (requestedPageId && !access.pageIds.includes(requestedPageId)) return NextResponse.json({ error: 'La página elegida no está asignada a este cliente.' }, { status: 403 })
  const pageId = requestedPageId ?? access.pageId

  if (!/^\d+$/.test(String(body.adsetId ?? ''))) return NextResponse.json({ error: 'Conjunto inválido.' }, { status: 400 })
  if (!body.name?.trim() || !body.primaryText?.trim() || !body.headline?.trim()) return NextResponse.json({ error: 'Faltan nombre, texto principal o título.' }, { status: 400 })
  // Los conjuntos con destino WhatsApp no usan URL; createAd exige una válida para el resto.
  const rawLink = typeof body.link === 'string' ? body.link.trim() : ''
  if (rawLink) {
    try {
      const link = new URL(rawLink)
      if (link.protocol !== 'https:' && link.protocol !== 'http:') throw new Error('protocol')
    } catch {
      return NextResponse.json({ error: 'La URL de destino no es válida.' }, { status: 400 })
    }
  }
  const sourceAdId = body.asset?.sourceAdId ? String(body.asset.sourceAdId) : null
  if (sourceAdId ? !/^\d+$/.test(sourceAdId) : !body.asset || !isAllowedAssetUrl(body.asset.url) || !['image', 'video'].includes(body.asset.kind)) return NextResponse.json({ error: 'Archivo inválido.' }, { status: 400 })

  try {
    const accountId = await getAdsetAccountId(body.adsetId)
    if (!access.accountIds.has(accountId)) return NextResponse.json({ error: 'El conjunto no pertenece a una cuenta de este cliente.' }, { status: 403 })
    const source = sourceAdId ? await getSourceAdMedia(sourceAdId) : undefined
    if (source && !access.accountIds.has(source.accountId.replace(/^act_/, ''))) return NextResponse.json({ error: 'El anuncio de origen no pertenece a una cuenta de este cliente.' }, { status: 403 })
    const result = await createAd({
      adsetId: body.adsetId,
      pageId,
      status: body.status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED',
      name: body.name.trim(),
      primaryText: body.primaryText,
      headline: body.headline,
      cta: body.cta,
      link: rawLink,
      asset: source
        ? { url: source.imageUrl ?? '', kind: source.kind, name: String(body.asset?.name ?? 'anuncio').slice(0, 100), source }
        : { url: body.asset!.url, kind: body.asset!.kind, name: String(body.asset!.name ?? 'archivo').slice(0, 100) },
    })
    return NextResponse.json(result)
  } catch (cause) {
    return publishErrorResponse(cause)
  }
}
