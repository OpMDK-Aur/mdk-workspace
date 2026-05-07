'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { ExternalLink, Loader2, Database, Pencil, Trash2 } from 'lucide-react'

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
  const [crmData, setCrmData] = useState<{ tipo: string | null; url: string | null; location_id: string | null }>({
    tipo: null,
    url: null,
    location_id: null,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({ tipo: 'ghl', url: '', location_id: '' })

  const supabase = createClient()

  useEffect(() => {
    fetchCRM()
  }, [clientId])

  const fetchCRM = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('clientes')
      .select('crm_tipo, crm_url, crm_location_id')
      .eq('id', clientId)
      .single()

    if (!error && data) {
      setCrmData({
        tipo: data.crm_tipo,
        url: data.crm_url,
        location_id: data.crm_location_id,
      })
    }
    setLoading(false)
  }

  const handleSave = async () => {
    if (!form.tipo) return

    setSaving(true)
    const { error } = await supabase
      .from('clientes')
      .update({
        crm_tipo: form.tipo,
        crm_url: form.url.trim() || null,
        crm_location_id: form.location_id.trim() || null,
      })
      .eq('id', clientId)

    if (!error) {
      setCrmData({
        tipo: form.tipo,
        url: form.url.trim() || null,
        location_id: form.location_id.trim() || null,
      })
      setDialogOpen(false)
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    setSaving(true)
    const { error } = await supabase
      .from('clientes')
      .update({
        crm_tipo: null,
        crm_url: null,
        crm_location_id: null,
      })
      .eq('id', clientId)

    if (!error) {
      setCrmData({ tipo: null, url: null, location_id: null })
    }
    setSaving(false)
  }

  const openEdit = () => {
    setForm({
      tipo: crmData.tipo || 'ghl',
      url: crmData.url || '',
      location_id: crmData.location_id || '',
    })
    setDialogOpen(true)
  }

  const getCRMColor = (tipo: string | null) => {
    return TIPOS_CRM.find(t => t.value === tipo)?.color || 'bg-gray-500'
  }

  const getCRMLabel = (tipo: string | null) => {
    return TIPOS_CRM.find(t => t.value === tipo)?.label || tipo || 'CRM'
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          CRM
        </h3>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={openEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Configurar CRM</DialogTitle>
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
                <Label htmlFor="url">URL del Dashboard</Label>
                <Input
                  id="url"
                  value={form.url}
                  onChange={(e) => setForm(prev => ({ ...prev, url: e.target.value }))}
                  placeholder="https://..."
                  className="mt-1"
                />
              </div>
              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Guardar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : !crmData.tipo ? (
        <p className="text-sm text-muted-foreground text-center py-4">Sin CRM configurado</p>
      ) : (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group">
          <div className={`h-8 w-8 rounded-md ${getCRMColor(crmData.tipo)} flex items-center justify-center shrink-0`}>
            <Database className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">{getCRMLabel(crmData.tipo)}</p>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {crmData.tipo}
              </Badge>
            </div>
            {crmData.location_id && (
              <p className="text-xs text-muted-foreground truncate">ID: {crmData.location_id}</p>
            )}
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {crmData.url && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => window.open(crmData.url!, '_blank')}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
              onClick={handleDelete}
              disabled={saving}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
