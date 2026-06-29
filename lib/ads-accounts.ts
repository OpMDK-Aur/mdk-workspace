import { createClient } from '@supabase/supabase-js'
import { AdsAccount } from './types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const supabase = createClient(supabaseUrl, supabaseKey)

/**
 * Obtiene todas las cuentas publicitarias para un cliente
 */
export async function getClientAdsAccounts(clientId: string): Promise<AdsAccount[]> {
  try {
    const { data, error } = await supabase
      .from('ads_accounts')
      .select('*')
      .eq('client_id', clientId)
    
    if (error) {
      console.error('[v0] Error fetching ads accounts:', error)
      return []
    }
    
    return data || []
  } catch (err) {
    console.error('[v0] Error in getClientAdsAccounts:', err)
    return []
  }
}

/**
 * Obtiene una cuenta publicitaria específica
 */
export async function getAdsAccount(accountId: string, clientId: string): Promise<AdsAccount | null> {
  try {
    const { data, error } = await supabase
      .from('ads_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('client_id', clientId)
      .single()
    
    if (error) {
      console.error('[v0] Error fetching ads account:', error)
      return null
    }
    
    return data || null
  } catch (err) {
    console.error('[v0] Error in getAdsAccount:', err)
    return null
  }
}

/**
 * Crea o actualiza una cuenta publicitaria
 */
export async function upsertAdsAccount(
  clientId: string,
  platform: 'google_ads' | 'meta_ads',
  accountId: string,
  accountName: string
): Promise<AdsAccount | null> {
  try {
    const { data, error } = await supabase
      .from('ads_accounts')
      .upsert({
        client_id: clientId,
        platform,
        account_id: accountId,
        account_name: accountName,
      }, {
        onConflict: 'client_id,platform,account_id'
      })
      .select()
      .single()
    
    if (error) {
      console.error('[v0] Error upserting ads account:', error)
      return null
    }
    
    return data || null
  } catch (err) {
    console.error('[v0] Error in upsertAdsAccount:', err)
    return null
  }
}

/**
 * Obtiene las cuentas de una plataforma específica
 */
export async function getPlatformAccounts(
  clientId: string,
  platform: 'google_ads' | 'meta_ads'
): Promise<AdsAccount[]> {
  try {
    const { data, error } = await supabase
      .from('ads_accounts')
      .select('*')
      .eq('client_id', clientId)
      .eq('platform', platform)
    
    if (error) {
      console.error('[v0] Error fetching platform accounts:', error)
      return []
    }
    
    return data || []
  } catch (err) {
    console.error('[v0] Error in getPlatformAccounts:', err)
    return []
  }
}

/**
 * Formatea una cuenta publicitaria para mostrar: "Nombre (ID) - Plataforma"
 */
export function formatAdsAccount(account: AdsAccount): string {
  const platformLabel = account.platform === 'google_ads' ? 'Google Ads' : 'Meta Ads'
  return `${account.account_name} (${account.account_id}) - ${platformLabel}`
}

/**
 * Crea un resumen de todas las cuentas por plataforma
 */
export async function getAccountsSummary(clientId: string): Promise<{
  googleAds: AdsAccount[]
  metaAds: AdsAccount[]
}> {
  try {
    const [googleAccounts, metaAccounts] = await Promise.all([
      getPlatformAccounts(clientId, 'google_ads'),
      getPlatformAccounts(clientId, 'meta_ads'),
    ])
    
    return {
      googleAds: googleAccounts,
      metaAds: metaAccounts,
    }
  } catch (err) {
    console.error('[v0] Error in getAccountsSummary:', err)
    return {
      googleAds: [],
      metaAds: [],
    }
  }
}
