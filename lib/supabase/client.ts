import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function createClient() {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    
    if (!url || !key) {
      console.error('[v0] Supabase env vars missing:', { 
        hasUrl: !!url, 
        hasKey: !!key,
        url: url ? url.substring(0, 30) + '...' : 'undefined'
      })
      throw new Error('Supabase configuration missing. Please add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to environment variables.')
    }
    
    client = createBrowserClient(url, key)
  }
  return client
}
