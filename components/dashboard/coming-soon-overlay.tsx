'use client'

import { useState } from 'react'
import { Rocket, X, Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface ComingSoonOverlayProps {
  role: string
}

function getRoleName(role: string) {
  switch (role) {
    case 'direccion':
      return 'Dirección'
    case 'project_manager':
      return 'Project Manager'
    case 'account_manager':
      return 'Account Manager'
    case 'consultor':
      return 'Consultor'
    default:
      return role
  }
}

export function ComingSoonOverlay({ role }: ComingSoonOverlayProps) {
  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault()
    setSubscribed(true)
  }

  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className="absolute top-4 right-4 z-50 bg-primary text-primary-foreground p-3 rounded-full shadow-lg hover:scale-105 transition-transform"
      >
        <Rocket className="h-5 w-5" />
      </button>
    )
  }

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <Card className="w-full max-w-md mx-4 shadow-2xl border-primary/20 relative overflow-hidden">
        {/* Animated background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10 pointer-events-none" />
        
        <button
          onClick={() => setIsMinimized(true)}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <CardHeader className="text-center pt-8 relative">
          <div className="mx-auto mb-4 relative">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
              <Rocket className="h-10 w-10 text-primary" />
            </div>
            <div className="absolute -top-1 -right-1 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
              <span className="text-primary-foreground text-xs font-bold">!</span>
            </div>
          </div>
          
          <CardTitle className="text-2xl font-bold text-balance">
            Panel de {getRoleName(role)}
          </CardTitle>
          <div className="inline-block mx-auto mt-2">
            <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
              Próximamente
            </span>
          </div>
          <CardDescription className="mt-4 text-base text-pretty">
            Estamos trabajando en una experiencia increíble para ti. 
            Este panel estará disponible muy pronto con todas las herramientas 
            que necesitas para gestionar tus clientes.
          </CardDescription>
        </CardHeader>

        <CardContent className="pb-8 relative">
          {!subscribed ? (
            <form onSubmit={handleSubscribe} className="space-y-3">
              <p className="text-sm text-center text-muted-foreground mb-4">
                Dejanos tu email y te avisaremos cuando esté listo
              </p>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1"
                  required
                />
                <Button type="submit" className="shrink-0">
                  <Bell className="h-4 w-4 mr-2" />
                  Avisar
                </Button>
              </div>
            </form>
          ) : (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-status-verde/10 mb-3">
                <svg className="w-6 h-6 text-status-verde" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-foreground font-medium">¡Listo!</p>
              <p className="text-sm text-muted-foreground mt-1">
                Te notificaremos cuando el panel esté disponible
              </p>
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-xs text-center text-muted-foreground">
              Mientras tanto, puedes acceder al panel de{' '}
              <span className="text-primary font-medium">Project Manager</span>{' '}
              que ya está disponible.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
