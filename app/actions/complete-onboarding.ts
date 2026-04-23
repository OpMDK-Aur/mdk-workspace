'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function completeOnboarding(payload: {
  full_name: string
  avatar_url: string | null
  role: string
  theme: 'light' | 'dark' | 'system'
  accent_hue: number
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Update profile directly instead of using RPC
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: payload.full_name,
      avatar_url: payload.avatar_url ?? '',
      role: payload.role,
      theme: payload.theme,
      accent_hue: payload.accent_hue,
      onboarding_completed: true,
    })
    .eq('id', user.id)

  if (error) {
    console.error('[v0] complete_onboarding error:', error.message)
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
