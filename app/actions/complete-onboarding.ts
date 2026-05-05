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

  // Extract Discord info from user metadata if authenticated via Discord
  const discordId = user.user_metadata?.provider_id || user.user_metadata?.sub || null
  const discordUsername = user.user_metadata?.full_name || user.user_metadata?.name || null
  const discordAvatar = user.user_metadata?.avatar_url || null
  const isDiscordAuth = user.app_metadata?.provider === 'discord'

  // Build update object
  const updateData: Record<string, unknown> = {
    nombre: payload.full_name.split(' ')[0],
    apellido: payload.full_name.split(' ').slice(1).join(' ') || '',
    avatar_url: payload.avatar_url ?? '',
    theme: payload.theme,
    accent_hue: payload.accent_hue,
    onboarding_completado: true,
  }

  // Add Discord info if user authenticated via Discord
  if (isDiscordAuth && discordId) {
    updateData.discord_id = discordId
    updateData.discord_username = discordUsername
    updateData.discord_avatar = discordAvatar
  }

  // Update colaborador directly instead of using RPC
  const { error } = await supabase
    .from('colaboradores')
    .update(updateData)
    .eq('id', user.id)

  if (error) {
    console.error('[v0] complete_onboarding error:', error.message)
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
