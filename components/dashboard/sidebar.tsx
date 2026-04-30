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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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
  Contact,
  Clock,
  CheckSquare,
  UsersRound,
  Bell,
  Search,
  Home,
  PanelLeftClose,
  PanelLeft,
  ChevronRight,
} from 'lucide-react'
import { UserSettingsDialog } from './user-settings-dialog'
import { NotificationsPanel } from './notifications-panel'

interface SidebarProps {
  user: User
  profile: Profile | null
  clients: Client[]
  selectedClientId: string | null
  onSelectClient: (id: string | null) => void
}

const areas = [
  { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard, href: '/dashboard', active: true },
  { id: 'crm', name: 'CRM', icon: Contact, href: '/dashboard/crm', active: true },
  { id: 'tasks', name: 'Tareas', icon: CheckSquare, href: '/dashboard/tasks', active: true },
  { id: 'consultoria', name: 'Consultoría', icon: Users, href: '#', active: false },
  { id: 'operaciones', name: 'Operaciones', icon: Settings, href: '#', active: false },
  { id: 'ventas-ai', name: 'Ventas AI', icon: Zap, href: '#', active: false },
]

const timeTrackingItems = [
  { id: 'time-entries', name: 'Time entries', icon: Clock, href: '/dashboard/time' },
  { id: 'reports', name: 'Reports', icon: FileText, href: '/dashboard/reports' },
  { id: 'team', name: 'Team', icon: Users, href: '/dashboard/team' },
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
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [wasCollapsed, setWasCollapsed] = useState(false)
  const [notificationCount] = useState(3) // TODO: fetch from API
  const [notificationsPanelOpen, setNotificationsPanelOpen] = useState(false)
  
  const openNotifications = () => {
    setWasCollapsed(isCollapsed)
    setNotificationsPanelOpen(true)
  }
  
  const closeNotifications = () => {
    setNotificationsPanelOpen(false)
    if (wasCollapsed) {
      setIsCollapsed(true)
    }
  }

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

  // Collapsed sidebar component
  if (isCollapsed && !notificationsPanelOpen) {
    return (
      <TooltipProvider delayDuration={0}>
        <aside className="w-16 border-r border-border bg-card flex flex-col h-screen overflow-hidden">
          {/* Header */}
          <div className="p-2 border-b border-border shrink-0">
            <div className="flex flex-col items-center gap-2">
              <div className="relative w-10 h-10 flex-shrink-0">
                <Image
                  src="/images/logo-mdk.jpg"
                  alt="MDK"
                  fill
                  priority
                  className="object-contain rounded"
                />
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="p-2 border-b border-border flex flex-col items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => router.push('/dashboard')}
                >
                  <Home className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Inicio</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-9 w-9 relative"
                  onClick={openNotifications}
                >
                  <Bell className="h-4 w-4" />
                  {notificationCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary text-[10px] font-medium text-primary-foreground flex items-center justify-center">
                      {notificationCount}
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Notificaciones</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <Search className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Buscar</TooltipContent>
            </Tooltip>
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="p-2 space-y-4">
              {/* Areas */}
              <div className="space-y-1">
                {areas.filter(a => a.active).map((area) => (
                  <Tooltip key={area.id}>
                    <TooltipTrigger asChild>
                      <Link
                        href={area.href}
                        className={cn(
                          'flex items-center justify-center h-9 w-full rounded-lg transition-colors',
                          pathname === area.href || (area.href !== '/dashboard' && pathname.startsWith(area.href))
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                      >
                        <area.icon className="h-4 w-4" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">{area.name}</TooltipContent>
                  </Tooltip>
                ))}
              </div>

              {/* Admin */}
              {canManageUsers && (
                <div className="space-y-1 pt-2 border-t border-border">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href="/dashboard/users"
                        className={cn(
                          'flex items-center justify-center h-9 w-full rounded-lg transition-colors',
                          pathname === '/dashboard/users'
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                      >
                        <UserCog className="h-4 w-4" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">Gestionar usuarios</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href="/dashboard/colaboradores"
                        className={cn(
                          'flex items-center justify-center h-9 w-full rounded-lg transition-colors',
                          pathname === '/dashboard/colaboradores'
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                      >
                        <UsersRound className="h-4 w-4" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">Colaboradores</TooltipContent>
                  </Tooltip>
                </div>
              )}

              {/* Time Tracking */}
              <div className="space-y-1 pt-2 border-t border-border">
                {timeTrackingItems.map((item) => (
                  <Tooltip key={item.id}>
                    <TooltipTrigger asChild>
                      <Link
                        href={item.href}
                        className={cn(
                          'flex items-center justify-center h-9 w-full rounded-lg transition-colors',
                          pathname === item.href || pathname.startsWith(item.href + '/')
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                      >
                        <item.icon className="h-4 w-4" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">{item.name}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </div>
          </ScrollArea>

          {/* Expand button */}
          <div className="p-2 border-t border-border shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-full"
                  onClick={() => setIsCollapsed(false)}
                >
                  <PanelLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Expandir</TooltipContent>
            </Tooltip>
          </div>

          {/* User section */}
          <div className="p-2 border-t border-border shrink-0">
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-full">
                      <Avatar className="h-7 w-7">
                        {profile?.avatar_url && (
                          <AvatarImage src={profile.avatar_url} alt={profile.full_name || ''} />
                        )}
                        <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="right">{profile?.full_name || user.email}</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" side="right" className="w-56">
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
      </TooltipProvider>
    )
  }

  // Expanded sidebar
  return (
    <TooltipProvider delayDuration={0}>
      <aside className="w-64 border-r border-border bg-card flex flex-col h-screen overflow-hidden">
        {/* Show notifications panel or main sidebar */}
        {notificationsPanelOpen ? (
          <NotificationsPanel onClose={closeNotifications} />
        ) : (
          <>
            {/* Header */}
            <div className="p-4 border-b border-border shrink-0">
              <div className="flex items-center justify-between">
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
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => setIsCollapsed(true)}
                    >
                      <PanelLeftClose className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Colapsar</TooltipContent>
                </Tooltip>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Operations · v1.0</p>
            </div>

            {/* Quick actions bar */}
            <div className="px-4 py-2 border-b border-border flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => router.push('/dashboard')}
                  >
                    <Home className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Inicio</TooltipContent>
              </Tooltip>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 px-2 relative gap-1.5"
                onClick={openNotifications}
              >
                <Bell className="h-4 w-4" />
                <span className="text-xs">Bandeja de entrada</span>
                {notificationCount > 0 && (
                  <span className="h-4 w-4 rounded-full bg-primary text-[10px] font-medium text-primary-foreground flex items-center justify-center">
                    {notificationCount}
                  </span>
                )}
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 ml-auto">
                    <Search className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Buscar</TooltipContent>
              </Tooltip>
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
                            pathname === area.href || (area.href !== '/dashboard' && pathname.startsWith(area.href))
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
                  <Link
                    href="/dashboard/colaboradores"
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      pathname === '/dashboard/colaboradores'
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground hover:bg-muted'
                    )}
                  >
                    <UsersRound className="h-4 w-4" />
                    Colaboradores
                  </Link>
                </div>
              </div>
            )}

            {/* Time Tracking */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Time Tracking
              </h3>
              <div className="space-y-1">
                {timeTrackingItems.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : 'text-foreground hover:bg-muted'
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.name}
                    </Link>
                  )
                })}
              </div>
            </div>

            {/* Clients */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Clientes
              </h3>
              <div className="space-y-1">
                <Link
                  href="/dashboard/clients"
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                    pathname === '/dashboard/clients'
                      ? 'bg-muted font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <Rocket className="h-3.5 w-3.5" />
                  <span>Todos los clientes</span>
                </Link>
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
          </>
        )}
      </aside>

      <UserSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        user={user}
        profile={profile}
      />
    </TooltipProvider>
  )
}
