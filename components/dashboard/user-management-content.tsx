'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { UserPlus, ChevronDown, Check, X, Loader2, Pencil, Camera } from 'lucide-react'
import { cn } from '@/lib/utils'

// Módulos disponibles (ordenados alfabéticamente)
const AVAILABLE_MODULES = [
  { id: 'administracion', label: 'Administración' },
  { id: 'agentes_ia', label: 'Agentes IA' },
  { id: 'colaboradores', label: 'Colaboradores' },
  { id: 'consultoria', label: 'Consultoría' },
  { id: 'control_saldos', label: 'Control de saldos' },
  { id: 'crm', label: 'CRM' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'gestion_usuarios', label: 'Gestión de usuarios' },
  { id: 'plataformas', label: 'Plataformas' },
  { id: 'reports', label: 'Reports' },
  { id: 'tareas', label: 'Tareas' },
  { id: 'team', label: 'Team' },
  { id: 'timer_entries', label: 'Timer entries' },
]

// Módulos por defecto según el rol
const DEFAULT_MODULES_BY_ROLE: Record<string, string[]> = {
  // Master: todos los módulos
  master: AVAILABLE_MODULES.map(m => m.id),
  // Administrador: todos los módulos
  administrador: AVAILABLE_MODULES.map(m => m.id),
  // Project Manager: todos excepto colaboradores
  project_manager: AVAILABLE_MODULES.filter(m => m.id !== 'colaboradores').map(m => m.id),
  // Account Manager: sin gestión_usuarios, colaboradores, reports
  account_manager: AVAILABLE_MODULES.filter(m => 
    !['gestion_usuarios', 'colaboradores', 'reports'].includes(m.id)
  ).map(m => m.id),
  // Consultor (Especialista): sin gestión_usuarios, colaboradores, reports
  especialista: AVAILABLE_MODULES.filter(m => 
    !['gestion_usuarios', 'colaboradores', 'reports'].includes(m.id)
  ).map(m => m.id),
  // Desarrollador: sin gestión_usuarios, colaboradores, reports
  desarrollador: AVAILABLE_MODULES.filter(m => 
    !['gestion_usuarios', 'colaboradores', 'reports'].includes(m.id)
  ).map(m => m.id),
}

// Función para obtener módulos por defecto según rol
function getDefaultModulesForRole(roleName: string): string[] {
  const normalizedRole = roleName.toLowerCase().replace(/ /g, '_')
  return DEFAULT_MODULES_BY_ROLE[normalizedRole] || ['dashboard']
}

interface Profile {
  id: string
  email: string
  full_name: string | null
  role: string
  role_name: string
  rol_id: string | null
  departamento_id: string | null
  departamento_name: string
  modulos_habilitados: string[]
  avatar_url: string | null
  activo: boolean
}

interface Role {
  id: string
  nombre: string
}

interface Departamento {
  id: string
  nombre: string
}

interface UserManagementContentProps {
  currentUserId: string
  currentUserRole: string
  profiles: Profile[]
  clients: Array<{ id: string; business_name: string; status: string | null }>
  userClientAccess: Array<{ id: string; user_id: string; client_id: string; access_level: string }>
  roles: Role[]
  departamentos: Departamento[]
}

function getRoleBadgeClass(role: string) {
  switch (role) {
    case 'master': return 'bg-purple-500/10 text-purple-500 border-purple-500/20'
    case 'administrador': return 'bg-primary/10 text-primary border-primary/20'
    case 'project_manager': return 'bg-status-verde/10 text-status-verde border-status-verde/20'
    case 'account_manager': return 'bg-status-amarillo/10 text-status-amarillo border-status-amarillo/20'
    default: return 'bg-muted text-muted-foreground'
  }
}

export function UserManagementContent({
  currentUserId,
  currentUserRole,
  profiles,
  clients,
  userClientAccess,
  roles,
  departamentos,
}: UserManagementContentProps) {
  const supabase = createClient()

  // Create user state
  const [createOpen, setCreateOpen] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newName, setNewName] = useState('')
  const [newRolId, setNewRolId] = useState<string>('')
  const [newDepartamentoId, setNewDepartamentoId] = useState<string>('')
  const [newClientIds, setNewClientIds] = useState<string[]>([])
  const [newModulos, setNewModulos] = useState<string[]>(['dashboard'])
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createSuccess, setCreateSuccess] = useState(false)

  // Edit user state
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null)
  const [editName, setEditName] = useState('')
  const [editRolId, setEditRolId] = useState<string>('')
  const [editDepartamentoId, setEditDepartamentoId] = useState<string>('')
  const [editClientIds, setEditClientIds] = useState<string[]>([])
  const [editModulos, setEditModulos] = useState<string[]>([])
  const [editAvatarUrl, setEditAvatarUrl] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Per-user client assignment state
  const [assigningUserId, setAssigningUserId] = useState<string | null>(null)
  const [assignedClients, setAssignedClients] = useState<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {}
    for (const access of userClientAccess) {
      if (!map[access.user_id]) map[access.user_id] = []
      map[access.user_id].push(access.client_id)
    }
    return map
  })

  // Local profiles state so edits reflect immediately
  const [localProfiles, setLocalProfiles] = useState<Profile[]>(profiles)

  const openEditDialog = (profile: Profile) => {
    setEditingProfile(profile)
    setEditName(profile.full_name || '')
    setEditRolId(profile.rol_id || '')
    setEditDepartamentoId(profile.departamento_id || '')
    setEditClientIds(assignedClients[profile.id] || [])
    setEditModulos(profile.modulos_habilitados || ['dashboard'])
    setEditAvatarUrl(profile.avatar_url)
    setSaveError(null)
    setSaveSuccess(false)
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !editingProfile) return

    setUploadingAvatar(true)
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${editingProfile.id}-${Date.now()}.${fileExt}`
      const filePath = `avatars/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true })

      if (uploadError) {
        setSaveError('Error al subir la imagen: ' + uploadError.message)
        return
      }

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      setEditAvatarUrl(publicUrl)
    } catch (err) {
      setSaveError('Error al subir la imagen')
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleSaveEdit = async () => {
    if (!editingProfile) return
    setSaving(true)
    setSaveError(null)

    const nameParts = editName.trim().split(' ')
    const nombre = nameParts[0] || ''
    const apellido = nameParts.slice(1).join(' ') || ''

    try {
      const { error: profileError } = await supabase
        .from('colaboradores')
        .update({
          nombre,
          apellido,
          rol_id: editRolId || null,
          departamento_id: editDepartamentoId || null,
          modulos_habilitados: editModulos,
          avatar_url: editAvatarUrl,
        })
        .eq('id', editingProfile.id)

      if (profileError) {
        setSaveError(profileError.message)
        return
      }

      // Update client access
      await supabase.from('user_client_access').delete().eq('user_id', editingProfile.id)
      if (editClientIds.length > 0) {
        await supabase.from('user_client_access').insert(
          editClientIds.map(clientId => ({
            user_id: editingProfile.id,
            client_id: clientId,
            access_level: 'read' as const,
          }))
        )
      }

      // Update local state
      const newRoleName = roles.find(r => r.id === editRolId)?.nombre || ''
      const newDepartamentoName = departamentos.find(d => d.id === editDepartamentoId)?.nombre || ''
      
      setLocalProfiles(prev =>
        prev.map(p => p.id === editingProfile.id ? {
          ...p,
          full_name: editName,
          rol_id: editRolId,
          role: newRoleName.toLowerCase().replace(/ /g, '_'),
          role_name: newRoleName,
          departamento_id: editDepartamentoId,
          departamento_name: newDepartamentoName,
          modulos_habilitados: editModulos,
          avatar_url: editAvatarUrl,
        } : p)
      )
      setAssignedClients(prev => ({ ...prev, [editingProfile.id]: editClientIds }))

      setSaveSuccess(true)
      setTimeout(() => {
        setSaveSuccess(false)
        setEditingProfile(null)
      }, 1000)
    } finally {
      setSaving(false)
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setCreateError(null)

    const nameParts = newName.trim().split(' ')
    const nombre = nameParts[0] || ''
    const apellido = nameParts.slice(1).join(' ') || ''

    try {
      const { data, error } = await supabase.auth.signUp({
        email: newEmail,
        password: newPassword,
        options: { data: { full_name: newName } },
      })

      if (error) { setCreateError(error.message); return }

      const newUserId = data.user?.id
      if (!newUserId) { setCreateError('No se pudo obtener el ID del nuevo usuario.'); return }

      // Create colaborador record
      await supabase.from('colaboradores').upsert({
        id: newUserId,
        email: newEmail,
        nombre,
        apellido,
        rol_id: newRolId || null,
        departamento_id: newDepartamentoId || null,
        modulos_habilitados: newModulos,
        activo: true,
      })

      // Assign clients
      if (newClientIds.length > 0) {
        await supabase.from('user_client_access').insert(
          newClientIds.map(clientId => ({ user_id: newUserId, client_id: clientId, access_level: 'read' as const }))
        )
      }

      setCreateSuccess(true)
      setNewEmail('')
      setNewPassword('')
      setNewName('')
      setNewRolId('')
      setNewDepartamentoId('')
      setNewClientIds([])
      setNewModulos(['dashboard'])
      setTimeout(() => { setCreateSuccess(false); setCreateOpen(false); window.location.reload() }, 1500)
    } finally {
      setCreating(false)
    }
  }

  const handleClientAssignmentToggle = async (userId: string, clientId: string) => {
    const current = assignedClients[userId] || []
    const isAssigned = current.includes(clientId)

    if (isAssigned) {
      await supabase.from('user_client_access').delete().eq('user_id', userId).eq('client_id', clientId)
      setAssignedClients(prev => ({ ...prev, [userId]: (prev[userId] || []).filter(id => id !== clientId) }))
    } else {
      await supabase.from('user_client_access').insert({ user_id: userId, client_id: clientId, access_level: 'read' })
      setAssignedClients(prev => ({ ...prev, [userId]: [...(prev[userId] || []), clientId] }))
    }
  }

  const toggleNewModulo = (moduloId: string) => {
    setNewModulos(prev => 
      prev.includes(moduloId) ? prev.filter(m => m !== moduloId) : [...prev, moduloId]
    )
  }

  const toggleEditModulo = (moduloId: string) => {
    setEditModulos(prev => 
      prev.includes(moduloId) ? prev.filter(m => m !== moduloId) : [...prev, moduloId]
    )
  }

  return (
    <div className="h-full">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Gestionar usuarios</h1>
            <div className="h-0.5 w-24 bg-primary mt-1.5 rounded-full" />
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90 gap-2">
                <UserPlus className="h-4 w-4" />
                Nuevo usuario
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Crear nuevo usuario</DialogTitle>
                <DialogDescription>Completa los datos para registrar un nuevo usuario en el workspace.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Nombre completo</Label>
                  <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ej: Maria Garcia" required />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="usuario@madketing.io" required />
                </div>
                <div className="space-y-1.5">
                  <Label>Contrasena inicial</Label>
                  <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Minimo 6 caracteres" minLength={6} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Rol</Label>
                    <Select value={newRolId} onValueChange={(value) => {
                      setNewRolId(value)
                      const selectedRole = roles.find(r => r.id === value)
                      if (selectedRole) {
                        setNewModulos(getDefaultModulesForRole(selectedRole.nombre))
                      }
                    }}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar rol..." /></SelectTrigger>
                      <SelectContent>
                        {roles.map(r => <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Departamento</Label>
                    <Select value={newDepartamentoId} onValueChange={setNewDepartamentoId}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                      <SelectContent>
                        {departamentos.map(d => <SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Clientes asignados</Label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full justify-between" type="button">
                        {newClientIds.length === 0 ? 'Seleccionar clientes...' : `${newClientIds.length} cliente${newClientIds.length !== 1 ? 's' : ''} seleccionado${newClientIds.length !== 1 ? 's' : ''}`}
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-80 max-h-60 overflow-y-auto">
                      <DropdownMenuCheckboxItem 
                        checked={newClientIds.length === clients.length}
                        onCheckedChange={() => setNewClientIds(newClientIds.length === clients.length ? [] : clients.map(c => c.id))}
                        onSelect={(e) => e.preventDefault()}
                        className="font-medium border-b mb-1"
                      >
                        Todos los clientes
                      </DropdownMenuCheckboxItem>
                      {clients.map(client => (
                        <DropdownMenuCheckboxItem 
                          key={client.id} 
                          checked={newClientIds.includes(client.id)}
                          onCheckedChange={() => setNewClientIds(prev => prev.includes(client.id) ? prev.filter(id => id !== client.id) : [...prev, client.id])}
                          onSelect={(e) => e.preventDefault()}
                        >
                          {client.business_name}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
{currentUserRole === 'master' && (
                    <div className="space-y-2">
                      <Label>Módulos habilitados</Label>
                      <div className="grid grid-cols-2 gap-2 p-3 border rounded-lg bg-muted/30 max-h-48 overflow-y-auto">
                        {AVAILABLE_MODULES.map(modulo => (
                          <label key={modulo.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-1.5 rounded">
                            <Checkbox
                              checked={newModulos.includes(modulo.id)}
                              onCheckedChange={() => toggleNewModulo(modulo.id)}
                            />
                            <span>{modulo.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  {createError && <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg px-3 py-2"><X className="h-4 w-4" />{createError}</div>}
                  {createSuccess && <div className="flex items-center gap-2 text-status-verde text-sm bg-status-verde/10 rounded-lg px-3 py-2"><Check className="h-4 w-4" />Usuario creado exitosamente</div>}
                  <Button type="submit" disabled={creating} className="w-full bg-primary hover:bg-primary/90">
                  {creating ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creando...</> : <><UserPlus className="h-4 w-4 mr-2" />Crear usuario</>}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {/* Users list */}
      <div className="p-6 space-y-4">
        <p className="text-sm text-muted-foreground">{localProfiles.length} usuario{localProfiles.length !== 1 ? 's' : ''} registrado{localProfiles.length !== 1 ? 's' : ''}</p>

        <div className="space-y-3">
          {localProfiles.map(profile => {
            const initials = profile.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || profile.email?.[0]?.toUpperCase() || 'U'
            const userClients = (assignedClients[profile.id] || []).map(cid => clients.find(c => c.id === cid)).filter(Boolean) as typeof clients
            const isCurrentUser = profile.id === currentUserId

            return (
              <Card key={profile.id}>
                <CardContent className="py-4">
                  <div className="flex items-start gap-4">
                    <Avatar className="h-10 w-10 mt-0.5 shrink-0">
                      {profile.avatar_url && <AvatarImage src={profile.avatar_url} alt={profile.full_name || ''} />}
                      <AvatarFallback className="bg-primary text-primary-foreground text-sm">{initials}</AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">
                          {profile.full_name || 'Sin nombre'}
                          {isCurrentUser && <span className="text-xs text-muted-foreground ml-1">(vos)</span>}
                        </p>
                        <Badge variant="outline" className={cn('text-xs', getRoleBadgeClass(profile.role))}>
                          {profile.role_name || profile.role}
                        </Badge>
                        {profile.departamento_name && (
                          <Badge variant="secondary" className="text-xs">
                            {profile.departamento_name}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{profile.email}</p>

                      <div className="mt-3 flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">Clientes:</span>
                        {userClients.length === 0 && <span className="text-xs text-muted-foreground italic">Sin clientes asignados</span>}
                        {userClients.slice(0, 3).map(c => (
                          <Badge key={c.id} variant="secondary" className="text-xs gap-1">
                            {c.business_name}
                            <button onClick={() => handleClientAssignmentToggle(profile.id, c.id)} className="hover:text-destructive transition-colors ml-0.5">
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </Badge>
                        ))}
                        {userClients.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{userClients.length - 3} más
                          </Badge>
                        )}
                        <DropdownMenu open={assigningUserId === profile.id} onOpenChange={open => setAssigningUserId(open ? profile.id : null)}>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-5 text-xs text-primary px-2 py-0">+ Asignar</Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="w-60 max-h-60 overflow-y-auto">
                            <DropdownMenuCheckboxItem 
                              checked={(assignedClients[profile.id] || []).length === clients.length}
                              onCheckedChange={() => {
                                const allAssigned = (assignedClients[profile.id] || []).length === clients.length
                                if (allAssigned) {
                                  // Remove all
                                  (assignedClients[profile.id] || []).forEach(clientId => {
                                    handleClientAssignmentToggle(profile.id, clientId)
                                  })
                                } else {
                                  // Add missing ones
                                  clients.forEach(client => {
                                    if (!(assignedClients[profile.id] || []).includes(client.id)) {
                                      handleClientAssignmentToggle(profile.id, client.id)
                                    }
                                  })
                                }
                              }}
                              onSelect={(e) => e.preventDefault()}
                              className="font-medium border-b mb-1"
                            >
                              Todos los clientes
                            </DropdownMenuCheckboxItem>
                            {clients.map(client => (
                              <DropdownMenuCheckboxItem 
                                key={client.id}
                                checked={(assignedClients[profile.id] || []).includes(client.id)}
                                onCheckedChange={() => handleClientAssignmentToggle(profile.id, client.id)}
                                onSelect={(e) => e.preventDefault()}
                              >
                                {client.business_name}
                              </DropdownMenuCheckboxItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      {/* Modules badges */}
                      <div className="mt-2 flex items-center gap-1 flex-wrap">
                        <span className="text-xs text-muted-foreground">Módulos:</span>
                        {(profile.modulos_habilitados || []).slice(0, 4).map(moduloId => {
                          const modulo = AVAILABLE_MODULES.find(m => m.id === moduloId)
                          return modulo ? (
                            <Badge key={moduloId} variant="outline" className="text-[10px] px-1.5 py-0">
                              {modulo.label}
                            </Badge>
                          ) : null
                        })}
                        {(profile.modulos_habilitados || []).length > 4 && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            +{(profile.modulos_habilitados || []).length - 4}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={() => openEditDialog(profile)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Edit user dialog */}
      <Dialog open={!!editingProfile} onOpenChange={open => { if (!open) setEditingProfile(null) }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar usuario</DialogTitle>
            <DialogDescription>Modifica los datos del usuario seleccionado.</DialogDescription>
          </DialogHeader>

          {editingProfile && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border">
                <div className="relative group">
                  <Avatar className="h-14 w-14 shrink-0">
                    {editAvatarUrl && <AvatarImage src={editAvatarUrl} alt={editingProfile.full_name || ''} />}
                    <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                      {(editName || editingProfile.full_name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <label className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                    {uploadingAvatar ? (
                      <Loader2 className="h-5 w-5 text-white animate-spin" />
                    ) : (
                      <Camera className="h-5 w-5 text-white" />
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarUpload}
                      disabled={uploadingAvatar}
                    />
                  </label>
                </div>
                <div>
                  <p className="text-sm font-medium">{editName || editingProfile.full_name || 'Sin nombre'}</p>
                  <p className="text-xs text-muted-foreground">{editingProfile.email}</p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">Pasa el cursor sobre la foto para cambiarla</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Nombre completo</Label>
                <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Nombre completo" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Rol</Label>
                  <Select value={editRolId} onValueChange={setEditRolId}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar rol..." /></SelectTrigger>
                    <SelectContent>
                      {roles.map(r => <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Departamento</Label>
                  <Select value={editDepartamentoId} onValueChange={setEditDepartamentoId}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                    <SelectContent>
                      {departamentos.map(d => <SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Clientes asignados</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between" type="button">
                      {editClientIds.length === 0 ? 'Sin clientes asignados' : `${editClientIds.length} cliente${editClientIds.length !== 1 ? 's' : ''}`}
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-80 max-h-60 overflow-y-auto">
                    <DropdownMenuCheckboxItem 
                      checked={editClientIds.length === clients.length}
                      onCheckedChange={() => setEditClientIds(editClientIds.length === clients.length ? [] : clients.map(c => c.id))}
                      onSelect={(e) => e.preventDefault()}
                      className="font-medium border-b mb-1"
                    >
                      Todos los clientes
                    </DropdownMenuCheckboxItem>
                    {clients.map(client => (
                      <DropdownMenuCheckboxItem 
                        key={client.id} 
                        checked={editClientIds.includes(client.id)}
                        onCheckedChange={() => setEditClientIds(prev => prev.includes(client.id) ? prev.filter(id => id !== client.id) : [...prev, client.id])}
                        onSelect={(e) => e.preventDefault()}
                      >
                        {client.business_name}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {currentUserRole === 'master' && (
                <div className="space-y-2">
                  <Label>Módulos habilitados</Label>
                  <div className="grid grid-cols-2 gap-2 p-3 border rounded-lg bg-muted/30 max-h-48 overflow-y-auto">
                    {AVAILABLE_MODULES.map(modulo => (
                      <label key={modulo.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-1.5 rounded">
                        <Checkbox
                          checked={editModulos.includes(modulo.id)}
                          onCheckedChange={() => toggleEditModulo(modulo.id)}
                        />
                        <span>{modulo.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {saveError && <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg px-3 py-2"><X className="h-4 w-4" />{saveError}</div>}
              {saveSuccess && <div className="flex items-center gap-2 text-status-verde text-sm bg-status-verde/10 rounded-lg px-3 py-2"><Check className="h-4 w-4" />Cambios guardados</div>}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setEditingProfile(null)}>Cancelar</Button>
                <Button className="flex-1 bg-primary hover:bg-primary/90" onClick={handleSaveEdit} disabled={saving}>
                  {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Guardando...</> : 'Guardar cambios'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
