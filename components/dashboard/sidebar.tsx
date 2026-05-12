'use client'

import { useState, useEffect, useRef } from 'react'
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
  X,
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

// Module IDs mapping to sidebar items
const MODULE_IDS = {
  dashboard: 'dashboard',
  crm: 'crm',
  tareas: 'tareas',
  consultoria: 'consultoria',
  administracion: 'administracion',
  agentes_ia: 'agentes_ia',
  gestion_usuarios: 'gestion_usuarios',
  plataformas: 'plataformas',
  control_saldos: 'control_saldos',
  colaboradores: 'colaboradores',
  timer_entries: 'timer_entries',
  reports: 'reports',
  team: 'team',
} as const

const areas = [
  { id: 'dashboard', moduleId: 'dashboard', name: 'Dashboard', icon: LayoutDashboard, href: '/dashboard', active: true },
  { id: 'crm', moduleId: 'crm', name: 'CRM', icon: Contact, href: '/dashboard/crm', active: true },
  { id: 'tasks', moduleId: 'tareas', name: 'Tareas', icon: CheckSquare, href: '/dashboard/tasks', active: true },
  { id: 'consultoria', moduleId: 'consultoria', name: 'Consultoría', icon: Users, href: '#', active: false },
  { id: 'agentes-ia', moduleId: 'agentes_ia', name: 'Agentes IA', icon: Zap, href: '#', active: false },
]

const adminItems = [
  { id: 'users', moduleId: 'gestion_usuarios', name: 'Gestionar usuarios', icon: UserCog, href: '/dashboard/users' },
  { id: 'platform', moduleId: 'plataformas', name: 'Plataformas', icon: Plug, href: '/dashboard/platform' },
  { id: 'saldos', moduleId: 'control_saldos', name: 'Control de saldos', icon: Wallet, href: '/dashboard/saldos' },
  { id: 'colaboradores', moduleId: 'colaboradores', name: 'Colaboradores', icon: UsersRound, href: '/dashboard/colaboradores' },
]

const timeTrackingItems = [
  { id: 'time-entries', moduleId: 'timer_entries', name: 'Timer entries', icon: Clock, href: '/dashboard/time' },
  { id: 'reports', moduleId: 'reports', name: 'Reports', icon: FileText, href: '/dashboard/reports' },
  { id: 'team', moduleId: 'team', name: 'Team', icon: Users, href: '/dashboard/team' },
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

function getRoleName(role: string, roleName?: string) {
  // If we have the actual role name from the database, use it
  if (roleName) return roleName
  
  // Fallback for legacy role codes
  switch (role) {
    case 'master': return 'Master'
    case 'direccion': return 'Dir. Operaciones'
    case 'project_manager': return 'Project Manager'
    case 'account_manager': return 'Account Manager'
    case 'consultor': return 'Consultor'
    case 'administrador': return 'Administrador'
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
  const [notificationCount, setNotificationCount] = useState(0)
  const [notificationsPanelOpen, setNotificationsPanelOpen] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

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

  // Filter clients based on search by nombre_del_negocio
  const filteredClients = clients.filter(client => 
    client.nombre_del_negocio?.toLowerCase().includes(clientSearch.toLowerCase())
  )

  // Fetch unread notification count for current user
  useEffect(() => {
    async function fetchNotificationCount() {
      // Get current user's colaborador_id
      const { data: { user: authUser } } = await supabase.auth.getUser()
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

    // Subscribe to changes
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
  const canManageUsers = userRole === 'direccion' || userRole === 'project_manager' || userRole === 'administrador' || userRole === 'master'
  
  // Get enabled modules for the user
  // Master role sees everything regardless of modulos_habilitados
  const isMaster = userRole === 'master'
  
  console.log('[v0] Sidebar - userRole:', userRole, 'isMaster:', isMaster, 'modulos_habilitados:', profile?.modulos_habilitados)
  
  const enabledModules = isMaster 
    ? Object.values(MODULE_IDS) 
    : (profile?.modulos_habilitados?.length ? profile.modulos_habilitados : ['dashboard'])
  
  // Filter functions for each section
  const isModuleEnabled = (moduleId: string) => enabledModules.includes(moduleId)
  const filteredAreas = areas.filter(area => isModuleEnabled(area.moduleId))
  const filteredAdminItems = adminItems.filter(item => isModuleEnabled(item.moduleId))
  const filteredTimeTrackingItems = timeTrackingItems.filter(item => isModuleEnabled(item.moduleId))

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
            
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="p-2 space-y-4">
              {/* Areas */}
              <div className="space-y-1">
                {filteredAreas.filter(a => a.active).map((area) => (
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
              {filteredAdminItems.length > 0 && (
                <div className="space-y-1 pt-2 border-t border-border">
                  {filteredAdminItems.map((item) => (
                    <Tooltip key={item.id}>
                      <TooltipTrigger asChild>
                        <Link
                          href={item.href}
                          className={cn(
                            'flex items-center justify-center h-9 w-full rounded-lg transition-colors',
                            pathname === item.href
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
              )}

              {/* Time Tracking */}
              {filteredTimeTrackingItems.length > 0 && (
                <div className="space-y-1 pt-2 border-t border-border">
                  {filteredTimeTrackingItems.map((item) => (
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
            </div>

            <ScrollArea className="flex-1 min-h-0">
          <div className="p-4 space-y-6">
            {/* Areas */}
            {filteredAreas.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Areas
                </h3>
                <div className="space-y-1">
                  {filteredAreas.map((area) => {
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
            )}

            {/* Administration — filtered by enabled modules */}
            {filteredAdminItems.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Administracion
                </h3>
                <div className="space-y-1">
                  {filteredAdminItems.map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                        pathname === item.href
                          ? 'bg-primary/10 text-primary'
                          : 'text-foreground hover:bg-muted'
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Time Tracking — filtered by enabled modules */}
            {filteredTimeTrackingItems.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Time Tracking
                </h3>
                <div className="space-y-1">
                  {filteredTimeTrackingItems.map((item) => {
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
            )}

            {/* Clients */}
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
                        getStatusColor(client.status)
                      )} />
                      <span className="truncate">{client.nombre_del_negocio}</span>
                    </Link>
                  )
                })}
                
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
                    {getRoleName(profile?.role || '', profile?.role_name)}
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
