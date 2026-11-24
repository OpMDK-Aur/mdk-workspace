import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { Skeleton } from '@/components/ui/skeleton'
import { getAureliaViewer } from '@/lib/aurelia/access'
import { getAureliaDataset } from '@/lib/aurelia/crm-subscriptions'
import { getAureliaOnboarding } from '@/lib/aurelia/onboarding'
import { AureliaClientsView } from '@/components/aurelia/aurelia-clients-view'

export const metadata = {
  title: 'Clientes | Aurelia | MDK Workspace',
  description: 'Onboarding, encuestas NPS y seguimiento de los clientes activos de Aurelia.',
}

export const dynamic = 'force-dynamic'

async function ClientsData() {
  const [dataset, onboarding] = await Promise.all([getAureliaDataset(), getAureliaOnboarding()])
  return <AureliaClientsView dataset={dataset} onboarding={onboarding} />
}

export default async function AureliaClientesPage() {
  const viewer = await getAureliaViewer()
  if (!viewer) redirect('/auth/login')
  if (!viewer.canAccess) redirect('/dashboard')

  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-6 p-6" aria-busy="true" aria-label="Cargando clientes">
          <Skeleton className="h-14 w-72" />
          <Skeleton className="h-[28rem] w-full rounded-xl" />
        </div>
      }
    >
      <ClientsData />
    </Suspense>
  )
}
