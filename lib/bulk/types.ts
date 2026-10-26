export type Ratio = '1:1' | '4:5' | '9:16' | '1.91:1'

export const CTAS = ['Más información', 'Enviar mensaje', 'Registrarte', 'Comprar'] as const
export type CTA = (typeof CTAS)[number]

export type BulkAsset = {
  id: string
  file?: File
  name: string
  kind: 'image' | 'video'
  url?: string
  ratio: Ratio
  pending?: boolean
  metaHash?: string
  metaVideoId?: string
}

export type BulkRowStatus = 'idle' | 'uploading' | 'creating' | 'done' | 'error'

export type BulkRow = {
  id: string
  baseName: string
  assets: BulkAsset[]
  adsetId: string
  cta: CTA
  primaryText: string
  headline: string
  aiGenerated?: boolean
  fromSuggestion?: string
  status?: BulkRowStatus
  error?: string
  metaAdId?: string
  adName?: string
  published?: { campaignName: string; adsetName: string; adName: string; adsetId: string; accountId: string }
}

export const OBJECTIVES = [
  { value: 'OUTCOME_TRAFFIC', label: 'Tráfico', tag: 'TRAFICO', needsPixel: false },
  { value: 'OUTCOME_LEADS', label: 'Clientes potenciales', tag: 'LEADS', needsPixel: true },
  { value: 'OUTCOME_SALES', label: 'Ventas', tag: 'VENTAS', needsPixel: true },
  { value: 'OUTCOME_ENGAGEMENT', label: 'Interacción', tag: 'INTERACCION', needsPixel: false },
  { value: 'OUTCOME_AWARENESS', label: 'Reconocimiento', tag: 'RECONOCIMIENTO', needsPixel: false },
] as const
export type Objective = (typeof OBJECTIVES)[number]['value']

export const COUNTRIES = [
  { code: 'AR', label: 'Argentina' }, { code: 'UY', label: 'Uruguay' }, { code: 'CL', label: 'Chile' }, { code: 'PY', label: 'Paraguay' },
  { code: 'MX', label: 'México' }, { code: 'CO', label: 'Colombia' }, { code: 'PE', label: 'Perú' }, { code: 'ES', label: 'España' }, { code: 'US', label: 'Estados Unidos' },
] as const

export type NewDestination = {
  id: string
  accountId: string
  campaign: { mode: 'new'; name: string; objective: Objective } | { mode: 'existing'; id: string; name: string }
  adset: { name: string; dailyBudget: number; countries: string[]; ageMin: number; ageMax: number; genders: 'all' | 'male' | 'female'; pixelId?: string; destination?: 'WHATSAPP' }
  created?: { campaignId: string; adsetId: string }
}

export const isNewDestinationId = (id: string) => id.startsWith('new_')

export function destinationToAdset(destination: NewDestination): BulkAdset {
  return {
    id: destination.id,
    name: destination.adset.name,
    campaignId: destination.campaign.mode === 'existing' ? destination.campaign.id : `${destination.id}_campaign`,
    campaignName: destination.campaign.name,
    status: 'NEW',
    accountId: destination.accountId,
    destination: destination.adset.destination,
  }
}

export type CreativeSuggestion = {
  id: string
  format: string
  ratios: Ratio[]
  title: string
  hook: string
  copy: string
  headline: string
  basis: string
}

export type BulkAdset = { id: string; name: string; campaignId: string; campaignName: string; status: string; accountId?: string; destination?: string }

export const isWhatsappAdset = (adset?: BulkAdset) => adset?.destination === 'WHATSAPP'

const STATUS_LABELS: Record<string, string> = {
  NEW: 'Nuevo',
  ACTIVE: 'Activa',
  PAUSED: 'Pausada',
  CAMPAIGN_PAUSED: 'Campaña pausada',
  IN_PROCESS: 'En proceso',
  WITH_ISSUES: 'Con problemas',
}

export const adsetStatusLabel = (status: string) => STATUS_LABELS[status.toUpperCase()] ?? (status ? status : 'Sin estado')
export const isAdsetActive = (status: string) => status.toUpperCase() === 'ACTIVE'

export function groupAdsetsByCampaign(adsets: BulkAdset[]) {
  const groups = new Map<string, { campaignName: string; adsets: BulkAdset[] }>()
  for (const adset of adsets) {
    const key = adset.campaignId || adset.campaignName
    const group = groups.get(key) ?? { campaignName: adset.campaignName, adsets: [] }
    group.adsets.push(adset)
    groups.set(key, group)
  }
  return [...groups.entries()].map(([key, group]) => ({ key, ...group }))
}

export type BulkDefaults = {
  adsetId: string
  cta: CTA
}

export type PublishInitialStatus = 'PAUSED' | 'ACTIVE'

export const PRIMARY_TEXT_LIMIT = 125
export const HEADLINE_LIMIT = 40
