import type { CreativeCard } from '@/lib/meta/to-creative-card'
import { HEADLINE_LIMIT, PRIMARY_TEXT_LIMIT, type BulkRow, type CreativeSuggestion, type PublishInitialStatus } from './types'

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

export type PublishProgress = { rowId: string; index: number; total: number; status: 'done' | 'error'; metaAdId?: string; error?: string }

export async function publishBulk({ rows, onProgress }: { clientId: string; rows: BulkRow[]; initialStatus: PublishInitialStatus; onProgress: (event: PublishProgress) => void }) {
  for (const [index, row] of rows.entries()) {
    await wait(450)
    const failed = row.baseName.includes('largo') && row.assets.some((asset) => asset.kind === 'video')
    onProgress(failed
      ? { rowId: row.id, index, total: rows.length, status: 'error', error: '(#100) El video supera la duración máxima permitida para Stories (60 s).' }
      : { rowId: row.id, index, total: rows.length, status: 'done', metaAdId: `mock_${Math.random().toString().slice(2, 14)}` })
  }
}

export async function retryPublishRow({ row }: { clientId: string; row: BulkRow; initialStatus: PublishInitialStatus }) {
  await wait(700)
  return { metaAdId: `mock_${Math.random().toString().slice(2, 14)}`, rowId: row.id }
}

export async function createDesignBrief({ suggestion }: { clientId: string; suggestion: CreativeSuggestion }) {
  await wait(500)
  return { taskId: `brief_${suggestion.id}` }
}
