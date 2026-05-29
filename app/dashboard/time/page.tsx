'use client'

import { useEffect, useState } from 'react'
import { EntriesList } from '@/components/time-entries/entries-list'
import { createClient } from '@/lib/supabase/client'

export default function TimePage() {
  const [isMaster, setIsMaster] = useState(false)
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
        
        setIsMaster(profile?.role === 'master')
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
    <div className={isMaster ? "max-w-6xl" : "max-w-4xl"}>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Time Entries</h1>
        <p className="text-muted-foreground mt-1">
          {isMaster 
            ? 'Administra las marcaciones de tiempo de todos los colaboradores'
            : 'View and manage your tracked time'}
        </p>
      </div>
      <EntriesList isMaster={isMaster} currentUserId={userId} />
    </div>
  )
}
