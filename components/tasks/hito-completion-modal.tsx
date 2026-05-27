'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Loader2, ExternalLink, CheckCircle2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getHitoById, getInstanceByTaskId, completeInstance } from '@/lib/service-map'
import type { HitoCatalogo, ChecklistItem, ChecklistItemSnapshot, ClientPlan } from '@/lib/types'

interface HitoCompletionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tareaId: string
  hitoPoeId: string
  clientPlan: ClientPlan
  completadoPor: string
  onComplete: () => void // Called after successful completion
  onCancel: () => void // Called if user cancels
}

export function HitoCompletionModal({
  open,
  onOpenChange,
  tareaId,
  hitoPoeId,
  clientPlan,
  completadoPor,
  onComplete,
  onCancel,
}: HitoCompletionModalProps) {
  const [hito, setHito] = useState<HitoCatalogo | null>(null)
  const [instanciaId, setInstanciaId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Checklist state: map of item id -> checked status
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({})

  // Link drive state
  const [linkDrive, setLinkDrive] = useState('')

  // Fetch hito and instance data
  useEffect(() => {
    if (!open || !hitoPoeId || !tareaId) return

    async function fetchData() {
      setLoading(true)
      setError(null)

      // Fetch hito
      const hitoResult = await getHitoById(hitoPoeId)
      if (hitoResult.error || !hitoResult.data) {
        setError('No se pudo cargar el hito')
        setLoading(false)
        return
      }
      setHito(hitoResult.data)

      // Fetch instance by task id
      const instanceResult = await getInstanceByTaskId(tareaId)
      if (instanceResult.error) {
        setError('No se pudo cargar la instancia del hito')
        setLoading(false)
        return
      }
      if (instanceResult.data) {
        setInstanciaId(instanceResult.data.id)
      }

      // Initialize checklist state
      const checklist = getChecklistForPlan(hitoResult.data, clientPlan)
      const initialState: Record<string, boolean> = {}
      for (const item of checklist) {
        initialState[item.id] = false
      }
      setChecklistState(initialState)

      setLoading(false)
    }

    fetchData()
  }, [open, hitoPoeId, tareaId, clientPlan])

  // Get the correct checklist based on client plan
  function getChecklistForPlan(hito: HitoCatalogo, plan: ClientPlan): ChecklistItem[] {
    if (plan === 'Esencial') {
      return hito.checklist_esencial || []
    }
    // Estrategico uses checklist_estrategico
    return hito.checklist_estrategico || []
  }

  // Toggle checklist item
  const toggleItem = (itemId: string) => {
    setChecklistState((prev) => ({
      ...prev,
      [itemId]: !prev[itemId],
    }))
  }

  // Check if all items are checked
  const allChecked = hito
    ? getChecklistForPlan(hito, clientPlan).every((item) => checklistState[item.id])
    : false

  // Handle confirm
  const handleConfirm = async () => {
    if (!hito || !instanciaId) {
      // If no instance found, just complete without service map update
      onComplete()
      return
    }

    setSaving(true)
    setError(null)

    // Build checklist snapshot
    const checklist = getChecklistForPlan(hito, clientPlan)
    const snapshot: ChecklistItemSnapshot[] = checklist.map((item) => ({
      id: item.id,
      texto: item.texto,
      completado: checklistState[item.id] || false,
    }))

    const checklistCompleto = snapshot.every((item) => item.completado)

    // Complete the instance
    const result = await completeInstance(
      instanciaId,
      completadoPor,
      snapshot,
      checklistCompleto,
      hito.requiere_link_drive && linkDrive.trim() ? linkDrive.trim() : undefined
    )

    if (result.error) {
      setError(result.error)
      setSaving(false)
      return
    }

    setSaving(false)
    onComplete()
  }

  // Handle cancel
  const handleCancel = () => {
    onCancel()
    onOpenChange(false)
  }

  const checklist = hito ? getChecklistForPlan(hito, clientPlan) : []
  const hasChecklist = checklist.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            Completando Hito
          </DialogTitle>
          {hito && (
            <DialogDescription className="text-base font-medium text-foreground pt-1">
              {hito.nombre}
            </DialogDescription>
          )}
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Cargando checklist...</span>
          </div>
        ) : error ? (
          <div className="text-center py-8 text-destructive">
            <p className="text-sm">{error}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={handleCancel}>
              Continuar sin checklist
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {/* Checklist */}
            {hasChecklist ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Marca los items completados del checklist:
                </p>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                  {checklist.map((item) => (
                    <label
                      key={item.id}
                      className={cn(
                        'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                        checklistState[item.id]
                          ? 'bg-emerald-500/5 border-emerald-500/30'
                          : 'bg-card hover:bg-muted/50'
                      )}
                    >
                      <Checkbox
                        checked={checklistState[item.id] || false}
                        onCheckedChange={() => toggleItem(item.id)}
                        className="mt-0.5"
                      />
                      <span
                        className={cn(
                          'text-sm',
                          checklistState[item.id] && 'text-muted-foreground line-through'
                        )}
                      >
                        {item.texto}
                      </span>
                    </label>
                  ))}
                </div>

                {/* Warning if not all checked */}
                {!allChecked && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Puedes cerrar el hito con checklist incompleto, pero se registrará en el historial.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Este hito no tiene checklist definido.
              </p>
            )}

            {/* Link Drive field */}
            {hito?.requiere_link_drive && (
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Link de Drive
                  <span className="text-destructive">*</span>
                </label>
                <Input
                  value={linkDrive}
                  onChange={(e) => setLinkDrive(e.target.value)}
                  placeholder="https://drive.google.com/..."
                  type="url"
                />
                <p className="text-xs text-muted-foreground">
                  Este hito requiere un link al documento en Drive.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading || saving || (hito?.requiere_link_drive && !linkDrive.trim())}
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirmar y Cerrar Tarea
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
