'use client'

import { Sparkles } from 'lucide-react'
import { SupervisorChat } from './supervisor-chat'

export function SupervisorPlayground({ clientId }: { clientId: string | null }) {
  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground md:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-2 border-b pb-6">
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="size-5" aria-hidden="true" />
            <span className="font-mono text-xs uppercase tracking-[0.18em]">AI workspace</span>
          </div>
          <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">Supervisor Agent</h1>
          <p className="max-w-2xl text-pretty text-muted-foreground">
            Punto de entrada aislado para validar el enrutamiento de consultas, herramientas y respuesta streaming.
          </p>
        </header>

        <SupervisorChat clientId={clientId} />
      </div>
    </main>
  )
}
