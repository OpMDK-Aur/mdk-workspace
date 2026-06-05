'use client'

import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ChartBlock } from './chart-block'
import { ImageBlock } from './image-block'
import { PdfBlock } from './pdf-block'
import type { Artifact } from './message-content'

interface ArtifactPanelProps {
  artifact: Artifact
  onClose: () => void
}

const TITLES: Record<Artifact['type'], string> = {
  chart: 'Gráfico',
  pdf: 'Informe PDF',
  image: 'Imagen',
}

export function ArtifactPanel({ artifact, onClose }: ArtifactPanelProps) {
  return (
    <aside className="flex h-full w-full flex-col border-l bg-card md:w-[420px] lg:w-[480px]">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h3 className="font-semibold">{TITLES[artifact.type]}</h3>
          <p className="text-xs text-muted-foreground">Vista previa</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar panel">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {artifact.type === 'chart' && <ChartBlock config={artifact.config as never} />}
        {artifact.type === 'image' && <ImageBlock config={artifact.config as never} />}
        {artifact.type === 'pdf' && (
          <PdfBlock config={artifact.config as never} messageContent={artifact.messageContent} />
        )}
      </div>
    </aside>
  )
}
