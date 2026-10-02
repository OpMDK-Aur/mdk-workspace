import type { Metadata } from 'next'
import { SeguimientoView } from '@/components/seguimiento/seguimiento-view'

export const metadata: Metadata = {
  title: 'Seguimiento semanal',
}

export default function SeguimientoPage() {
  return <SeguimientoView />
}
