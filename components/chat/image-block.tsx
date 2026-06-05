'use client'

import { useState, useEffect, useRef } from 'react'
import { Loader2, ImageOff, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ImageBlockConfig {
  prompt: string
  alt?: string
}

export function ImageBlock({ config }: { config: ImageBlockConfig }) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const requestedRef = useRef(false)

  useEffect(() => {
    if (requestedRef.current) return
    requestedRef.current = true

    const generate = async () => {
      try {
        const res = await fetch('/api/agentes/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: config.prompt }),
        })
        if (!res.ok) throw new Error('Failed')
        const data = await res.json()
        if (data.url) {
          setUrl(data.url)
        } else {
          setError(true)
        }
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    }

    generate()
  }, [config.prompt])

  const handleDownload = () => {
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = `imagen-${Date.now()}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div className="my-4 rounded-xl border bg-card overflow-hidden">
      {loading && (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-sm">Generando imagen...</span>
        </div>
      )}
      {error && (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
          <ImageOff className="h-6 w-6" />
          <span className="text-sm">No se pudo generar la imagen</span>
        </div>
      )}
      {url && !loading && !error && (
        <div className="relative group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={config.alt || config.prompt} className="w-full h-auto" />
          <Button
            size="icon"
            variant="secondary"
            className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={handleDownload}
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
