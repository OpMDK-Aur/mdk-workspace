import type { ReactNode } from 'react'
import { Gem } from 'lucide-react'

export function AureliaHeading({ subtitle, actions }: { subtitle: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Gem className="size-5" aria-hidden="true" />
        </span>
        <div className="flex flex-col">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unidad de negocio</p>
          <h1 className="text-2xl font-semibold tracking-tight text-balance">Aurelia</h1>
          <p className="text-sm text-muted-foreground text-pretty">{subtitle}</p>
        </div>
      </div>
      {actions}
    </header>
  )
}
