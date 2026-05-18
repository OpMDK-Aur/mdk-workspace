'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Loader2, Plus, Pencil, Trash2, FileText, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getClientMinutas, createMinuta, updateMinuta, deleteMinuta } from '@/lib/service-map'
import type { MinutaCliente, TipoMinuta } from '@/lib/types'

interface CurrentUser {
  id: string
  nombre: string
  apellido?: string
}

interface ClientMinutasProps {
  clientId: string
  currentUser: CurrentUser | null
}

const TIPO_MINUTA_LABELS: Record<TipoMinuta, string> = {
  reunion_cierre_mes: 'Cierre de Mes',
  reunion_scorecard: 'Scorecard',
  reunion_alineacion: 'Alineación',
  otra: 'Otra',
}

const TIPO_MINUTA_COLORS: Record<TipoMinuta, string> = {
  reunion_cierre_mes: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  reunion_scorecard: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  reunion_alineacion: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  otra: 'bg-muted text-muted-foreground border-border',
}

export function ClientMinutas({ clientId, currentUser }: ClientMinutasProps) {
  const [minutas, setMinutas] = useState<MinutaCliente[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingMinuta, setEditingMinuta] = useState<MinutaCliente | null>(null)
  const [saving, setSaving] = useState(false)

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Form state
  const [formTitulo, setFormTitulo] = useState('')
  const [formContenido, setFormContenido] = useState('')
  const [formFecha, setFormFecha] = useState('')
  const [formTipo, setFormTipo] = useState<TipoMinuta>('otra')

  // Fetch minutas
  useEffect(() => {
    async function fetchMinutas() {
      setLoading(true)
      setError(null)

      const result = await getClientMinutas(clientId)
      if (result.error) {
        setError(result.error)
      } else {
        setMinutas(result.data || [])
      }

      setLoading(false)
    }

    fetchMinutas()
  }, [clientId])

  // Reset form
  const resetForm = () => {
    setFormTitulo('')
    setFormContenido('')
    setFormFecha(new Date().toISOString().split('T')[0])
    setFormTipo('otra')
    setEditingMinuta(null)
  }

  // Open dialog for new minuta
  const openNewDialog = () => {
    resetForm()
    setIsDialogOpen(true)
  }

  // Open dialog for editing
  const openEditDialog = (minuta: MinutaCliente) => {
    setEditingMinuta(minuta)
    setFormTitulo(minuta.titulo)
    setFormContenido(minuta.contenido || '')
    setFormFecha(minuta.fecha)
    setFormTipo(minuta.tipo)
    setIsDialogOpen(true)
  }

  // Save minuta (create or update)
  const handleSave = async () => {
    if (!formTitulo.trim() || !formFecha || !currentUser) return

    setSaving(true)
    setError(null)

    const autorName = `${currentUser.nombre}${currentUser.apellido ? ` ${currentUser.apellido}` : ''}`

    if (editingMinuta) {
      // Update existing
      const result = await updateMinuta(editingMinuta.id, {
        titulo: formTitulo.trim(),
        contenido: formContenido.trim(),
        fecha: formFecha,
        tipo: formTipo,
      })

      if (result.error) {
        setError(result.error)
      } else {
        setMinutas((prev) =>
          prev.map((m) =>
            m.id === editingMinuta.id
              ? { ...m, titulo: formTitulo.trim(), contenido: formContenido.trim(), fecha: formFecha, tipo: formTipo }
              : m
          )
        )
        setIsDialogOpen(false)
        resetForm()
      }
    } else {
      // Create new
      const result = await createMinuta({
        cliente_id: clientId,
        titulo: formTitulo.trim(),
        contenido: formContenido.trim() || undefined,
        fecha: formFecha,
        tipo: formTipo,
        autor: autorName,
        colaborador_id: currentUser.id,
      })

      if (result.error) {
        setError(result.error)
      } else if (result.data) {
        setMinutas((prev) => [result.data!, ...prev])
        setIsDialogOpen(false)
        resetForm()
      }
    }

    setSaving(false)
  }

  // Delete minuta
  const handleDelete = async () => {
    if (!deleteId) return

    setDeleting(true)

    const result = await deleteMinuta(deleteId)
    if (result.error) {
      setError(result.error)
    } else {
      setMinutas((prev) => prev.filter((m) => m.id !== deleteId))
    }

    setDeleting(false)
    setDeleteId(null)
  }

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Cargando minutas...</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {minutas.length} {minutas.length === 1 ? 'minuta' : 'minutas'}
        </p>
        <Button size="sm" className="h-8 gap-1.5" onClick={openNewDialog}>
          <Plus className="h-3.5 w-3.5" />
          Nueva Minuta
        </Button>
      </div>

      {/* Error */}
      {error && <div className="text-sm text-destructive p-2 rounded-lg bg-destructive/10">{error}</div>}

      {/* Empty state */}
      {minutas.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No hay minutas registradas.</p>
          <p className="text-xs mt-1">Agrega una minuta para documentar reuniones con el cliente.</p>
        </div>
      )}

      {/* Minutas list */}
      <div className="space-y-2">
        {minutas.map((minuta) => (
          <div
            key={minuta.id}
            className="group p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className={cn('text-[10px] h-5', TIPO_MINUTA_COLORS[minuta.tipo])}>
                    {TIPO_MINUTA_LABELS[minuta.tipo]}
                  </Badge>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(minuta.fecha)}
                  </span>
                </div>
                <h4 className="text-sm font-medium">{minuta.titulo}</h4>
                {minuta.contenido && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap">
                    {minuta.contenido}
                  </p>
                )}
                {minuta.autor && (
                  <p className="text-[10px] text-muted-foreground mt-2">Por: {minuta.autor}</p>
                )}
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(minuta)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => setDeleteId(minuta.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingMinuta ? 'Editar Minuta' : 'Nueva Minuta'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Título *</label>
              <Input
                value={formTitulo}
                onChange={(e) => setFormTitulo(e.target.value)}
                placeholder="Ej: Reunión de cierre mensual"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Fecha *</label>
                <Input type="date" value={formFecha} onChange={(e) => setFormFecha(e.target.value)} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Tipo</label>
                <Select value={formTipo} onValueChange={(v) => setFormTipo(v as TipoMinuta)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TIPO_MINUTA_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Contenido</label>
              <Textarea
                value={formContenido}
                onChange={(e) => setFormContenido(e.target.value)}
                placeholder="Notas y puntos discutidos..."
                rows={6}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={!formTitulo.trim() || !formFecha || saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingMinuta ? 'Guardar' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar minuta</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. La minuta será eliminada permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive hover:bg-destructive/90">
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
