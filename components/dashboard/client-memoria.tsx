'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { BookOpen, Edit3, Save, X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface ClientMemoriaProps {
  clienteId: string
}

export function ClientMemoria({ clienteId }: ClientMemoriaProps) {
  const [memoria, setMemoria] = useState<string>('')
  const [memoriaId, setMemoriaId] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  const supabase = createClient()

  useEffect(() => {
    loadMemoria()
  }, [clienteId])

  const loadMemoria = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('cliente_memoria')
      .select('id, contenido')
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (data && !error) {
      setMemoria(data.contenido)
      setMemoriaId(data.id)
    }
    setLoading(false)
  }

  const handleEdit = () => {
    setEditContent(memoria)
    setIsEditing(true)
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditContent('')
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (memoriaId) {
        // Update existing
        await supabase
          .from('cliente_memoria')
          .update({ contenido: editContent, updated_at: new Date().toISOString() })
          .eq('id', memoriaId)
      } else {
        // Create new
        const { data } = await supabase
          .from('cliente_memoria')
          .insert({ cliente_id: clienteId, contenido: editContent })
          .select('id')
          .single()
        
        if (data) setMemoriaId(data.id)
      }
      setMemoria(editContent)
      setIsEditing(false)
    } catch (e) {
      console.error('Error saving memoria:', e)
    } finally {
      setSaving(false)
    }
  }

  // Parse markdown-like content for better display
  const renderContent = (content: string) => {
    if (!content) return null
    
    return content.split('\n').map((line, i) => {
      // Headers
      if (line.startsWith('### ')) {
        return <h3 key={i} className="text-base font-semibold text-foreground mt-4 mb-2">{line.replace('### ', '')}</h3>
      }
      if (line.startsWith('## ')) {
        return <h2 key={i} className="text-lg font-bold text-foreground mt-4 mb-2">{line.replace('## ', '')}</h2>
      }
      // Bold items (numbered lists with **)
      if (line.match(/^\d+\.\s*\*\*/)) {
        const parts = line.split('**')
        return (
          <p key={i} className="text-sm text-muted-foreground mb-1 pl-2">
            {parts.map((part, j) => j % 2 === 1 ? <strong key={j} className="text-foreground">{part}</strong> : part)}
          </p>
        )
      }
      // List items
      if (line.startsWith('- ') || line.startsWith('   - ')) {
        const indent = line.startsWith('   ') ? 'pl-6' : 'pl-2'
        return <p key={i} className={cn('text-sm text-muted-foreground mb-0.5', indent)}>{line}</p>
      }
      // Empty lines
      if (line.trim() === '') {
        return <div key={i} className="h-2" />
      }
      // Regular text
      return <p key={i} className="text-sm text-muted-foreground mb-1">{line}</p>
    })
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          Memoria del Cliente
        </CardTitle>
        {!isEditing && (
          <Button variant="ghost" size="sm" onClick={handleEdit} className="h-8 px-2">
            <Edit3 className="h-4 w-4 mr-1" />
            Editar
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isEditing ? (
          <div className="space-y-3">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="Escribe la memoria del cliente aquí... Puedes usar formato markdown (### para títulos, ** para negrita, - para listas)"
              className="min-h-[300px] text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={handleCancel} disabled={saving}>
                <X className="h-4 w-4 mr-1" />
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Guardar
              </Button>
            </div>
          </div>
        ) : memoria ? (
          <div className="max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
            {renderContent(memoria)}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No hay memoria registrada para este cliente.</p>
            <Button variant="link" size="sm" onClick={handleEdit} className="mt-2">
              Agregar memoria
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
