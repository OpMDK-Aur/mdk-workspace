'use client'

import { useEffect, useState } from 'react'
import { EntriesList } from '@/components/time-entries/entries-list'
import { createClient } from '@/lib/supabase/client'

// Roles con acceso de administrador (ver todas las marcaciones y filtrar por colaborador)
const ADMIN_ROLES = ['master', 'administrador', 'direccion']

export default function TimePage() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [userId, setUserId] = useState<string>()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function checkRole() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (user) {
        setUserId(user.id)
        // Check role from colaboradores table with roles join (match by email, as the
        // rest of the app does — the colaboradores id is not always the auth user id)
        const { data: colaborador } = await supabase
          .from('colaboradores')
          .select('rol_id, roles(nombre)')
          .eq('email', user.email)
          .single()
        
        const roleName = (colaborador?.roles as { nombre: string } | null)?.nombre || ''
        setIsAdmin(ADMIN_ROLES.includes(roleName.toLowerCase()))
      }
      setLoading(false)
    }
    
    checkRole()
  }, [])

  if (loading) {
    return (
      <div className="max-w-5xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Time Entries</h1>
          <p className="text-muted-foreground mt-1">Cargando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={isAdmin ? "max-w-6xl" : "max-w-4xl"}>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Time Entries</h1>
        <p className="text-muted-foreground mt-1">
          {isAdmin 
            ? 'Administra las marcaciones de tiempo de todos los colaboradores'
            : 'View and manage your tracked time'}
        </p>
      </div>
      <EntriesList isMaster={isAdmin} currentUserId={userId} />
    </div>
  )
}
