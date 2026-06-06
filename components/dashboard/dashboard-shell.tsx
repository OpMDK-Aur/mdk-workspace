'use client'

import { useEffect } from 'react'
import { useTheme } from 'next-themes'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/lib/types'
import { Sidebar } from './sidebar'
import { ActiveTimerBar } from '@/components/time-tracking/active-timer-bar'
import { NotificationAlertProvider } from './notification-alert'

interface DashboardShellProps {
  user: User
  profile: Profile | null
  children: React.ReactNode
}

export function DashboardShell({ user, profile, children }: DashboardShellProps) {
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
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <ActiveTimerBar />
        <main className="flex-1 overflow-auto relative">
          {children}
        </main>
      </div>
      <NotificationAlertProvider />
    </div>
  )
}
