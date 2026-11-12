import { Suspense } from 'react'
import { COPILOT_VIEW, ConexaWorkspace } from '@/components/ai/conexa-workspace'

export const metadata = {
  title: 'Recomendaciones | Conexa | MDK Workspace',
  description: 'Chat contextual de Conexa, propuestas revisables y registro de acciones publicadas en las plataformas del cliente.',
}

export default function CopilotoPage() {
  return <Suspense><ConexaWorkspace initialView={COPILOT_VIEW} /></Suspense>
}
