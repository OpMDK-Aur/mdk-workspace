'use client'

import { useState } from 'react'
import Image from 'next/image'
import type { Profile, UserRole } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
import { UserPlus, ChevronDown, Check, X, Loader2, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'

interface UserManagementContentProps {
  currentUserId: string
  currentUserRole: string
  profiles: Profile[]
  clients: Array<{ id: string; business_name: string; status: string | null }>
  userClientAccess: Array<{ id: string; user_id: string; client_id: string; access_level: string }>
}

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'direccion', label: 'Dir. Operaciones' },
  { value: 'project_manager', label: 'Project Manager' },
  { value: 'account_manager', label: 'Account Manager' },
  { value: 'consultor', label: 'Consultor' },
]

function getRoleBadgeClass(role: string) {
  switch (role) {
    case 'direccion': return 'bg-primary/10 text-primary border-primary/20'
    case 'project_manager': return 'bg-status-verde/10 text-status-verde border-status-verde/20'
    case 'account_manager': return 'bg-status-amarillo/10 text-status-amarillo border-status-amarillo/20'
    case 'consultor': return 'bg-muted text-muted-foreground'
    default: return 'bg-muted text-muted-foreground'
  }
}

export function UserManagementContent({
  currentUserId,
  currentUserRole,
  profiles,
  clients,
  userClientAccess,
}: UserManagementContentProps) {
  const supabase = createClient()

  // Create user state
  const [createOpen, setCreateOpen] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<UserRole>('account_manager')
  const [newClientIds, setNewClientIds] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createSuccess, setCreateSuccess] = useState(false)

  // Edit user state
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState<UserRole>('account_manager')
  const [editClientIds, setEditClientIds] = useState<string[]>([])
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

  const getRoleLabel = (role: string) => ROLE_OPTIONS.find(r => r.value === role)?.label || role

  const openEditDialog = (profile: Profile) => {
    setEditingProfile(profile)
    setEditName(profile.full_name || '')
    setEditRole(profile.role)
    setEditClientIds(assignedClients[profile.id] || [])
    setSaveError(null)
    setSaveSuccess(false)
  }

  const handleSaveEdit = async () => {
    if (!editingProfile) return
    setSaving(true)
    setSaveError(null)

    // Prevent a user from changing their own role
    const roleToSave = editingProfile.id === currentUserId ? editingProfile.role : editRole
    const previousRole = editingProfile.role
    const previousClientIds = assignedClients[editingProfile.id] || []

    try {
      const { error: profileError } = await supabase
        .from('colaboradores')
        .update({ nombre: editName.split(' ')[0], apellido: editName.split(' ').slice(1).join(' ') || '' })
        .eq('id', editingProfile.id)

      if (profileError) {
        setSaveError(profileError.message)
        return
      }

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

      // Update project_manager_id or account_manager_id on clients
      const managerField = roleToSave === 'project_manager' 
        ? 'project_manager_id' 
        : roleToSave === 'account_manager' 
          ? 'account_manager_id' 
          : null

      // If role changed, clear old manager assignments
      if (previousRole !== roleToSave) {
        const previousField = previousRole === 'project_manager'
          ? 'project_manager_id'
          : previousRole === 'account_manager'
            ? 'account_manager_id'
            : null

        if (previousField && previousClientIds.length > 0) {
          await supabase
            .from('clients')
            .update({ [previousField]: null })
            .in('id', previousClientIds)
            .eq(previousField, editingProfile.id)
        }
      }

      // Set new manager assignments for assigned clients
      if (managerField && editClientIds.length > 0) {
        await supabase
          .from('clients')
          .update({ [managerField]: editingProfile.id })
          .in('id', editClientIds)
      }

      // Clear manager field from clients that were unassigned
      if (managerField) {
        const removedClientIds = previousClientIds.filter(id => !editClientIds.includes(id))
        if (removedClientIds.length > 0) {
          await supabase
            .from('clients')
            .update({ [managerField]: null })
            .in('id', removedClientIds)
            .eq(managerField, editingProfile.id)
        }
      }

      setLocalProfiles(prev =>
        prev.map(p => p.id === editingProfile.id ? { ...p, full_name: editName, role: roleToSave } : p)
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

    try {
      const { data, error } = await supabase.auth.signUp({
        email: newEmail,
        password: newPassword,
        options: { data: { full_name: newName, role: newRole } },
      })

      if (error) { setCreateError(error.message); return }

      const newUserId = data.user?.id
      if (!newUserId) { setCreateError('No se pudo obtener el ID del nuevo usuario.'); return }

      if (newClientIds.length > 0) {
        await supabase.from('user_client_access').insert(
          newClientIds.map(clientId => ({ user_id: newUserId, client_id: clientId, access_level: 'read' as const }))
        )

        // Update project_manager_id or account_manager_id on assigned clients
        const managerField = newRole === 'project_manager' 
          ? 'project_manager_id' 
          : newRole === 'account_manager' 
            ? 'account_manager_id' 
            : null

        if (managerField) {
          await supabase
            .from('clients')
            .update({ [managerField]: newUserId })
            .in('id', newClientIds)
        }
      }

      setCreateSuccess(true)
      setNewEmail(''); setNewPassword(''); setNewName(''); setNewRole('account_manager'); setNewClientIds([])
      setTimeout(() => { setCreateSuccess(false); setCreateOpen(false); window.location.reload() }, 1500)
    } finally {
      setCreating(false)
    }
  }

  const handleClientAssignmentToggle = async (userId: string, clientId: string) => {
    const current = assignedClients[userId] || []
    const isAssigned = current.includes(clientId)
    
    // Find the user's role to determine which manager field to update
    const userProfile = localProfiles.find(p => p.id === userId)
    const managerField = userProfile?.role === 'project_manager' 
      ? 'project_manager_id' 
      : userProfile?.role === 'account_manager' 
        ? 'account_manager_id' 
        : null

    if (isAssigned) {
      await supabase.from('user_client_access').delete().eq('user_id', userId).eq('client_id', clientId)
      
      // Clear manager field when unassigning
      if (managerField) {
        await supabase
          .from('clients')
          .update({ [managerField]: null })
          .eq('id', clientId)
          .eq(managerField, userId)
      }
      
      setAssignedClients(prev => ({ ...prev, [userId]: (prev[userId] || []).filter(id => id !== clientId) }))
    } else {
      await supabase.from('user_client_access').insert({ user_id: userId, client_id: clientId, access_level: 'read' })
      
      // Set manager field when assigning
      if (managerField) {
        await supabase
          .from('clients')
          .update({ [managerField]: userId })
          .eq('id', clientId)
      }
      
      setAssignedClients(prev => ({ ...prev, [userId]: [...(prev[userId] || []), clientId] }))
    }
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
            <DialogContent className="sm:max-w-md">
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
                <div className="space-y-1.5">
                  <Label>Rol</Label>
                  <Select value={newRole} onValueChange={v => setNewRole(v as UserRole)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
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
                      {clients.map(client => (
                        <DropdownMenuCheckboxItem key={client.id} checked={newClientIds.includes(client.id)}
                          onCheckedChange={() => setNewClientIds(prev => prev.includes(client.id) ? prev.filter(id => id !== client.id) : [...prev, client.id])}>
                          {client.business_name}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
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
                          {getRoleLabel(profile.role)}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{profile.email}</p>

                      <div className="mt-3 flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">Clientes:</span>
                        {userClients.length === 0 && <span className="text-xs text-muted-foreground italic">Sin clientes asignados</span>}
                        {userClients.map(c => (
                          <Badge key={c.id} variant="secondary" className="text-xs gap-1">
                            {c.business_name}
                            {!isCurrentUser && (
                              <button onClick={() => handleClientAssignmentToggle(profile.id, c.id)} className="hover:text-destructive transition-colors ml-0.5">
                                <X className="h-2.5 w-2.5" />
                              </button>
                            )}
                          </Badge>
                        ))}
                        {!isCurrentUser && (
                          <DropdownMenu open={assigningUserId === profile.id} onOpenChange={open => setAssigningUserId(open ? profile.id : null)}>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-5 text-xs text-primary px-2 py-0">+ Asignar</Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-60 max-h-60 overflow-y-auto">
                              {clients.map(client => (
                                <DropdownMenuCheckboxItem key={client.id}
                                  checked={(assignedClients[profile.id] || []).includes(client.id)}
                                  onCheckedChange={() => handleClientAssignmentToggle(profile.id, client.id)}>
                                  {client.business_name}
                                </DropdownMenuCheckboxItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>

                    {!isCurrentUser && (
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={() => openEditDialog(profile)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Edit user dialog */}
      <Dialog open={!!editingProfile} onOpenChange={open => { if (!open) setEditingProfile(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar usuario</DialogTitle>
            <DialogDescription>Modifica los datos del usuario seleccionado.</DialogDescription>
          </DialogHeader>

          {editingProfile && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border">
                <Avatar className="h-10 w-10 shrink-0">
                  {editingProfile.avatar_url && <AvatarImage src={editingProfile.avatar_url} alt={editingProfile.full_name || ''} />}
                  <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                    {(editName || editingProfile.full_name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{editName || editingProfile.full_name || 'Sin nombre'}</p>
                  <p className="text-xs text-muted-foreground">{editingProfile.email}</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Nombre completo</Label>
                <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Nombre completo" />
              </div>

              <div className="space-y-1.5">
                <Label>Rol</Label>
                {editingProfile?.id === currentUserId ? (
                  <p className="text-sm text-muted-foreground border rounded-md px-3 py-2">
                    {getRoleLabel(editingProfile.role)} <span className="text-xs opacity-60">(no podés cambiar tu propio rol)</span>
                  </p>
                ) : (
                  <Select value={editRole} onValueChange={v => setEditRole(v as UserRole)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
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
                    {clients.map(client => (
                      <DropdownMenuCheckboxItem key={client.id} checked={editClientIds.includes(client.id)}
                        onCheckedChange={() => setEditClientIds(prev => prev.includes(client.id) ? prev.filter(id => id !== client.id) : [...prev, client.id])}>
                        {client.business_name}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

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
