'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Briefcase, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface ServiciosClienteProps {
  clientId: string
}

export function ServiciosCliente({ clientId }: ServiciosClienteProps) {
  const [servicios, setServicios] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadServicios = async () => {
      try {
        setLoading(true)
        const supabase = createClient()
        const { data, error } = await supabase
          .from('servicios_contratados')
          .select('*')
          .eq('cliente_id', clientId)

        if (error) {
          console.error('Error:', error)
          setServicios([])
        } else {
          setServicios(data || [])
        }
      } catch (error) {
        console.error('Error loading servicios:', error)
        setServicios([])
      } finally {
        setLoading(false)
      }
    }

    loadServicios()
  }, [clientId])

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" />
            Servicios contratados
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-xs text-muted-foreground">Cargando...</div>
        ) : servicios.length > 0 ? (
          <div className="space-y-2">
            {servicios.map((servicio) => (
              <div
                key={servicio.id}
                className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium">{servicio.nombre}</p>
                  {servicio.categoria && (
                    <p className="text-xs text-muted-foreground">{servicio.categoria}</p>
                  )}
                </div>
                {servicio.activo && (
                  <Badge variant="outline" className="ml-2 text-xs">
                    Activo
                  </Badge>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">No hay servicios contratados</p>
            <Button variant="outline" size="sm" className="w-full gap-1">
              <Plus className="h-3 w-3" />
              Agregar servicio
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
