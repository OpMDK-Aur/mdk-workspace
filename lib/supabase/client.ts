import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function createClient() {
  if (client) {
    return client
  }
  
  client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        lock: 'no-op',
        storageKey: 'sb-auth-token',
        flowType: 'pkce',
        detectSessionInUrl: true,
        persistSession: true,
      },
    }
  )
  
  return client
}
