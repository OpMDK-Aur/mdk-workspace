'use client'

import { useState } from 'react'
import { Activity, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { AureliaClient, AureliaDataset } from '@/lib/aurelia/metrics'
import type { AureliaOnboardingData } from '@/lib/aurelia/onboarding-shared'
import { AureliaClientSheet } from './aurelia-client-sheet'
import { AureliaHeading } from './aurelia-heading'
import { AureliaOnboardingPanel } from './aurelia-onboarding-panel'
import { useAureliaTime } from './use-aurelia-time'

export function AureliaClientsView({ dataset, onboarding }: { dataset: AureliaDataset; onboarding: AureliaOnboardingData }) {
  const [selectedClient, setSelectedClient] = useState<AureliaClient | null>(null)
  const time = useAureliaTime()

  return (
    <div className="flex flex-col gap-6 p-6">
      <AureliaHeading subtitle="Onboarding y seguimiento de los clientes activos." />

      {dataset.available ? (
        <>
          <AureliaOnboardingPanel clients={dataset.clients} onboarding={onboarding} onOpenClient={setSelectedClient} />
          <AureliaClientSheet client={selectedClient} currency={dataset.currency} time={time} onClose={() => setSelectedClient(null)} />
        </>
      ) : (
        <p className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          {dataset.message}
        </p>
      )}

      <Card aria-disabled="true" className="border-dashed">
        <CardHeader className="flex flex-row items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Activity className="size-4" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-medium">Controller de actividad</CardTitle>
              <Badge variant="secondary">Próximamente</Badge>
            </div>
            <CardDescription className="text-pretty">Monitoreo de la actividad de cada cliente dentro de Aurelia, para detectar a tiempo a los que dejan de usarla.</CardDescription>
          </div>
        </CardHeader>
      </Card>
    </div>
  )
}
