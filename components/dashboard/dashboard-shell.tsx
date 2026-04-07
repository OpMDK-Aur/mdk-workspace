'use client'

import { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import type { User } from '@supabase/supabase-js'
import type { Profile, Client } from '@/lib/types'
import { Sidebar } from './sidebar'

interface DashboardShellProps {
  user: User
  profile: Profile | null
  clients: Client[]
  children: React.ReactNode
}

export function DashboardShell({ user, profile, clients, children }: DashboardShellProps) {
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const { setTheme } = useTheme()

  // Sync saved theme and accent color from DB on mount
  useEffect(() => {
    if (profile?.theme) {
      setTheme(profile.theme)
    }
    if (profile?.accent_hue) {
      const hue = profile.accent_hue
      document.documentElement.style.setProperty('--primary', `oklch(0.7 0.18 ${hue})`)
      document.documentElement.style.setProperty('--accent', `oklch(0.7 0.18 ${hue})`)
      document.documentElement.style.setProperty('--ring', `oklch(0.7 0.18 ${hue})`)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.theme, profile?.accent_hue])

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar
        user={user}
        profile={profile}
        clients={clients}
        selectedClientId={selectedClientId}
        onSelectClient={setSelectedClientId}
      />
      <main className="flex-1 overflow-auto relative">
        {children}
      </main>
    </div>
  )
}
