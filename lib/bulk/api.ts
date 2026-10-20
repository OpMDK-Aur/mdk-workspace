import type { CreativeCard } from '@/lib/meta/to-creative-card'
import { createClient } from '@/lib/supabase/client'
import { HEADLINE_LIMIT, PRIMARY_TEXT_LIMIT, type BulkAsset, type BulkRow, type CreativeSuggestion, type NewDestination, type PublishInitialStatus, type Ratio } from './types'

// Phase 1 mocks. Swap each body for the real endpoint call:
// POST /api/conexa/meta/bulk/copies, GET /api/conexa/meta/creative-suggestions, POST /api/conexa/meta/bulk/publish (SSE).

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export type CopiesRequest = { clientId: string; clientName: string; rows: Array<Pick<BulkRow, 'id' | 'baseName' | 'adsetId'>> }
export type CopiesResponse = Record<string, { primaryText: string; headline: string }>

const humanize = (value: string) => value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()

export async function generateCopies({ clientName, rows }: CopiesRequest): Promise<CopiesResponse> {
  await wait(1400)
  const openers = ['Conocé', 'Descubrí', 'Probá', 'Aprovechá']
  return Object.fromEntries(rows.map((row, index) => {
    const subject = humanize(row.baseName) || 'nuestra propuesta'
    const primaryText = `${openers[index % openers.length]} ${subject} de ${clientName}. Escribinos hoy y te asesoramos sin compromiso.`
    const headline = `${subject.charAt(0).toUpperCase()}${subject.slice(1)}`
    return [row.id, { primaryText: primaryText.slice(0, PRIMARY_TEXT_LIMIT), headline: headline.slice(0, HEADLINE_LIMIT) }]
  }))
}

const percent = (value: number) => `${value.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`

// Metrics in `basis` come only from the Meta integration data passed in; the model will only write concept, hook and copy.
export async function getCreativeSuggestions({ creatives }: { clientId: string; creatives: CreativeCard[] }): Promise<CreativeSuggestion[]> {
  await wait(500)
  const withImpressions = creatives.filter((creative) => creative.impressions > 0)
  const byCtr = [...withImpressions].sort((a, b) => b.ctr - a.ctr)
  const top = byCtr[0]
  const average = withImpressions.length ? withImpressions.reduce((sum, item) => sum + item.ctr, 0) / withImpressions.length : 0
  const formatCounts = withImpressions.reduce<Record<string, number>>((acc, item) => {
    const key = String(item.format ?? 'Sin formato')
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})
  const dominantFormat = Object.entries(formatCounts).sort((a, b) => b[1] - a[1])[0]
  const lowest = byCtr.at(-1)
  const noData = 'Todavía no hay creativos con impresiones en la cuenta para comparar.'

  return [
    {
      id: 'sug_ugc',
      format: 'Video · 9:16 + 1:1 · 20–30 s',
      ratios: ['9:16', '1:1'],
      title: 'Variación del creativo ganador',
      hook: '“Te cuento por qué volvería a elegirlos”',
      copy: 'Una clienta real cuenta su experiencia en primera persona. Sin guion, con subtítulos.',
      headline: 'Lo que dicen nuestros clientes',
      basis: top ? `${top.name} · CTR ${percent(top.ctr)}, el mejor de la cuenta (promedio ${percent(average)}).` : noData,
    },
    {
      id: 'sug_static',
      format: 'Imagen · 4:5 + 9:16',
      ratios: ['4:5', '9:16'],
      title: 'Oferta directa con precio',
      hook: '“Este mes, con beneficio exclusivo”',
      copy: 'Pieza estática con la oferta del mes, precio visible y un solo llamado a la acción.',
      headline: 'Beneficio exclusivo este mes',
      basis: dominantFormat ? `${dominantFormat[1]} de ${withImpressions.length} creativos activos son ${dominantFormat[0].toLowerCase()}: conviene sumar variedad de formato.` : noData,
    },
    {
      id: 'sug_refresh',
      format: 'Video · 9:16 · 10–15 s',
      ratios: ['9:16'],
      title: 'Reemplazo del creativo con menor CTR',
      hook: '“3 cosas que nadie te dice antes de empezar”',
      copy: 'Formato lista corta, ritmo rápido y cierre con la propuesta de valor.',
      headline: 'Lo que tenés que saber',
      basis: lowest && lowest !== top ? `${lowest.name} · CTR ${percent(lowest.ctr)}, el más bajo de la cuenta.` : noData,
    },
  ]
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error ?? `Error ${response.status}`)
  return payload as T
}

// Los archivos van directo del navegador al storage para no pasar por el límite de tamaño de las funciones.
export async function uploadBulkAsset(clientId: string, asset: BulkAsset): Promise<string> {
  if (!asset.file) throw new Error(`Falta el archivo de ${asset.name}. Volvé a subirlo.`)
  const supabase = createClient()
  const safeName = asset.file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9.\-_]/g, '_')
  const path = `meta-bulk/${clientId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`
  const { error } = await supabase.storage.from('chat-adjuntos').upload(path, asset.file, { contentType: asset.file.type || 'application/octet-stream', cacheControl: '3600' })
  if (error) throw new Error(`No se pudo subir ${asset.name}: ${error.message}`)
  return supabase.storage.from('chat-adjuntos').getPublicUrl(path).data.publicUrl
}

// Meta usa un solo archivo por anuncio en esta versión: priorizamos los formatos de feed.
export function primaryAsset(assets: BulkAsset[]) {
  const ready = assets.filter((asset) => !asset.pending && asset.file)
  const order: Ratio[] = ['4:5', '1:1', '1.91:1', '9:16']
  return [...ready].sort((a, b) => order.indexOf(a.ratio) - order.indexOf(b.ratio))[0]
}

export async function createDestination({ clientId, destination, status }: { clientId: string; destination: NewDestination; status: PublishInitialStatus }) {
  return postJson<{ campaignId: string; adsetId: string }>('/api/conexa/meta/bulk/structure', {
    clientId,
    accountId: destination.accountId,
    status,
    campaign: destination.campaign.mode === 'new' ? { mode: 'new', name: destination.campaign.name, objective: destination.campaign.objective } : { mode: 'existing', id: destination.campaign.id },
    adset: destination.adset,
  })
}

export async function publishAd({ clientId, pageId, row, adsetId, name, status, link }: { clientId: string; pageId?: string; row: BulkRow; adsetId: string; name: string; status: PublishInitialStatus; link: string }) {
  const asset = primaryAsset(row.assets)
  if (!asset) throw new Error('El anuncio no tiene un archivo listo para subir.')
  const url = await uploadBulkAsset(clientId, asset)
  return postJson<{ adId: string; accountId: string }>('/api/conexa/meta/bulk/ad', {
    clientId,
    pageId,
    adsetId,
    status,
    name,
    primaryText: row.primaryText,
    headline: row.headline,
    cta: row.cta,
    link,
    asset: { url, kind: asset.kind, name: asset.name },
  })
}

export async function fetchClientPages(clientId: string) {
  const response = await fetch(`/api/conexa/meta/bulk/pages?${new URLSearchParams({ clientId })}`)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error ?? 'No se pudieron cargar las páginas')
  return (payload.pages ?? []) as Array<{ id: string; name: string }>
}

export async function fetchPixels(clientId: string, accountId: string) {
  const response = await fetch(`/api/conexa/meta/bulk/pixels?${new URLSearchParams({ clientId, accountId })}`)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error ?? 'No se pudieron cargar los píxeles')
  return (payload.pixels ?? []) as Array<{ id: string; name: string }>
}

export async function createDesignBrief({ suggestion }: { clientId: string; suggestion: CreativeSuggestion }) {
  await wait(500)
  return { taskId: `brief_${suggestion.id}` }
}
