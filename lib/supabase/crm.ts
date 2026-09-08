import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const crmUrl = process.env.SUPABASE_AURELIA_CRM_URL
const crmPublishableKey = process.env.SUPABASE_CRM_AURELIA_PUBLISHED_API_KEY

if (!crmUrl || !crmPublishableKey) {
  throw new Error(
    'Missing SUPABASE_AURELIA_CRM_URL or SUPABASE_CRM_AURELIA_PUBLISHED_API_KEY',
  )
}

/**
 * Creates a client for the Aurelia CRM Supabase project.
 * Keep this client server-side and rely on the CRM project's RLS policies.
 */
export function createCrmClient() {
  return createSupabaseClient(crmUrl, crmPublishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
