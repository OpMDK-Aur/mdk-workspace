'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { Loader2, Plus, Trash2, GripVertical, Save, ArrowLeft, Map } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { HitoCatalogo, FrecuenciaHito, TipoServicio, ChecklistItem } from '@/lib/types'
import { updateCatalogHito, checkHitoHasFutureInstances } from '@/lib/service-map'
import Link from 'next/link'

const MASTER_ROL_ID = '9c585cac-f311-4c7a-83d5-23d3c714db6a'

const FRECUENCIAS: FrecuenciaHito[] = [
  'Mensual',
  'Bimestral',
  'Semanal',
  'Semanal (Lun)',
  'Semanal (Vie)',
  '2 Veces x Sem',
]

const TIPO_SERVICIO_OPTIONS: { value: TipoServicio; label: string }[] = [
  { value: 'esencial', label: 'Esencial' },
  { value: 'estrategico', label: 'Estratégico' },
]

interface HitoWithActive extends HitoCatalogo {
  activo: boolean
}

export default function HitosConfigPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [hitos, setHitos] = useState<HitoWithActive[]>([])
  
  // Edit panel state
  const [selectedHito, setSelectedHito] = useState<HitoWithActive | null>(null)
  const [editForm, setEditForm] = useState<Partial<HitoWithActive>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Confirmation dialog state
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [hasFutureInstances, setHasFutureInstances] = useState(false)

  // Check authorization and load data
  useEffect(() => {
    async function init() {
      const supabase = createClient()
      
      // Check user authorization
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }

      const { data: colaborador } = await supabase
        .from('colaboradores')
        .select('rol_id')
        .eq('user_id', user.id)
        .single()

      if (!colaborador || colaborador.rol_id !== MASTER_ROL_ID) {
        router.push('/dashboard')
        return
      }

      setAuthorized(true)

      // Load hitos catalog
      const { data: hitosData, error: hitosError } = await supabase
        .from('hitos_catalogo')
        .select('*')
        .order('orden')

      if (hitosError) {
        console.error('Error loading hitos:', hitosError)
        setError('Error cargando el catálogo de hitos')
      } else {
        setHitos(hitosData || [])
      }

      setLoading(false)
    }

    init()
  }, [router])

  // Open edit panel
  const handleRowClick = (hito: HitoWithActive) => {
    setSelectedHito(hito)
    setEditForm({
      nombre: hito.nombre,
      descripcion: hito.descripcion,
      tipo_servicio: hito.tipo_servicio,
      frecuencia: hito.frecuencia,
      genera_tarea: hito.genera_tarea,
      requiere_link_drive: hito.requiere_link_drive,
      activo: hito.activo,
      checklist_esencial: hito.checklist_esencial ? [...hito.checklist_esencial] : [],
      checklist_estrategico: hito.checklist_estrategico ? [...hito.checklist_estrategico] : [],
    })
    setError(null)
  }

  // Close edit panel
  const handleClosePanel = () => {
    setSelectedHito(null)
    setEditForm({})
    setError(null)
  }

  // Add checklist item
  const addChecklistItem = (type: 'esencial' | 'estrategico') => {
    const key = type === 'esencial' ? 'checklist_esencial' : 'checklist_estrategico'
    const current = editForm[key] || []
    const newItem: ChecklistItem = {
      id: crypto.randomUUID(),
      texto: '',
    }
    setEditForm(prev => ({
      ...prev,
      [key]: [...current, newItem],
    }))
  }

  // Update checklist item text
  const updateChecklistItem = (type: 'esencial' | 'estrategico', itemId: string, texto: string) => {
    const key = type === 'esencial' ? 'checklist_esencial' : 'checklist_estrategico'
    const current = editForm[key] || []
    setEditForm(prev => ({
      ...prev,
      [key]: current.map(item => item.id === itemId ? { ...item, texto } : item),
    }))
  }

  // Remove checklist item
  const removeChecklistItem = (type: 'esencial' | 'estrategico', itemId: string) => {
    const key = type === 'esencial' ? 'checklist_esencial' : 'checklist_estrategico'
    const current = editForm[key] || []
    setEditForm(prev => ({
      ...prev,
      [key]: current.filter(item => item.id !== itemId),
    }))
  }

  // Pre-save check for future instances
  const handleSaveClick = async () => {
    if (!selectedHito) return

    // Check if there are future instances
    const hasInstances = await checkHitoHasFutureInstances(selectedHito.id)
    setHasFutureInstances(hasInstances)

    if (hasInstances) {
      setConfirmDialogOpen(true)
    } else {
      await performSave()
    }
  }

  // Perform the actual save
  const performSave = async () => {
    if (!selectedHito) return

    setSaving(true)
    setError(null)

    try {
      const updates = {
        nombre: editForm.nombre || selectedHito.nombre,
        descripcion: editForm.descripcion ?? selectedHito.descripcion,
        tipo_servicio: editForm.tipo_servicio || selectedHito.tipo_servicio,
        frecuencia: editForm.frecuencia || selectedHito.frecuencia,
        genera_tarea: editForm.genera_tarea ?? selectedHito.genera_tarea,
        requiere_link_drive: editForm.requiere_link_drive ?? selectedHito.requiere_link_drive,
        activo: editForm.activo ?? selectedHito.activo,
        checklist_esencial: editForm.checklist_esencial?.filter(item => item.texto.trim()) || null,
        checklist_estrategico: editForm.checklist_estrategico?.filter(item => item.texto.trim()) || null,
      }

      const result = await updateCatalogHito(selectedHito.id, updates)

      if (!result.success) {
        setError(result.error || 'Error guardando cambios')
        return
      }

      // Update local state
      setHitos(prev => prev.map(h => 
        h.id === selectedHito.id 
          ? { ...h, ...updates } as HitoWithActive
          : h
      ))

      handleClosePanel()
    } catch (err) {
      console.error('Error saving hito:', err)
      setError('Error inesperado al guardar')
    } finally {
      setSaving(false)
      setConfirmDialogOpen(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!authorized) {
    return null // Will redirect
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/clients/config">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Map className="h-6 w-6" />
              Configuración del Mapa de Servicio
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Administra los hitos del catálogo y sus checklists
            </p>
          </div>
        </div>
      </div>

      {/* Hitos Table */}
      <Card>
        <CardHeader>
          <CardTitle>Catálogo de Hitos</CardTitle>
          <CardDescription>
            Haz clic en una fila para editar el hito
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">#</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="w-[120px]">Tipo</TableHead>
                  <TableHead className="w-[140px]">Frecuencia</TableHead>
                  <TableHead className="w-[100px] text-center">Genera Tarea</TableHead>
                  <TableHead className="w-[100px] text-center">Link Drive</TableHead>
                  <TableHead className="w-[80px] text-center">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hitos.map((hito) => (
                  <TableRow
                    key={hito.id}
                    className={cn(
                      'cursor-pointer hover:bg-muted/50 transition-colors',
                      selectedHito?.id === hito.id && 'bg-muted'
                    )}
                    onClick={() => handleRowClick(hito)}
                  >
                    <TableCell className="font-mono text-muted-foreground">
                      {hito.orden}
                    </TableCell>
                    <TableCell className="font-medium">{hito.nombre}</TableCell>
                    <TableCell>
                      <Badge 
                        variant={hito.tipo_servicio === 'estrategico' ? 'default' : 'secondary'}
                        className="capitalize"
                      >
                        {hito.tipo_servicio}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{hito.frecuencia}</TableCell>
                    <TableCell className="text-center">
                      {hito.genera_tarea ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          Sí
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {hito.requiere_link_drive ? (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                          Sí
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {hito.activo ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          Activo
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200">
                          Inactivo
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Panel */}
      <Sheet open={!!selectedHito} onOpenChange={(open) => !open && handleClosePanel()}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Editar Hito</SheetTitle>
            <SheetDescription>
              Modifica los campos del hito y su checklist
            </SheetDescription>
          </SheetHeader>

          {selectedHito && (
            <div className="mt-6 space-y-6">
              {/* Basic Fields */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nombre">Nombre</Label>
                  <Input
                    id="nombre"
                    value={editForm.nombre || ''}
                    onChange={(e) => setEditForm(prev => ({ ...prev, nombre: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="descripcion">Descripción</Label>
                  <Textarea
                    id="descripcion"
                    value={editForm.descripcion || ''}
                    onChange={(e) => setEditForm(prev => ({ ...prev, descripcion: e.target.value }))}
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="tipo_servicio">Tipo de Servicio</Label>
                    <Select
                      value={editForm.tipo_servicio}
                      onValueChange={(v) => setEditForm(prev => ({ ...prev, tipo_servicio: v as TipoServicio }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIPO_SERVICIO_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="frecuencia">Frecuencia</Label>
                    <Select
                      value={editForm.frecuencia}
                      onValueChange={(v) => setEditForm(prev => ({ ...prev, frecuencia: v as FrecuenciaHito }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FRECUENCIAS.map(freq => (
                          <SelectItem key={freq} value={freq}>
                            {freq}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center justify-between py-2">
                  <div className="space-y-0.5">
                    <Label>Genera Tarea</Label>
                    <p className="text-xs text-muted-foreground">
                      Crear tarea automáticamente al generar instancias
                    </p>
                  </div>
                  <Switch
                    checked={editForm.genera_tarea ?? false}
                    onCheckedChange={(checked) => setEditForm(prev => ({ ...prev, genera_tarea: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between py-2">
                  <div className="space-y-0.5">
                    <Label>Requiere Link de Drive</Label>
                    <p className="text-xs text-muted-foreground">
                      Solicitar link al completar el hito
                    </p>
                  </div>
                  <Switch
                    checked={editForm.requiere_link_drive ?? false}
                    onCheckedChange={(checked) => setEditForm(prev => ({ ...prev, requiere_link_drive: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between py-2">
                  <div className="space-y-0.5">
                    <Label>Activo</Label>
                    <p className="text-xs text-muted-foreground">
                      Incluir en la generación de instancias
                    </p>
                  </div>
                  <Switch
                    checked={editForm.activo ?? true}
                    onCheckedChange={(checked) => setEditForm(prev => ({ ...prev, activo: checked }))}
                  />
                </div>
              </div>

              {/* Checklist Esencial */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">Checklist Esencial</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addChecklistItem('esencial')}
                    className="gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Agregar
                  </Button>
                </div>
                <div className="space-y-2">
                  {(editForm.checklist_esencial || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground italic py-2">
                      Sin items de checklist
                    </p>
                  ) : (
                    (editForm.checklist_esencial || []).map((item, index) => (
                      <div key={item.id} className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground/50" />
                        <span className="text-xs text-muted-foreground w-4">{index + 1}.</span>
                        <Input
                          value={item.texto}
                          onChange={(e) => updateChecklistItem('esencial', item.id, e.target.value)}
                          placeholder="Descripción del item..."
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => removeChecklistItem('esencial', item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Checklist Estratégico */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">Checklist Estratégico</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addChecklistItem('estrategico')}
                    className="gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Agregar
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Items adicionales visibles solo para clientes con plan Estratégico
                </p>
                <div className="space-y-2">
                  {(editForm.checklist_estrategico || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground italic py-2">
                      Sin items adicionales
                    </p>
                  ) : (
                    (editForm.checklist_estrategico || []).map((item, index) => (
                      <div key={item.id} className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground/50" />
                        <span className="text-xs text-muted-foreground w-4">{index + 1}.</span>
                        <Input
                          value={item.texto}
                          onChange={(e) => updateChecklistItem('estrategico', item.id, e.target.value)}
                          placeholder="Descripción del item..."
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => removeChecklistItem('estrategico', item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Error message */}
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              {/* Save button */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={handleClosePanel}>
                  Cancelar
                </Button>
                <Button onClick={handleSaveClick} disabled={saving} className="gap-2">
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Guardar Cambios
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar cambios</AlertDialogTitle>
            <AlertDialogDescription>
              Este hito tiene instancias futuras no completadas. Los cambios que realices 
              afectarán esas instancias pendientes. ¿Deseas continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={performSave}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
