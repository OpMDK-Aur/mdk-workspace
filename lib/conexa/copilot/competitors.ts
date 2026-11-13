import { generateText } from 'ai'
import { COMPETITOR_AD_COUNTRY, MAX_COMPETITORS_RESEARCHED } from './config'
import { metaRequest } from './executors'

export type CompetitorSource = { id: string; label: string; excerpt: string }
export type CompetitorResearch = { name: string; userNotes: string[]; adLibrary: { available: boolean; ads: Array<{ page: string; text: string; title: string; since: string | null; platforms: string[] }>; message?: string }; web: { available: boolean; summary: string; urls: string[]; message?: string } }

const clip = (value: unknown, limit: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
const slug = (name: string) => name.toLocaleLowerCase('es').replace(/[^a-z0-9áéíóúñü]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

type AdArchiveRow = { page_name?: string; ad_creative_bodies?: string[]; ad_creative_link_titles?: string[]; ad_delivery_start_time?: string; publisher_platforms?: string[] }

/** La Biblioteca de anuncios solo devuelve anuncios comerciales para países con transparencia ampliada (UE) o si la app tiene el acceso aprobado; si no hay datos se informa sin cortar la generación. */
async function readAdLibrary(name: string): Promise<CompetitorResearch['adLibrary']> {
  try {
    const result = await metaRequest<{ data?: AdArchiveRow[] }>('ads_archive', {
      search_terms: name,
      ad_reached_countries: JSON.stringify([COMPETITOR_AD_COUNTRY]),
      ad_active_status: 'ACTIVE',
      ad_type: 'ALL',
      fields: 'page_name,ad_creative_bodies,ad_creative_link_titles,ad_delivery_start_time,publisher_platforms',
      limit: '8',
    })
    const ads = (result.data ?? []).map((row) => ({ page: clip(row.page_name, 80), text: clip(row.ad_creative_bodies?.[0], 280), title: clip(row.ad_creative_link_titles?.[0], 120), since: row.ad_delivery_start_time?.slice(0, 10) ?? null, platforms: row.publisher_platforms ?? [] }))
    return ads.length ? { available: true, ads } : { available: false, ads: [], message: 'La Biblioteca de anuncios no devolvió anuncios activos para este nombre.' }
  } catch (error) {
    return { available: false, ads: [], message: error instanceof Error ? clip(error.message, 200) : 'Biblioteca de anuncios no disponible.' }
  }
}

async function readWeb(name: string, industry: string | null): Promise<CompetitorResearch['web']> {
  try {
    const result = await generateText({
      model: 'perplexity/sonar',
      abortSignal: AbortSignal.timeout(25_000),
      prompt: `Resumí en español, en hasta 8 viñetas cortas, qué está haciendo hoy en marketing y ventas la empresa «${name}»${industry ? ` (rubro: ${industry.replace(/_/g, ' ')})` : ''} en ${COMPETITOR_AD_COUNTRY === 'AR' ? 'Argentina' : COMPETITOR_AD_COUNTRY}: ofertas y precios visibles, promociones vigentes, mensajes principales, canales que usa y propuesta de valor. Usá solo información pública y reciente. Si no encontrás información confiable sobre esa empresa, respondé únicamente "Sin información confiable".`,
    })
    const summary = clip(result.text, 1400)
    const urls = [...new Set((result.sources ?? []).flatMap((source) => (source.sourceType === 'url' ? [source.url] : [])))].slice(0, 4)
    if (!summary || /^sin información confiable/i.test(summary)) return { available: false, summary: '', urls, message: 'La búsqueda web no encontró información confiable.' }
    return { available: true, summary, urls }
  } catch (error) {
    return { available: false, summary: '', urls: [], message: error instanceof Error ? clip(error.message, 200) : 'Búsqueda web no disponible.' }
  }
}

/** Combina lo que cargó el equipo, la Biblioteca de anuncios de Meta y una búsqueda web por competidor. */
export async function researchCompetitors(competitors: Array<{ name: string; notes: string[] }>, industry: string | null) {
  const targets = competitors.slice(0, MAX_COMPETITORS_RESEARCHED)
  const research: CompetitorResearch[] = await Promise.all(targets.map(async ({ name, notes }) => {
    const [adLibrary, web] = await Promise.all([readAdLibrary(name), readWeb(name, industry)])
    return { name, userNotes: notes, adLibrary, web }
  }))
  const sources: CompetitorSource[] = research.flatMap((item) => {
    const key = slug(item.name)
    return [
      ...(item.userNotes.length ? [{ id: `competitor:user:${key}`, label: `Competencia · ${item.name} (cargado por el equipo)`, excerpt: clip(item.userNotes.join(' · '), 900) }] : []),
      ...(item.adLibrary.available ? [{ id: `competitor:adlibrary:${key}`, label: `Competencia · ${item.name} (Biblioteca de anuncios de Meta)`, excerpt: clip(item.adLibrary.ads.map((ad) => `${ad.page}: ${ad.title} ${ad.text}${ad.since ? ` (desde ${ad.since})` : ''}`).join(' | '), 1200) }] : []),
      ...(item.web.available ? [{ id: `competitor:web:${key}`, label: `Competencia · ${item.name} (búsqueda web)`, excerpt: clip(`${item.web.summary}${item.web.urls.length ? ` Fuentes: ${item.web.urls.join(', ')}` : ''}`, 1500) }] : []),
    ]
  })
  return { research, sources }
}
