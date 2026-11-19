import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getAureliaViewer } from '@/lib/aurelia/access'
import { getAureliaDataset } from '@/lib/aurelia/crm-subscriptions'
import { AureliaDashboard } from '@/components/aurelia/aurelia-dashboard'
import { AureliaDashboardSkeleton } from '@/components/aurelia/aurelia-dashboard-skeleton'

export const metadata = {
  title: 'Aurelia | MDK Workspace',
  description: 'Altas, bajas, MRR y clientes del CRM de Aurelia.',
}

export const dynamic = 'force-dynamic'

async function AureliaData() {
  const dataset = await getAureliaDataset()
  return <AureliaDashboard dataset={dataset} />
}

export default async function AureliaPage() {
  const viewer = await getAureliaViewer()
  if (!viewer) redirect('/auth/login')
  if (!viewer.canAccess) redirect('/dashboard')

  return (
    <Suspense fallback={<AureliaDashboardSkeleton />}>
      <AureliaData />
    </Suspense>
  )
}
