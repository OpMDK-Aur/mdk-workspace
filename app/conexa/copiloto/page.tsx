import { Suspense } from 'react'
import { COPILOT_VIEW, ConexaWorkspace } from '@/components/ai/conexa-workspace'

export const metadata = {
  title: 'Copiloto | Conexa | MDK Workspace',
  description: 'Conexa propone acciones concretas, vos las aprobás y Conexa las ejecuta y mide el resultado.',
}

export default function CopilotoPage() {
  return <Suspense><ConexaWorkspace initialView={COPILOT_VIEW} /></Suspense>
}
