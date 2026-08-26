/**
 * Construye un link directo a la cuenta/campaña analizada en la plataforma
 * de ads correspondiente, para que las recomendaciones del Performance
 * Analyst se puedan accionar sin tener que buscar manualmente la campaña.
 */
export type AdsPlatform = 'google' | 'meta'

export function buildAdsPlatformLink(platform: AdsPlatform, accountId: string, campaignId?: string | null): string {
  if (platform === 'meta') {
    // Meta Ads Manager identifica las cuentas con el prefijo "act_"; lo
    // normalizamos por si el account_id ya lo incluye o no.
    const act = accountId.startsWith('act_') ? accountId : `act_${accountId}`
    const base = `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${act}`
    return campaignId ? `${base}&selected_campaign_ids=${campaignId}` : base
  }
  // Google Ads identifica la cuenta con el customer ID (sin guiones) vía el
  // parámetro "ocid". No siempre es exactamente el ocid ofuscado, pero es el
  // mejor deep-link posible sin una llamada adicional a la API de Google.
  const ocid = accountId.replace(/-/g, '')
  const base = `https://ads.google.com/aw/campaigns?ocid=${ocid}`
  return campaignId ? `${base}&campaignId=${campaignId}` : base
}

export function platformLabel(platform: AdsPlatform): string {
  return platform === 'meta' ? 'Meta Ads' : 'Google Ads'
}
