'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Loader2, TrendingUp, TrendingDown, Minus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { LineChart, Line, XAxis, YAxis, ReferenceLine } from 'recharts'

interface NPSRecord {
  id: string
  score: number
  comentario: string | null
  fecha: string
  encuestado_nombre: string | null
  encuestado_cargo: string | null
}

interface ClientNPSProps {
  clientId: string
  currentUserId?: string
  projectManagerId?: string | null
  accountManagerId?: string | null
}

function getNPSCategory(score: number): { label: string; color: string; bgColor: string } {
  if (score >= 5) return { label: 'Excelente', color: 'text-green-500', bgColor: 'bg-green-500' }
  if (score >= 4) return { label: 'Bueno', color: 'text-emerald-500', bgColor: 'bg-emerald-500' }
  if (score >= 3) return { label: 'Regular', color: 'text-yellow-500', bgColor: 'bg-yellow-500' }
  if (score >= 2) return { label: 'Malo', color: 'text-orange-500', bgColor: 'bg-orange-500' }
  return { label: 'Muy malo', color: 'text-red-500', bgColor: 'bg-red-500' }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: '2-digit' })
}

export function ClientNPS({ clientId, currentUserId, projectManagerId, accountManagerId }: ClientNPSProps) {
  const [records, setRecords] = useState<NPSRecord[]>([])
  const [filteredRecords, setFilteredRecords] = useState<NPSRecord[]>([])
  const [currentScore, setCurrentScore] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pmFilter, setPmFilter] = useState<string | null>(projectManagerId || null)
  const [amFilter, setAmFilter] = useState<string | null>(accountManagerId || null)
  const [projectManagers, setProjectManagers] = useState<Array<{ id: string; full_name: string | null; email: string }>>([])
  const [accountManagers, setAccountManagers] = useState<Array<{ id: string; full_name: string | null; email: string }>>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [form, setForm] = useState({
    score: 3,
    comentario: '',
    encuestado_nombre: '',
    encuestado_cargo: '',
    fecha: new Date().toISOString().split('T')[0],
  })

  const supabase = createClient()

  useEffect(() => {
    fetchNPS()
    loadUsers()
  }, [clientId])

  useEffect(() => {
    // Apply filters to records
    let filtered = records
    
    if (pmFilter) {
      filtered = filtered.filter(r => r.proyecto_manager_id === pmFilter)
    }
    
    if (amFilter) {
      filtered = filtered.filter(r => r.account_manager_id === amFilter)
    }
    
    setFilteredRecords(filtered)
  }, [records, pmFilter, amFilter])

  const loadUsers = async () => {
    setUsersLoading(true)
    try {
      // Obtener IDs únicos de PM y AM de todos los clientes
      const { data: clientesData } = await supabase
        .from('clientes')
        .select('project_manager_id, account_manager_id')
      
      if (clientesData) {
        const pmIds = [...new Set(clientesData.map(c => c.project_manager_id).filter(Boolean))]
        const amIds = [...new Set(clientesData.map(c => c.account_manager_id).filter(Boolean))]
        
        // Cargar datos de Project Managers
        if (pmIds.length > 0) {
          const { data: pmData } = await supabase
            .from('profiles')
            .select('id, full_name, email')
            .in('id', pmIds)
            .order('full_name', { ascending: true })
          
          if (pmData) {
            setProjectManagers(pmData)
          }
        }
        
        // Cargar datos de Account Managers
        if (amIds.length > 0) {
          const { data: amData } = await supabase
            .from('profiles')
            .select('id, full_name, email')
            .in('id', amIds)
            .order('full_name', { ascending: true })
          
          if (amData) {
            setAccountManagers(amData)
          }
        }
      }
    } catch (err) {
      console.error('Error loading users:', err)
    } finally {
      setUsersLoading(false)
    }
  }

  const fetchNPS = async () => {
    setLoading(true)

    // Fetch NPS history with client info for PM/AM filtering
    const { data: historyData, error } = await supabase
      .from('cliente_nps_historial')
      .select('*, clientes(project_manager_id, account_manager_id)')
      .eq('cliente_id', clientId)
      .order('fecha', { ascending: true })

    if (!error && historyData) {
      // Enrich records with client PM/AM info
      const enrichedRecords = historyData.map((record: any) => ({
        ...record,
        proyecto_manager_id: record.clientes?.project_manager_id,
        account_manager_id: record.clientes?.account_manager_id,
      }))
      setRecords(enrichedRecords)
      // Set current score from the most recent record (last in ascending order)
      if (enrichedRecords.length > 0) {
        const mostRecent = enrichedRecords[enrichedRecords.length - 1]
        setCurrentScore(mostRecent.score)
      } else {
        setCurrentScore(null)
      }
    }
    
    setLoading(false)
  }

  const handleSave = async () => {
    setSaving(true)
    
    if (editingId) {
      // Update existing record
      const { error } = await supabase
        .from('cliente_nps_historial')
        .update({
          score: form.score,
          comentario: form.comentario.trim() || null,
          fecha: form.fecha,
          encuestado_nombre: form.encuestado_nombre.trim() || null,
          encuestado_cargo: form.encuestado_cargo.trim() || null,
        })
        .eq('id', editingId)

      if (!error) {
        // Update records array
        const updatedRecords = records.map(r => 
          r.id === editingId 
            ? { ...r, score: form.score, comentario: form.comentario || null, fecha: form.fecha, encuestado_nombre: form.encuestado_nombre || null, encuestado_cargo: form.encuestado_cargo || null }
            : r
        ).sort((a, b) => 
          new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
        )
        setRecords(updatedRecords)
        
        // Set current score from most recent record
        const mostRecent = updatedRecords[updatedRecords.length - 1]
        setCurrentScore(mostRecent.score)
        
        // Close dialog immediately without waiting for clientes table update
        setDialogOpen(false)
        setEditingId(null)
        setForm({
          score: 3,
          comentario: '',
          encuestado_nombre: '',
          encuestado_cargo: '',
          fecha: new Date().toISOString().split('T')[0],
        })

        // Update clientes table in background (don't await)
        supabase
          .from('clientes')
          .update({ nps_score: mostRecent.score })
          .eq('id', clientId)
          .catch(err => console.error('[v0] Error updating client NPS score:', err))
      }
    } else {
      // Insert new record
      const { data, error } = await supabase
        .from('cliente_nps_historial')
        .insert({
          cliente_id: clientId,
          score: form.score,
          comentario: form.comentario.trim() || null,
          fecha: form.fecha,
          encuestado_nombre: form.encuestado_nombre.trim() || null,
          encuestado_cargo: form.encuestado_cargo.trim() || null,
          registrado_por: currentUserId || null,
        })
        .select()
        .single()

      if (!error && data) {
        // Add to records and sort by date
        const newRecords = [...records, data].sort((a, b) => 
          new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
        )
        setRecords(newRecords)
        
        // Set current score from most recent record
        const mostRecent = newRecords[newRecords.length - 1]
        setCurrentScore(mostRecent.score)
        
        // Close dialog immediately without waiting for clientes table update
        setDialogOpen(false)
        setForm({
          score: 3,
          comentario: '',
          encuestado_nombre: '',
          encuestado_cargo: '',
          fecha: new Date().toISOString().split('T')[0],
        })

        // Update clientes table in background (don't await)
        supabase
          .from('clientes')
          .update({ nps_score: mostRecent.score })
          .eq('id', clientId)
          .catch(err => console.error('[v0] Error updating client NPS score:', err))
      }
    }
    
    setSaving(false)
  }

  const handleEdit = (record: NPSRecord) => {
    setEditingId(record.id)
    setForm({
      score: record.score,
      comentario: record.comentario || '',
      encuestado_nombre: record.encuestado_nombre || '',
      encuestado_cargo: record.encuestado_cargo || '',
      fecha: record.fecha,
    })
    setDialogOpen(true)
  }

  const handleDelete = async (recordId: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este registro?')) return
    
    const { error } = await supabase
      .from('cliente_nps_historial')
      .delete()
      .eq('id', recordId)

    if (!error) {
      const updatedRecords = records.filter(r => r.id !== recordId).sort((a, b) => 
        new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
      )
      setRecords(updatedRecords)
      
      if (updatedRecords.length > 0) {
        const mostRecent = updatedRecords[updatedRecords.length - 1]
        setCurrentScore(mostRecent.score)
        
        // Update clientes table with most recent score
        await supabase
          .from('clientes')
          .update({ nps_score: mostRecent.score })
          .eq('id', clientId)
      } else {
        setCurrentScore(null)
      }
    }
  }

  // Calculate trend
  const getTrend = () => {
    if (records.length < 2) return null
    const lastTwo = records.slice(-2)
    const diff = lastTwo[1].score - lastTwo[0].score
    return diff
  }

  const trend = getTrend()
  const category = currentScore !== null ? getNPSCategory(currentScore) : null

  // Prepare chart data
  const chartData = records.map(r => ({
    fecha: formatDate(r.fecha),
    score: r.score,
    fullDate: r.fecha,
  }))

  const chartConfig = {
    score: {
      label: 'NPS Score',
      color: 'hsl(var(--primary))',
    },
  }

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          NPS Score
        </h3>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) {
            setEditingId(null)
            setForm({
              score: 3,
              comentario: '',
              encuestado_nombre: '',
              encuestado_cargo: '',
              fecha: new Date().toISOString().split('T')[0],
            })
          }
        }}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2">
              <Plus className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? 'Editar Encuesta NPS' : 'Registrar Encuesta NPS'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label>Score (1-5)</Label>
                <div className="flex items-center gap-2 mt-2">
                  {[1, 2, 3, 4, 5].map((score) => (
                    <button
                      key={score}
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, score }))}
                      className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg transition-all",
                        form.score === score
                          ? cn("text-white scale-110", getNPSCategory(score).bgColor)
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}
                    >
                      {score}
                    </button>
                  ))}
                </div>
                <p className={cn("text-sm mt-2", getNPSCategory(form.score).color)}>
                  {getNPSCategory(form.score).label}
                </p>
              </div>
              <div>
                <Label htmlFor="fecha">Fecha de la encuesta</Label>
                <Input
                  id="fecha"
                  type="date"
                  value={form.fecha}
                  onChange={(e) => setForm(prev => ({ ...prev, fecha: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="encuestado_nombre">Nombre del encuestado</Label>
                  <Input
                    id="encuestado_nombre"
                    value={form.encuestado_nombre}
                    onChange={(e) => setForm(prev => ({ ...prev, encuestado_nombre: e.target.value }))}
                    placeholder="Opcional"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="encuestado_cargo">Cargo</Label>
                  <Input
                    id="encuestado_cargo"
                    value={form.encuestado_cargo}
                    onChange={(e) => setForm(prev => ({ ...prev, encuestado_cargo: e.target.value }))}
                    placeholder="Opcional"
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="comentario">Comentario / Feedback</Label>
                <Textarea
                  id="comentario"
                  value={form.comentario}
                  onChange={(e) => setForm(prev => ({ ...prev, comentario: e.target.value }))}
                  placeholder="Opcional"
                  className="mt-1 max-h-48 resize-none"
                  rows={3}
                />
              </div>
              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {editingId ? 'Actualizar' : 'Registrar'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Select value={pmFilter || 'all'} onValueChange={(val) => setPmFilter(val === 'all' ? null : val)}>
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue placeholder="Project Manager" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los PM</SelectItem>
            {projectManagers.map(pm => (
              <SelectItem key={pm.id} value={pm.id}>
                {pm.full_name || pm.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={amFilter || 'all'} onValueChange={(val) => setAmFilter(val === 'all' ? null : val)}>
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue placeholder="Account Manager" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los AM</SelectItem>
            {accountManagers.map(am => (
              <SelectItem key={am.id} value={am.id}>
                {am.full_name || am.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(pmFilter || amFilter) && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              setPmFilter(null)
              setAmFilter(null)
            }}
          >
            <X className="h-3 w-3 mr-1" />
            Limpiar filtros
          </Button>
        )}
      </div>

      {/* Stats and Content */}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : currentScore === null && filteredRecords.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground mb-2">Sin datos de NPS</p>
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Registrar primera encuesta
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Left column: Current Score + Chart */}
          <div className="lg:col-span-2 space-y-4">
            {/* Current Score Display */}
            <div className="flex items-center gap-4">
              <div className={cn(
                "w-16 h-16 rounded-xl flex items-center justify-center text-white font-bold text-2xl shrink-0",
                category?.bgColor || 'bg-gray-500'
              )}>
                {currentScore ?? '-'}
              </div>
              <div className="flex-1">
                <p className={cn("text-lg font-semibold", category?.color)}>
                  {category?.label || 'Sin datos'}
                </p>
                {trend !== null && (
                  <div className="flex items-center gap-1 text-sm">
                    {trend > 0 ? (
                      <>
                        <TrendingUp className="h-4 w-4 text-green-500" />
                        <span className="text-green-500">+{trend} vs anterior</span>
                      </>
                    ) : trend < 0 ? (
                      <>
                        <TrendingDown className="h-4 w-4 text-red-500" />
                        <span className="text-red-500">{trend} vs anterior</span>
                      </>
                    ) : (
                      <>
                        <Minus className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Sin cambio</span>
                      </>
                    )}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {filteredRecords.length} encuesta{filteredRecords.length !== 1 ? 's' : ''} registrada{filteredRecords.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {/* Chart */}
            {filteredRecords.length >= 2 && (
              <ChartContainer config={chartConfig} className="aspect-auto h-32 w-full">
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <XAxis 
                    dataKey="fecha" 
                    tick={{ fontSize: 10 }} 
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    domain={[1, 5]} 
                    ticks={[1, 2, 3, 4, 5]}
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    width={20}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ReferenceLine y={4} stroke="#22c55e" strokeDasharray="3 3" strokeOpacity={0.5} />
                  <ReferenceLine y={3} stroke="#eab308" strokeDasharray="3 3" strokeOpacity={0.5} />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ r: 4, fill: 'hsl(var(--primary))' }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ChartContainer>
            )}
          </div>

          {/* Right column: Recent Records */}
          {filteredRecords.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase">Historial reciente</p>
              <div className="space-y-1 max-h-44 overflow-y-auto">
                {filteredRecords.slice(-5).reverse().map(record => (
                  <div key={record.id} className="group flex items-center gap-2 p-2 rounded-lg bg-muted/50 text-sm hover:bg-muted transition-colors">
                    <div className={cn(
                      "w-6 h-6 rounded flex items-center justify-center text-white text-xs font-medium shrink-0",
                      getNPSCategory(record.score).bgColor
                    )}>
                      {record.score}
                    </div>
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleEdit(record)}>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(record.fecha)}
                      </div>
                      {record.encuestado_nombre && (
                        <div className="text-xs truncate">
                          {record.encuestado_nombre}
                        </div>
                      )}
                      {record.comentario && (
                        <div className="text-xs text-muted-foreground truncate">
                          {record.comentario}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleEdit(record)
                        }}
                      >
                        <span className="text-xs">✏️</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(record.id)
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
