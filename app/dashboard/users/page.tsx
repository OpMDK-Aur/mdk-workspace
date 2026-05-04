import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { UserManagementContent } from '@/components/dashboard/user-management-content'

export default async function UsersPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: colaborador } = await supabase
    .from('colaboradores')
    .select('*, roles(id, nombre)')
    .eq('id', user.id)
    .single()

  if (!colaborador) {
    redirect('/dashboard')
  }

  // Get all colaboradores with roles and departments
  const { data: colaboradores } = await supabase
    .from('colaboradores')
    .select('*, roles(id, nombre), departamentos(id, nombre)')
    .order('nombre')

  // Map colaboradores to profiles format
  const profiles = (colaboradores || []).map(c => ({
    id: c.id,
    email: c.email,
    full_name: [c.nombre, c.apellido].filter(Boolean).join(' ') || null,
    role: c.roles?.nombre?.toLowerCase().replace(/ /g, '_') || '',
    role_name: c.roles?.nombre || '',
    rol_id: c.rol_id,
    departamento_id: c.departamento_id,
    departamento_name: c.departamentos?.nombre || '',
    modulos_habilitados: c.modulos_habilitados || ['dashboard'],
    avatar_url: c.avatar_url,
    activo: c.activo,
  }))

  // Get all clients from clientes table
  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, nombre_del_negocio, activo')
    .order('nombre_del_negocio')

  const clients = (clientes || []).map(c => ({
    id: c.id,
    business_name: c.nombre_del_negocio || '',
    status: c.activo ? 'active' : 'inactive',
  }))

  // Get all user-client access records
  const { data: userClientAccess } = await supabase
    .from('user_client_access')
    .select('*')

  // Get all roles
  const { data: roles } = await supabase
    .from('roles')
    .select('id, nombre')
    .eq('activo', true)
    .order('nombre')

  // Get all departments
  const { data: departamentos } = await supabase
    .from('departamentos')
    .select('id, nombre')
    .eq('activo', true)
    .order('nombre')

  const roleName = colaborador?.roles?.nombre?.toLowerCase().replace(/ /g, '_') || ''

  return (
    <UserManagementContent
      currentUserId={user.id}
      currentUserRole={roleName}
      profiles={profiles}
      clients={clients}
      userClientAccess={userClientAccess || []}
      roles={roles || []}
      departamentos={departamentos || []}
    />
  )
}
