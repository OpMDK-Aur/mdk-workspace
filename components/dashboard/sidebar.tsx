'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import type { Profile, Client } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  LayoutDashboard,
  Users,
  Zap,
  Settings,
  FileText,
  BookOpen,
  LogOut,
  ChevronDown,
  Rocket,
  UserCog,
  Plug,
  Wallet,
} from 'lucide-react'
import { UserSettingsDialog } from './user-settings-dialog'

interface SidebarProps {
  user: User
  profile: Profile | null
  clients: Client[]
  selectedClientId: string | null
  onSelectClient: (id: string | null) => void
}

const areas = [
  { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard, href: '/dashboard', active: true },
  { id: 'consultoria', name: 'Consultoría', icon: Users, href: '#', active: false },
  { id: 'operaciones', name: 'Operaciones', icon: Settings, href: '#', active: false },
  { id: 'ventas-ai', name: 'Ventas AI', icon: Zap, href: '#', active: false },
]

const recursos = [
  { id: 'reportes', name: 'Reportes', icon: FileText },
  { id: 'sops', name: 'SOPs', icon: BookOpen },
]

function getStatusColor(status: string | null) {
  switch (status) {
    case 'verde': return 'bg-status-verde'
    case 'amarillo': return 'bg-status-amarillo'
    case 'naranja': return 'bg-status-naranja'
    case 'rojo': return 'bg-status-rojo'
    default: return 'bg-muted-foreground'
  }
}

function getRoleName(role: string) {
  switch (role) {
    case 'direccion': return 'Dir. Operaciones'
    case 'project_manager': return 'Project Manager'
    case 'account_manager': return 'Account Manager'
    case 'consultor': return 'Consultor'
    default: return role
  }
}

export function Sidebar({
  user,
  profile,
  clients,
  selectedClientId,
  onSelectClient,
}: SidebarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [settingsOpen, setSettingsOpen] = useState(false)

  const userRole = profile?.role ?? 'project_manager'
  const canManageUsers = userRole === 'direccion' || userRole === 'project_manager'

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  const initials =
    profile?.full_name
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) ||
    user.email?.[0].toUpperCase() ||
    'U'

  return (
    <>
      <aside className="w-64 border-r border-border bg-card flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <div className="relative w-28 h-10 flex-shrink-0">
              <Image
                src="/images/logo-mdk.jpg"
                alt="MDK"
                fill
                priority
                className="object-contain object-left"
              />
            </div>
            <span className="text-xs text-muted-foreground">Workspace</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Operations · v1.0</p>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4 space-y-6">
            {/* Areas */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Areas
              </h3>
              <div className="space-y-1">
                {areas.map((area) => {
                  const isComingSoon = !area.active
                  return (
                    <div key={area.id} className="relative">
                      {isComingSoon ? (
                        <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground/50 cursor-default">
                          <area.icon className="h-4 w-4 opacity-50" />
                          <span>{area.name}</span>
                          <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                            Pronto
                          </span>
                        </button>
                      ) : (
                        <Link
                          href={area.href}
                          className={cn(
                            'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                            pathname === area.href
                              ? 'bg-primary/10 text-primary'
                              : 'text-foreground hover:bg-muted'
                          )}
                        >
                          <area.icon className="h-4 w-4" />
                          {area.name}
                        </Link>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Administration — only for direccion and project_manager */}
            {canManageUsers && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Administracion
                </h3>
                <div className="space-y-1">
                  <Link
                    href="/dashboard/users"
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      pathname === '/dashboard/users'
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground hover:bg-muted'
                    )}
                  >
                    <UserCog className="h-4 w-4" />
                    Gestionar usuarios
                  </Link>
                  <Link
                    href="/dashboard/platform"
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      pathname === '/dashboard/platform'
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground hover:bg-muted'
                    )}
                  >
                    <Plug className="h-4 w-4" />
                    Plataformas
                  </Link>
                  <Link
                    href="/dashboard/saldos"
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      pathname === '/dashboard/saldos'
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground hover:bg-muted'
                    )}
                  >
                    <Wallet className="h-4 w-4" />
                    Control de saldos
                  </Link>
                </div>
              </div>
            )}

            {/* Clients */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Clientes
              </h3>
              <div className="space-y-1">
                <button
                  onClick={() => onSelectClient(null)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                    selectedClientId === null
                      ? 'bg-muted font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <Rocket className="h-3.5 w-3.5" />
                  <span>Todos los clientes</span>
                </button>
                {clients.slice(0, 10).map((client) => {
                  const clientHref = `/dashboard/clients/${client.id}`
                  const isClientPage = pathname === clientHref
                  return (
                    <Link
                      key={client.id}
                      href={clientHref}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                        isClientPage
                          ? 'bg-muted font-medium text-foreground'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      <div className={cn(
                        'h-2.5 w-2.5 rounded-full flex-shrink-0 ring-1 ring-inset ring-black/10',
                        getStatusColor(client.status)
                      )} />
                      <span className="truncate">{client.business_name}</span>
                    </Link>
                  )
                })}
                {clients.length > 10 && (
                  <button className="w-full text-left px-3 py-2 text-xs text-primary hover:underline">
                    Ver todos ({clients.length})
                  </button>
                )}
              </div>
            </div>

            {/* Resources */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Recursos
              </h3>
              <div className="space-y-1">
                {recursos.map((recurso) => (
                  <button
                    key={recurso.id}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <recurso.icon className="h-4 w-4" />
                    {recurso.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* User section — fixed at bottom */}
        <div className="p-4 border-t border-border shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full justify-start gap-3 px-2">
                <Avatar className="h-8 w-8 shrink-0">
                  {profile?.avatar_url && (
                    <AvatarImage src={profile.avatar_url} alt={profile.full_name || ''} />
                  )}
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-medium truncate">
                    {profile?.full_name || user.email?.split('@')[0]}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {getRoleName(profile?.role || 'consultor')}
                  </p>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-56">
              <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                <Settings className="mr-2 h-4 w-4" />
                Configuracion
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Cerrar sesion
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <UserSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        user={user}
        profile={profile}
      />
    </>
  )
}
