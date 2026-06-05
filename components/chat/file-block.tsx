'use client'

import { Download, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface FileData {
  name: string
  type: string
  content: string
}

export function FileBlock({ config }: { config: FileData }) {
  const { name, type, content } = config

  const handleDownload = () => {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="my-4 p-4 rounded-lg border bg-card flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-[#7F77DD]/10 flex items-center justify-center">
          <FileText className="h-5 w-5 text-[#7F77DD]" />
        </div>
        <div>
          <p className="font-medium">{name}</p>
          <p className="text-sm text-muted-foreground">{type}</p>
        </div>
      </div>
      <Button onClick={handleDownload} variant="outline" size="sm" className="gap-2">
        <Download className="h-4 w-4" />
        Descargar
      </Button>
    </div>
  )
}
