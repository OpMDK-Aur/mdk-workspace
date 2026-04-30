'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface UpdateProfilePayload {
  full_name: string
  avatar_url: string | null
  theme: 'light' | 'dark' | 'system'
  accent_hue: number
  onboarding_completed?: boolean
}

export async function updateProfile(payload: UpdateProfilePayload) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const updateData: Record<string, unknown> = {
    nombre: payload.full_name.split(' ')[0],
    apellido: payload.full_name.split(' ').slice(1).join(' ') || '',
    avatar_url: payload.avatar_url,
    theme: payload.theme,
    accent_hue: payload.accent_hue,
  }

  if (payload.onboarding_completed !== undefined) {
    updateData.onboarding_completado = payload.onboarding_completed
  }

  const { error, data } = await supabase
    .from('colaboradores')
    .update(updateData)
    .eq('id', user.id)
    .select('onboarding_completado')
    .single()

  if (error) {
    console.error('[v0] updateProfile error:', error.message, error.code)
    return { error: error.message }
  }

  console.log('[v0] updateProfile success, onboarding_completado:', data?.onboarding_completado)

  revalidatePath('/', 'layout')
  revalidatePath('/dashboard', 'layout')
  revalidatePath('/onboarding')

  return { success: true }
}
