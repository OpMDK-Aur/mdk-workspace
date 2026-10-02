export type CreativeFormat = 'Imagen' | 'Video' | 'Carrusel' | 'Dinámico'

export type CreativeCard = {
  id: string
  adId: string | null
  creativeId: string | null
  name: string
  campaign: string
  status: string
  format: CreativeFormat | null
  thumbnail: string | null
  impressions: number
  reach: number
  clicks: number
  leads: number
  ctr: number
  spend: number
  currency: string
}

type MetaAccountLike = { moneda?: string | null; creatives?: unknown[]; ads?: unknown[] }

const FORMAT_MAP: Record<string, CreativeFormat> = {
  image: 'Imagen', imagen: 'Imagen', photo: 'Imagen', share: 'Imagen',
  video: 'Video',
  carousel: 'Carrusel', carrusel: 'Carrusel', multi_share: 'Carrusel',
  dynamic: 'Dinámico', dinamico: 'Dinámico', 'dinámico': 'Dinámico', dco: 'Dinámico', catalog: 'Dinámico',
}

function toFormat(value: unknown): CreativeFormat | null {
  if (typeof value !== 'string' || !value.trim()) return null
  return FORMAT_MAP[value.trim().toLowerCase()] ?? null
}

function toText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function toNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

type RawCreative = {
  id?: unknown
  image_url?: unknown
  thumbnail_url?: unknown
  video_id?: unknown
  object_story_spec?: {
    link_data?: { picture?: unknown; child_attachments?: unknown[] }
    video_data?: { image_url?: unknown }
  }
  asset_feed_spec?: { images?: Array<{ url?: unknown }>; videos?: Array<{ thumbnail_url?: unknown }> }
}

export function creativeThumbnail(creative: RawCreative | null): string | null {
  if (!creative) return null
  const spec = creative.object_story_spec
  return toText(creative.image_url)
    ?? toText(creative.thumbnail_url)
    ?? toText(spec?.link_data?.picture)
    ?? toText(spec?.video_data?.image_url)
    ?? toText(creative.asset_feed_spec?.images?.[0]?.url)
    ?? toText(creative.asset_feed_spec?.videos?.[0]?.thumbnail_url)
}

function creativeFormat(creative: RawCreative | null): CreativeFormat | null {
  if (!creative) return null
  const spec = creative.object_story_spec
  if (toText(creative.video_id) || spec?.video_data) return 'Video'
  if (spec?.link_data?.child_attachments?.length) return 'Carrusel'
  if (creative.asset_feed_spec) return 'Dinámico'
  return 'Imagen'
}

export function isPausedStatus(status: string) {
  return /paused|pausad|inactive|archived/i.test(status)
}

export function toCreativeCards(accounts: MetaAccountLike[]): CreativeCard[] {
  return accounts
    .flatMap((account) => {
      const currency = toText(account.moneda) ?? 'ARS'
      const rows = (account.creatives ?? account.ads ?? []) as Array<Record<string, unknown>>
      return rows.map((row): CreativeCard => {
        const creative = (row.creative && typeof row.creative === 'object' ? row.creative : null) as RawCreative | null
        const campaign = row.campaign as { name?: unknown } | undefined
        return {
        id: String(row.creative_id ?? row.id ?? ''),
        adId: toText(row.id) ?? toText(row.ad_id) ?? toText(row.creative_id),
        creativeId: toText(creative?.id),
        name: toText(row.creative_name) ?? toText(row.name) ?? 'Sin nombre',
        campaign: toText(row.campaign_name) ?? toText(campaign?.name) ?? '',
        status: toText(row.effective_status) ?? toText(row.status) ?? '',
        format: creativeFormat(creative) ?? toFormat(row.format ?? row.object_type ?? row.creative_type),
        thumbnail: creativeThumbnail(creative) ?? toText(row.thumbnail_url) ?? toText(row.image_url),
        impressions: toNumber(row.impressions),
        reach: toNumber(row.reach),
        clicks: toNumber(row.clicks),
        leads: toNumber(row.leads),
        ctr: toNumber(row.ctr),
        spend: toNumber(row.spend),
        currency,
      }
      })
    })
    .filter((card) => card.id && card.impressions > 0)
    .sort((a, b) => b.spend - a.spend)
}
