'use client'

import { useState } from 'react'
import { Loader2, Square, TimerOff } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useTimerStore } from '@/lib/time-tracking/timer-store'

interface ActiveTimerBlockedDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ActiveTimerBlockedDialog({ open, onOpenChange }: ActiveTimerBlockedDialogProps) {
  const description = useTimerStore((s) => s.description)
  const stopTimer = useTimerStore((s) => s.stopTimer)
  const [isStopping, setIsStopping] = useState(false)

  const handleStop = async () => {
    setIsStopping(true)
    try {
      await stopTimer()
      toast.success('Marcador detenido. Ya podés iniciar una nueva marcación.')
      onOpenChange(false)
    } catch {
      toast.error('No se pudo detener el marcador')
    } finally {
      setIsStopping(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <TimerOff className="h-5 w-5 text-amber-500" aria-hidden="true" />
            <AlertDialogTitle>Tenés un marcador activo</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="leading-relaxed">
            No podés iniciar una nueva marcación mientras el timer está corriendo. Frená el marcador actual para continuar.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {description && (
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">En curso: </span>
            <span className="font-medium text-foreground">{description}</span>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isStopping}>Cancelar</AlertDialogCancel>
          <Button variant="destructive" onClick={handleStop} disabled={isStopping} className="gap-1.5">
            {isStopping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-3.5 w-3.5 fill-current" />}
            Detener marcador actual
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
