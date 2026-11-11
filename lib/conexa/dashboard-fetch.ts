'use client'

import { createClient } from '@/lib/supabase/client'

export async function dashboardApiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  const { data: { session } } = await createClient().auth.getSession()
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`)
  return fetch(input, { ...init, headers })
}
