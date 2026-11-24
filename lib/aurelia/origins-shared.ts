/** Origen de una venta: sale del referral del primer mensaje entrante del contacto en la cuenta de Aurelia. */
export type ClientOrigin = {
  /** `referral`: tiene anuncio/campaña; `organic`: el contacto existe pero ningún mensaje trae referral; `no-contact`: no se encontró el teléfono. */
  kind: 'referral' | 'organic' | 'no-contact'
  /** Canal ("Meta WhatsApp", "Meta Formulario", "Google"...) o null si no hay referral. */
  channel: string | null
  /** Etiqueta completa, p. ej. "Meta WhatsApp · Campaña Noviembre". */
  label: string | null
  referralAt: string | null
}

export type AureliaOriginsData =
  | { available: false; message: string }
  | { available: true; origins: Record<string, ClientOrigin>; generatedAt: string }

export const ORGANIC_LABEL = 'Sin referral'
export const NO_CONTACT_LABEL = 'Sin contacto en el CRM'

/** Últimos 10 dígitos: ignora el prefijo de país y el 9 de los celulares argentinos. */
export const phoneKey = (value: string | null | undefined) => {
  const digits = (value ?? '').replace(/\D/g, '').slice(-10)
  return digits.length >= 8 ? digits : null
}

export function originFromLabel(label: string | null, referralAt: string | null): ClientOrigin {
  if (!label) return { kind: 'organic', channel: null, label: null, referralAt: null }
  const separator = label.indexOf(' · ')
  return { kind: 'referral', channel: separator === -1 ? 'Otro' : label.slice(0, separator), label, referralAt }
}

export function originChannelLabel(origin: ClientOrigin | undefined) {
  if (!origin || origin.kind === 'no-contact') return NO_CONTACT_LABEL
  return origin.kind === 'organic' ? ORGANIC_LABEL : origin.channel ?? 'Otro'
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
