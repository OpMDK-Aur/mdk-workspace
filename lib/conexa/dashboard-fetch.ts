'use client'

import { createClient, getAuthUser } from '@/lib/supabase/client'

export async function dashboardApiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const client = createClient()
  const headers = new Headers(init.headers)
  await getAuthUser().catch(() => null)
  const { data: { session } } = await client.auth.getSession()
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`)
  return fetch(input, { ...init, headers })
}
