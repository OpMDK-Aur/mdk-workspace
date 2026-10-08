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

export type BulkAdset = { id: string; name: string }

export type BulkDefaults = {
  adsetId: string
  cta: CTA
}

export type PublishInitialStatus = 'PAUSED' | 'ACTIVE'

export const PRIMARY_TEXT_LIMIT = 125
export const HEADLINE_LIMIT = 40
