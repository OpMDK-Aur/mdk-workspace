'use client'

import { useState, useRef } from 'react'
import type { AgentConfig } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface AgentConfigSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  agente: AgentConfig
}

const VARIABLES = [
  '{{cliente.nombre}}',
  '{{periodo}}',
  '{{metricas.cpl}}',
  '{{metricas.inversion}}',
  '{{metricas.conversiones}}',
  '{{cliente_memoria}}',
]

const BEHAVIOR_LABELS: Record<string, string> = {
  crear_tarea_al_finalizar: 'Crear tarea al finalizar',
  incluir_cliente_memoria: 'Incluir historial del cliente',
  notificar_account_manager: 'Notificar al account manager',
  crear_tarea_al_detectar_anomalia: 'Crear tarea al detectar anomalia',
  solo_unidad_mdk: 'Solo unidad MDK',
  cerrar_hito_al_finalizar: 'Cerrar hito al finalizar',
  notificar_responsable_tecnologia: 'Notificar responsable de tecnologia',
}

export function AgentConfigSheet({ open, onOpenChange, agente }: AgentConfigSheetProps) {
  const supabase = createClient()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  
  const [systemPrompt, setSystemPrompt] = useState(agente.system_prompt || '')
  const [parametros, setParametros] = useState<Record<string, unknown>>(agente.parametros || {})
  const [comportamiento, setComportamiento] = useState<Record<string, unknown>>(agente.comportamiento || {})
  const [saving, setSaving] = useState(false)

  const insertVariable = (variable: string) => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const newValue = systemPrompt.slice(0, start) + variable + systemPrompt.slice(end)
    setSystemPrompt(newValue)
    
    // Reset cursor position after React updates the value
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + variable.length, start + variable.length)
    }, 0)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      const { error } = await supabase
        .from('agentes_config')
        .update({
          system_prompt: systemPrompt,
          parametros,
          comportamiento,
          actualizado_por: user?.id,
          updated_at: new Date().toISOString(),
        })
        .eq('slug', agente.slug)

      if (error) throw error

      toast.success('Configuracion guardada')
      onOpenChange(false)
    } catch (error) {
      console.error('Error saving config:', error)
      toast.error('Error al guardar la configuracion')
    } finally {
      setSaving(false)
    }
  }

  const handleRestore = async () => {
    // This would restore from a defaults table or hardcoded values
    toast.info('Funcion de restaurar aun no implementada')
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[480px] sm:max-w-[480px]">
        <SheetHeader>
          <SheetTitle>Configurar {agente.nombre}</SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="context" className="mt-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="context">Contexto</TabsTrigger>
            <TabsTrigger value="params">Parametros</TabsTrigger>
            <TabsTrigger value="behavior">Comportamiento</TabsTrigger>
          </TabsList>

          {/* Tab 1: Context & Instructions */}
          <TabsContent value="context" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>System Prompt</Label>
              <Textarea
                ref={textareaRef}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="min-h-[200px] font-mono text-sm"
                placeholder="Instrucciones para el agente..."
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Variables disponibles</Label>
              <div className="flex flex-wrap gap-1.5">
                {VARIABLES.map((v) => (
                  <Badge
                    key={v}
                    variant="secondary"
                    className="cursor-pointer hover:bg-[#7F77DD]/20 transition-colors"
                    onClick={() => insertVariable(v)}
                  >
                    {v}
                  </Badge>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Tab 2: Parameters */}
          <TabsContent value="params" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Modelo</Label>
                <Select
                  value={(parametros.modelo as string) || 'claude-opus-4-20250514'}
                  onValueChange={(v) => setParametros({ ...parametros, modelo: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="claude-opus-4-20250514">Claude Sonnet 4</SelectItem>
                    <SelectItem value="claude-haiku-4-5-20251001">Claude Haiku 4.5</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Temperatura</Label>
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.1}
                  value={(parametros.temperatura as number) || 0.7}
                  onChange={(e) => setParametros({ ...parametros, temperatura: parseFloat(e.target.value) })}
                />
              </div>

              <div className="space-y-2">
                <Label>Max Tokens</Label>
                <Input
                  type="number"
                  value={(parametros.max_tokens as number) || 4000}
                  onChange={(e) => setParametros({ ...parametros, max_tokens: parseInt(e.target.value) })}
                />
              </div>

              {agente.slug === 'controller' && (
                <div className="space-y-2">
                  <Label>Umbral CPL (multiplicador)</Label>
                  <Input
                    type="number"
                    step={0.5}
                    value={(parametros.umbral_cpl_multiplicador as number) || 2}
                    onChange={(e) => setParametros({ ...parametros, umbral_cpl_multiplicador: parseFloat(e.target.value) })}
                  />
                </div>
              )}

              {agente.slug === 'redactor' && (
                <div className="space-y-2">
                  <Label>Max Palabras</Label>
                  <Input
                    type="number"
                    value={(parametros.max_palabras as number) || 300}
                    onChange={(e) => setParametros({ ...parametros, max_palabras: parseInt(e.target.value) })}
                  />
                </div>
              )}
            </div>
          </TabsContent>

          {/* Tab 3: Behavior */}
          <TabsContent value="behavior" className="space-y-4 mt-4">
            <div className="space-y-4">
              {Object.entries(comportamiento).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <Label className="font-normal">
                    {BEHAVIOR_LABELS[key] || key}
                  </Label>
                  <Switch
                    checked={value as boolean}
                    onCheckedChange={(checked) => 
                      setComportamiento({ ...comportamiento, [key]: checked })
                    }
                  />
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t bg-background">
          <div className="text-xs text-muted-foreground mb-3">
            Ultima edicion: {format(new Date(agente.updated_at), "d 'de' MMMM, HH:mm", { locale: es })}
          </div>
          <div className="flex gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">
                  Restaurar default
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Restaurar configuracion</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esto revertira todas las modificaciones a los valores originales. Esta accion no se puede deshacer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRestore}>
                    Restaurar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Button 
              className="flex-1 bg-[#7F77DD] hover:bg-[#6B63C7]"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
