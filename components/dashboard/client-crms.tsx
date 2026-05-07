'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Plus, ExternalLink, Trash2, Loader2, Database, Pencil } from 'lucide-react'

interface CRM {
  id: string
  cliente_id: string
  nombre: string
  tipo: string
  location_id: string | null
  url_dashboard: string | null
  activo: boolean
  created_at: string
}

interface ClientCRMsProps {
  clientId: string
}

const TIPOS_CRM = [
  { value: 'ghl', label: 'GoHighLevel', color: 'bg-orange-500' },
  { value: 'hubspot', label: 'HubSpot', color: 'bg-orange-600' },
  { value: 'salesforce', label: 'Salesforce', color: 'bg-blue-500' },
  { value: 'pipedrive', label: 'Pipedrive', color: 'bg-green-500' },
  { value: 'zoho', label: 'Zoho CRM', color: 'bg-red-500' },
  { value: 'monday', label: 'Monday', color: 'bg-pink-500' },
  { value: 'notion', label: 'Notion', color: 'bg-gray-700' },
  { value: 'airtable', label: 'Airtable', color: 'bg-blue-400' },
  { value: 'otro', label: 'Otro', color: 'bg-gray-500' },
]

export function ClientCRMs({ clientId }: ClientCRMsProps) {
  const [crms, setCrms] = useState<CRM[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCRM, setEditingCRM] = useState<CRM | null>(null)
  const [form, setForm] = useState({ nombre: '', tipo: 'ghl', location_id: '', url_dashboard: '' })

  const supabase = createClient()

  useEffect(() => {
    fetchCRMs()
  }, [clientId])

  const fetchCRMs = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('cliente_crms')
      .select('*')
      .eq('cliente_id', clientId)
      .order('created_at', { ascending: false })

    if (!error && data) {
      setCrms(data)
    }
    setLoading(false)
  }

  const handleSave = async () => {
    if (!form.nombre.trim() || !form.tipo) return

    setSaving(true)
    
    if (editingCRM) {
      const { error } = await supabase
        .from('cliente_crms')
        .update({
          nombre: form.nombre.trim(),
          tipo: form.tipo,
          location_id: form.location_id.trim() || null,
          url_dashboard: form.url_dashboard.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingCRM.id)

      if (!error) {
        setCrms(prev => prev.map(c => 
          c.id === editingCRM.id 
            ? { ...c, nombre: form.nombre.trim(), tipo: form.tipo, location_id: form.location_id.trim() || null, url_dashboard: form.url_dashboard.trim() || null }
            : c
        ))
      }
    } else {
      const { data, error } = await supabase
        .from('cliente_crms')
        .insert({
          cliente_id: clientId,
          nombre: form.nombre.trim(),
          tipo: form.tipo,
          location_id: form.location_id.trim() || null,
          url_dashboard: form.url_dashboard.trim() || null,
        })
        .select()
        .single()

      if (!error && data) {
        setCrms(prev => [data, ...prev])
      }
    }

    setSaving(false)
    setDialogOpen(false)
    setEditingCRM(null)
    setForm({ nombre: '', tipo: 'ghl', location_id: '', url_dashboard: '' })
  }

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('cliente_crms')
      .delete()
      .eq('id', id)

    if (!error) {
      setCrms(prev => prev.filter(c => c.id !== id))
    }
  }

  const openEdit = (crm: CRM) => {
    setEditingCRM(crm)
    setForm({ 
      nombre: crm.nombre, 
      tipo: crm.tipo, 
      location_id: crm.location_id || '', 
      url_dashboard: crm.url_dashboard || '' 
    })
    setDialogOpen(true)
  }

  const openNew = () => {
    setEditingCRM(null)
    setForm({ nombre: '', tipo: 'ghl', location_id: '', url_dashboard: '' })
    setDialogOpen(true)
  }

  const getCRMColor = (tipo: string) => {
    return TIPOS_CRM.find(t => t.value === tipo)?.color || 'bg-gray-500'
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          CRMs
        </h3>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={openNew}>
              <Plus className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingCRM ? 'Editar CRM' : 'Agregar CRM'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label htmlFor="tipo">Tipo de CRM</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm(prev => ({ ...prev, tipo: v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_CRM.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="nombre">Nombre / Cuenta</Label>
                <Input
                  id="nombre"
                  value={form.nombre}
                  onChange={(e) => setForm(prev => ({ ...prev, nombre: e.target.value }))}
                  placeholder="Cuenta principal"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="location_id">Location ID / Account ID</Label>
                <Input
                  id="location_id"
                  value={form.location_id}
                  onChange={(e) => setForm(prev => ({ ...prev, location_id: e.target.value }))}
                  placeholder="Opcional"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="url_dashboard">URL del Dashboard</Label>
                <Input
                  id="url_dashboard"
                  value={form.url_dashboard}
                  onChange={(e) => setForm(prev => ({ ...prev, url_dashboard: e.target.value }))}
                  placeholder="https://..."
                  className="mt-1"
                />
              </div>
              <Button onClick={handleSave} disabled={saving || !form.nombre.trim()} className="w-full">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {editingCRM ? 'Guardar cambios' : 'Agregar'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : crms.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Sin CRMs configurados</p>
      ) : (
        <div className="space-y-2">
          {crms.map(crm => (
            <div
              key={crm.id}
              className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group"
            >
              <div className={`h-8 w-8 rounded-md ${getCRMColor(crm.tipo)} flex items-center justify-center shrink-0`}>
                <Database className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{crm.nombre}</p>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {TIPOS_CRM.find(t => t.value === crm.tipo)?.label || crm.tipo}
                  </Badge>
                </div>
                {crm.location_id && (
                  <p className="text-xs text-muted-foreground truncate">ID: {crm.location_id}</p>
                )}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {crm.url_dashboard && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => window.open(crm.url_dashboard!, '_blank')}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => openEdit(crm)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(crm.id)}
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
