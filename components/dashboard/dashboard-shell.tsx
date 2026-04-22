'use client'

import { useState, useEffect, useMemo } from 'react'
import { useTheme } from 'next-themes'
import type { User } from '@supabase/supabase-js'
import type { Profile, Client } from '@/lib/types'
import { Sidebar } from './sidebar'
import { MadkyWidget } from '@/components/madky/madky-widget'
import { TimerProvider } from '@/lib/time-tracking/timer-context'
import { ActiveTimerBar } from '@/components/timer/active-timer-bar'

interface DashboardShellProps {
  user: User
  profile: Profile | null
  clients: Client[]
  children: React.ReactNode
}

export function DashboardShell({ user, profile, clients, children }: DashboardShellProps) {
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const { setTheme } = useTheme()

  // Find the selected client object
  const selectedClient = useMemo(() => {
    if (!selectedClientId) return null
    return clients.find(c => c.id === selectedClientId) ?? null
  }, [selectedClientId, clients])

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
    <TimerProvider>
      <div className="flex h-screen bg-background overflow-hidden">
        <Sidebar
          user={user}
          profile={profile}
          clients={clients}
          selectedClientId={selectedClientId}
          onSelectClient={setSelectedClientId}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          <ActiveTimerBar />
          <main className="flex-1 overflow-auto relative">
            {children}
          </main>
        </div>
        
        {/* Madky AI Assistant Widget */}
        <MadkyWidget 
          selectedClient={selectedClient}
          allClients={clients}
        />
      </div>
    </TimerProvider>
  )
}
