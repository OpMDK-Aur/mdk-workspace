'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import type { Profile, Client } from '@/lib/types'
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
  Rocket,
  UserPlus,
  Bell,
  Search,
  Home,
  PanelLeftClose,
  PanelLeft,
  ChevronRight,
  X,
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
  UserCircle,
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
  { id: 'time', name: 'Entradas de tiempo', href: '/dashboard/time', icon: Clock },
  { id: 'reports', name: 'Reportes', href: '/dashboard/reports', icon: BarChart3 },
]

// Clients section
const clientsItems: NavItem[] = [
  { id: 'clients', name: 'Clientes', href: '/dashboard/clients', icon: Building2 },
  { id: 'performance', name: 'Performance', href: '/dashboard/page', icon: LineChart },
  { id: 'agentes', name: 'Agentes', href: '/dashboard/agentes', icon: Cpu, badge: 'proximamente' },
]

// Administration section
const adminItems: NavItem[] = [
  { id: 'time-settings', name: 'Control de horas', href: '/dashboard/time/settings', icon: ClockCheck },
  { id: 'service-map', name: 'Mapa de servicio', href: '/dashboard/config/hitos', icon: Map },
  { id: 'nps', name: 'NPS', href: '/dashboard/reports?tab=nps', icon: Smile },
  { id: 'facturacion', name: 'Facturacion', href: '/dashboard/saldos', icon: FileText },
  { id: 'colaboradores', name: 'Colaboradores', href: '/dashboard/colaboradores', icon: Users },
]

// Platforms section
const platformItems: NavItem[] = [
  { id: 'ad-accounts', name: 'Cuentas publicitarias', href: '/dashboard/platform', icon: Megaphone },
  { id: 'apps', name: 'Apps', href: '/dashboard/platform?tab=apps', icon: AppWindow },
  { id: 'crm', name: 'CRM', href: '/dashboard/crm', icon: Database },
  { id: 'webhooks', name: 'Webhooks', href: '/dashboard/platform?tab=webhooks', icon: Webhook },
]

// Config section
const configItems: NavItem[] = [
  { id: 'profile', name: 'Mi perfil', href: '/dashboard/perfil', icon: UserCircle },
  { id: 'create-user', name: 'Crear usuario', href: '/dashboard/users', icon: UserPlus, masterOnly: true },
]

function getSemaforoColor(unidades_negocio: string[] | undefined, semaforo_unidades: Record<string, string> | undefined) {
  if (!unidades_negocio || !semaforo_unidades || unidades_negocio.length === 0) {
    return 'bg-muted-foreground'
  }
  
  const semaforo = semaforo_unidades[unidades_negocio[0]]
  switch (semaforo) {
    case 'verde': return 'bg-status-verde'
    case 'amarillo': return 'bg-status-amarillo'
    case 'naranja': return 'bg-status-naranja'
    case 'rojo': return 'bg-status-rojo'
    default: return 'bg-muted-foreground'
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
  const [notificationCount, setNotificationCount] = useState(0)
  const [notificationsPanelOpen, setNotificationsPanelOpen] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  
  // Collapsible section states - open by default if pathname matches
  const [adminOpen, setAdminOpen] = useState(() => 
    adminItems.some(item => pathname.startsWith(item.href.split('?')[0]))
  )
  const [platformsOpen, setPlatformsOpen] = useState(() =>
    platformItems.some(item => pathname.startsWith(item.href.split('?')[0]))
  )
  const [configOpen, setConfigOpen] = useState(() =>
    configItems.some(item => pathname.startsWith(item.href.split('?')[0]))
  )
  
  // Task count for badge
  const [taskCount, setTaskCount] = useState(0)

  // Get user role - normalize to expected format
  const userRole = profile?.role_name || profile?.role || 'Usuario'
  const userModulos = profile?.modulos_habilitados || []
  const userIsMaster = isMaster(userRole)

  // Keyboard shortcut for search (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
        setSearchFocused(true)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Filter clients based on search
  const filteredClients = clients.filter(client => 
    client.nombre_del_negocio?.toLowerCase().includes(clientSearch.toLowerCase())
  )

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
              {/* Main items */}
              <div className="space-y-1">
                {mainItems.map(item => renderNavItem(item, true))}
              </div>

              {/* Clients section */}
              <div className="space-y-1 pt-2 border-t border-border">
                {clientsItems.map(item => renderNavItem(item, true))}
              </div>

              {/* Admin section - only if visible */}
              {(userIsMaster || canSeeSection(userRole, userModulos, 'administracion')) && (
                <div className="space-y-1 pt-2 border-t border-border">
                  {adminItems.map(item => renderNavItem(item, true))}
                </div>
              )}

              {/* Platforms section */}
              {(userIsMaster || canSeeSection(userRole, userModulos, 'plataformas')) && (
                <div className="space-y-1 pt-2 border-t border-border">
                  {platformItems.map(item => renderNavItem(item, true))}
                </div>
              )}

              {/* Config section */}
              <div className="space-y-1 pt-2 border-t border-border">
                {configItems.map(item => renderNavItem(item, true))}
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
                {/* Main navigation */}
                <div className="space-y-1">
                  {mainItems.map(item => renderNavItem(item))}
                </div>

                {/* Clients section */}
                <div className="space-y-1">
                  {clientsItems.map(item => renderNavItem(item))}
                </div>

                {/* Administration section */}
                {(userIsMaster || canSeeSection(userRole, userModulos, 'administracion')) && (
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

                {/* Platforms section */}
                {(userIsMaster || canSeeSection(userRole, userModulos, 'plataformas')) && (
                  <Collapsible open={platformsOpen} onOpenChange={setPlatformsOpen}>
                    <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors">
                      <span>Plataformas</span>
                      <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', platformsOpen && 'rotate-90')} />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-1">
                      {platformItems.map(item => renderNavItem(item))}
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* Configuration section */}
                <Collapsible open={configOpen} onOpenChange={setConfigOpen}>
                  <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors">
                    <span>Configuracion</span>
                    <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', configOpen && 'rotate-90')} />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-1">
                    {configItems.map(item => renderNavItem(item))}
                  </CollapsibleContent>
                </Collapsible>

                {/* Clients list */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Clientes
                    </h3>
                  </div>
                  
                  {/* Search input */}
                  <div className="relative mb-2">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      onFocus={() => setSearchFocused(true)}
                      onBlur={() => setSearchFocused(false)}
                      placeholder="Buscar cliente..."
                      className={cn(
                        'w-full h-8 pl-8 pr-8 rounded-md border bg-background text-sm placeholder:text-muted-foreground',
                        'focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary',
                        'transition-all'
                      )}
                    />
                    {clientSearch && (
                      <button
                        onClick={() => setClientSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 rounded-sm hover:bg-muted flex items-center justify-center"
                      >
                        <X className="h-3 w-3 text-muted-foreground" />
                      </button>
                    )}
                    {!clientSearch && !searchFocused && (
                      <kbd className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                        <span className="text-xs">⌘</span>K
                      </kbd>
                    )}
                  </div>
                  
                  <div className="space-y-1">
                    {!clientSearch && (
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
                    )}
                    {filteredClients.length === 0 && clientSearch && (
                      <p className="px-3 py-2 text-sm text-muted-foreground">
                        No se encontraron clientes
                      </p>
                    )}
                    {(clientSearch ? filteredClients : filteredClients.slice(0, 10)).map((client) => {
                      const clientHref = `/dashboard/clients/${client.id}`
                      const isClientPage = pathname === clientHref
                      return (
                        <Link
                          key={client.id}
                          href={clientHref}
                          onClick={() => setClientSearch('')}
                          className={cn(
                            'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                            isClientPage
                              ? 'bg-muted font-medium text-foreground'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          )}
                        >
                          <div className={cn(
                            'h-2.5 w-2.5 rounded-full flex-shrink-0 ring-1 ring-inset ring-black/10',
                            getSemaforoColor(client.unidades_negocio, client.semaforo_unidades)
                          )} />
                          <span className="truncate">{client.nombre_del_negocio}</span>
                        </Link>
                      )
                    })}
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
