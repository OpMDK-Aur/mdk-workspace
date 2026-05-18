'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MessageSquare, Map, FileText } from 'lucide-react'
import { ClientServiceMap } from './client-service-map'
import { ClientMinutas } from './client-minutas'
import type { ClientPlan } from '@/lib/types'

interface CurrentUser {
  id: string
  nombre: string
  apellido?: string
  avatar_url?: string | null
}

interface ClientActivityTabsProps {
  clientId: string
  clientPlan: ClientPlan
  currentUser: CurrentUser | null
  children: React.ReactNode // The existing ClientComments component
}

export function ClientActivityTabs({
  clientId,
  clientPlan,
  currentUser,
  children,
}: ClientActivityTabsProps) {
  return (
    <Tabs defaultValue="comments" className="w-full">
      <TabsList className="h-9 w-full justify-start">
        <TabsTrigger value="comments" className="gap-1.5 text-xs">
          <MessageSquare className="h-3.5 w-3.5" />
          Comentarios
        </TabsTrigger>
        <TabsTrigger value="minutas" className="gap-1.5 text-xs">
          <FileText className="h-3.5 w-3.5" />
          Minutas
        </TabsTrigger>
        <TabsTrigger value="service-map" className="gap-1.5 text-xs">
          <Map className="h-3.5 w-3.5" />
          Mapa de Servicio
        </TabsTrigger>
      </TabsList>

      <TabsContent value="comments" className="mt-4">
        {children}
      </TabsContent>

      <TabsContent value="minutas" className="mt-4">
        <ClientMinutas clientId={clientId} currentUser={currentUser} />
      </TabsContent>

      <TabsContent value="service-map" className="mt-4">
        <ClientServiceMap clientId={clientId} clientPlan={clientPlan} />
      </TabsContent>
    </Tabs>
  )
}
