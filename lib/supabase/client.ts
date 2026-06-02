import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient, User } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function createClient() {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    client = createBrowserClient(url, key)
  }
  return client
}

// Serialized auth.getUser() to prevent "Lock broken" errors
let userPromise: Promise<{ data: { user: User | null }, error: Error | null }> | null = null
let userCache: { user: User | null, timestamp: number } | null = null
const CACHE_TTL = 5000 // 5 seconds

export async function getAuthUser() {
  const now = Date.now()
  
  // Return cached user if still valid
  if (userCache && (now - userCache.timestamp) < CACHE_TTL) {
    return { data: { user: userCache.user }, error: null }
  }
  
  // If a request is already in flight, wait for it
  if (userPromise) {
    return userPromise
  }
  
  // Start new request
  const supabase = createClient()
  userPromise = supabase.auth.getUser().then(result => {
    userCache = { user: result.data.user, timestamp: Date.now() }
    userPromise = null
    return result
  }).catch(err => {
    userPromise = null
    throw err
  })
  
  return userPromise
}
