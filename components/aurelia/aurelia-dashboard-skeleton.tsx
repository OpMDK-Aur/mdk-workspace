import { Skeleton } from '@/components/ui/skeleton'
import { AureliaHeading } from './aurelia-heading'

export function AureliaDashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <AureliaHeading subtitle="Conectando con el CRM de Aurelia…" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-xl lg:col-span-2" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  )
}
