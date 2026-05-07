'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Building2, Globe, Users, Clock, TrendingUp, Star } from 'lucide-react'

interface ClientSearchResult {
  id: string
  nombre: string
  logo_url: string | null
  categoria: string | null
  estado: string | null
  fee_mensual: number | null
  nps_score: number | null
  crm_tipo: string | null
}

interface ClientSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ClientSearch({ open, onOpenChange }: ClientSearchProps) {
  const router = useRouter()
  const supabase = createClient()
  const [search, setSearch] = useState('')
  const [clients, setClients] = useState<ClientSearchResult[]>([])
  const [recentClients, setRecentClients] = useState<ClientSearchResult[]>([])
  const [loading, setLoading] = useState(false)

  // Load all clients on mount for instant search
  useEffect(() => {
    const loadClients = async () => {
      const { data } = await supabase
        .from('clientes')
        .select('id, nombre, logo_url, categoria, estado, fee_mensual, nps_score, crm_tipo')
        .eq('activo', true)
        .order('nombre')

      if (data) {
        setClients(data)
      }
    }
    
    loadClients()
  }, [supabase])

  // Load recent clients from localStorage
  useEffect(() => {
    const recent = localStorage.getItem('recent_clients')
    if (recent) {
      try {
        const recentIds = JSON.parse(recent) as string[]
        const recentList = recentIds
          .map(id => clients.find(c => c.id === id))
          .filter((c): c is ClientSearchResult => c !== undefined)
          .slice(0, 5)
        setRecentClients(recentList)
      } catch {
        // Invalid data, ignore
      }
    }
  }, [clients])

  // Filter clients based on search
  const filteredClients = search.trim()
    ? clients.filter(client =>
        client.nombre.toLowerCase().includes(search.toLowerCase()) ||
        client.categoria?.toLowerCase().includes(search.toLowerCase()) ||
        client.crm_tipo?.toLowerCase().includes(search.toLowerCase())
      )
    : []

  // Group by category
  const clientsByCategory = filteredClients.reduce((acc, client) => {
    const cat = client.categoria || 'Sin categoría'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(client)
    return acc
  }, {} as Record<string, ClientSearchResult[]>)

  const handleSelect = useCallback((clientId: string) => {
    // Save to recent
    const recent = localStorage.getItem('recent_clients')
    let recentIds: string[] = []
    try {
      recentIds = recent ? JSON.parse(recent) : []
    } catch {
      recentIds = []
    }
    recentIds = [clientId, ...recentIds.filter(id => id !== clientId)].slice(0, 10)
    localStorage.setItem('recent_clients', JSON.stringify(recentIds))

    onOpenChange(false)
    router.push(`/dashboard/clients/${clientId}`)
  }, [onOpenChange, router])

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const getStatusColor = (estado: string | null) => {
    switch (estado?.toLowerCase()) {
      case 'activo': return 'bg-green-500/10 text-green-500 border-green-500/20'
      case 'pausado': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
      case 'inactivo': return 'bg-red-500/10 text-red-500 border-red-500/20'
      default: return 'bg-muted text-muted-foreground'
    }
  }

  const formatFee = (fee: number | null) => {
    if (!fee) return null
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(fee)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Buscar cliente"
      description="Busca clientes por nombre, categoría o CRM"
    >
      <CommandInput
        placeholder="Buscar cliente..."
        value={search}
        onValueChange={setSearch}
      />
      <CommandList className="max-h-[400px]">
        <CommandEmpty className="py-6 text-center">
          <Building2 className="h-10 w-10 mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No se encontraron clientes</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Prueba con otro término de búsqueda</p>
        </CommandEmpty>

        {/* Recent clients (when no search) */}
        {!search.trim() && recentClients.length > 0 && (
          <CommandGroup heading="Recientes">
            {recentClients.map(client => (
              <CommandItem
                key={client.id}
                value={`recent-${client.id}-${client.nombre}`}
                onSelect={() => handleSelect(client.id)}
                className="flex items-center gap-3 py-3"
              >
                <Avatar className="h-9 w-9 border">
                  <AvatarImage src={client.logo_url || undefined} alt={client.nombre} />
                  <AvatarFallback className="text-xs bg-primary/10 text-primary">
                    {getInitials(client.nombre)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{client.nombre}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>Visitado recientemente</span>
                  </div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Search results grouped by category */}
        {Object.entries(clientsByCategory).map(([category, categoryClients]) => (
          <CommandGroup key={category} heading={category}>
            {categoryClients.map(client => (
              <CommandItem
                key={client.id}
                value={`${client.id}-${client.nombre}-${client.categoria}`}
                onSelect={() => handleSelect(client.id)}
                className="flex items-center gap-3 py-3"
              >
                <Avatar className="h-9 w-9 border">
                  <AvatarImage src={client.logo_url || undefined} alt={client.nombre} />
                  <AvatarFallback className="text-xs bg-primary/10 text-primary">
                    {getInitials(client.nombre)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{client.nombre}</p>
                    {client.estado && (
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getStatusColor(client.estado)}`}>
                        {client.estado}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    {client.fee_mensual && (
                      <span className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" />
                        {formatFee(client.fee_mensual)}/mes
                      </span>
                    )}
                    {client.nps_score !== null && (
                      <span className="flex items-center gap-1">
                        <Star className="h-3 w-3" />
                        NPS: {client.nps_score}
                      </span>
                    )}
                    {client.crm_tipo && (
                      <span className="flex items-center gap-1">
                        <Globe className="h-3 w-3" />
                        {client.crm_tipo.toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}

        {/* Quick actions when no search */}
        {!search.trim() && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Acciones">
              <CommandItem
                onSelect={() => {
                  onOpenChange(false)
                  router.push('/dashboard')
                }}
                className="py-2"
              >
                <Users className="h-4 w-4 mr-2" />
                Ver todos los clientes
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}
