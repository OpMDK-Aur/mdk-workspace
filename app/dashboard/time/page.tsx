'use client'

import { useEffect, useState } from 'react'
import { EntriesList } from '@/components/time-entries/entries-list'
import { createClient } from '@/lib/supabase/client'

// Roles con acceso de administrador a marcaciones de tiempo
const ADMIN_ROLES = ['master', 'direccion', 'administrador', 'project_manager']

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
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()
        
        setIsAdmin(ADMIN_ROLES.includes(profile?.role || ''))
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
