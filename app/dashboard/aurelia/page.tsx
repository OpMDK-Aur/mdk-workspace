import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isMaster } from '@/lib/permissions'
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: colaborador } = await supabase
    .from('colaboradores')
    .select('modulos_habilitados, roles(nombre)')
    .eq('id', user.id)
    .maybeSingle()

  const roleName = (colaborador?.roles as { nombre?: string } | null)?.nombre ?? ''
  const canAccess = isMaster(roleName) || (colaborador?.modulos_habilitados ?? []).includes('aurelia')
  if (!canAccess) redirect('/dashboard')

  return (
    <Suspense fallback={<AureliaDashboardSkeleton />}>
      <AureliaData />
    </Suspense>
  )
}
