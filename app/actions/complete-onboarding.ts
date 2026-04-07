'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function completeOnboarding(payload: {
  full_name: string
  avatar_url: string | null
  theme: 'light' | 'dark' | 'system'
  accent_hue: number
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Use SECURITY DEFINER function — bypasses RLS unconditionally
  const { error } = await supabase.rpc('complete_user_onboarding', {
    p_user_id:    user.id,
    p_full_name:  payload.full_name,
    p_avatar_url: payload.avatar_url ?? '',
    p_theme:      payload.theme,
    p_accent_hue: payload.accent_hue,
  })

  if (error) {
    console.error('[v0] complete_user_onboarding RPC error:', error.message)
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
