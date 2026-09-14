import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Creates a client for the Aurelia CRM Supabase project.
 * Keep this client server-side and rely on the CRM project's RLS policies.
 */
export function createCrmClient() {
  const crmUrl = process.env.SUPABASE_AURELIA_CRM_URL?.trim() || process.env.SUPABASE_CRM_AURELIA_URL?.trim()
  const crmPublishableKey = process.env.SUPABASE_CRM_AURELIA_PUBLISHED_API_KEY?.trim() || process.env.SUPABASE_AURELIA_CRM_PUBLISHABLE_KEY?.trim()

  if (!crmUrl || !crmPublishableKey) {
    throw new Error(
      'Missing CRM environment variables: SUPABASE_AURELIA_CRM_URL/SUPABASE_CRM_AURELIA_URL and SUPABASE_CRM_AURELIA_PUBLISHED_API_KEY/SUPABASE_AURELIA_CRM_PUBLISHABLE_KEY',
    )
  }

  return createSupabaseClient(crmUrl, crmPublishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
