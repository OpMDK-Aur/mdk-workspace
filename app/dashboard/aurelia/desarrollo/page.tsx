import { redirect } from 'next/navigation'
import { getAureliaViewer } from '@/lib/aurelia/access'
import { AureliaHeading } from '@/components/aurelia/aurelia-heading'
import { DevBoard } from '@/components/aurelia/dev-board/dev-board'

export const metadata = {
  title: 'Desarrollo | Aurelia | MDK Workspace',
  description: 'Panel kanban de tareas de desarrollo de Aurelia: errores, sugerencias y próximos pasos.',
}

export const dynamic = 'force-dynamic'

export default async function AureliaDesarrolloPage() {
  const viewer = await getAureliaViewer()
  if (!viewer) redirect('/auth/login')
  if (!viewer.canAccess) redirect('/dashboard')

  return (
    <div className="flex min-h-full flex-col gap-6 p-6">
      <AureliaHeading subtitle="Tareas de desarrollo: errores y sugerencias, de la revisión a producción." />
      <DevBoard />
    </div>
  )
}
