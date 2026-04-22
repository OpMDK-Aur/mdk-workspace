'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Clock, FileText, BarChart3, Users, Settings } from 'lucide-react'

const navItems = [
  { href: '/dashboard/time', label: 'Timer', icon: Clock },
  { href: '/dashboard/time/entries', label: 'Time entries', icon: FileText },
  { href: '/dashboard/reports', label: 'Reports', icon: BarChart3 },
  { href: '/dashboard/team', label: 'Team', icon: Users },
  { href: '/dashboard/time/settings', label: 'Settings', icon: Settings },
]

export function TimeTrackingSidebar() {
  const pathname = usePathname()

  return (
    <nav className="w-56 border-r border-border bg-card shrink-0">
      <div className="p-4">
        <h2 className="text-lg font-semibold text-foreground mb-1">Time Tracking</h2>
        <p className="text-xs text-muted-foreground">Track your work hours</p>
      </div>
      <div className="px-3 pb-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || 
            (item.href === '/dashboard/time' && pathname === '/dashboard/time') ||
            (item.href !== '/dashboard/time' && pathname.startsWith(item.href))
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
