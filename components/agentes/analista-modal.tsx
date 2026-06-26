'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FileText, ArrowRight } from 'lucide-react'

interface AnalistaModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialClientId?: string
}

export function AnalistaModal({
  open,
  onOpenChange,
  initialClientId,
}: AnalistaModalProps) {
  const router = useRouter()

  const handleOpenAnalista = () => {
    // Redirect to analista page
    router.push('/analista')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#7F77DD]" />
            Ejecutar Analista
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Se abrirá la herramienta Analista donde podrás generar el informe de cierre de mes para el cliente.
          </p>

          {initialClientId && (
            <div className="p-3 bg-muted/50 rounded-md">
              <p className="text-xs text-muted-foreground">ID de cliente preseleccionado: <code className="text-xs bg-background px-1 py-0.5 rounded">{initialClientId}</code></p>
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              className="gap-2 bg-[#7F77DD] hover:bg-[#6B63C7]"
              onClick={handleOpenAnalista}
            >
              <FileText className="h-4 w-4" />
              Ir a Analista
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
