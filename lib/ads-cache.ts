import { createClient } from '@/lib/supabase/server'

const CACHE_TTL_HOURS = 1

function buildCacheKey(platform: string, accountId: string, dateRange: string, start?: string, end?: string): string {
  const range = dateRange === 'custom' && start && end ? `${start}_${end}` : dateRange
  return `${platform}:${accountId}:${range}`
}

export async function getCachedAdsData(
  platform: string,
  accountId: string,
  dateRange: string,
  start?: string,
  end?: string
): Promise<any | null> {
  try {
    const supabase = await createClient()
    const key = buildCacheKey(platform, accountId, dateRange, start, end)

    const { data, error } = await supabase
      .from('ads_cache')
      .select('payload, expires_at')
      .eq('cache_key', key)
      .single()

    if (error || !data) return null

    // Check expiry
    if (new Date(data.expires_at) < new Date()) {
      // Delete stale row async (don't await)
      supabase.from('ads_cache').delete().eq('cache_key', key)
      return null
    }

    return data.payload
  } catch {
    return null
  }
}

export async function setCachedAdsData(
  platform: string,
  accountId: string,
  dateRange: string,
  payload: any,
  start?: string,
  end?: string
): Promise<void> {
  try {
    const supabase = await createClient()
    const key = buildCacheKey(platform, accountId, dateRange, start, end)
    const now = new Date()
    const expiresAt = new Date(now.getTime() + CACHE_TTL_HOURS * 60 * 60 * 1000)

    await supabase
      .from('ads_cache')
      .upsert(
        {
          cache_key: key,
          platform,
          account_id: accountId,
          date_range: dateRange === 'custom' && start && end ? `${start}_${end}` : dateRange,
          payload,
          fetched_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
        },
        { onConflict: 'cache_key' }
      )
  } catch {
    // Cache write failure is non-fatal
  }
}
