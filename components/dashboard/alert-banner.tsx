'use client'

import { useState } from 'react'
import { AlertCircle, X, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface AlertBannerProps {
  message: string
  type?: 'warning' | 'info' | 'success' | 'error'
}

export function AlertBanner({ message, type = 'warning' }: AlertBannerProps) {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  const bgColor = {
    warning: 'bg-status-naranja/10 border-status-naranja/20',
    info: 'bg-primary/10 border-primary/20',
    success: 'bg-status-verde/10 border-status-verde/20',
    error: 'bg-status-rojo/10 border-status-rojo/20',
  }

  const iconColor = {
    warning: 'text-status-naranja',
    info: 'text-primary',
    success: 'text-status-verde',
    error: 'text-status-rojo',
  }

  return (
    <div className={cn(
      'flex items-center gap-3 p-4 rounded-lg border',
      bgColor[type]
    )}>
      <AlertCircle className={cn('h-5 w-5 shrink-0', iconColor[type])} />
      <p className="flex-1 text-sm">{message}</p>
      <Button 
        variant="ghost" 
        size="sm" 
        className="text-primary shrink-0 gap-1"
      >
        Ver análisis
        <ArrowRight className="h-3 w-3" />
      </Button>
      <button 
        onClick={() => setDismissed(true)}
        className="p-1 hover:bg-foreground/5 rounded-md transition-colors"
      >
        <X className="h-4 w-4 text-muted-foreground" />
      </button>
    </div>
  )
}
