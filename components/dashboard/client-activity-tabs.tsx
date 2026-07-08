'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MessageSquare, Map, FileText, Paperclip } from 'lucide-react'
import { ClientServiceMap } from './client-service-map'
import { ClientMinutas } from './client-minutas'
import { ClientAdjuntos } from './client-adjuntos'
import type { ClientPlan, UnidadNegocio } from '@/lib/types'

interface CurrentUser {
  id: string
  nombre: string
  apellido?: string
  avatar_url?: string | null
}

interface ClientActivityTabsProps {
  clientId: string
  clientPlan: ClientPlan
  unidadNegocio?: UnidadNegocio | null
  currentUser: CurrentUser | null
  children: React.ReactNode // The existing ClientComments component
}

export function ClientActivityTabs({
  clientId,
  clientPlan,
  unidadNegocio,
  currentUser,
  children,
}: ClientActivityTabsProps) {
  const showServiceMap = unidadNegocio === 'MDK'
  
  return (
    <Tabs defaultValue="comments" className="w-full">
      <TabsList className="h-9 w-full justify-start">
        <TabsTrigger value="comments" className="gap-1.5 text-xs">
          <MessageSquare className="h-3.5 w-3.5" />
          Comentarios
        </TabsTrigger>
        {/* <TabsTrigger value="servicios" className="gap-1.5 text-xs">
          <Briefcase className="h-3.5 w-3.5" />
          Servicios
        </TabsTrigger> */}
        <TabsTrigger value="adjuntos" className="gap-1.5 text-xs">
          <Paperclip className="h-3.5 w-3.5" />
          Adjuntos
        </TabsTrigger>
        <TabsTrigger value="minutas" className="gap-1.5 text-xs">
          <FileText className="h-3.5 w-3.5" />
          Minutas
        </TabsTrigger>
        {showServiceMap && (
          <TabsTrigger value="service-map" className="gap-1.5 text-xs">
            <Map className="h-3.5 w-3.5" />
            Mapa de Servicio
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="comments" className="mt-4">
        {children}
      </TabsContent>

      {/* <TabsContent value="servicios" className="mt-4">
        <ServiciosCliente clientId={clientId} />
      </TabsContent> */}

      <TabsContent value="adjuntos" className="mt-4">
        <ClientAdjuntos clientId={clientId} currentUserId={currentUser?.id} embedded />
      </TabsContent>

      <TabsContent value="minutas" className="mt-4">
        <ClientMinutas clientId={clientId} currentUser={currentUser} />
      </TabsContent>

      {showServiceMap && (
        <TabsContent value="service-map" className="mt-4">
          <ClientServiceMap clientId={clientId} clientPlan={clientPlan} currentUserId={currentUser?.id} />
        </TabsContent>
      )}
    </Tabs>
  )
}
