'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/lib/types'
import { createClient, getAuthUser } from '@/lib/supabase/client'
import { isMaster, canSeeSection } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  LayoutDashboard,
  Users,
  Settings,
  LogOut,
  ChevronDown,
  Bell,
  Home,
  PanelLeftClose,
  PanelLeft,
  ChevronRight,
  Clock,
  BarChart3,
  Building2,
  LineChart,
  Cpu,
  ClockCheck,
  Map,
  Smile,
  FileText,
  Megaphone,
  AppWindow,
  Database,
  Webhook,
} from 'lucide-react'
import { UserSettingsDialog } from './user-settings-dialog'
import { NotificationsPanel } from './notifications-panel'

interface SidebarProps {
  user: User
  profile: Profile | null
}

// Navigation structure
interface NavItem {
  id: string
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: 'tasks' | 'proximamente'
  moduleId?: string
  masterOnly?: boolean
}

interface NavSection {
  id: string
  title?: string
  items: NavItem[]
  moduleId?: string // Section-level module requirement
}

// Main navigation items (no section header)
const mainItems: NavItem[] = [
  { id: 'tasks', name: 'Tareas', href: '/dashboard/tasks', icon: LayoutDashboard, badge: 'tasks' },
]

// Sub-items for Tareas (nested under mainItems)
const tareasSubItems: NavItem[] = [
  { id: 'time', name: 'Entradas de tiempo', href: '/dashboard/time', icon: Clock },
  { id: 'reports', name: 'Mis horas', href: '/dashboard/reports', icon: BarChart3 },
]

// Primary navigation items (below Tareas)
const primaryItems: NavItem[] = [
  { id: 'clients', name: 'Clientes', href: '/dashboard/clients', icon: Building2 },
  { id: 'performance', name: 'Performance', href: '/dashboard/page', icon: LineChart },
  { id: 'agentes', name: 'Agentes', href: '/dashboard/agentes', icon: Cpu, badge: 'proximamente' },
]

// Administration section
const adminItems: NavItem[] = [
  { id: 'time-settings', name: 'Control de horas', href: '/dashboard/admin/horas', icon: ClockCheck },
  { id: 'service-map', name: 'Mapa de servicio', href: '/dashboard/admin/mapa-servicio', icon: Map },
  { id: 'nps', name: 'NPS', href: '/dashboard/admin/nps', icon: Smile },
  { id: 'facturacion', name: 'Facturacion', href: '/dashboard/saldos', icon: FileText },
  { id: 'colaboradores', name: 'Colaboradores', href: '/dashboard/colaboradores', icon: Users },
]

// Integraciones section (formerly Platforms)
const platformItems: NavItem[] = [
  { id: 'ad-accounts', name: 'Cuentas publicitarias', href: '/dashboard/platform', icon: Megaphone },
  { id: 'apps', name: 'Apps', href: '/dashboard/platform?tab=apps', icon: AppWindow },
  { id: 'crm', name: 'CRM', href: '/dashboard/crm', icon: Database },
  { id: 'webhooks', name: 'Webhooks', href: '/dashboard/platform?tab=webhooks', icon: Webhook },
]

export function Sidebar({
  user,
  profile,
}: SidebarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [wasCollapsed, setWasCollapsed] = useState(false)
  const [notificationCount, setNotificationCount] = useState(0)
  const [notificationsPanelOpen, setNotificationsPanelOpen] = useState(false)
  
  // Collapsible section states - open by default if pathname matches
  const [tareasOpen, setTareasOpen] = useState(() =>
    pathname.startsWith('/dashboard/tasks') || 
    pathname.startsWith('/dashboard/time') || 
    pathname.startsWith('/dashboard/reports')
  )
  const [adminOpen, setAdminOpen] = useState(() => 
    adminItems.some(item => pathname.startsWith(item.href.split('?')[0]))
  )
  const [platformsOpen, setPlatformsOpen] = useState(() =>
    platformItems.some(item => pathname.startsWith(item.href.split('?')[0]))
  )
  
  // Task count for badge
  const [taskCount, setTaskCount] = useState(0)

  // Get user role - normalize to expected format
  const userRole = profile?.role_name || profile?.role || 'Usuario'
  const userModulos = profile?.modulos_habilitados || []
  const userIsMaster = isMaster(userRole)

  // Fetch unread notification count
  useEffect(() => {
    async function fetchNotificationCount() {
      const { data: { user: authUser } } = await getAuthUser()
      if (!authUser?.email) return
      
      const { data: colaborador } = await supabase
        .from('colaboradores')
        .select('id')
        .eq('email', authUser.email)
        .single()
      
      if (!colaborador) return
      
      const { count, error } = await supabase
        .from('notificaciones')
        .select('*', { count: 'exact', head: true })
        .eq('colaborador_id', colaborador.id)
        .eq('leida', false)
      
      if (!error && count !== null) {
        setNotificationCount(count)
      }
    }
    fetchNotificationCount()

    const channel = supabase
      .channel('notificaciones_count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notificaciones' }, () => {
        fetchNotificationCount()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  // Fetch pending task count
  useEffect(() => {
    async function fetchTaskCount() {
      if (!profile?.id) return
      
      const { count, error } = await supabase
        .from('tareas')
        .select('*', { count: 'exact', head: true })
        .contains('responsable_ids', [profile.id])
        .eq('estado', 'pendiente')
      
      if (!error && count !== null) {
        setTaskCount(count)
      }
    }
    fetchTaskCount()

    const channel = supabase
      .channel('tareas_count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tareas' }, () => {
        fetchTaskCount()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, profile?.id])
  
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

  // Check if item is active
  const isItemActive = (href: string) => {
    const basePath = href.split('?')[0]
    if (basePath === '/dashboard') return pathname === '/dashboard'
    return pathname === basePath || pathname.startsWith(basePath + '/')
  }

  // Render a navigation item
  const renderNavItem = (item: NavItem, collapsed = false) => {
    // Check masterOnly
    if (item.masterOnly && !userIsMaster) return null
    
    const isActive = isItemActive(item.href)
    const isComingSoon = item.badge === 'proximamente'
    
    if (collapsed) {
      return (
        <Tooltip key={item.id}>
          <TooltipTrigger asChild>
            {isComingSoon ? (
              <div className="flex items-center justify-center h-9 w-full rounded-lg text-muted-foreground/50 cursor-default">
                <item.icon className="h-4 w-4 opacity-50" />
              </div>
            ) : (
              <Link
                href={item.href}
                className={cn(
                  'flex items-center justify-center h-9 w-full rounded-lg transition-colors relative',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.badge === 'tasks' && taskCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary text-[10px] font-medium text-primary-foreground flex items-center justify-center">
                    {taskCount > 9 ? '9+' : taskCount}
                  </span>
                )}
              </Link>
            )}
          </TooltipTrigger>
          <TooltipContent side="right">
            {item.name}
            {isComingSoon && ' (Proximamente)'}
          </TooltipContent>
        </Tooltip>
      )
    }

    if (isComingSoon) {
      return (
        <div
          key={item.id}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground/50 cursor-default"
        >
          <item.icon className="h-4 w-4 opacity-50" />
          <span>{item.name}</span>
          <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
            Pronto
          </span>
        </div>
      )
    }

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
        <span>{item.name}</span>
        {item.badge === 'tasks' && taskCount > 0 && (
          <Badge className="ml-auto h-5 px-1.5 text-[10px] bg-primary text-primary-foreground">
            {taskCount > 99 ? '99+' : taskCount}
          </Badge>
        )}
      </Link>
    )
  }

  // Collapsed sidebar
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
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="p-2 space-y-4">
              {/* Main items (Tareas + sub-items) */}
              <div className="space-y-1">
                {mainItems.map(item => renderNavItem(item, true))}
                {tareasSubItems.map(item => renderNavItem(item, true))}
              </div>

              {/* Primary items (Clientes, Performance, Agentes) */}
              <div className="space-y-1 pt-2 border-t border-border">
                {primaryItems.map(item => renderNavItem(item, true))}
              </div>

              {/* Admin section - ONLY for Master users */}
              {userIsMaster && (
                <div className="space-y-1 pt-2 border-t border-border">
                  {adminItems.map(item => renderNavItem(item, true))}
                </div>
              )}

              {/* Integraciones section */}
              {(userIsMaster || canSeeSection(userRole, userModulos, 'plataformas')) && (
                <div className="space-y-1 pt-2 border-t border-border">
                  {platformItems.map(item => renderNavItem(item, true))}
                </div>
              )}
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
                  Mi perfil
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
            </div>

            <ScrollArea className="flex-1 min-h-0">
              <div className="p-4 space-y-4">
                {/* Main navigation - Tareas with collapsible sub-items */}
                <div className="space-y-1">
                  {/* Tareas as collapsible parent */}
                  <Collapsible open={tareasOpen} onOpenChange={setTareasOpen}>
                    <div className="flex items-center">
                      <Link
                        href="/dashboard/tasks"
                        className={cn(
                          'flex-1 flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                          isItemActive('/dashboard/tasks')
                            ? 'bg-primary/10 text-primary'
                            : 'text-foreground hover:bg-muted'
                        )}
                      >
                        <LayoutDashboard className="h-4 w-4" />
                        <span>Tareas</span>
                        {taskCount > 0 && (
                          <Badge className="ml-auto h-5 px-1.5 text-[10px] bg-primary text-primary-foreground">
                            {taskCount > 99 ? '99+' : taskCount}
                          </Badge>
                        )}
                      </Link>
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                        >
                          <ChevronRight className={cn('h-4 w-4 transition-transform', tareasOpen && 'rotate-90')} />
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                    <CollapsibleContent className="space-y-1 mt-1">
                      {tareasSubItems.map(item => (
                        <Link
                          key={item.id}
                          href={item.href}
                          className={cn(
                            'w-full flex items-center gap-3 pl-7 pr-3 py-2 rounded-lg text-sm font-medium transition-colors',
                            isItemActive(item.href)
                              ? 'bg-primary/10 text-primary'
                              : 'text-foreground hover:bg-muted'
                          )}
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.name}</span>
                        </Link>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                </div>

                {/* Primary items (Clientes, Performance, Agentes) */}
                <div className="space-y-1">
                  {primaryItems.map(item => renderNavItem(item))}
                </div>

                {/* Administration section - ONLY for Master users */}
                {userIsMaster && (
                  <Collapsible open={adminOpen} onOpenChange={setAdminOpen}>
                    <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors">
                      <span>Administracion</span>
                      <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', adminOpen && 'rotate-90')} />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-1">
                      {adminItems.map(item => renderNavItem(item))}
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* Integraciones section */}
                {(userIsMaster || canSeeSection(userRole, userModulos, 'plataformas')) && (
                  <Collapsible open={platformsOpen} onOpenChange={setPlatformsOpen}>
                    <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors">
                      <span>Integraciones</span>
                      <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', platformsOpen && 'rotate-90')} />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-1">
                      {platformItems.map(item => renderNavItem(item))}
                    </CollapsibleContent>
                  </Collapsible>
                )}
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
                      <p className="text-xs text-muted-foreground truncate">
                        {profile?.puesto || 'Sin puesto'}
                      </p>
                    </div>
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="top" className="w-56">
                  <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                    <Settings className="mr-2 h-4 w-4" />
                    Mi perfil
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
