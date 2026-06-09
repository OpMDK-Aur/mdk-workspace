'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Save, Plus, Trash2, RefreshCw, AlertCircle, Calculator, Pencil, Check, X, Shield, Users, UserPlus, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// Convert decimal hours to HH:MM:SS format
const formatHoursToTime = (hours: number): string => {
  if (!hours || isNaN(hours) || hours === 0) return '00:00:00'
  const totalSeconds = Math.round(hours * 3600)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

// Parse HH:MM:SS to decimal hours
const parseTimeToHours = (timeStr: string): number => {
  const parts = timeStr.split(':').map(Number)
  if (parts.length !== 3 || parts.some(isNaN)) return 0
  const [h, m, s] = parts
  return h + m / 60 + s / 3600
}

interface Role {
  id: string
  nombre: string
}

interface Colaborador {
  id: string
  nombre: string
  apellido: string | null
  email: string | null
  rol_id: string | null
  puesto: string | null
  modulos_habilitados: string[] | null
  activo: boolean
  avatar_url: string | null
  roles?: Role | null
}

interface Cliente {
  id: string
  nombre_del_negocio: string
  fee_mdk: number | null
  fee_aurelia: number | null
  fee_consultoria: number | null
}

interface MetricaColaborador {
  id: string
  colaborador_id: string
  cliente_id: string
  colaborador?: Colaborador
  cliente?: Cliente
  fee_administrado: number
  valor_hora: number
  horas_teoricas_cliente: number
  minimo_no_negociable_horas: number
  horas_objetivo: number
  acumulado_mes_asignado: number
  porcentaje_asignacion: number
  mes: number
  anio: number
}

// Available modules that can be enabled
const AVAILABLE_MODULES = [
  { id: 'dashboard', name: 'Dashboard', description: 'Acceso al panel principal' },
  { id: 'tareas', name: 'Tareas', description: 'Gestion de tareas y tiempo' },
  { id: 'clientes', name: 'Clientes', description: 'Ver informacion de clientes' },
  { id: 'reportes', name: 'Reportes', description: 'Ver reportes de horas' },
  { id: 'plataformas', name: 'Plataformas', description: 'Acceso a cuentas publicitarias, apps, CRM' },
]

// Available puestos
const PUESTOS = [
  'Project Manager',
  'Account Manager', 
  'Director/a',
  'CEO',
  'Desarrollador',
  'Diseñador/a',
  'Analista',
  'Coordinador',
  'Especialista',
]

// Get color class based on percentage vs objetivo
function getPercentageColor(value: number): string {
  if (value >= 50) return 'bg-green-500/20 text-green-400'
  if (value > 0) return 'bg-yellow-500/20 text-yellow-400'
  return 'bg-red-500/20 text-red-400'
}

// Get color for hours
function getHoursColor(actual: number, minimo: number): string {
  if (minimo === 0) return ''
  if (actual >= minimo) return 'bg-green-500/20 text-green-400'
  if (actual > 0) return 'bg-yellow-500/20 text-yellow-400'
  return 'bg-red-500/20 text-red-400'
}

export default function ColaboradoresPage() {
  const [activeTab, setActiveTab] = useState('permisos')
  const [metricas, setMetricas] = useState<MetricaColaborador[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [hasAccess, setHasAccess] = useState<boolean | null>(null)
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [editedRows, setEditedRows] = useState<Set<string>>(new Set())
  const [filterColaborador, setFilterColaborador] = useState<string>('all')
  const [valorHoraGlobal, setValorHoraGlobal] = useState<number>(150000)
  const [isImporting, setIsImporting] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Permissions tab state
  const [editedColaboradores, setEditedColaboradores] = useState<Set<string>>(new Set())
  const [savingPermissions, setSavingPermissions] = useState(false)
  
  // Create user dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newUserName, setNewUserName] = useState('')
  const [newUserLastName, setNewUserLastName] = useState('')
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [newUserRole, setNewUserRole] = useState('')
  const [newUserPuesto, setNewUserPuesto] = useState('')
  const [creatingUser, setCreatingUser] = useState(false)
  
  // Edit user dialog state
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editingUser, setEditingUser] = useState<Colaborador | null>(null)
  const [editUserName, setEditUserName] = useState('')
  const [editUserLastName, setEditUserLastName] = useState('')
  const [editUserEmail, setEditUserEmail] = useState('')
  const [editUserPassword, setEditUserPassword] = useState('')
  const [editUserRole, setEditUserRole] = useState('')
  const [editUserPuesto, setEditUserPuesto] = useState('')
  const [editUserActivo, setEditUserActivo] = useState(true)
  const [savingUser, setSavingUser] = useState(false)
  
  // Edicion de fees del cliente
  const [editingFeeClientId, setEditingFeeClientId] = useState<string | null>(null)
  const [editFeeMdk, setEditFeeMdk] = useState<number>(0)
  const [editFeeAurelia, setEditFeeAurelia] = useState<number>(0)
  const [editFeeConsultoria, setEditFeeConsultoria] = useState<number>(0)
  const [savingFee, setSavingFee] = useState(false)

  const supabase = createClient()

  // Check access - only Master role can see this page
  useEffect(() => {
    async function checkAccess() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setHasAccess(false)
        return
      }

      const { data: colab } = await supabase
        .from('colaboradores')
        .select('rol_id, roles(nombre)')
        .eq('email', user.email)
        .single()

      const roleName = (colab?.roles as Role | null)?.nombre || ''
      setHasAccess(roleName.toLowerCase() === 'master')
    }
    checkAccess()
  }, [supabase])

  // Load data
  useEffect(() => {
    if (hasAccess !== true) return

    async function loadData() {
      setIsLoading(true)

      // Load roles
      const { data: rolesData } = await supabase
        .from('roles')
        .select('id, nombre')
        .order('nombre')
      
      if (rolesData) setRoles(rolesData)

      // Load colaboradores with their roles
      const { data: colabs } = await supabase
        .from('colaboradores')
        .select('id, nombre, apellido, email, rol_id, puesto, modulos_habilitados, activo, avatar_url, roles(id, nombre)')
        .order('nombre')

      if (colabs) setColaboradores(colabs as Colaborador[])

      // Load clientes with fees
      const { data: clientesData } = await supabase
        .from('clientes')
        .select('id, nombre_del_negocio, fee_mdk, fee_aurelia, fee_consultoria')
        .order('nombre_del_negocio')

      if (clientesData) setClientes(clientesData)

      // Calculate date range for selected month
      const startDate = new Date(selectedYear, selectedMonth - 1, 1)
      const endDate = new Date(selectedYear, selectedMonth, 0)
      const startDateStr = startDate.toISOString().split('T')[0]
      const endDateStr = endDate.toISOString().split('T')[0]

      // Fetch actual hours from entradas_de_tiempo for the selected month
      const { data: entries } = await supabase
        .from('entradas_de_tiempo')
        .select('colaborador_id, cliente_id, duracion_seg')
        .gte('iniciado_en', `${startDateStr}T00:00:00`)
        .lte('iniciado_en', `${endDateStr}T23:59:59`)

      // Calculate hours per colaborador-cliente pair
      const hoursMap = new Map<string, number>()
      entries?.forEach(entry => {
        if (entry.colaborador_id && entry.cliente_id && entry.duracion_seg) {
          const key = `${entry.colaborador_id}-${entry.cliente_id}`
          hoursMap.set(key, (hoursMap.get(key) || 0) + (entry.duracion_seg / 3600))
        }
      })

      // Load metricas for selected period
      let { data: mets } = await supabase
        .from('metricas_colaborador')
        .select(`
          *,
          colaborador:colaborador_id(id, nombre, apellido, email, rol_id, roles(id, nombre)),
          cliente:cliente_id(id, nombre_del_negocio, fee_mdk, fee_aurelia, fee_consultoria)
        `)
        .eq('mes', selectedMonth)
        .eq('anio', selectedYear)
        .order('created_at')

      if (mets && mets.length > 0) {
        const processedMetricas = mets.map(m => {
          const colaborador = m.colaborador as Colaborador
          const cliente = m.cliente as Cliente
          // Prefer the values stored in Supabase. Only fall back to the
          // calculated values when the stored column is empty (0/null).
          const storedValorHora = Number(m.valor_hora) || 0
          const valorHora = storedValorHora > 0 ? storedValorHora : 150000
          const feeMdk = cliente?.fee_mdk || 0
          const calculatedHorasTeoricas = calcularHorasTeoricas(feeMdk, valorHora, colaborador)
          const acumuladoReal = hoursMap.get(`${m.colaborador_id}-${m.cliente_id}`) || 0

          const storedHorasTeoricas = Number(m.horas_teoricas_cliente) || 0
          const storedObjetivo = Number(m.horas_objetivo) || 0
          const storedMinimo = Number(m.minimo_no_negociable_horas) || 0
          const storedAcumulado = Number(m.acumulado_mes_asignado) || 0

          const finalHorasTeoricas = storedHorasTeoricas > 0 ? storedHorasTeoricas : calculatedHorasTeoricas
          const finalObjetivo = storedObjetivo > 0 ? storedObjetivo : finalHorasTeoricas
          const finalMinimo = storedMinimo > 0 ? storedMinimo : finalHorasTeoricas / 2
          // acumulado_mes_asignado: prefer the live tracked hours; fall back to the stored value.
          const finalAcumulado = acumuladoReal > 0 ? acumuladoReal : storedAcumulado

          return {
            ...m,
            colaborador,
            cliente,
            horas_teoricas_cliente: finalHorasTeoricas,
            minimo_no_negociable_horas: finalMinimo,
            horas_objetivo: finalObjetivo,
            acumulado_mes_asignado: finalAcumulado,
            valor_hora: valorHora,
          }
        })
        
        setMetricas(processedMetricas)
      }

      setIsLoading(false)
    }
    loadData()
  }, [hasAccess, selectedMonth, selectedYear, supabase, reloadKey])

  // Calculate horas teoricas
  const calcularHorasTeoricas = (fee: number, valorHora: number, colaborador?: Colaborador | null): number => {
    if (valorHora === 0) return 0
    const rolNombre = colaborador?.roles?.nombre?.toLowerCase() || ''
    const isConsultor = rolNombre.includes('consultor') || rolNombre === 'consultant'
    if (isConsultor) return 0
    const isAccountManager = rolNombre.includes('account') || rolNombre === 'account_manager' || rolNombre === 'account manager'
    const porcentaje = isAccountManager ? 0.20 : 0.075
    return (fee * porcentaje) / valorHora
  }

  // ─── PERMISSIONS TAB HANDLERS ─────────────────────────────────────────────────

  const handleRoleChange = (colaboradorId: string, rolId: string) => {
    setColaboradores(colaboradores.map(c => 
      c.id === colaboradorId ? { ...c, rol_id: rolId } : c
    ))
    setEditedColaboradores(new Set([...editedColaboradores, colaboradorId]))
  }

  const handlePuestoChange = (colaboradorId: string, puesto: string) => {
    setColaboradores(colaboradores.map(c => 
      c.id === colaboradorId ? { ...c, puesto } : c
    ))
    setEditedColaboradores(new Set([...editedColaboradores, colaboradorId]))
  }

  const handleModuleToggle = (colaboradorId: string, moduleId: string, enabled: boolean) => {
    setColaboradores(colaboradores.map(c => {
      if (c.id === colaboradorId) {
        const currentModules = c.modulos_habilitados || []
        const newModules = enabled
          ? [...currentModules, moduleId]
          : currentModules.filter(m => m !== moduleId)
        return { ...c, modulos_habilitados: newModules }
      }
      return c
    }))
    setEditedColaboradores(new Set([...editedColaboradores, colaboradorId]))
  }

  const handleSavePermissions = async () => {
    setSavingPermissions(true)
    
    try {
      for (const id of editedColaboradores) {
        const colab = colaboradores.find(c => c.id === id)
        if (!colab) continue

        const { error } = await supabase
          .from('colaboradores')
          .update({
            rol_id: colab.rol_id,
            puesto: colab.puesto,
            modulos_habilitados: colab.modulos_habilitados,
          })
          .eq('id', id)

        if (error) {
          console.error('Error saving permissions:', error)
          toast.error(`Error al guardar permisos para ${colab.nombre}`)
          continue
        }
      }
      
      setEditedColaboradores(new Set())
      toast.success('Permisos guardados correctamente')
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al guardar permisos')
    }
    
    setSavingPermissions(false)
  }

  // ─── CREATE USER HANDLER ──────────────────────────────────────────────────────

  const handleCreateUser = async () => {
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword.trim()) {
      toast.error('Nombre, email y contraseña son requeridos')
      return
    }

    if (newUserPassword.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres')
      return
    }

    setCreatingUser(true)

    try {
      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newUserEmail.trim().toLowerCase(),
          password: newUserPassword,
          nombre: newUserName.trim(),
          apellido: newUserLastName.trim() || '',
          rol_id: newUserRole || null,
          puesto: newUserPuesto || null,
          modulos_habilitados: ['dashboard', 'tareas'],
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        toast.error(result.error || 'Error al crear usuario')
        setCreatingUser(false)
        return
      }

      // Reload colaboradores list
      const { data: colabs } = await supabase
        .from('colaboradores')
        .select('id, nombre, apellido, email, rol_id, puesto, modulos_habilitados, activo, avatar_url, roles(id, nombre)')
        .order('nombre')

      if (colabs) setColaboradores(colabs as Colaborador[])

      // Reset form and close dialog
      setNewUserName('')
      setNewUserLastName('')
      setNewUserEmail('')
      setNewUserPassword('')
      setNewUserRole('')
      setNewUserPuesto('')
      setShowCreateDialog(false)
      
      toast.success(`Usuario ${newUserName} creado correctamente`)
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al crear usuario')
    }

    setCreatingUser(false)
  }

  // ─── EDIT USER HANDLER ────────────────��───────────────────────────────────────

  const openEditDialog = (colaborador: Colaborador) => {
    setEditingUser(colaborador)
    setEditUserName(colaborador.nombre || '')
    setEditUserLastName(colaborador.apellido || '')
    setEditUserEmail(colaborador.email || '')
    setEditUserPassword('')
    setEditUserRole(colaborador.rol_id || '')
    setEditUserPuesto(colaborador.puesto || '')
    setEditUserActivo(colaborador.activo !== false)
    setShowEditDialog(true)
  }

  const handleUpdateUser = async () => {
    if (!editingUser) return

    if (!editUserName.trim() || !editUserEmail.trim()) {
      toast.error('Nombre y email son requeridos')
      return
    }

    if (editUserPassword && editUserPassword.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres')
      return
    }

    setSavingUser(true)

    try {
      const response = await fetch('/api/admin/update-user', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: editingUser.id,
          email: editUserEmail.trim().toLowerCase(),
          password: editUserPassword || undefined,
          nombre: editUserName.trim(),
          apellido: editUserLastName.trim() || '',
          rol_id: editUserRole || null,
          puesto: editUserPuesto || null,
          activo: editUserActivo,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        toast.error(result.error || 'Error al actualizar usuario')
        setSavingUser(false)
        return
      }

      // Reload colaboradores list
      const { data: colabs } = await supabase
        .from('colaboradores')
        .select('id, nombre, apellido, email, rol_id, puesto, modulos_habilitados, activo, avatar_url, roles(id, nombre)')
        .order('nombre')

      if (colabs) setColaboradores(colabs as Colaborador[])

      // Close dialog
      setShowEditDialog(false)
      setEditingUser(null)
      
      toast.success(`Usuario ${editUserName} actualizado correctamente`)
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al actualizar usuario')
    }

    setSavingUser(false)
  }

  // ─── METRICS TAB HANDLERS ─────────────────────────────────────────────────────

  // Parse a single CSV line respecting quoted fields (e.g. "$15,882.24")
  const parseCsvLine = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current)
        current = ''
      } else {
        current += char
      }
    }
    result.push(current)
    return result.map(s => s.trim())
  }

  // Parse "$15,882.24" -> 15882.24
  const parseCurrency = (raw: string): number => {
    if (!raw) return 0
    const cleaned = raw.replace(/[$\s]/g, '').replace(/,/g, '')
    const n = Number(cleaned)
    return isNaN(n) ? 0 : n
  }

  // Normalize names for matching (case + accent insensitive)
  const normalize = (s: string): string =>
    (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleImportCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      event.target.value = '' // allow re-importing same file later
    }
    if (!file) return

    setIsImporting(true)
    try {
      const text = await file.text()
      const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
      if (lines.length < 2) {
        toast.error('El archivo CSV esta vacio o no tiene datos')
        setIsImporting(false)
        return
      }

      // Map header positions (tolerant to column order)
      const header = parseCsvLine(lines[0]).map(h => normalize(h))
      const idx = (name: string) => header.findIndex(h => h === normalize(name))
      const iColab = idx('Colaborador')
      const iCliente = idx('cliente')
      const iValor = idx('valor_hora')
      const iTeoricas = idx('horas_teoricas')
      const iMinimas = idx('horas_minimas')
      const iMaximas = idx('horas_maximas')

      if (iColab < 0 || iCliente < 0) {
        toast.error('El CSV debe tener columnas "Colaborador" y "cliente"')
        setIsImporting(false)
        return
      }

      // Build lookup maps by full name and by business name
      const colabByName = new Map<string, Colaborador>()
      colaboradores.forEach(c => {
        const full = normalize(`${c.nombre} ${c.apellido || ''}`)
        colabByName.set(full, c)
        colabByName.set(normalize(c.nombre), c) // fallback to first name only
      })
      const clienteByName = new Map<string, Cliente>()
      clientes.forEach(c => clienteByName.set(normalize(c.nombre_del_negocio), c))

      const rows: Array<{
        colaborador: Colaborador
        cliente: Cliente
        valorHora: number
        teoricas: number
        minimas: number
        maximas: number
      }> = []
      const unmatchedColab = new Set<string>()
      const unmatchedCliente = new Set<string>()
      let skippedIncomplete = 0

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i])
        const colabName = cols[iColab] || ''
        const clienteName = cols[iCliente] || ''
        const teoricasStr = iTeoricas >= 0 ? cols[iTeoricas] || '' : ''
        const maximasStr = iMaximas >= 0 ? cols[iMaximas] || '' : ''

        // Skip rows without colaborador or without hours data
        if (!colabName.trim()) {
          skippedIncomplete++
          continue
        }
        if (!teoricasStr.trim() || !maximasStr.trim()) {
          skippedIncomplete++
          continue
        }

        const colaborador = colabByName.get(normalize(colabName))
        const cliente = clienteByName.get(normalize(clienteName))

        if (!colaborador) {
          unmatchedColab.add(colabName)
          continue
        }
        if (!cliente) {
          unmatchedCliente.add(clienteName)
          continue
        }

        rows.push({
          colaborador,
          cliente,
          valorHora: iValor >= 0 ? parseCurrency(cols[iValor] || '') : 0,
          teoricas: parseTimeToHours(teoricasStr),
          minimas: iMinimas >= 0 ? parseTimeToHours(cols[iMinimas] || '') : 0,
          maximas: parseTimeToHours(maximasStr),
        })
      }

      if (rows.length === 0) {
        toast.error('No se encontraron filas validas para importar. Revisa que los nombres coincidan con los colaboradores y clientes.')
        setIsImporting(false)
        return
      }

      // Build upsert payloads for the selected period
      const payloads = rows.map(r => ({
        colaborador_id: r.colaborador.id,
        cliente_id: r.cliente.id,
        fee_administrado: r.cliente.fee_mdk || 0,
        valor_hora: r.valorHora,
        horas_teoricas_cliente: r.teoricas,
        minimo_no_negociable_horas: r.minimas,
        horas_objetivo: r.maximas,
        mes: selectedMonth,
        anio: selectedYear,
      }))

      const { error } = await supabase
        .from('metricas_colaborador')
        .upsert(payloads, { onConflict: 'colaborador_id,cliente_id,mes,anio' })

      if (error) {
        toast.error(`Error al importar: ${error.message}`)
        setIsImporting(false)
        return
      }

      // Feedback summary
      let msg = `${rows.length} filas importadas para ${months[selectedMonth - 1]} ${selectedYear}`
      const warnings: string[] = []
      if (skippedIncomplete > 0) warnings.push(`${skippedIncomplete} filas incompletas omitidas`)
      if (unmatchedColab.size > 0) warnings.push(`colaboradores sin coincidencia: ${[...unmatchedColab].join(', ')}`)
      if (unmatchedCliente.size > 0) warnings.push(`clientes sin coincidencia: ${[...unmatchedCliente].join(', ')}`)

      toast.success(msg)
      if (warnings.length > 0) {
        toast.warning(warnings.join(' | '), { duration: 8000 })
      }

      setEditedRows(new Set())
      setReloadKey(k => k + 1)
    } catch (err) {
      console.error('[v0] Error importando CSV:', err)
      toast.error('No se pudo leer el archivo CSV')
    }

    setIsImporting(false)
  }

  const handleAddRow = () => {
    if (colaboradores.length === 0 || clientes.length === 0) {
      toast.error('No hay colaboradores o clientes disponibles')
      return
    }

    const cliente = clientes[0]
    const colaborador = colaboradores[0]
    const feeMdk = cliente.fee_mdk || 0
    const horasTeoricas = calcularHorasTeoricas(feeMdk, valorHoraGlobal, colaborador)

    const newMetrica: MetricaColaborador = {
      id: crypto.randomUUID(),
      colaborador_id: colaborador.id,
      cliente_id: cliente.id,
      colaborador: colaborador,
      cliente: cliente,
      fee_administrado: feeMdk,
      valor_hora: valorHoraGlobal,
      horas_teoricas_cliente: horasTeoricas,
      minimo_no_negociable_horas: horasTeoricas / 2,
      horas_objetivo: horasTeoricas,
      acumulado_mes_asignado: 0,
      porcentaje_asignacion: 0,
      mes: selectedMonth,
      anio: selectedYear,
    }

    setMetricas([newMetrica, ...metricas])
    setEditedRows(new Set([...editedRows, newMetrica.id]))
  }

  const handleUpdateField = (id: string, field: keyof MetricaColaborador, value: number) => {
    setMetricas(metricas.map(m => {
      if (m.id === id) {
        const updated = { ...m, [field]: value }
        if (field === 'horas_objetivo') {
          updated.minimo_no_negociable_horas = value / 2
        }
        if (updated.horas_objetivo > 0) {
          updated.porcentaje_asignacion = (updated.acumulado_mes_asignado * 100) / updated.horas_objetivo
        } else {
          updated.porcentaje_asignacion = 0
        }
        return updated
      }
      return m
    }))
    setEditedRows(new Set([...editedRows, id]))
  }

  const handleChangeColaborador = (metricaId: string, colaboradorId: string) => {
    const colab = colaboradores.find(c => c.id === colaboradorId)
    if (colab) {
      setMetricas(metricas.map(m => {
        if (m.id === metricaId) {
          const feeMdk = m.cliente?.fee_mdk || m.fee_administrado || 0
          const horasTeoricas = calcularHorasTeoricas(feeMdk, m.valor_hora, colab)
          return { 
            ...m, 
            colaborador_id: colaboradorId, 
            colaborador: colab,
            horas_teoricas_cliente: horasTeoricas,
            horas_objetivo: horasTeoricas,
            minimo_no_negociable_horas: horasTeoricas / 2,
          }
        }
        return m
      }))
      setEditedRows(new Set([...editedRows, metricaId]))
    }
  }

  const handleChangeCliente = (metricaId: string, clienteId: string) => {
    const cliente = clientes.find(c => c.id === clienteId)
    if (cliente) {
      const feeMdk = cliente.fee_mdk || 0
      setMetricas(metricas.map(m => {
        if (m.id === metricaId) {
          const horasTeoricas = calcularHorasTeoricas(feeMdk, m.valor_hora, m.colaborador)
          return { 
            ...m, 
            cliente_id: clienteId, 
            cliente: cliente,
            fee_administrado: feeMdk,
            horas_teoricas_cliente: horasTeoricas,
            horas_objetivo: horasTeoricas,
            minimo_no_negociable_horas: horasTeoricas / 2,
          }
        }
        return m
      }))
      setEditedRows(new Set([...editedRows, metricaId]))
    }
  }

  const handleRecalcularTodo = () => {
    setMetricas(metricas.map(m => {
      const feeMdk = m.cliente?.fee_mdk || m.fee_administrado || 0
      const horasTeoricas = calcularHorasTeoricas(feeMdk, m.valor_hora, m.colaborador)
      const porcentaje = horasTeoricas > 0 ? (m.acumulado_mes_asignado * 100) / horasTeoricas : 0
      
      return {
        ...m,
        fee_administrado: feeMdk,
        horas_teoricas_cliente: horasTeoricas,
        horas_objetivo: horasTeoricas,
        minimo_no_negociable_horas: horasTeoricas / 2,
        porcentaje_asignacion: porcentaje,
      }
    }))
    setEditedRows(new Set(metricas.map(m => m.id)))
    toast.success('Valores recalculados')
  }

  const handleStartEditFee = (cliente: Cliente) => {
    setEditingFeeClientId(cliente.id)
    setEditFeeMdk(cliente.fee_mdk || 0)
    setEditFeeAurelia(cliente.fee_aurelia || 0)
    setEditFeeConsultoria(cliente.fee_consultoria || 0)
  }

  const handleSaveFee = async () => {
    if (!editingFeeClientId) return
    
    setSavingFee(true)
    const { error } = await supabase
      .from('clientes')
      .update({
        fee_mdk: editFeeMdk,
        fee_aurelia: editFeeAurelia,
        fee_consultoria: editFeeConsultoria,
      })
      .eq('id', editingFeeClientId)
    
    if (error) {
      toast.error('Error al guardar fees')
    } else {
      setClientes(clientes.map(c => 
        c.id === editingFeeClientId 
          ? { ...c, fee_mdk: editFeeMdk, fee_aurelia: editFeeAurelia, fee_consultoria: editFeeConsultoria }
          : c
      ))
      setMetricas(metricas.map(m => {
        if (m.cliente_id === editingFeeClientId) {
          const totalFee = editFeeMdk + editFeeAurelia + editFeeConsultoria
          return {
            ...m,
            cliente: { ...m.cliente!, fee_mdk: editFeeMdk, fee_aurelia: editFeeAurelia, fee_consultoria: editFeeConsultoria },
            fee_administrado: totalFee,
          }
        }
        return m
      }))
      toast.success('Fees actualizados')
      setEditingFeeClientId(null)
    }
    setSavingFee(false)
  }

  const handleCancelEditFee = () => {
    setEditingFeeClientId(null)
  }

  const handleDeleteRow = async (id: string) => {
    const metrica = metricas.find(m => m.id === id)
    if (!metrica) return

    const { data } = await supabase
      .from('metricas_colaborador')
      .select('id')
      .eq('id', id)
      .single()

    if (data) {
      const { error } = await supabase
        .from('metricas_colaborador')
        .delete()
        .eq('id', id)

      if (error) {
        toast.error('Error al eliminar')
        return
      }
    }

    setMetricas(metricas.filter(m => m.id !== id))
    const newEdited = new Set(editedRows)
    newEdited.delete(id)
    setEditedRows(newEdited)
    toast.success('Fila eliminada')
  }

  const handleSave = async () => {
    setIsSaving(true)

    try {
      for (const id of editedRows) {
        const metrica = metricas.find(m => m.id === id)
        if (!metrica) continue

        const payload = {
          id: metrica.id,
          colaborador_id: metrica.colaborador_id,
          cliente_id: metrica.cliente_id,
          fee_administrado: metrica.fee_administrado,
          valor_hora: metrica.valor_hora,
          horas_teoricas_cliente: metrica.horas_teoricas_cliente,
          minimo_no_negociable_horas: metrica.minimo_no_negociable_horas,
          horas_objetivo: metrica.horas_objetivo,
          acumulado_mes_asignado: metrica.acumulado_mes_asignado,
          porcentaje_asignacion: metrica.porcentaje_asignacion,
          mes: selectedMonth,
          anio: selectedYear,
        }

        // Upsert by primary key (id). Every row — new ones from handleAddRow and
        // existing ones from the fetch — always carries an id, so resolving the
        // conflict on the PK reliably updates existing rows and inserts new ones.
        // (Using onConflict on the composite key would require a matching UNIQUE
        // constraint in the DB and silently fails to save when it's missing.)
        const { error } = await supabase
          .from('metricas_colaborador')
          .upsert(payload, { onConflict: 'id' })

        if (error) {
          toast.error(`Error al guardar: ${error.message}`)
          setIsSaving(false)
          return
        }
      }

      setEditedRows(new Set())
      toast.success('Cambios guardados')
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al guardar cambios')
    }

    setIsSaving(false)
  }

  // Filter metricas by colaborador
  const filteredMetricas = filterColaborador === 'all' 
    ? metricas 
    : metricas.filter(m => m.colaborador_id === filterColaborador)

  // Filter only active colaboradores for permissions
  const activeColaboradores = colaboradores.filter(c => c.activo)

  if (hasAccess === null) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (hasAccess === false) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Acceso restringido</h1>
        <p className="text-muted-foreground">Solo usuarios con rol Master pueden acceder a esta pagina.</p>
      </div>
    )
  }

  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ]

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Colaboradores</h1>
          <p className="text-muted-foreground">Gestiona permisos, roles y metricas de los colaboradores</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <UserPlus className="h-4 w-4 mr-2" />
          Crear usuario
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="permisos" className="gap-2">
            <Shield className="h-4 w-4" />
            Roles y Permisos
          </TabsTrigger>
          <TabsTrigger value="metricas" className="gap-2">
            <Users className="h-4 w-4" />
            Metricas
          </TabsTrigger>
        </TabsList>

        {/* ─── PERMISSIONS TAB ─────────────────────────────────────────────────────── */}
        <TabsContent value="permisos" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Configuracion de Roles y Modulos</CardTitle>
                  <CardDescription>
                    Asigna roles y habilita modulos para cada colaborador. Los usuarios Master tienen acceso a todo.
                  </CardDescription>
                </div>
                <Button 
                  onClick={handleSavePermissions}
                  disabled={editedColaboradores.size === 0 || savingPermissions}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {savingPermissions ? 'Guardando...' : 'Guardar cambios'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[200px]">Colaborador</TableHead>
                        <TableHead className="w-[140px]">Rol</TableHead>
                        <TableHead className="w-[160px]">Puesto</TableHead>
                        {AVAILABLE_MODULES.map(mod => (
                          <TableHead key={mod.id} className="text-center w-[100px]">
                            <div className="flex flex-col items-center">
                              <span className="text-xs">{mod.name}</span>
                            </div>
                          </TableHead>
                        ))}
                        <TableHead className="w-[80px] text-center">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeColaboradores.map(colab => {
                        const isMaster = roles.find(r => r.id === colab.rol_id)?.nombre?.toLowerCase() === 'master'
                        const isEdited = editedColaboradores.has(colab.id)
                        
                        return (
                          <TableRow key={colab.id} className={isEdited ? 'bg-primary/5' : ''}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8">
                                  {colab.avatar_url && (
                                    <AvatarImage src={colab.avatar_url} alt={colab.nombre} />
                                  )}
                                  <AvatarFallback className="text-xs">
                                    {colab.nombre?.[0]}{colab.apellido?.[0]}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-medium text-sm">{colab.nombre} {colab.apellido}</p>
                                  <p className="text-xs text-muted-foreground">{colab.email}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Select 
                                value={colab.rol_id || ''} 
                                onValueChange={(v) => handleRoleChange(colab.id, v)}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Seleccionar rol" />
                                </SelectTrigger>
                                <SelectContent>
                                  {roles.map(role => (
                                    <SelectItem key={role.id} value={role.id}>
                                      <div className="flex items-center gap-2">
                                        {role.nombre}
                                        {role.nombre.toLowerCase() === 'master' && (
                                          <Badge variant="secondary" className="text-[10px] px-1">Admin</Badge>
                                        )}
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Select 
                                value={colab.puesto || ''} 
                                onValueChange={(v) => handlePuestoChange(colab.id, v)}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Seleccionar puesto" />
                                </SelectTrigger>
                                <SelectContent>
                                  {PUESTOS.map(puesto => (
                                    <SelectItem key={puesto} value={puesto}>
                                      {puesto}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            {AVAILABLE_MODULES.map(mod => (
                              <TableCell key={mod.id} className="text-center">
                                {isMaster ? (
                                  <Badge variant="secondary" className="text-[10px]">Auto</Badge>
                                ) : (
                                  <Checkbox
                                    checked={colab.modulos_habilitados?.includes(mod.id) || false}
                                    onCheckedChange={(checked) => 
                                      handleModuleToggle(colab.id, mod.id, checked as boolean)
                                    }
                                  />
                                )}
                              </TableCell>
                            ))}
                            <TableCell className="text-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditDialog(colab)}
                                className="h-8 w-8 p-0"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Legend */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-6 text-sm">
                <div>
                  <span className="font-medium">Master:</span>
                  <span className="text-muted-foreground ml-1">Acceso total a todas las secciones incluyendo Administracion</span>
                </div>
                <div>
                  <span className="font-medium">Usuario:</span>
                  <span className="text-muted-foreground ml-1">Puede editar en los modulos habilitados</span>
                </div>
                <div>
                  <span className="font-medium">Lector:</span>
                  <span className="text-muted-foreground ml-1">Solo lectura en los modulos habilitados</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── METRICS TAB ─────────────────────────────────────────────────────────── */}
        <TabsContent value="metricas" className="space-y-4">
          <div className="flex items-center justify-end gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Valor hora:</span>
              <Input
                type="number"
                value={valorHoraGlobal}
                onChange={(e) => setValorHoraGlobal(Number(e.target.value))}
                className="w-[120px] text-right"
              />
            </div>
            <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((month, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{month}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2024, 2025, 2026].map(year => (
                  <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Detalle por Cliente</CardTitle>
                  <CardDescription>
                    {months[selectedMonth - 1]} {selectedYear} - Formulas: H.Teoricas = ((Fee x %)/ValorHora) (PM: 7.5%, AC: 20%)
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={filterColaborador} onValueChange={setFilterColaborador}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filtrar colaborador" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los colaboradores</SelectItem>
                      {colaboradores.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nombre} {c.apellido || ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={handleRecalcularTodo}>
                    <Calculator className="h-4 w-4 mr-1" />
                    Recalcular
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={handleImportCSV}
                  />
                  <Button variant="outline" size="sm" onClick={handleImportClick} disabled={isImporting}>
                    <Upload className="h-4 w-4 mr-1" />
                    {isImporting ? 'Importando...' : 'Importar CSV'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleAddRow}>
                    <Plus className="h-4 w-4 mr-1" />
                    Agregar
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={handleSave} 
                    disabled={editedRows.size === 0 || isSaving}
                  >
                    <Save className="h-4 w-4 mr-1" />
                    {isSaving ? 'Guardando...' : 'Guardar'}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[160px]">Colaborador</TableHead>
                        <TableHead className="w-[160px]">Cliente</TableHead>
                        <TableHead className="text-right w-[140px]">Fees (MDK/Aur/Cons)</TableHead>
                        <TableHead className="text-right w-[100px]">Valor Hora</TableHead>
                        <TableHead className="text-right w-[90px]">H Teoricas</TableHead>
                        <TableHead className="text-right w-[90px]">Minimo</TableHead>
                        <TableHead className="text-right w-[90px]">Objetivo</TableHead>
                        <TableHead className="text-right w-[90px]">Acumulado</TableHead>
                        <TableHead className="text-right w-[80px]">%</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredMetricas.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                            No hay datos para este periodo. Haz clic en &quot;Agregar&quot; para comenzar.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredMetricas.map((m) => (
                          <TableRow key={m.id} className={editedRows.has(m.id) ? 'bg-primary/5' : ''}>
                            <TableCell>
                              <Select 
                                value={m.colaborador_id} 
                                onValueChange={(v) => handleChangeColaborador(m.id, v)}
                              >
                                <SelectTrigger className="w-full h-8 text-xs">
                                  <SelectValue>
                                    {m.colaborador ? `${m.colaborador.nombre} ${m.colaborador.apellido || ''}`.trim() : 'Seleccionar'}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  {colaboradores.map(c => (
                                    <SelectItem key={c.id} value={c.id}>
                                      {c.nombre} {c.apellido || ''}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Select 
                                value={m.cliente_id} 
                                onValueChange={(v) => handleChangeCliente(m.id, v)}
                              >
                                <SelectTrigger className="w-full h-8 text-xs">
                                  <SelectValue>
                                    {m.cliente?.nombre_del_negocio || 'Seleccionar'}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  {clientes.map(c => (
                                    <SelectItem key={c.id} value={c.id}>
                                      {c.nombre_del_negocio}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-right">
                              {editingFeeClientId === m.cliente_id ? (
                                <div className="flex flex-col gap-1 items-end">
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-muted-foreground w-8">MDK:</span>
                                    <Input
                                      type="number"
                                      value={editFeeMdk}
                                      onChange={(e) => setEditFeeMdk(Number(e.target.value))}
                                      className="w-[80px] h-6 text-xs text-right"
                                    />
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-muted-foreground w-8">Aur:</span>
                                    <Input
                                      type="number"
                                      value={editFeeAurelia}
                                      onChange={(e) => setEditFeeAurelia(Number(e.target.value))}
                                      className="w-[80px] h-6 text-xs text-right"
                                    />
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-muted-foreground w-8">Cons:</span>
                                    <Input
                                      type="number"
                                      value={editFeeConsultoria}
                                      onChange={(e) => setEditFeeConsultoria(Number(e.target.value))}
                                      className="w-[80px] h-6 text-xs text-right"
                                    />
                                  </div>
                                  <div className="flex gap-1 mt-1">
                                    <Button 
                                      size="icon" 
                                      variant="ghost" 
                                      className="h-5 w-5"
                                      onClick={handleSaveFee}
                                      disabled={savingFee}
                                    >
                                      <Check className="h-3 w-3 text-green-500" />
                                    </Button>
                                    <Button 
                                      size="icon" 
                                      variant="ghost" 
                                      className="h-5 w-5"
                                      onClick={handleCancelEditFee}
                                      disabled={savingFee}
                                    >
                                      <X className="h-3 w-3 text-red-500" />
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-1">
                                  <div className="flex flex-col items-end text-[10px]">
                                    {(m.cliente?.fee_mdk ?? 0) > 0 && (
                                      <span>MDK: ${((m.cliente?.fee_mdk || 0) / 1000).toFixed(1)}K</span>
                                    )}
                                    {(m.cliente?.fee_aurelia ?? 0) > 0 && (
                                      <span>Aur: ${((m.cliente?.fee_aurelia || 0) / 1000).toFixed(1)}K</span>
                                    )}
                                    {(m.cliente?.fee_consultoria ?? 0) > 0 && (
                                      <span>Cons: ${((m.cliente?.fee_consultoria || 0) / 1000).toFixed(1)}K</span>
                                    )}
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5"
                                    onClick={() => m.cliente && handleStartEditFee(m.cliente)}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                value={m.valor_hora}
                                onChange={(e) => handleUpdateField(m.id, 'valor_hora', Number(e.target.value))}
                                className="w-[90px] h-8 text-xs text-right"
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="text"
                                value={formatHoursToTime(m.horas_teoricas_cliente)}
                                onChange={(e) => handleUpdateField(m.id, 'horas_teoricas_cliente', parseTimeToHours(e.target.value))}
                                placeholder="HH:MM:SS"
                                className="w-[90px] h-8 text-xs text-right font-mono"
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="text"
                                value={formatHoursToTime(m.minimo_no_negociable_horas)}
                                onChange={(e) => handleUpdateField(m.id, 'minimo_no_negociable_horas', parseTimeToHours(e.target.value))}
                                placeholder="HH:MM:SS"
                                className={cn(
                                  "w-[90px] h-8 text-xs text-right font-mono",
                                  getHoursColor(m.minimo_no_negociable_horas, m.horas_objetivo / 2)
                                )}
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="text"
                                value={formatHoursToTime(m.horas_objetivo)}
                                onChange={(e) => handleUpdateField(m.id, 'horas_objetivo', parseTimeToHours(e.target.value))}
                                placeholder="HH:MM:SS"
                                className="w-[90px] h-8 text-xs text-right font-mono"
                              />
                            </TableCell>
                            <TableCell className={cn("text-right", getHoursColor(m.acumulado_mes_asignado, m.minimo_no_negociable_horas))}>
                              <Input
                                type="text"
                                value={formatHoursToTime(m.acumulado_mes_asignado)}
                                onChange={(e) => handleUpdateField(m.id, 'acumulado_mes_asignado', parseTimeToHours(e.target.value))}
                                placeholder="HH:MM:SS"
                                className={cn(
                                  "w-[90px] h-8 text-xs text-right font-mono",
                                  getHoursColor(m.acumulado_mes_asignado, m.minimo_no_negociable_horas)
                                )}
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              {(() => {
                                const pct = m.horas_objetivo > 0
                                  ? (m.acumulado_mes_asignado * 100) / m.horas_objetivo
                                  : 0
                                return (
                                  <span className={cn(
                                    "px-2 py-1 rounded text-xs",
                                    getPercentageColor(pct)
                                  )}>
                                    {pct.toFixed(1)}%
                                  </span>
                                )
                              })()}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => handleDeleteRow(m.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create User Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Crear nuevo usuario</DialogTitle>
            <DialogDescription>
              Ingresa los datos del nuevo colaborador. La cuenta quedara activa inmediatamente.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Nombre *
              </Label>
              <Input
                id="name"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                className="col-span-3"
                placeholder="Nombre"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="lastname" className="text-right">
                Apellido
              </Label>
              <Input
                id="lastname"
                value={newUserLastName}
                onChange={(e) => setNewUserLastName(e.target.value)}
                className="col-span-3"
                placeholder="Apellido"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="email" className="text-right">
                Email *
              </Label>
              <Input
                id="email"
                type="email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                className="col-span-3"
                placeholder="email@ejemplo.com"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="password" className="text-right">
                Contraseña *
              </Label>
              <Input
                id="password"
                type="password"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                className="col-span-3"
                placeholder="Minimo 6 caracteres"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="role" className="text-right">
                Rol
              </Label>
              <Select value={newUserRole} onValueChange={setNewUserRole}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Seleccionar rol" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map(role => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="puesto" className="text-right">
                Puesto
              </Label>
              <Select value={newUserPuesto} onValueChange={setNewUserPuesto}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Seleccionar puesto" />
                </SelectTrigger>
                <SelectContent>
                  {PUESTOS.map(puesto => (
                    <SelectItem key={puesto} value={puesto}>
                      {puesto}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateUser} disabled={creatingUser}>
              {creatingUser ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Creando...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Crear usuario
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Editar usuario</DialogTitle>
            <DialogDescription>
              Modifica los datos del colaborador. Deja la contraseña vacia para no cambiarla.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-name" className="text-right">
                Nombre *
              </Label>
              <Input
                id="edit-name"
                value={editUserName}
                onChange={(e) => setEditUserName(e.target.value)}
                className="col-span-3"
                placeholder="Nombre"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-lastname" className="text-right">
                Apellido
              </Label>
              <Input
                id="edit-lastname"
                value={editUserLastName}
                onChange={(e) => setEditUserLastName(e.target.value)}
                className="col-span-3"
                placeholder="Apellido"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-email" className="text-right">
                Email *
              </Label>
              <Input
                id="edit-email"
                type="email"
                value={editUserEmail}
                onChange={(e) => setEditUserEmail(e.target.value)}
                className="col-span-3"
                placeholder="email@ejemplo.com"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-password" className="text-right">
                Contraseña
              </Label>
              <Input
                id="edit-password"
                type="password"
                value={editUserPassword}
                onChange={(e) => setEditUserPassword(e.target.value)}
                className="col-span-3"
                placeholder="Dejar vacio para no cambiar"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-role" className="text-right">
                Rol
              </Label>
              <Select value={editUserRole} onValueChange={setEditUserRole}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Seleccionar rol" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map(role => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-puesto" className="text-right">
                Puesto
              </Label>
              <Select value={editUserPuesto} onValueChange={setEditUserPuesto}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Seleccionar puesto" />
                </SelectTrigger>
                <SelectContent>
                  {PUESTOS.map(puesto => (
                    <SelectItem key={puesto} value={puesto}>
                      {puesto}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-activo" className="text-right">
                Estado
              </Label>
              <div className="col-span-3 flex items-center gap-2">
                <Checkbox
                  id="edit-activo"
                  checked={editUserActivo}
                  onCheckedChange={(checked) => setEditUserActivo(checked as boolean)}
                />
                <Label htmlFor="edit-activo" className="font-normal">
                  {editUserActivo ? 'Usuario activo' : 'Usuario inactivo'}
                </Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateUser} disabled={savingUser}>
              {savingUser ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Guardar cambios
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
