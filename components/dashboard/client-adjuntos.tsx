'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { 
  Plus, Trash2, Loader2, FileText, Image, FileVideo, 
  File, Download, ExternalLink, Upload 
} from 'lucide-react'

interface Adjunto {
  id: string
  cliente_id: string
  nombre: string
  url: string
  tipo: string | null
  tamanio: number | null
  subido_por: string | null
  created_at: string
}

interface ClientAdjuntosProps {
  clientId: string
  currentUserId?: string
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileIcon(tipo: string | null) {
  if (!tipo) return File
  if (tipo.startsWith('image')) return Image
  if (tipo.startsWith('video')) return FileVideo
  if (tipo.includes('pdf')) return FileText
  return File
}

function getFileType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg']
  const videoExts = ['mp4', 'mov', 'avi', 'webm']
  const docExts = ['pdf', 'doc', 'docx']
  
  if (imageExts.includes(ext)) return 'image'
  if (videoExts.includes(ext)) return 'video'
  if (docExts.includes(ext)) return 'document'
  return 'file'
}

export function ClientAdjuntos({ clientId, currentUserId }: ClientAdjuntosProps) {
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const supabase = createClient()

  useEffect(() => {
    fetchAdjuntos()
  }, [clientId])

  const fetchAdjuntos = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('cliente_adjuntos')
      .select('*')
      .eq('cliente_id', clientId)
      .order('created_at', { ascending: false })

    if (!error && data) {
      setAdjuntos(data)
    }
    setLoading(false)
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)

    for (const file of Array.from(files)) {
      const fileName = `${clientId}/${Date.now()}-${file.name}`
      
      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('cliente-adjuntos')
        .upload(fileName, file)

      if (uploadError) {
        console.error('Error uploading file:', uploadError)
        continue
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('cliente-adjuntos')
        .getPublicUrl(fileName)

      // Save to database
      const { data, error } = await supabase
        .from('cliente_adjuntos')
        .insert({
          cliente_id: clientId,
          nombre: file.name,
          url: publicUrl,
          tipo: getFileType(file.name),
          tamanio: file.size,
          subido_por: currentUserId,
        })
        .select()
        .single()

      if (!error && data) {
        setAdjuntos(prev => [data, ...prev])
      }
    }

    setUploading(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleDelete = async (adjunto: Adjunto) => {
    // Delete from storage
    const fileName = adjunto.url.split('/').pop()
    if (fileName) {
      await supabase.storage
        .from('cliente-adjuntos')
        .remove([`${clientId}/${fileName}`])
    }

    // Delete from database
    const { error } = await supabase
      .from('cliente_adjuntos')
      .delete()
      .eq('id', adjunto.id)

    if (!error) {
      setAdjuntos(prev => prev.filter(a => a.id !== adjunto.id))
    }
  }

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Adjuntos
        </h3>
        <div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleUpload}
            multiple
            className="hidden"
          />
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 px-2"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : adjuntos.length === 0 ? (
        <div 
          className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            Click para subir archivos o arrastra aqui
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {adjuntos.map(adjunto => {
            const Icon = getFileIcon(adjunto.tipo)
            return (
              <div
                key={adjunto.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group"
              >
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{adjunto.nombre}</p>
                  <div className="flex items-center gap-2">
                    {adjunto.tamanio && (
                      <span className="text-xs text-muted-foreground">
                        {formatFileSize(adjunto.tamanio)}
                      </span>
                    )}
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {adjunto.tipo || 'archivo'}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => window.open(adjunto.url, '_blank')}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    asChild
                  >
                    <a href={adjunto.url} download={adjunto.nombre}>
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(adjunto)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}

          {/* Upload more button */}
          <div 
            className="border border-dashed rounded-lg p-3 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <p className="text-xs text-muted-foreground">+ Agregar mas archivos</p>
          </div>
        </div>
      )}
    </div>
  )
}
