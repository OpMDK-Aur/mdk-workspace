import 'server-only'
import { generateText, Output } from 'ai'
import { z } from 'zod'
import type { DriveFileRef, PlanAd, PlanContext, ResolvedPlan } from './types'

const MODEL = 'openai/gpt-5-mini'
export const PRIMARY_TEXT_MAX = 125
export const HEADLINE_MAX = 40
const CONCURRENCY = 5

const copySchema = z.object({ primaryText: z.string(), headline: z.string() })
type Copy = z.infer<typeof copySchema>

export type CreativeCopyInput = {
  file: DriveFileRef
  attributes: string[]
  campaign?: string
  adset?: string
  references: Array<{ primaryText: string; headline: string }>
}

// The main format is the one shown in feed: 4:5, then 1:1, then whatever the ad has.
export function primaryCreative(ad: Pick<PlanAd, 'files' | 'formats'>) {
  const index = ['4:5', '1:1'].map((format) => ad.formats.indexOf(format)).find((value) => value >= 0) ?? 0
  return ad.files[index] ?? ad.files[0]
}

// Drive thumbnails exist for images and videos (a representative frame), so both go through the same path.
async function driveImage(googleToken: string, fileId: string) {
  const headers = { Authorization: `Bearer ${googleToken}` }
  const meta = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=thumbnailLink&supportsAllDrives=true`, { headers, cache: 'no-store' })
  if (!meta.ok) return null
  const { thumbnailLink } = await meta.json() as { thumbnailLink?: string }
  if (!thumbnailLink) return null
  const image = await fetch(thumbnailLink.replace(/=s\d+$/, '=s1024'), { headers, cache: 'no-store' })
  if (!image.ok) return null
  return { data: new Uint8Array(await image.arrayBuffer()), mediaType: image.headers.get('content-type') ?? 'image/jpeg' }
}

const within = (copy: Copy) => copy.primaryText.trim().length > 0 && copy.headline.trim().length > 0
  && copy.primaryText.trim().length <= PRIMARY_TEXT_MAX && copy.headline.trim().length <= HEADLINE_MAX

const SYSTEM = `Escribís el texto principal y el título de un anuncio de Meta mirando el creativo.
- Español rioplatense, con el tono del cliente y de los anuncios de referencia del conjunto.
- Usá solo información que esté en el creativo o en el contexto del cliente. No inventes precios, promociones, plazos, tasas ni condiciones.
- Si el creativo muestra un precio, una tasa, una cuota o una oferta, el copy tiene que repetirlos exactamente como aparecen.
- Texto principal: como máximo ${PRIMARY_TEXT_MAX} caracteres en total. Título: como máximo ${HEADLINE_MAX} caracteres.
- Sin emojis, sin hashtags, sin comillas.`

/** Returns null when the creative can't be read or the model can't respect the rules: the field stays empty. */
export async function copyFromCreative(googleToken: string, clientContext: string, input: CreativeCopyInput): Promise<Copy | null> {
  const image = await driveImage(googleToken, input.file.id).catch(() => null)
  if (!image) return null
  const details = [
    `Datos de la fila (marca, modelo, modalidad): ${input.attributes.join(' · ') || 'sin datos'}`,
    input.campaign ? `Campaña: ${input.campaign}` : '',
    input.adset ? `Conjunto: ${input.adset}` : '',
    `Contexto del cliente: ${clientContext || 'sin contexto'}`,
    input.references.length ? `Copy de los anuncios activos del conjunto (referencia de tono y estructura, no copies datos que no estén en el creativo):\n${input.references.map((ref) => `- Texto: ${ref.primaryText} | Título: ${ref.headline}`).join('\n')}` : '',
  ].filter(Boolean).join('\n')

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { output } = await generateText({
        model: MODEL,
        system: SYSTEM,
        output: Output.object({ schema: copySchema }),
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: attempt ? `${details}\n\nTu respuesta anterior superó los largos permitidos o vino vacía. Respetá ${PRIMARY_TEXT_MAX} y ${HEADLINE_MAX} caracteres.` : details },
            { type: 'image', image: image.data, mediaType: image.mediaType },
          ],
        }],
      })
      const copy = { primaryText: output.primaryText.trim(), headline: output.headline.trim() }
      if (within(copy)) return copy
    } catch (error) {
      console.error('[bulk-copy] creative copy failed', error)
    }
  }
  return null
}

export function creativeCopyInput(context: PlanContext, plan: ResolvedPlan, ad: PlanAd): CreativeCopyInput | null {
  const file = primaryCreative(ad)
  if (!file) return null
  const adset = plan.adsets.find((item) => item.key === ad.adsetKey)
  const sourceIds = adset ? (adset.existingIds.length ? adset.existingIds : adset.reference ? [adset.reference.id] : []) : []
  const references = context.inventory.ads
    .filter((item) => sourceIds.includes(item.adsetId) && item.status === 'ACTIVE' && item.primaryText)
    .slice(0, 3)
    .map((item) => ({ primaryText: item.primaryText.slice(0, 300), headline: item.headline.slice(0, 80) }))
  const attributeColumns = context.interpretation.columns.filter((column) => column.role === 'attribute').map((column) => context.grid.headers.indexOf(column.header)).filter((index) => index >= 0)
  const row = context.grid.rows.find((item) => item.rowNumber === ad.rowNumber)
  return {
    file,
    attributes: row ? attributeColumns.map((index) => (row.cells[index] ?? '').trim()).filter(Boolean) : [],
    campaign: plan.campaigns.find((item) => item.key === ad.campaignKey)?.name,
    adset: adset?.name,
    references,
  }
}

export async function mapLimited<T, R>(items: T[], run: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await run(items[index])
    }
  }))
  return results
}
