'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Plus, ExternalLink, Trash2, Loader2, Globe, Pencil } from 'lucide-react'

interface Landing {
  id: string
  cliente_id: string
  nombre: string
  url: string
  tipo: string
  activa: boolean
  created_at: string
}

interface ClientLandingsProps {
  clientId: string
}

const TIPOS_LANDING = [
  { value: 'landing', label: 'Landing Page' },
  { value: 'funnel', label: 'Funnel' },
  { value: 'checkout', label: 'Checkout' },
  { value: 'blog', label: 'Blog' },
  { value: 'ecommerce', label: 'E-commerce' },
  { value: 'otro', label: 'Otro' },
]

export function ClientLandings({ clientId }: ClientLandingsProps) {
  const [landings, setLandings] = useState<Landing[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingLanding, setEditingLanding] = useState<Landing | null>(null)
  const [form, setForm] = useState({ nombre: '', url: '', tipo: 'landing' })

  const supabase = createClient()

  useEffect(() => {
    fetchLandings()
  }, [clientId])

  const fetchLandings = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('cliente_landings')
      .select('*')
      .eq('cliente_id', clientId)
      .order('created_at', { ascending: false })

    if (!error && data) {
      setLandings(data)
    }
    setLoading(false)
  }

  const handleSave = async () => {
    if (!form.nombre.trim() || !form.url.trim()) return

    setSaving(true)
    
    if (editingLanding) {
      const { error } = await supabase
        .from('cliente_landings')
        .update({
          nombre: form.nombre.trim(),
          url: form.url.trim(),
          tipo: form.tipo,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingLanding.id)

      if (!error) {
        setLandings(prev => prev.map(l => 
          l.id === editingLanding.id 
            ? { ...l, nombre: form.nombre.trim(), url: form.url.trim(), tipo: form.tipo }
            : l
        ))
      }
    } else {
      const { data, error } = await supabase
        .from('cliente_landings')
        .insert({
          cliente_id: clientId,
          nombre: form.nombre.trim(),
          url: form.url.trim(),
          tipo: form.tipo,
        })
        .select()
        .single()

      if (!error && data) {
        setLandings(prev => [data, ...prev])
      }
    }

    setSaving(false)
    setDialogOpen(false)
    setEditingLanding(null)
    setForm({ nombre: '', url: '', tipo: 'landing' })
  }

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('cliente_landings')
      .delete()
      .eq('id', id)

    if (!error) {
      setLandings(prev => prev.filter(l => l.id !== id))
    }
  }

  const openEdit = (landing: Landing) => {
    setEditingLanding(landing)
    setForm({ nombre: landing.nombre, url: landing.url, tipo: landing.tipo })
    setDialogOpen(true)
  }

  const openNew = () => {
    setEditingLanding(null)
    setForm({ nombre: '', url: '', tipo: 'landing' })
    setDialogOpen(true)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Landings
        </h3>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={openNew}>
              <Plus className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingLanding ? 'Editar Landing' : 'Agregar Landing'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label htmlFor="nombre">Nombre</Label>
                <Input
                  id="nombre"
                  value={form.nombre}
                  onChange={(e) => setForm(prev => ({ ...prev, nombre: e.target.value }))}
                  placeholder="Landing principal"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="url">URL</Label>
                <Input
                  id="url"
                  value={form.url}
                  onChange={(e) => setForm(prev => ({ ...prev, url: e.target.value }))}
                  placeholder="https://..."
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="tipo">Tipo</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm(prev => ({ ...prev, tipo: v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_LANDING.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleSave} disabled={saving || !form.nombre.trim() || !form.url.trim()} className="w-full">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {editingLanding ? 'Guardar cambios' : 'Agregar'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : landings.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Sin landings configuradas</p>
      ) : (
        <div className="space-y-2">
          {landings.map(landing => (
            <div
              key={landing.id}
              className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group"
            >
              <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                <Globe className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{landing.nombre}</p>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {TIPOS_LANDING.find(t => t.value === landing.tipo)?.label || landing.tipo}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate">{landing.url}</p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => window.open(landing.url, '_blank')}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => openEdit(landing)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(landing.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
