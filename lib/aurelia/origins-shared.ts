/** Origen de una venta: sale del referral del primer mensaje entrante del contacto en la cuenta de Aurelia. */
export type ClientOrigin = {
  /** `referral`: tiene anuncio/campaña; `organic`: el contacto existe pero ningún mensaje trae referral; `no-contact`: no se encontró el teléfono. */
  kind: 'referral' | 'organic' | 'no-contact'
  /** Canal ("Meta WhatsApp", "Meta Formulario", "Google"...) o null si no hay referral. */
  channel: string | null
  /** Etiqueta completa, p. ej. "Meta WhatsApp · Campaña Noviembre". */
  label: string | null
  referralAt: string | null
  /** De dónde salió el dato: el referral de los mensajes del CRM o la atribución del contacto en GoHighLevel. */
  source?: 'crm' | 'ghl'
  /** Primera y última atribución del contacto en GoHighLevel, tal como las muestra GHL (pagas u orgánicas). */
  ghlFirst?: AttributionTouch | null
  ghlLast?: AttributionTouch | null
}

/** Un punto de contacto de la atribución: "Meta Formulario · Potenciales", "Redes orgánicas · Instagram", "Directo"... */
export type AttributionTouch = { channel: string; label: string; paid: boolean }

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)
const readText = (record: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}
const urlParam = (url: string | null, name: string) => {
  if (!url) return null
  try { return new URL(url).searchParams.get(name)?.trim() || null } catch { return null }
}
const hostName = (url: string | null) => {
  if (!url) return null
  try { return new URL(url.includes('://') ? url : `https://${url}`).hostname.replace(/^(www|l|m|lm)\./, '') } catch { return null }
}
const NETWORK_NAMES: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', whatsapp: 'WhatsApp', tiktok: 'TikTok', youtube: 'YouTube', linkedin: 'LinkedIn', google: 'Google' }
const networkName = (...values: Array<string | null>) => {
  for (const value of values) {
    const lower = value?.toLowerCase() ?? ''
    const match = Object.keys(NETWORK_NAMES).find((key) => lower.includes(key))
    if (match) return NETWORK_NAMES[match]
  }
  return null
}

/**
 * Traduce un objeto de atribución de GoHighLevel (attributionSource / lastAttributionSource) a una etiqueta.
 * A diferencia del referral del CRM, también describe los orígenes orgánicos (redes, directo, búsqueda,
 * carga manual), porque GHL siempre registra de dónde llegó el contacto.
 */
export function describeGhlAttribution(attribution: Record<string, unknown> | null | undefined, contactSource?: string | null): AttributionTouch | null {
  if (!attribution || typeof attribution !== 'object') return null
  const url = readText(attribution, 'url')
  const session = (readText(attribution, 'sessionSource') ?? '').toLowerCase()
  const utmSource = (readText(attribution, 'utmSource', 'utm_source') ?? urlParam(url, 'utm_source') ?? '').toLowerCase()
  const medium = (readText(attribution, 'medium', 'utmMedium', 'utm_medium') ?? '').toLowerCase()
  const referrer = readText(attribution, 'referrer')
  const campaign = readText(attribution, 'utmCampaign', 'utm_campaign', 'campaign', 'campaignName') ?? urlParam(url, 'utm_campaign') ?? readText(attribution, 'adName', 'utmContent', 'adSetName') ?? urlParam(url, 'utm_content')
  const has = (...keys: string[]) => keys.some((key) => readText(attribution, key) !== null)
  const lowerSource = (contactSource ?? '').toLowerCase()
  if (!session && !utmSource && !medium && !campaign && !referrer && !url) return null

  const isWhatsApp = has('ctwaClid', 'ctwa_clid')
  const isGoogle = session === 'paid search' || has('gclid', 'gbraid', 'wbraid', 'gadCampaignId') || utmSource.includes('google') || medium.includes('google')
  const isPaid = session.startsWith('paid') || isWhatsApp || has('gclid', 'fbclid', 'adId', 'adName', 'campaignId') || ['cpc', 'ppc', 'paid', 'ads'].some((name) => medium === name || utmSource === name)
  if (isPaid) {
    const channel = isGoogle ? 'Google' : isWhatsApp || medium.includes('whatsapp') || lowerSource.includes('whatsapp') ? 'Meta WhatsApp' : 'Meta Formulario'
    return { channel, label: `${channel} · ${campaign ?? (channel === 'Google' ? 'Google Ads' : 'Meta Ads')}`, paid: true }
  }

  const network = networkName(hostName(referrer), medium, utmSource)
  const detail = medium === 'calendar' ? 'Calendario' : medium === 'form' || medium === 'survey' ? 'Formulario web' : null
  const build = (channel: string, ...parts: Array<string | null>) => {
    const suffix = parts.filter(Boolean).join(' · ')
    return { channel, label: suffix ? `${channel} · ${suffix}` : channel, paid: false }
  }
  if (session === 'social media') return build('Redes orgánicas', network, detail)
  if (session === 'organic search') return build('Búsqueda orgánica', network, detail)
  if (session === 'direct traffic') return build('Directo', detail)
  if (session === 'referral') return build('Sitio referido', hostName(referrer), detail)
  if (session === 'crm ui') return build('Carga manual', medium === 'csv_import' ? 'Importación CSV' : null)
  if (session === 'crm workflows') return build('Automatización de GHL')
  if (session === 'third party') return build('Integración externa', capitalize(medium || '') || null)
  if (session === 'other') return build('Otro', network, detail)
  if (session) return build(capitalize(session), network, detail)
  if (campaign) return build('Otro', campaign)
  return network ? build('Redes orgánicas', network, detail) : null
}

export type AureliaOriginsData =
  | { available: false; message: string }
  | { available: true; origins: Record<string, ClientOrigin>; generatedAt: string; ghl: { connected: boolean; contacts: number; error: string | null } }

export const normalizeEmail = (value: string | null | undefined) => {
  const email = (value ?? '').trim().toLowerCase()
  return email.includes('@') ? email : null
}

export const ORGANIC_LABEL = 'Sin referral'
export const NO_CONTACT_LABEL = 'Sin contacto en el CRM'

/** Últimos 10 dígitos: ignora el prefijo de país y el 9 de los celulares argentinos. */
export const phoneKey = (value: string | null | undefined) => {
  const digits = (value ?? '').replace(/\D/g, '').slice(-10)
  return digits.length >= 8 ? digits : null
}

export function originFromLabel(label: string | null, referralAt: string | null, source: ClientOrigin['source'] = 'crm'): ClientOrigin {
  if (!label) return { kind: 'organic', channel: null, label: null, referralAt: null, source }
  const separator = label.indexOf(' · ')
  return { kind: 'referral', channel: separator === -1 ? 'Otro' : label.slice(0, separator), label, referralAt, source }
}

/**
 * Combina el origen del CRM con el de GoHighLevel: manda el referral del CRM; si no hay, se usa la
 * atribución de GHL; y si ninguno tiene campaña, cuenta como sin referral cuando el contacto existe en alguno.
 */
export function mergeOrigins(crm: ClientOrigin, ghl: ClientOrigin | null): ClientOrigin {
  if (!ghl) return crm
  const touches = { ghlFirst: ghl.ghlFirst ?? null, ghlLast: ghl.ghlLast ?? null }
  if (crm.kind === 'referral') return { ...crm, ...touches }
  if (ghl.kind === 'referral' || ghl.channel) return ghl
  return crm.kind === 'no-contact' ? ghl : { ...crm, ...touches }
}

/**
 * Origen a partir de la primera y la última atribución de GHL: gana el primer toque pago; si el primero fue
 * orgánico y el último vino de un anuncio, el anuncio; si ninguno es pago, el primer toque orgánico, salvo que
 * sea poco informativo (directo, carga manual) y el último diga más (p. ej. Instagram).
 */
/** Orígenes que no dicen de dónde vino la persona: si el último toque es más concreto, se usa ese. */
const WEAK_CHANNELS = new Set(['Directo', 'Carga manual', 'Otro', 'Automatización de GHL'])

export function originFromGhlTouches(first: AttributionTouch | null, last: AttributionTouch | null, at: string | null): ClientOrigin {
  const informativeLast = last && !WEAK_CHANNELS.has(last.channel) && (!first || WEAK_CHANNELS.has(first.channel)) ? last : null
  const main = [first, last].find((touch) => touch?.paid) ?? informativeLast ?? first ?? last
  const base = { referralAt: at, source: 'ghl' as const, ghlFirst: first, ghlLast: last }
  if (!main) return { kind: 'organic', channel: null, label: null, ...base, referralAt: null }
  return { kind: main.paid ? 'referral' : 'organic', channel: main.channel, label: main.label, ...base }
}

export function originChannelLabel(origin: ClientOrigin | undefined) {
  if (!origin || (origin.kind === 'no-contact' && !origin.channel)) return NO_CONTACT_LABEL
  if (origin.kind === 'organic') return origin.channel ?? ORGANIC_LABEL
  return origin.channel ?? 'Otro'
}

/** Campaña o anuncio sin el canal adelante. */
export function originCampaign(origin: ClientOrigin | undefined) {
  if (!origin?.label) return null
  const separator = origin.label.indexOf(' · ')
  return separator === -1 ? origin.label : origin.label.slice(separator + 3)
}

export type OriginGroup = { channel: string; count: number; campaigns: Array<{ name: string; count: number }> }

export function groupOrigins(clientIds: string[], origins: Record<string, ClientOrigin>): OriginGroup[] {
  const groups = new Map<string, Map<string, number>>()
  for (const id of clientIds) {
    const origin = origins[id]
    const channel = originChannelLabel(origin)
    const campaigns = groups.get(channel) ?? new Map<string, number>()
    const campaign = originCampaign(origin)
    if (campaign) campaigns.set(campaign, (campaigns.get(campaign) ?? 0) + 1)
    else campaigns.set('', (campaigns.get('') ?? 0) + 1)
    groups.set(channel, campaigns)
  }
  return [...groups.entries()]
    .map(([channel, campaigns]) => ({
      channel,
      count: [...campaigns.values()].reduce((sum, value) => sum + value, 0),
      campaigns: [...campaigns.entries()].filter(([name]) => name).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.count - a.count)
}
