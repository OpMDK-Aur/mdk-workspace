'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Trash2, Loader2, FileText, Image, FileVideo,
  File, Download, ExternalLink, Upload,
} from 'lucide-react'
import type { Task, TaskFile } from '@/lib/types'
import { useTaskStore } from '@/lib/tasks/task-store'

interface TareaAdjunto {
  id: string
  tarea_id: string
  nombre: string
  url: string
  tipo: string | null
  tamanio: number | null
  subido_por: string | null
  created_at: string
}

export interface TaskFilesSectionProps {
  task: Task
  currentUserId: string | null
  colaboradorNombre?: string
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
  if (tipo.includes('pdf') || tipo.includes('document')) return FileText
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

export function TaskFilesSection({ task, currentUserId, colaboradorNombre }: TaskFilesSectionProps) {
  const { addFile, deleteFile } = useTaskStore()
  const [adjuntos, setAdjuntos] = useState<TareaAdjunto[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  useEffect(() => {
    fetchAdjuntos()
  }, [task.id])

  const fetchAdjuntos = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('tarea_adjuntos')
      .select('*')
      .eq('tarea_id', task.id)
      .order('created_at', { ascending: false })

    if (!error && data) {
      setAdjuntos(data)
    }
    setLoading(false)
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    console.log('[v0] TaskFilesSection handleUpload called, files:', files?.length)
    if (!files || files.length === 0) return

    setUploading(true)
    setError(null)

    for (const file of Array.from(files)) {
      console.log('[v0] Uploading file:', file.name, file.size, file.type)
      const sanitizedName = file.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_.-]/g, '')

      const path = `${currentUserId || 'anon'}/${task.id}/${Date.now()}-${sanitizedName}`
      console.log('[v0] Storage path:', path)

      try {
        const { error: uploadError } = await supabase.storage
          .from('task-files')
          .upload(path, file)

        if (uploadError) {
          console.error('[v0] Storage upload error:', uploadError)
          setError(`Error al subir ${file.name}: ${uploadError.message}`)
          continue
        }

        console.log('[v0] Storage upload success, getting public URL')
        const { data: { publicUrl } } = supabase.storage
          .from('task-files')
          .getPublicUrl(path)
        console.log('[v0] Public URL:', publicUrl)

        const { data: dbData, error: dbError } = await supabase
          .from('tarea_adjuntos')
          .insert({
            tarea_id: task.id,
            nombre: file.name,
            url: publicUrl,
            tipo: getFileType(file.name),
            tamanio: file.size,
            subido_por: currentUserId,
          })
          .select()
          .single()

        if (dbError) {
          setError(`Error al guardar ${file.name}: ${dbError.message}`)
          continue
        }

        if (dbData) {
          setAdjuntos(prev => [dbData, ...prev])
          // Sync with task store
          addFile(task.id, {
            name: file.name,
            url: publicUrl,
            mimeType: file.type,
            size: file.size,
            uploadedBy: currentUserId || 'unknown',
            uploadedByName: colaboradorNombre || 'Usuario',
          })
        }
      } catch (err) {
        setError(`Error inesperado al subir ${file.name}`)
      }
    }

    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDelete = async (adjunto: TareaAdjunto) => {
    // Reconstruct storage path from public URL
    const urlObj = new URL(adjunto.url)
    const pathAfterBucket = urlObj.pathname.split('/task-files/')[1]
    if (pathAfterBucket) {
      await supabase.storage.from('task-files').remove([pathAfterBucket])
    }

    const { error } = await supabase
      .from('tarea_adjuntos')
      .delete()
      .eq('id', adjunto.id)

    if (!error) {
      setAdjuntos(prev => prev.filter(a => a.id !== adjunto.id))
      // Find and remove from task store
      const storeFile = task.files.find(f => f.url === adjunto.url)
      if (storeFile) deleteFile(task.id, storeFile.id)
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleUpload}
      />

      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center justify-between gap-2">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 hover:opacity-70">✕</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : adjuntos.length === 0 ? (
        <div
          className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="h-8 w-8 mx-auto text-muted-foreground mb-2 animate-spin" />
          ) : (
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          )}
          <p className="text-sm text-muted-foreground">
            {uploading ? 'Subiendo...' : 'Click para subir archivos o arrastrá acá'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {adjuntos.map(adjunto => {
            const Icon = getFileIcon(adjunto.tipo)
            const canDelete = adjunto.subido_por === currentUserId
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
                    variant="ghost" size="sm" className="h-7 w-7 p-0"
                    onClick={() => window.open(adjunto.url, '_blank')}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" asChild>
                    <a href={adjunto.url} download={adjunto.nombre}>
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                  {canDelete && (
                    <Button
                      variant="ghost" size="sm"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(adjunto)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            )
          })}

          {/* Upload more */}
          <div
            className="border border-dashed rounded-lg p-3 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => !uploading && fileInputRef.current?.click()}
          >
            {uploading ? (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Subiendo...</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">+ Agregar más archivos</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
