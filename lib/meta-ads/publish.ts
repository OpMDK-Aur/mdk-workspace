import { getMetaAccessToken } from './token'

const META_API_VERSION = process.env.META_API_VERSION || 'v25.0'
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`

export type CampaignObjective = 'OUTCOME_TRAFFIC' | 'OUTCOME_AWARENESS' | 'OUTCOME_ENGAGEMENT' | 'OUTCOME_LEADS' | 'OUTCOME_SALES'
export type PublishStatus = 'PAUSED' | 'ACTIVE'

export type NewAdsetInput = {
  name: string
  dailyBudget: number
  countries: string[]
  ageMin: number
  ageMax: number
  genders: 'all' | 'male' | 'female'
  pixelId?: string
  destination?: 'WHATSAPP'
  pageId?: string
}

export type StructureInput = {
  accountId: string
  status: PublishStatus
  campaign: { mode: 'existing'; id: string } | { mode: 'new'; name: string; objective: CampaignObjective }
  adset: NewAdsetInput
}

export type SourceAdMedia = { accountId: string; kind: 'image' | 'video'; imageHash?: string; imageUrl?: string; videoId?: string; thumbnail?: string }

export type AdAssetInput = { url: string; kind: 'image' | 'video'; name: string; source?: SourceAdMedia }

export type LibraryAd = { id: string; name: string; status: string; campaignName: string; accountId: string; createdTime: string; kind: 'image' | 'video'; thumbnail: string | null; primaryText: string; headline: string }

type Text = { text?: string }
type RawAdCreative = {
  body?: string; title?: string; image_hash?: string; image_url?: string; thumbnail_url?: string; video_id?: string
  object_story_spec?: {
    link_data?: { message?: string; name?: string; image_hash?: string; picture?: string; child_attachments?: unknown[] }
    video_data?: { message?: string; title?: string; video_id?: string; image_url?: string }
  }
  asset_feed_spec?: { bodies?: Text[]; titles?: Text[]; images?: Array<{ hash?: string; url?: string }>; videos?: Array<{ video_id?: string; thumbnail_url?: string }> }
}
type RawAd = { id: string; name?: string; effective_status?: string; created_time?: string; account_id?: string; campaign?: { name?: string }; creative?: RawAdCreative }

const AD_LIBRARY_CREATIVE = 'creative.thumbnail_width(400).thumbnail_height(400){body,title,image_hash,image_url,thumbnail_url,video_id,object_story_spec,asset_feed_spec}'

function creativeCopy(creative: RawAdCreative = {}) {
  const story = creative.object_story_spec
  const feed = creative.asset_feed_spec
  return {
    primaryText: creative.body || story?.link_data?.message || story?.video_data?.message || feed?.bodies?.[0]?.text || '',
    headline: creative.title || story?.link_data?.name || story?.video_data?.title || feed?.titles?.[0]?.text || '',
  }
}

// Carruseles quedan afuera: la carga masiva publica una sola pieza por anuncio.
function creativeMedia(accountId: string, creative: RawAdCreative = {}): SourceAdMedia | null {
  const story = creative.object_story_spec
  const feed = creative.asset_feed_spec
  if (story?.link_data?.child_attachments?.length) return null
  const videoId = creative.video_id || story?.video_data?.video_id || feed?.videos?.[0]?.video_id
  const thumbnail = creative.thumbnail_url || story?.video_data?.image_url || feed?.videos?.[0]?.thumbnail_url || creative.image_url
  if (videoId) return { accountId, kind: 'video', videoId, thumbnail }
  const imageHash = creative.image_hash || story?.link_data?.image_hash || feed?.images?.[0]?.hash
  const imageUrl = creative.image_url || story?.link_data?.picture || feed?.images?.[0]?.url || creative.thumbnail_url
  if (!imageHash && !imageUrl) return null
  return { accountId, kind: 'image', imageHash, imageUrl, thumbnail: creative.thumbnail_url || imageUrl }
}

export type AdInput = {
  adsetId: string
  pageId: string
  status: PublishStatus
  name: string
  primaryText: string
  headline: string
  cta: string
  link: string
  asset: AdAssetInput
}

export class MetaPublishError extends Error {
  constructor(message: string, readonly step: string) {
    super(message)
  }
}

const CTA_TYPES: Record<string, string> = {
  'Más información': 'LEARN_MORE',
  'Enviar mensaje': 'CONTACT_US',
  'Registrarte': 'SIGN_UP',
  'Comprar': 'SHOP_NOW',
}

// Meta expresa los presupuestos en la unidad mínima de la moneda; estas monedas no tienen decimales.
const ZERO_DECIMAL_CURRENCIES = new Set(['CLP', 'COP', 'CRC', 'HUF', 'ISK', 'IDR', 'JPY', 'KRW', 'PYG', 'TWD', 'VND'])

const OPTIMIZATION: Record<CampaignObjective, { goal: string; destination?: string; event?: string }> = {
  OUTCOME_TRAFFIC: { goal: 'LINK_CLICKS', destination: 'WEBSITE' },
  OUTCOME_AWARENESS: { goal: 'REACH' },
  OUTCOME_ENGAGEMENT: { goal: 'POST_ENGAGEMENT' },
  OUTCOME_LEADS: { goal: 'OFFSITE_CONVERSIONS', destination: 'WEBSITE', event: 'LEAD' },
  OUTCOME_SALES: { goal: 'OFFSITE_CONVERSIONS', destination: 'WEBSITE', event: 'PURCHASE' },
}

const WHATSAPP_OPTIMIZATION: { goal: string; destination?: string; event?: string } = { goal: 'CONVERSATIONS', destination: 'WHATSAPP' }
const WHATSAPP_LINK = 'https://api.whatsapp.com/send'

async function token() {
  const value = await getMetaAccessToken()
  if (!value) throw new MetaPublishError('META_ADS_ACCESS_TOKEN no está configurado.', 'config')
  return value
}

async function graph<T>(step: string, path: string, init?: { method?: 'GET' | 'POST'; params?: Record<string, string> }): Promise<T> {
  const method = init?.method ?? 'GET'
  const params = new URLSearchParams({ ...(init?.params ?? {}), access_token: await token() })
  const url = method === 'GET' ? `${META_BASE_URL}/${path}?${params}` : `${META_BASE_URL}/${path}`
  const response = await fetch(url, method === 'GET' ? { cache: 'no-store' } : { method, body: params, cache: 'no-store' })
  const payload = await response.json().catch(() => null) as ({ error?: { message?: string; error_user_msg?: string; error_user_title?: string } } & T) | null
  if (!response.ok || payload?.error) {
    const error = payload?.error
    throw new MetaPublishError(error?.error_user_msg || error?.message || `Meta respondió ${response.status}.`, step)
  }
  return payload as T
}

const act = (accountId: string) => `act_${accountId.replace(/^act_/, '')}`

export async function getAdsetAccountId(adsetId: string) {
  const adset = await graph<{ account_id: string }>('conjunto', adsetId, { params: { fields: 'account_id' } })
  return adset.account_id
}

export async function listPixels(accountId: string) {
  const result = await graph<{ data: Array<{ id: string; name: string }> }>('píxeles', `${act(accountId)}/adspixels`, { params: { fields: 'id,name', limit: '50' } })
  return result.data ?? []
}

async function getCampaignObjective(campaignId: string) {
  const campaign = await graph<{ objective: CampaignObjective }>('campaña', campaignId, { params: { fields: 'objective' } })
  return campaign.objective
}

export async function createStructure(input: StructureInput) {
  const account = await graph<{ currency: string }>('cuenta', act(input.accountId), { params: { fields: 'currency' } })
  const multiplier = ZERO_DECIMAL_CURRENCIES.has(account.currency) ? 1 : 100

  let campaignId: string
  let objective: CampaignObjective
  if (input.campaign.mode === 'new') {
    const created = await graph<{ id: string }>('campaña', `${act(input.accountId)}/campaigns`, {
      method: 'POST',
      params: {
        name: input.campaign.name,
        objective: input.campaign.objective,
        status: input.status,
        special_ad_categories: '[]',
        is_adset_budget_sharing_enabled: 'false',
      },
    })
    campaignId = created.id
    objective = input.campaign.objective
  } else {
    campaignId = input.campaign.id
    objective = await getCampaignObjective(campaignId)
  }

  const whatsapp = input.adset.destination === 'WHATSAPP'
  if (whatsapp && objective !== 'OUTCOME_ENGAGEMENT') {
    throw new MetaPublishError('El destino WhatsApp solo se puede usar en campañas con objetivo Interacción.', 'conjunto')
  }
  const optimization = whatsapp ? WHATSAPP_OPTIMIZATION : OPTIMIZATION[objective] ?? OPTIMIZATION.OUTCOME_TRAFFIC
  if (optimization.event && !input.adset.pixelId) {
    throw new MetaPublishError('Este objetivo necesita un píxel para optimizar conversiones.', 'conjunto')
  }

  const targeting: Record<string, unknown> = {
    geo_locations: { countries: input.adset.countries },
    age_min: input.adset.ageMin,
    age_max: input.adset.ageMax,
    targeting_automation: { advantage_audience: 0 },
  }
  if (input.adset.genders !== 'all') targeting.genders = [input.adset.genders === 'male' ? 1 : 2]

  const adsetParams: Record<string, string> = {
    name: input.adset.name,
    campaign_id: campaignId,
    daily_budget: String(Math.round(input.adset.dailyBudget * multiplier)),
    billing_event: 'IMPRESSIONS',
    optimization_goal: optimization.goal,
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    targeting: JSON.stringify(targeting),
    status: input.status,
  }
  if (optimization.destination) adsetParams.destination_type = optimization.destination
  if (whatsapp) {
    adsetParams.promoted_object = JSON.stringify({ page_id: input.adset.pageId })
  } else if (optimization.event && input.adset.pixelId) {
    adsetParams.promoted_object = JSON.stringify({ pixel_id: input.adset.pixelId, custom_event_type: optimization.event })
  }

  const adset = await graph<{ id: string }>('conjunto', `${act(input.accountId)}/adsets`, { method: 'POST', params: adsetParams })
  return { campaignId, adsetId: adset.id }
}

async function uploadImage(accountId: string, asset: AdAssetInput) {
  const file = await fetch(asset.url, { cache: 'no-store' })
  if (!file.ok) throw new MetaPublishError(`No se pudo leer el archivo ${asset.name}.`, 'imagen')
  const bytes = Buffer.from(await file.arrayBuffer()).toString('base64')
  const result = await graph<{ images: Record<string, { hash: string }> }>('imagen', `${act(accountId)}/adimages`, { method: 'POST', params: { bytes, name: asset.name } })
  const hash = Object.values(result.images ?? {})[0]?.hash
  if (!hash) throw new MetaPublishError(`Meta no devolvió el hash de ${asset.name}.`, 'imagen')
  return hash
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function uploadVideo(accountId: string, asset: AdAssetInput) {
  const { id } = await graph<{ id: string }>('video', `${act(accountId)}/advideos`, { method: 'POST', params: { file_url: asset.url, name: asset.name } })
  // Meta necesita una miniatura para el creativo y la genera recién cuando termina de procesar el video.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const video = await graph<{ status?: { video_status?: string }; picture?: string }>('video', id, { params: { fields: 'status,picture' } })
    if (video.status?.video_status === 'error') throw new MetaPublishError(`Meta no pudo procesar el video ${asset.name}.`, 'video')
    if (video.status?.video_status === 'ready' && video.picture) return { videoId: id, thumbnail: video.picture }
    await wait(2500)
  }
  throw new MetaPublishError(`El video ${asset.name} sigue procesándose en Meta. Reintentá en unos minutos.`, 'video')
}

async function sourceVideo(source: SourceAdMedia) {
  const videoId = source.videoId as string
  if (source.thumbnail) return { videoId, thumbnail: source.thumbnail }
  const video = await graph<{ picture?: string }>('video', videoId, { params: { fields: 'picture' } })
  if (!video.picture) throw new MetaPublishError('No se pudo obtener la miniatura del video original.', 'video')
  return { videoId, thumbnail: video.picture }
}

// Los hashes de imagen son propios de cada cuenta: en otra cuenta la imagen se vuelve a subir.
async function sourceImageHash(accountId: string, asset: AdAssetInput) {
  const source = asset.source as SourceAdMedia
  if (source.imageHash && source.accountId.replace(/^act_/, '') === accountId.replace(/^act_/, '')) return source.imageHash
  if (!source.imageUrl) throw new MetaPublishError(`No se pudo copiar la imagen de ${asset.name} a esta cuenta.`, 'imagen')
  return uploadImage(accountId, { ...asset, url: source.imageUrl })
}

export async function listLibraryAds(accountId: string): Promise<LibraryAd[]> {
  const result = await graph<{ data?: RawAd[] }>('biblioteca', `${act(accountId)}/ads`, {
    params: { fields: `id,name,effective_status,created_time,account_id,campaign{name},${AD_LIBRARY_CREATIVE}`, limit: '100' },
  })
  return (result.data ?? []).flatMap((ad) => {
    const media = creativeMedia(ad.account_id ?? accountId, ad.creative)
    if (!media) return []
    return [{
      id: ad.id,
      name: ad.name ?? `Anuncio ${ad.id}`,
      status: ad.effective_status ?? '',
      campaignName: ad.campaign?.name ?? '',
      accountId: ad.account_id ?? accountId,
      createdTime: ad.created_time ?? '',
      kind: media.kind,
      thumbnail: media.thumbnail ?? null,
      ...creativeCopy(ad.creative),
    }]
  })
}

export async function getSourceAdMedia(adId: string) {
  const ad = await graph<RawAd>('anuncio de origen', adId, { params: { fields: `account_id,${AD_LIBRARY_CREATIVE}` } })
  const media = creativeMedia(ad.account_id ?? '', ad.creative)
  if (!media || !ad.account_id) throw new MetaPublishError('El anuncio elegido no tiene una imagen o video reutilizable.', 'anuncio de origen')
  return media
}

export async function createAd(input: AdInput) {
  const adset = await graph<{ account_id: string; destination_type?: string }>('conjunto', input.adsetId, { params: { fields: 'account_id,destination_type' } })
  const accountId = adset.account_id
  const whatsapp = adset.destination_type === 'WHATSAPP'
  if (!whatsapp && !/^https?:\/\//i.test(input.link)) throw new MetaPublishError('Falta la URL de destino del anuncio.', 'anuncio')
  const link = whatsapp ? WHATSAPP_LINK : input.link
  const callToAction = whatsapp
    ? { type: 'WHATSAPP_MESSAGE', value: { app_destination: 'WHATSAPP', link } }
    : { type: CTA_TYPES[input.cta] ?? 'LEARN_MORE', value: { link } }

  let objectStorySpec: Record<string, unknown>
  if (input.asset.kind === 'video') {
    const { videoId, thumbnail } = input.asset.source?.videoId ? await sourceVideo(input.asset.source) : await uploadVideo(accountId, input.asset)
    objectStorySpec = { page_id: input.pageId, video_data: { video_id: videoId, image_url: thumbnail, message: input.primaryText, title: input.headline, call_to_action: callToAction } }
  } else {
    const hash = input.asset.source ? await sourceImageHash(accountId, input.asset) : await uploadImage(accountId, input.asset)
    objectStorySpec = { page_id: input.pageId, link_data: { image_hash: hash, link, message: input.primaryText, name: input.headline, call_to_action: callToAction } }
  }

  const creative = await graph<{ id: string }>('creativo', `${act(accountId)}/adcreatives`, {
    method: 'POST',
    params: { name: input.name, object_story_spec: JSON.stringify(objectStorySpec) },
  })
  const ad = await graph<{ id: string }>('anuncio', `${act(accountId)}/ads`, {
    method: 'POST',
    params: { name: input.name, adset_id: input.adsetId, creative: JSON.stringify({ creative_id: creative.id }), status: input.status },
  })
  return { adId: ad.id, creativeId: creative.id, accountId }
}
