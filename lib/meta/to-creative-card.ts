export type CreativeFormat = 'Imagen' | 'Video' | 'Carrusel' | 'Dinámico'

export type CreativeCard = {
  id: string
  name: string
  campaign: string
  status: string
  format: CreativeFormat | null
  thumbnail: string | null
  impressions: number
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

export function isPausedStatus(status: string) {
  return /paused|pausad|inactive|archived/i.test(status)
}

export function toCreativeCards(accounts: MetaAccountLike[]): CreativeCard[] {
  return accounts
    .flatMap((account) => {
      const currency = toText(account.moneda) ?? 'ARS'
      const rows = (account.creatives ?? account.ads ?? []) as Array<Record<string, unknown>>
      return rows.map((row): CreativeCard => ({
        id: String(row.creative_id ?? row.id ?? ''),
        name: toText(row.creative_name) ?? toText(row.name) ?? 'Sin nombre',
        campaign: toText(row.campaign_name) ?? 'Sin campaña',
        status: toText(row.effective_status) ?? toText(row.status) ?? '',
        format: toFormat(row.format ?? row.object_type ?? row.creative_type),
        thumbnail: toText(row.thumbnail_url) ?? toText(row.thumbnail) ?? toText(row.image_url) ?? toText(row.preview_url),
        impressions: toNumber(row.impressions),
        ctr: toNumber(row.ctr),
        spend: toNumber(row.spend),
        currency,
      }))
    })
    .filter((card) => card.id && card.impressions > 0)
    .sort((a, b) => b.spend - a.spend)
}
