'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Briefcase, Plus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

interface ServiciosClienteProps {
  clientId: string
}

export function ServiciosCliente({ clientId }: ServiciosClienteProps) {
  // Placeholder component - tabla servicios_contratados no existe aún
  // Cuando se cree la tabla, descomentar el useEffect con la carga de datos
  const [servicios, setServicios] = useState<any[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [nuevoServicio, setNuevoServicio] = useState({ nombre: '', categoria: '' })

  const handleAgregarServicio = () => {
    if (!nuevoServicio.nombre.trim()) {
      toast.error('El nombre del servicio es requerido')
      return
    }

    const servicio = {
      id: `servicio-${Date.now()}`,
      nombre: nuevoServicio.nombre,
      categoria: nuevoServicio.categoria || '',
      activo: true,
      cliente_id: clientId
    }

    setServicios(prev => [...prev, servicio])
    toast.success('Servicio agregado correctamente')
    setNuevoServicio({ nombre: '', categoria: '' })
    setDialogOpen(false)
  }

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
        {servicios.length > 0 ? (
          <div className="space-y-2">
            {servicios.map((servicio: any) => (
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
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="w-full gap-1">
                  <Plus className="h-3 w-3" />
                  Agregar servicio
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Agregar nuevo servicio</DialogTitle>
                  <DialogDescription>
                    Completa los datos del nuevo servicio a contratar
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="nombre" className="text-sm">
                      Nombre del servicio *
                    </Label>
                    <Input
                      id="nombre"
                      placeholder="Ej: Facebook Ads"
                      value={nuevoServicio.nombre}
                      onChange={(e) =>
                        setNuevoServicio({ ...nuevoServicio, nombre: e.target.value })
                      }
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="categoria" className="text-sm">
                      Categoría
                    </Label>
                    <Input
                      id="categoria"
                      placeholder="Ej: Marketing"
                      value={nuevoServicio.categoria}
                      onChange={(e) =>
                        setNuevoServicio({ ...nuevoServicio, categoria: e.target.value })
                      }
                      className="h-9"
                    />
                  </div>
                  <div className="flex gap-2 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setDialogOpen(false)}
                      className="flex-1"
                    >
                      Cancelar
                    </Button>
                    <Button onClick={handleAgregarServicio} className="flex-1">
                      Agregar
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
