'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { 
  Plus, Trash2, Loader2, FileText, Pencil, ExternalLink,
  DollarSign, Clock, CheckCircle, XCircle, AlertCircle
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface Cotizacion {
  id: string
  cliente_id: string
  numero: string
  titulo: string
  descripcion: string | null
  monto: number
  moneda: string
  estado: string
  fecha_emision: string
  fecha_vencimiento: string | null
  url_documento: string | null
  created_at: string
}

interface ClientCotizacionesProps {
  clientId: string
  currentUserId?: string
}

const ESTADOS = [
  { value: 'borrador', label: 'Borrador', icon: FileText, color: 'bg-gray-500' },
  { value: 'enviada', label: 'Enviada', icon: Clock, color: 'bg-blue-500' },
  { value: 'aceptada', label: 'Aceptada', icon: CheckCircle, color: 'bg-green-500' },
  { value: 'rechazada', label: 'Rechazada', icon: XCircle, color: 'bg-red-500' },
  { value: 'vencida', label: 'Vencida', icon: AlertCircle, color: 'bg-orange-500' },
]

const MONEDAS = [
  { value: 'ARS', label: 'ARS ($)' },
  { value: 'USD', label: 'USD ($)' },
  { value: 'EUR', label: 'EUR (€)' },
  { value: 'MXN', label: 'MXN ($)' },
]

export function ClientCotizaciones({ clientId }: ClientCotizacionesProps) {
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCotizacion, setEditingCotizacion] = useState<Cotizacion | null>(null)
  const [form, setForm] = useState({
    numero: '',
    titulo: '',
    descripcion: '',
    monto: '',
    moneda: 'ARS',
    estado: 'borrador',
    fecha_emision: format(new Date(), 'yyyy-MM-dd'),
    fecha_vencimiento: '',
    url_documento: '',
  })

  const supabase = createClient()

  useEffect(() => {
    fetchCotizaciones()
  }, [clientId])

  const fetchCotizaciones = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('cliente_cotizaciones')
      .select('*')
      .eq('cliente_id', clientId)
      .order('created_at', { ascending: false })

    if (!error && data) {
      setCotizaciones(data)
    }
    setLoading(false)
  }

  const generateNumero = () => {
    const count = cotizaciones.length + 1
    return `COT-${String(count).padStart(3, '0')}`
  }

  const handleSave = async () => {
    if (!form.titulo.trim() || !form.monto) return
    setSaving(true)

    const cotizacionData = {
      numero: form.numero || generateNumero(),
      titulo: form.titulo,
      descripcion: form.descripcion || null,
      monto: parseFloat(form.monto),
      moneda: form.moneda,
      estado: form.estado,
      fecha_emision: form.fecha_emision,
      fecha_vencimiento: form.fecha_vencimiento || null,
      url_documento: form.url_documento || null,
    }

    if (editingCotizacion) {
      const { data, error } = await supabase
        .from('cliente_cotizaciones')
        .update(cotizacionData)
        .eq('id', editingCotizacion.id)
        .select()

      if (!error && data && data[0]) {
        setCotizaciones(prev => prev.map(c => 
          c.id === editingCotizacion.id 
            ? { 
                ...data[0],
                id: c.id,
                cliente_id: c.cliente_id,
                created_at: c.created_at
              }
            : c
        ))
      }
    } else {
      const { data, error } = await supabase
        .from('cliente_cotizaciones')
        .insert({ ...cotizacionData, cliente_id: clientId })
        .select()

      if (!error && data && data[0]) {
        setCotizaciones(prev => [data[0], ...prev])
      }
    }

    setSaving(false)
    setDialogOpen(false)
    setEditingCotizacion(null)
    resetForm()
  }

  const resetForm = () => {
    setForm({
      numero: '',
      titulo: '',
      descripcion: '',
      monto: '',
      moneda: 'ARS',
      estado: 'borrador',
      fecha_emision: format(new Date(), 'yyyy-MM-dd'),
      fecha_vencimiento: '',
      url_documento: '',
    })
  }

  const openNew = () => {
    setEditingCotizacion(null)
    resetForm()
  }

  const openEdit = (cotizacion: Cotizacion) => {
    setEditingCotizacion(cotizacion)
    setForm({
      numero: cotizacion.numero,
      titulo: cotizacion.titulo,
      descripcion: cotizacion.descripcion || '',
      monto: String(cotizacion.monto),
      moneda: cotizacion.moneda,
      estado: cotizacion.estado,
      fecha_emision: cotizacion.fecha_emision,
      fecha_vencimiento: cotizacion.fecha_vencimiento || '',
      url_documento: cotizacion.url_documento || '',
    })
    setDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    await supabase.from('cliente_cotizaciones').delete().eq('id', id)
    setCotizaciones(prev => prev.filter(c => c.id !== id))
  }

  const getEstadoInfo = (estado: string) => {
    return ESTADOS.find(e => e.value === estado) || ESTADOS[0]
  }

  const formatMonto = (monto: number, moneda: string) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: moneda,
    }).format(monto)
  }

  const totales = {
    total: cotizaciones.reduce((sum, c) => sum + c.monto, 0),
    aceptadas: cotizaciones.filter(c => c.estado === 'aceptada').reduce((sum, c) => sum + c.monto, 0),
    pendientes: cotizaciones.filter(c => c.estado === 'enviada').reduce((sum, c) => sum + c.monto, 0),
  }

  const monedaTotales = cotizaciones.length === 0 
    ? 'ARS'
    : (() => {
        const counts: Record<string, number> = {}
        for (const c of cotizaciones) counts[c.moneda] = (counts[c.moneda] ?? 0) + 1
        return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
      })()

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Cotizaciones
        </h3>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={openNew}>
              <Plus className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingCotizacion ? 'Editar Cotizacion' : 'Nueva Cotizacion'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="numero">Numero</Label>
                  <Input
                    id="numero"
                    value={form.numero}
                    onChange={(e) => setForm(prev => ({ ...prev, numero: e.target.value }))}
                    placeholder="Auto-generado"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="estado">Estado</Label>
                  <Select value={form.estado} onValueChange={(v) => setForm(prev => ({ ...prev, estado: v }))}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ESTADOS.map(e => (
                        <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="titulo">Titulo</Label>
                <Input
                  id="titulo"
                  value={form.titulo}
                  onChange={(e) => setForm(prev => ({ ...prev, titulo: e.target.value }))}
                  placeholder="Servicio de marketing digital"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="descripcion">Descripcion</Label>
                <Textarea
                  id="descripcion"
                  value={form.descripcion}
                  onChange={(e) => setForm(prev => ({ ...prev, descripcion: e.target.value }))}
                  placeholder="Detalle de la cotizacion..."
                  className="mt-1"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="monto">Monto</Label>
                  <Input
                    id="monto"
                    type="number"
                    step="0.01"
                    value={form.monto}
                    onChange={(e) => setForm(prev => ({ ...prev, monto: e.target.value }))}
                    placeholder="0.00"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="moneda">Moneda</Label>
                  <Select value={form.moneda} onValueChange={(v) => setForm(prev => ({ ...prev, moneda: v }))}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONEDAS.map(m => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="fecha_emision">Fecha Emision</Label>
                  <Input
                    id="fecha_emision"
                    type="date"
                    value={form.fecha_emision}
                    onChange={(e) => setForm(prev => ({ ...prev, fecha_emision: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="fecha_vencimiento">Fecha Vencimiento</Label>
                  <Input
                    id="fecha_vencimiento"
                    type="date"
                    value={form.fecha_vencimiento}
                    onChange={(e) => setForm(prev => ({ ...prev, fecha_vencimiento: e.target.value }))}
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="url_documento">URL del Documento</Label>
                <Input
                  id="url_documento"
                  value={form.url_documento}
                  onChange={(e) => setForm(prev => ({ ...prev, url_documento: e.target.value }))}
                  placeholder="https://..."
                  className="mt-1"
                />
              </div>
              <Button onClick={handleSave} disabled={saving || !form.titulo.trim() || !form.monto} className="w-full">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {editingCotizacion ? 'Guardar cambios' : 'Crear cotizacion'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {cotizaciones.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="rounded-lg bg-muted/50 p-2 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Total</p>
            <p className="text-sm font-semibold">{formatMonto(totales.total, monedaTotales)}</p>
          </div>
          <div className="rounded-lg bg-green-500/10 p-2 text-center">
            <p className="text-[10px] text-green-600 uppercase">Aceptadas</p>
            <p className="text-sm font-semibold text-green-600">{formatMonto(totales.aceptadas, monedaTotales)}</p>
          </div>
          <div className="rounded-lg bg-blue-500/10 p-2 text-center">
            <p className="text-[10px] text-blue-600 uppercase">Pendientes</p>
            <p className="text-sm font-semibold text-blue-600">{formatMonto(totales.pendientes, monedaTotales)}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : cotizaciones.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Sin cotizaciones</p>
      ) : (
        <div className="space-y-2">
          {cotizaciones.map(cotizacion => {
            const estadoInfo = getEstadoInfo(cotizacion.estado)
            const Icon = estadoInfo.icon
            return (
              <div
                key={cotizacion.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group"
              >
                <div className={`h-10 w-10 rounded-lg ${estadoInfo.color} flex items-center justify-center shrink-0`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{cotizacion.titulo}</p>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                      {cotizacion.numero}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium">{formatMonto(cotizacion.monto, cotizacion.moneda)}</span>
                    <span>•</span>
                    <span>{format(new Date(cotizacion.fecha_emision), 'dd MMM yyyy', { locale: es })}</span>
                  </div>
                </div>
                <Badge 
                  variant="outline" 
                  className={`text-[10px] px-1.5 py-0.5 shrink-0 ${
                    cotizacion.estado === 'aceptada' ? 'border-green-500 text-green-600' :
                    cotizacion.estado === 'rechazada' ? 'border-red-500 text-red-600' :
                    cotizacion.estado === 'enviada' ? 'border-blue-500 text-blue-600' :
                    cotizacion.estado === 'vencida' ? 'border-orange-500 text-orange-600' :
                    ''
                  }`}
                >
                  {estadoInfo.label}
                </Badge>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {cotizacion.url_documento && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => window.open(cotizacion.url_documento!, '_blank')}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => openEdit(cotizacion)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(cotizacion.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
