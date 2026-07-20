'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Task, TaskStatus, TaskPriority, TaskType, TaskCustomField, TaskQuotation, ClientPlan, TaskFile, TaskComment } from '@/lib/types'
import { cn, linkifyText } from '@/lib/utils'
import { createClient, getAuthUser } from '@/lib/supabase/client'
import {
  useTaskStore,
  STATUS_CONFIG,
  STATUS_ORDER,
  PRIORITY_CONFIG,
  ASSIGNEES,
} from '@/lib/tasks/task-store'

// Database types
interface TipoDeTarea {
  id: string
  nombre: string
  activo: boolean
}

interface Colaborador {
  id: string
  nombre: string
  apellido?: string | null
  avatar_url: string | null
  }

interface Cliente {
  id: string
  nombre_del_negocio: string
  plan?: ClientPlan
}
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'

import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { HitoCompletionModal } from './hito-completion-modal'
import { RedactorModal } from '@/components/agentes/redactor-modal'
import { TesterModal } from '@/components/agentes/tester-modal'
import { AnalistaModal } from '@/components/agentes/analista-modal'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Calendar } from '@/components/ui/calendar'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Check, ChevronsUpDown, ChevronLeft, ChevronRight, Pencil, ArrowUpDown, Search, SlidersHorizontal, Building2, Paperclip, User } from 'lucide-react'
import {
  Play,
  RotateCcw,
  Calendar as CalendarIcon,
  Plus,
  X,
  Clock,
  Trash2,
  Maximize2,
  Minimize2,
  FileText,
  Upload,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Code,
  Table,
  Link as LinkIcon,
  Quote,
  Send,
  FileIcon,
  Power,
  Download,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  RotateCw,
  FlaskConical,
} from 'lucide-react'
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { TaskFilesSection } from './task-files-section'
import { es } from 'date-fns/locale'
import { QuotationSection } from './quotation-section'
import { useTimerStore } from '@/lib/time-tracking/timer-store'
import { Square, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// Multi Client Select Component
function MultiClientSelect({
  clients,
  availableClients,
  onChange,
  onNavigateToClient,
}: {
  clients: Array<{ id: string; nombre_del_negocio: string }>
  availableClients: Array<{ id: string; nombre_del_negocio: string }>
  onChange: (clients: Array<{ id: string; nombre_del_negocio: string }>) => void
  onNavigateToClient?: (clientId: string) => void
}) {
  const [open, setOpen] = useState(false)
  
  const addClient = (clientId: string) => {
    const client = availableClients.find(c => c.id === clientId)
    if (client && !clients.find(c => c.id === clientId)) {
      onChange([...clients, { id: client.id, nombre_del_negocio: client.nombre_del_negocio }])
    }
  }
  
  const removeClient = (id: string) => {
    onChange(clients.filter(c => c.id !== id))
  }
  
  const remainingClients = availableClients.filter(c => !clients.find(cl => cl.id === c.id))
  
  return (
    <div className="space-y-2">
      {/* Current clients */}
      <div className="flex flex-wrap gap-1.5">
        {clients.length === 0 ? (
          <span className="text-sm text-muted-foreground">Sin cliente</span>
        ) : (
          clients.map(c => (
            <div
              key={c.id}
              className="flex items-center gap-1.5 bg-muted/50 rounded-full px-2.5 py-0.5 group"
            >
              <button
                onClick={() => onNavigateToClient?.(c.id)}
                className="text-xs hover:text-primary hover:underline transition-colors cursor-pointer"
                title={`Ir a ${c.nombre_del_negocio}`}
              >
                {c.nombre_del_negocio}
              </button>
              <button
                onClick={() => removeClient(c.id)}
                className="h-4 w-4 rounded-full hover:bg-destructive/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))
        )}
      </div>
      
      {/* Add client popover */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
            <Plus className="h-3 w-3" />
            Agregar cliente
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar cliente..." className="h-9" />
            <CommandList>
              <CommandEmpty>No se encontraron clientes</CommandEmpty>
              <CommandGroup>
                {remainingClients.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={c.nombre_del_negocio}
                    onSelect={() => {
                      addClient(c.id)
                      setOpen(false)
                    }}
                  >
                    {c.nombre_del_negocio}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

// Multi Assignee Select Component
function MultiAssigneeSelect({ 
  assignees, 
  colaboradores,
  onChange 
}: { 
  assignees: Array<{ id: string; nombre: string; apellido?: string | null; avatar_url: string | null }>
  colaboradores: Array<{ id: string; nombre: string; apellido?: string | null; avatar_url: string | null }>
  onChange: (assignees: Array<{ id: string; nombre: string; apellido?: string | null; avatar_url: string | null }>) => void
}) {
  const [open, setOpen] = useState(false)

  const fullName = (p: { nombre: string; apellido?: string | null }) =>
    [p.nombre, p.apellido].filter(Boolean).join(' ')

  const addAssignee = (colabId: string) => {
    const colab = colaboradores.find(c => c.id === colabId)
    if (colab && !assignees.find(a => a.id === colabId)) {
      onChange([...assignees, { id: colab.id, nombre: colab.nombre, apellido: colab.apellido, avatar_url: colab.avatar_url }])
    }
  }

  const removeAssignee = (id: string) => {
    onChange(assignees.filter(a => a.id !== id))
  }

  const availableColaboradores = colaboradores.filter(c => !assignees.find(a => a.id === c.id))

  return (
    <div className="space-y-2">
      {/* Current assignees */}
      <div className="flex flex-wrap gap-1.5">
        {assignees.length === 0 ? (
          <span className="text-sm text-muted-foreground">Sin asignar</span>
        ) : (
          assignees.map(a => (
            <div 
              key={a.id} 
              className="flex items-center gap-1.5 bg-muted/50 rounded-full pl-1 pr-2 py-0.5 group"
            >
              <Avatar className="h-5 w-5">
                {a.avatar_url && <AvatarImage src={a.avatar_url} alt={fullName(a)} />}
                <AvatarFallback className="text-[9px]">{getInitials(fullName(a))}</AvatarFallback>
              </Avatar>
              <span className="text-xs">{fullName(a)}</span>
              <button 
                onClick={() => removeAssignee(a.id)}
                className="h-4 w-4 rounded-full hover:bg-destructive/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))
        )}
      </div>
      
      {/* Add assignee popover */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
            <Plus className="h-3 w-3" />
            Agregar
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar colaborador..." />
            <CommandList>
              <CommandEmpty>No hay más colaboradores.</CommandEmpty>
              <CommandGroup>
                {availableColaboradores.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={fullName(c)}
                    onSelect={() => {
                      addAssignee(c.id)
                      setOpen(false)
                    }}
                  >
                    <Avatar className="h-5 w-5 mr-2">
                      {c.avatar_url && <AvatarImage src={c.avatar_url} alt={fullName(c)} />}
                      <AvatarFallback className="text-[9px]">{getInitials(fullName(c))}</AvatarFallback>
                    </Avatar>
                    {fullName(c)}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

// Searchable Task Type Select Component
function SearchableTaskTypeSelect({ 
  tiposTarea, 
  value, 
  onValueChange 
}: { 
  tiposTarea: TipoDeTarea[]
  value: string
  onValueChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selectedTipo = tiposTarea.find(t => t.id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-9 w-full justify-between font-normal overflow-hidden"
        >
          {selectedTipo ? (
            <span className="truncate text-sm">{selectedTipo.nombre}</span>
          ) : (
            <span className="text-muted-foreground">Seleccionar tipo...</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar tipo de tarea..." />
          <CommandList>
            <CommandEmpty>No se encontraron tipos.</CommandEmpty>
            <CommandGroup>
              {tiposTarea.map((tipo) => (
                <CommandItem
                  key={tipo.id}
                  value={tipo.nombre}
                  onSelect={() => {
                    onValueChange(tipo.id)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === tipo.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {tipo.nombre}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function formatTimeShort(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function getInitials(name: string | undefined | null): string {
  if (!name) return '??'
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

// ── Rich Text Editor ──────────────────────────────────────────────────────────

function RichTextEditor({ 
  content, 
  onChange,
  placeholder = 'Escribe aqui...'
}: { 
  content: string
  onChange: (html: string) => void
  placeholder?: string
}) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [showTableMenu, setShowTableMenu] = useState(false)
  const [isInTable, setIsInTable] = useState(false)

  useEffect(() => {
    if (editorRef.current && content !== editorRef.current.innerHTML) {
      editorRef.current.innerHTML = content || ''
    }
  }, [content])

  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value)
    editorRef.current?.focus()
    handleInput()
  }

  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML)
    }
  }

  // Handle paste event to paste as plain text
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    if (text) {
      document.execCommand('insertText', false, text)
    }
  }

  // Check if cursor is inside a table
  const checkTableContext = () => {
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      let node: Node | null = selection.anchorNode
      while (node) {
        if (node.nodeName === 'TABLE' || node.nodeName === 'TD' || node.nodeName === 'TH') {
          setIsInTable(true)
          return
        }
        node = node.parentNode
      }
    }
    setIsInTable(false)
  }

  // Get current cell
  const getCurrentCell = (): HTMLTableCellElement | null => {
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      let node: Node | null = selection.anchorNode
      while (node) {
        if (node.nodeName === 'TD' || node.nodeName === 'TH') {
          return node as HTMLTableCellElement
        }
        node = node.parentNode
      }
    }
    return null
  }

  // Get current table
  const getCurrentTable = (): HTMLTableElement | null => {
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      let node: Node | null = selection.anchorNode
      while (node) {
        if (node.nodeName === 'TABLE') {
          return node as HTMLTableElement
        }
        node = node.parentNode
      }
    }
    return null
  }

  const insertTable = () => {
    const table = `
      <table style="width:100%; border-collapse:collapse; margin:8px 0;">
        <tr>
          <th style="border:1px solid #333; padding:8px; background:#1a1a2e;">Col 1</th>
          <th style="border:1px solid #333; padding:8px; background:#1a1a2e;">Col 2</th>
          <th style="border:1px solid #333; padding:8px; background:#1a1a2e;">Col 3</th>
        </tr>
        <tr>
          <td style="border:1px solid #333; padding:8px;">Dato 1</td>
          <td style="border:1px solid #333; padding:8px;">Dato 2</td>
          <td style="border:1px solid #333; padding:8px;">Dato 3</td>
        </tr>
      </table>
    `
    execCommand('insertHTML', table)
    setShowTableMenu(false)
  }

  const addTableRow = () => {
    const table = getCurrentTable()
    const cell = getCurrentCell()
    if (!table || !cell) return

    const row = cell.parentElement as HTMLTableRowElement
    const colCount = row.cells.length
    const newRow = table.insertRow(row.rowIndex + 1)
    
    for (let i = 0; i < colCount; i++) {
      const newCell = newRow.insertCell(i)
      newCell.style.cssText = 'border:1px solid #333; padding:8px;'
      newCell.textContent = ''
    }
    handleInput()
  }

  const addTableColumn = () => {
    const table = getCurrentTable()
    const cell = getCurrentCell()
    if (!table || !cell) return

    const colIndex = cell.cellIndex + 1
    
    for (let i = 0; i < table.rows.length; i++) {
      const row = table.rows[i]
      const newCell = row.insertCell(colIndex)
      if (i === 0) {
        newCell.outerHTML = `<th style="border:1px solid #333; padding:8px; background:#1a1a2e;">Nueva col</th>`
      } else {
        newCell.style.cssText = 'border:1px solid #333; padding:8px;'
        newCell.textContent = ''
      }
    }
    handleInput()
  }

  const deleteTableRow = () => {
    const table = getCurrentTable()
    const cell = getCurrentCell()
    if (!table || !cell) return

    const row = cell.parentElement as HTMLTableRowElement
    if (table.rows.length > 1) {
      table.deleteRow(row.rowIndex)
      handleInput()
    }
  }

  const deleteTableColumn = () => {
    const table = getCurrentTable()
    const cell = getCurrentCell()
    if (!table || !cell) return

    const colIndex = cell.cellIndex
    if (table.rows[0].cells.length > 1) {
      for (let i = 0; i < table.rows.length; i++) {
        table.rows[i].deleteCell(colIndex)
      }
      handleInput()
    }
  }

  const deleteTable = () => {
    const table = getCurrentTable()
    if (table) {
      table.remove()
      handleInput()
      setShowTableMenu(false)
    }
  }

  const insertCodeBlock = () => {
    const code = `<pre style="background:#1a1a2e; padding:12px; border-radius:6px; overflow-x:auto; margin:8px 0;"><code>// Tu codigo aqui</code></pre>`
    execCommand('insertHTML', code)
  }

  return (
    <div className="rounded-lg border bg-background">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 p-2 border-b flex-wrap">
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('bold')}>
          <Bold className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('italic')}>
          <Italic className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('underline')}>
          <Underline className="h-3.5 w-3.5" />
        </Button>
        <Separator orientation="vertical" className="h-4 mx-1" />
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('insertUnorderedList')}>
          <List className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('insertOrderedList')}>
          <ListOrdered className="h-3.5 w-3.5" />
        </Button>
        <Separator orientation="vertical" className="h-4 mx-1" />
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={insertCodeBlock}>
          <Code className="h-3.5 w-3.5" />
        </Button>
        
        {/* Table dropdown */}
        <DropdownMenu open={showTableMenu} onOpenChange={setShowTableMenu}>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7">
              <Table className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem onClick={insertTable}>
              <Plus className="h-3.5 w-3.5 mr-2" />
              Insertar tabla
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={addTableRow} disabled={!isInTable}>
              <Plus className="h-3.5 w-3.5 mr-2" />
              Agregar fila abajo
            </DropdownMenuItem>
            <DropdownMenuItem onClick={addTableColumn} disabled={!isInTable}>
              <Plus className="h-3.5 w-3.5 mr-2" />
              Agregar columna derecha
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={deleteTableRow} disabled={!isInTable} className="text-destructive">
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Eliminar fila
            </DropdownMenuItem>
            <DropdownMenuItem onClick={deleteTableColumn} disabled={!isInTable} className="text-destructive">
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Eliminar columna
            </DropdownMenuItem>
            <DropdownMenuItem onClick={deleteTable} disabled={!isInTable} className="text-destructive">
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Eliminar tabla
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('formatBlock', 'blockquote')}>
          <Quote className="h-3.5 w-3.5" />
        </Button>
      </div>
      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onPaste={handlePaste}
        onClick={checkTableContext}
        onKeyUp={checkTableContext}
        className="min-h-[120px] p-3 text-sm focus:outline-none prose prose-sm prose-invert max-w-none [&_table]:w-full [&_th]:bg-muted [&_td]:p-2 [&_th]:p-2 [&_td]:border [&_th]:border [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded-md [&_blockquote]:border-l-2 [&_blockquote]:border-primary [&_blockquote]:pl-3 [&_blockquote]:italic"
        data-placeholder={placeholder}
        style={{ minHeight: '120px' }}
      />
    </div>
  )
}

// ── Time Tracker Component (synced with global timer) ─────────────────────────

function TimeTracker({ task }: { task: Task }) {
  const { updateTask } = useTaskStore()
  const { 
    isRunning: globalIsRunning, 
    taskId: globalTaskId, 
    startedAt: globalStartedAt,
    startTimerForTask, 
    stopTimer: globalStopTimer,
    getElapsedSeconds 
  } = useTimerStore()
  
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [isStarting, setIsStarting] = useState(false)
  const [isStopping, setIsStopping] = useState(false)

  const isThisTaskRunning = globalIsRunning && globalTaskId === task.id

  useEffect(() => {
    if (!isThisTaskRunning) {
      setElapsedSeconds(0)
      return
    }
    setElapsedSeconds(getElapsedSeconds())
    const interval = setInterval(() => {
      setElapsedSeconds(getElapsedSeconds())
    }, 1000)
    return () => clearInterval(interval)
  }, [isThisTaskRunning, globalStartedAt, getElapsedSeconds])

  const totalDisplay = task.totalTimeSec + (isThisTaskRunning ? elapsedSeconds : 0)

  const handleStart = async () => {
    setIsStarting(true)
    try {
      await startTimerForTask(task.id, task.title, task.clientId || null)
      toast.success('Timer iniciado para esta tarea')
    } catch {
      toast.error('Error al iniciar el timer')
    } finally {
      setIsStarting(false)
    }
  }

  const handleStop = async () => {
    setIsStopping(true)
    try {
      const durationSec = getElapsedSeconds()
      await globalStopTimer()
      const newSession = {
        id: `session-${Date.now()}`,
        startedAt: new Date(globalStartedAt!),
        endedAt: new Date(),
        durationSec,
      }
      updateTask(task.id, {
        totalTimeSec: task.totalTimeSec + durationSec,
        timeSessions: [...task.timeSessions, newSession],
      })
      toast.success('Tiempo guardado correctamente')
    } catch {
      toast.error('Error al guardar el tiempo')
    } finally {
      setIsStopping(false)
    }
  }

  const handleReset = () => {
    if (isThisTaskRunning) globalStopTimer()
    updateTask(task.id, { totalTimeSec: 0, timeSessions: [] })
  }

  const isOtherTaskRunning = globalIsRunning && globalTaskId && globalTaskId !== task.id

  // ── Compact bar layout: [ ■ Parar ]  00:00:15  [ ↺ ] ──────────────────────
  return (
    <div className="flex items-center gap-2 w-full">
      {isThisTaskRunning ? (
        <Button
          size="sm"
          className="h-7 px-2.5 gap-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded-md"
          onClick={handleStop}
          disabled={isStopping}
        >
          {isStopping
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : <Square className="h-3 w-3 fill-current" />}
          Parar
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2.5 gap-1.5 text-xs rounded-md"
          onClick={handleStart}
          disabled={isStarting || !!isOtherTaskRunning}
          title={isOtherTaskRunning ? 'Hay otro timer activo' : 'Iniciar timer'}
        >
          {isStarting
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : <Play className="h-3 w-3 fill-current" />}
          Iniciar
        </Button>
      )}

      <span className={cn(
        'font-mono text-sm font-medium tabular-nums tracking-tight',
        isThisTaskRunning ? 'text-green-500 dark:text-green-400' : 'text-foreground'
      )}>
        {formatTime(totalDisplay)}
      </span>

      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
        onClick={handleReset}
        title="Resetear tiempo"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </Button>

      {isOtherTaskRunning && (
        <span className="text-xs text-amber-500 ml-1">Otro timer activo</span>
      )}
    </div>
  )
}

// ── Files Section ─�������───��───────────────────────────────────────────────────────

// ── Comments Section (with rich text editor) ──────────────────────────────────

// ─── CommentItem: renders a single comment with lightbox + attachments ───────
function CommentItem({ comment: c, taskId }: { comment: TaskComment; taskId: string }) {
  const { deleteComment } = useTaskStore()
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'IMG') {
      setLightboxImage((target as HTMLImageElement).src)
    }
  }

  return (
    <>
      <div className="flex items-start gap-2.5 text-xs mb-3 group">
        <Avatar className="h-5 w-5 mt-0.5 shrink-0">
          <AvatarImage src={c.userAvatar || undefined} alt={c.userName} />
          <AvatarFallback className="text-[8px]">{getInitials(c.userName)}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-xs font-medium text-foreground">{c.userName}</span>
            <span className="text-[11px] text-muted-foreground">
              {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true, locale: es })}
            </span>
            <Button
              variant="ghost" size="icon" className="h-4 w-4 ml-auto opacity-0 group-hover:opacity-100"
              onClick={() => deleteComment(taskId, c.id)}
            >
              <X className="h-2.5 w-2.5" />
            </Button>
          </div>
          {/* Content with clickable images */}
          <div
            className="text-[11px] text-foreground/80 break-words [&_img]:max-w-full [&_img]:rounded [&_img]:mt-1 [&_img]:cursor-pointer [&_img]:hover:opacity-80 [&_img]:transition-opacity"
            dangerouslySetInnerHTML={{ __html: linkifyText(c.content) }}
            onClick={handleImageClick}
          />
          {/* Attachments */}
          {c.attachments && c.attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {c.attachments.map((att: { url: string; name: string; mimeType: string }, i: number) => (
                att.mimeType.startsWith('image/') ? (
                  <img
                    key={i}
                    src={att.url}
                    alt={att.name}
                    className="h-16 w-16 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity border border-border"
                    onClick={() => setLightboxImage(att.url)}
                  />
                ) : (
                  <a
                    key={i}
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border border-border bg-muted hover:bg-accent transition-colors"
                  >
                    <Paperclip className="h-3 w-3 shrink-0" />
                    <span className="max-w-[100px] truncate">{att.name}</span>
                  </a>
                )
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center"
          onClick={() => setLightboxImage(null)}
        >
          <Button
            variant="ghost" size="icon"
            className="absolute top-4 right-4 text-white hover:bg-white/10"
            onClick={() => setLightboxImage(null)}
          >
            <X className="h-5 w-5" />
          </Button>
          <img
            src={lightboxImage}
            alt="Imagen adjunta"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
function CommentsSection({ task, compact = false }: { task: Task; compact?: boolean }) {
  const { addComment, updateComment, deleteComment } = useTaskStore()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [currentUser, setCurrentUser] = useState<{ id: string; nombre: string; avatar_url: string | null } | null>(null)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const editorRef = useRef<HTMLDivElement>(null)
  const commentFileInputRef = useRef<HTMLInputElement>(null)
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)
  const [pendingAttachments, setPendingAttachments] = useState<{ url: string; name: string; mimeType: string }[]>([])
  
  // Mention states
  const [showMentions, setShowMentions] = useState(false)
  const [mentionSearch, setMentionSearch] = useState('')
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 })
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0)
  const mentionStartRef = useRef<{ node: Node; offset: number } | null>(null)
  
  const filteredAssignees = ASSIGNEES.filter(a => 
    a.name.toLowerCase().includes(mentionSearch.toLowerCase())
  ).slice(0, 5)

  // Sort comments by date
  const sortedComments = useMemo(() => {
    return [...(task.comments || [])].sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime()
      const dateB = new Date(b.createdAt).getTime()
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB
    })
  }, [task.comments, sortOrder])

  useEffect(() => {
    async function loadUser() {
      const supabase = createClient()
      const { data: { user } } = await getAuthUser()
      if (user?.email) {
        const { data: colab } = await supabase
          .from('colaboradores')
          .select('id, nombre, avatar_url')
          .eq('email', user.email)
          .single()
        if (colab) setCurrentUser(colab)
      }
    }
    loadUser()
  }, [])

  // Handle paste event - insert images inline
  const handlePaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData?.items
    const text = e.clipboardData?.getData('text/plain')
    
    if (!items && !text) return

    // Handle images
    for (const item of Array.from(items || [])) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) {
          // Convert to base64 and insert inline
          const reader = new FileReader()
          reader.onload = () => {
            const dataUrl = reader.result as string
            const img = document.createElement('img')
            img.src = dataUrl
            img.alt = 'Imagen'
            img.style.maxWidth = '100%'
            img.style.maxHeight = '200px'
            img.style.borderRadius = '8px'
            img.style.margin = '4px 0'
            img.style.display = 'inline-block'
            img.style.verticalAlign = 'middle'
            
            const selection = window.getSelection()
            if (selection && selection.rangeCount > 0) {
              const range = selection.getRangeAt(0)
              range.deleteContents()
              range.insertNode(img)
              range.setStartAfter(img)
              range.collapse(true)
              selection.removeAllRanges()
              selection.addRange(range)
            } else if (editorRef.current) {
              editorRef.current.appendChild(img)
            }
          }
          reader.readAsDataURL(file)
        }
      }
    }

    // Handle text paste - convert to plain text to remove formatting
    if (text && items && Array.from(items).some(item => !item.type.startsWith('image/'))) {
      e.preventDefault()
      document.execCommand('insertText', false, text)
    }
  }

  // Handle input for mentions
  const handleInput = () => {
    if (!editorRef.current) return
    
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    
    const range = selection.getRangeAt(0)
    const textNode = range.startContainer
    
    if (textNode.nodeType !== Node.TEXT_NODE) {
      setShowMentions(false)
      return
    }
    
    const text = textNode.textContent || ''
    const cursorPos = range.startOffset
    
    // Find @ before cursor
    const textBeforeCursor = text.slice(0, cursorPos)
    const atIndex = textBeforeCursor.lastIndexOf('@')
    
    if (atIndex !== -1) {
      // Check no space between @ and cursor
      const textAfterAt = textBeforeCursor.slice(atIndex + 1)
      if (!textAfterAt.includes(' ')) {
        setMentionSearch(textAfterAt)
        mentionStartRef.current = { node: textNode, offset: atIndex }
        
        // Get position for dropdown
        const tempRange = document.createRange()
        tempRange.setStart(textNode, atIndex)
        tempRange.setEnd(textNode, atIndex)
        const rect = tempRange.getBoundingClientRect()
        const editorRect = editorRef.current.getBoundingClientRect()
        
        setMentionPosition({
          top: rect.bottom - editorRect.top + 5,
          left: rect.left - editorRect.left
        })
        setShowMentions(true)
        setSelectedMentionIndex(0)
        return
      }
    }
    
    setShowMentions(false)
  }

  // Insert mention
  const insertMention = (assignee: { id: string; name: string }) => {
    if (!editorRef.current || !mentionStartRef.current) return
    
    const selection = window.getSelection()
    if (!selection) return
    
    const { node, offset } = mentionStartRef.current
    const range = document.createRange()
    
    // Create mention span
    const mentionSpan = document.createElement('span')
    mentionSpan.className = 'mention bg-primary/20 text-primary px-1 rounded'
    mentionSpan.setAttribute('data-mention-id', assignee.id)
    mentionSpan.setAttribute('data-mention-name', assignee.name)
    mentionSpan.contentEditable = 'false'
    mentionSpan.textContent = `@${assignee.name}`
    
    // Get current text and cursor position
    const text = node.textContent || ''
    const cursorPos = selection.getRangeAt(0).startOffset
    
    // Split text
    const beforeMention = text.slice(0, offset)
    const afterMention = text.slice(cursorPos)
    
    // Create new nodes
    const beforeText = document.createTextNode(beforeMention)
    const afterText = document.createTextNode(' ' + afterMention)
    
    // Replace content
    const parent = node.parentNode
    if (parent) {
      parent.insertBefore(beforeText, node)
      parent.insertBefore(mentionSpan, node)
      parent.insertBefore(afterText, node)
      parent.removeChild(node)
      
      // Set cursor after mention
      range.setStartAfter(afterText)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
    }
    
    setShowMentions(false)
    mentionStartRef.current = null
    editorRef.current.focus()
  }

  // Handle keyboard events
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Handle mention navigation
    if (showMentions && filteredAssignees.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedMentionIndex(i => Math.min(i + 1, filteredAssignees.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedMentionIndex(i => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(filteredAssignees[selectedMentionIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowMentions(false)
        return
      }
    }
    
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // Handle edit comment
  const handleEditComment = async (commentId: string) => {
    if (!editingContent.trim()) return
    await updateComment(task.id, commentId, editingContent)
    setEditingCommentId(null)
    setEditingContent('')
    toast.success('Comentario actualizado')
  }

  const handleSubmit = async () => {
    if (!editorRef.current) return
    const content = editorRef.current.innerHTML.trim()
    // Allow submit if there's content OR if there are attachments
    if ((!content || content === '<br>') && pendingAttachments.length === 0) return
    if (isSubmitting) return
    
    setIsSubmitting(true)
    const userId = currentUser?.id || 'system'
    const userName = currentUser?.nombre || 'Usuario'
    
    // Extract mentioned user IDs
    const mentionedIds: string[] = []
    editorRef.current.querySelectorAll('.mention[data-mention-id]').forEach(el => {
      const id = el.getAttribute('data-mention-id')
      if (id && !mentionedIds.includes(id)) {
        mentionedIds.push(id)
      }
    })
    
    try {
      await addComment(task.id, content, userId, userName, currentUser?.avatar_url, mentionedIds, pendingAttachments)
      editorRef.current.innerHTML = ''
      setPendingAttachments([])
      toast.success('Comentario agregado')
    } catch (err) {
      console.error('Error adding comment:', err)
      toast.error('Error al agregar comentario')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle image click for lightbox
  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'IMG') {
      const imgSrc = (target as HTMLImageElement).src
      setLightboxImage(imgSrc)
    }
  }

  return (
    <div className={cn(
      "flex flex-col overflow-hidden",
      compact ? "h-auto" : "h-full"
    )}>
      {/* Header - hidden in compact mode */}
      {!compact && (
        <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0">
                <p className="text-sm font-semibold">Comentarios ({(task.comments || []).length})</p>
                {(task.comments || []).length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs h-7"
              onClick={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')}
            >
              <ArrowUpDown className="h-3 w-3" />
              {sortOrder === 'newest' ? 'Más recientes' : 'Más antiguos'}
            </Button>
          )}
        </div>
      )}

      {/* Comments list - scrollable */}
              {!compact && (task.comments || []).length > 0 && (
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-[200px]">
          {sortedComments.map((c) => (
            <div key={c.id} className="group flex items-start gap-3 w-full">
              <Avatar className="h-8 w-8 shrink-0 mt-0.5">
                <AvatarImage src={c.userAvatar || undefined} alt={c.userName} />
                <AvatarFallback className="text-xs">{getInitials(c.userName)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-sm font-medium">{c.userName}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true, locale: es })}
                  </span>
                  <span className="text-xs text-muted-foreground/60">
                    {format(new Date(c.createdAt), 'dd/MM/yyyy HH:mm', { locale: es })}
                  </span>
                </div>
                {editingCommentId === c.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editingContent}
                      onChange={(e) => setEditingContent(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleEditComment(c.id)
                        }
                        if (e.key === 'Escape') {
                          setEditingCommentId(null)
                          setEditingContent('')
                        }
                      }}
                      className="w-full min-h-[60px] p-2.5 text-sm rounded-md border border-border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleEditComment(c.id)}>Guardar</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setEditingCommentId(null); setEditingContent('') }}>Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="text-sm text-foreground/80 break-words whitespace-pre-wrap [&_p]:my-1 [&_a]:text-primary [&_a]:underline [&_a]:hover:opacity-80 [&_strong]:text-foreground [&_strong]:font-semibold [&_em]:italic [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_img]:max-w-full [&_img]:rounded-lg [&_img]:mt-2 [&_img]:max-h-[300px] [&_img]:object-contain [&_img]:block [&_img]:cursor-pointer [&_img]:hover:opacity-90 [&_img]:transition-opacity"
                    dangerouslySetInnerHTML={{ __html: linkifyText(c.content) }}
                    onClick={handleImageClick}
                  />
                )}
              </div>
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingCommentId(c.id); setEditingContent(c.content.replace(/<[^>]*>/g, '')) }} title="Editar">
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteComment(task.id, c.id)} title="Eliminar">
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New comment composer - compact or full */}
      <div className={cn(
        "border-t shrink-0",
        compact ? "px-4 py-3 space-y-2" : "px-5 py-4 space-y-3"
      )}>
        <div className="flex items-center gap-2">
          <Avatar className={cn("shrink-0", compact ? "h-6 w-6" : "h-7 w-7")}>
            {currentUser?.avatar_url && <AvatarImage src={currentUser.avatar_url} alt={currentUser.nombre} />}
            <AvatarFallback className={cn("text-xs", compact ? "text-[7px]" : "")}>
              {currentUser ? getInitials(currentUser.nombre) : 'US'}
            </AvatarFallback>
          </Avatar>
          <span className={cn("font-medium", compact ? "text-xs" : "text-sm")}>{currentUser?.nombre || 'Nuevo comentario'}</span>
        </div>
        <div className="relative">
          <div
            ref={editorRef}
            contentEditable
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            data-placeholder={compact ? "Escribe..." : "Escribe un comentario... usa @ para mencionar (podes pegar imagenes con Ctrl+V)"}
            className={cn(
              "w-full p-3 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary overflow-y-auto empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50 [&_img]:max-w-full [&_img]:max-h-[200px] [&_img]:rounded-lg [&_img]:inline-block [&_img]:align-middle [&_img]:my-1 [&_.mention]:bg-primary/20 [&_.mention]:text-primary [&_.mention]:px-1 [&_.mention]:rounded",
              compact ? "min-h-[50px] max-h-[120px] text-xs" : "min-h-[88px] max-h-[250px]"
            )}
          />
          
          {/* Mention dropdown */}
          {showMentions && filteredAssignees.length > 0 && (
            <div 
              className={cn(
                "absolute z-50 bg-popover border rounded-md shadow-lg py-1 min-w-[200px]",
                compact && "min-w-[150px]"
              )}
              style={{ top: mentionPosition.top, left: mentionPosition.left }}
            >
              {filteredAssignees.map((assignee, index) => (
                <button
                  key={assignee.id}
                  type="button"
                  className={cn(
                    'w-full px-3 py-2 text-sm text-left flex items-center gap-2 hover:bg-muted',
                    compact && "px-2 py-1 text-xs",
                    index === selectedMentionIndex && 'bg-muted'
                  )}
                  onClick={() => insertMention(assignee)}
                  onMouseEnter={() => setSelectedMentionIndex(index)}
                >
                  <Avatar className={cn("shrink-0", compact ? "h-5 w-5" : "h-6 w-6")}>
                    {assignee.avatar_url && <AvatarImage src={assignee.avatar_url} />}
                    <AvatarFallback className={cn("text-xs", compact && "text-[7px]")}>{getInitials(assignee.name)}</AvatarFallback>
                  </Avatar>
                  <span>{assignee.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        
        <div className="flex items-center justify-between gap-2">
          {/* Attach file button */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7 text-muted-foreground hover:text-foreground shrink-0", compact && "h-6 w-6")}
            onClick={() => commentFileInputRef.current?.click()}
            title="Adjuntar archivo"
          >
            <Paperclip className={cn("h-3.5 w-3.5", compact && "h-3 w-3")} />
          </Button>
          <input
            ref={commentFileInputRef}
            type="file"
            multiple
            accept="*/*"
            className="hidden"
            onChange={async (e) => {
              const files = Array.from(e.target.files || [])
              if (!files.length) return
              for (const file of files) {
                try {
                  const formData = new FormData()
                  formData.append('file', file)
                  const res = await fetch('/api/upload', { method: 'POST', body: formData })
                  if (res.ok) {
                    const { url } = await res.json()
                    setPendingAttachments(prev => [...prev, { url, name: file.name, mimeType: file.type }])
                    toast.success(`Adjunto: ${file.name}`)
                  }
                } catch {
                  toast.error('Error al subir archivo')
                }
              }
              e.target.value = ''
            }}
          />
          {/* Pending attachments preview */}
          {pendingAttachments.length > 0 && (
            <div className="flex flex-wrap gap-1 flex-1">
              {pendingAttachments.map((att, i) => (
                <div key={i} className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted border border-border">
                  <Paperclip className="h-2.5 w-2.5 shrink-0" />
                  <span className="max-w-[60px] truncate">{att.name}</span>
                  <button onClick={() => setPendingAttachments(prev => prev.filter((_, j) => j !== i))}>
                    <X className="h-2.5 w-2.5 text-muted-foreground hover:text-foreground" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <Button
            size="sm"
            className={cn("gap-2 px-4 ml-auto", compact && "h-7 px-2 gap-1 text-xs")}
            onClick={handleSubmit}
            disabled={isSubmitting || ((!editorRef.current?.innerHTML.trim() || editorRef.current?.innerHTML.trim() === '<br>') && pendingAttachments.length === 0)}
          >
            <Send className={cn("h-3.5 w-3.5", compact && "h-3 w-3")} />
            {isSubmitting ? (compact ? 'Env...' : 'Enviando...') : 'Enviar'}
          </Button>
        </div>
      </div>

      {/* Lightbox for images */}
      {lightboxImage && (
        <div 
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setLightboxImage(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors"
            onClick={() => setLightboxImage(null)}
          >
            <X className="h-8 w-8" />
          </button>
          <img 
            src={lightboxImage} 
            alt="Imagen ampliada"
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}

// ── Custom Fields Component ──���───────────────────�������─────����──────────────────────

function CustomFields({ task }: { task: Task }) {
  const { addCustomField, removeCustomField, updateTask } = useTaskStore()
  const [isAdding, setIsAdding] = useState(false)
  const [newFieldName, setNewFieldName] = useState('')
  const [newFieldType, setNewFieldType] = useState<TaskCustomField['type']>('text')
  const [newFieldOptions, setNewFieldOptions] = useState('')

  const handleAddField = () => {
    if (!newFieldName.trim()) return
    const key = newFieldName.toLowerCase().replace(/\s+/g, '_')
    
    const fieldData: TaskCustomField = {
      label: newFieldName,
      type: newFieldType,
      value: newFieldType === 'boolean' ? 'false' : '',
    }
    
    // Add options for select/multiselect
    if ((newFieldType === 'select' || newFieldType === 'multiselect') && newFieldOptions.trim()) {
      fieldData.options = newFieldOptions.split(',').map(o => o.trim()).filter(Boolean)
    }
    
    addCustomField(task.id, key, fieldData)
    setNewFieldName('')
    setNewFieldType('text')
    setNewFieldOptions('')
    setIsAdding(false)
  }

  const handleUpdateFieldValue = (key: string, value: string) => {
    const updated = {
      ...task.customFields,
      [key]: { ...task.customFields[key], value },
    }
    updateTask(task.id, { customFields: updated })
  }

  const handleToggleBoolean = (key: string) => {
    const currentValue = task.customFields[key].value === 'true'
    handleUpdateFieldValue(key, (!currentValue).toString())
  }

  const handleToggleMultiselect = (key: string, option: string) => {
    const currentValues = task.customFields[key].value ? task.customFields[key].value.split(',') : []
    let newValues: string[]
    if (currentValues.includes(option)) {
      newValues = currentValues.filter(v => v !== option)
    } else {
      newValues = [...currentValues, option]
    }
    handleUpdateFieldValue(key, newValues.join(','))
  }

  const renderFieldInput = (key: string, field: TaskCustomField) => {
    switch (field.type) {
      case 'boolean':
        return (
          <div className="flex items-center gap-2 flex-1">
            <Checkbox
              id={`field-${key}`}
              checked={field.value === 'true'}
              onCheckedChange={() => handleToggleBoolean(key)}
            />
            <label 
              htmlFor={`field-${key}`}
              className="text-sm cursor-pointer"
            >
              {field.value === 'true' ? 'Si' : 'No'}
            </label>
          </div>
        )
      
      case 'select':
        return (
          <Select value={field.value} onValueChange={(v) => handleUpdateFieldValue(key, v)}>
            <SelectTrigger className="h-8 text-sm flex-1">
              <SelectValue placeholder="Seleccionar..." />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((option) => (
                <SelectItem key={option} value={option}>{option}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      
      case 'multiselect':
        const selectedValues = field.value ? field.value.split(',') : []
        return (
          <div className="flex-1 flex flex-wrap gap-1.5">
            {field.options?.map((option) => {
              const isSelected = selectedValues.includes(option)
              return (
                <Badge
                  key={option}
                  variant={isSelected ? 'default' : 'outline'}
                  className={cn(
                    'cursor-pointer text-xs',
                    isSelected && 'bg-primary'
                  )}
                  onClick={() => handleToggleMultiselect(key, option)}
                >
                  {option}
                </Badge>
              )
            })}
          </div>
        )
      
      default:
        return (
          <Input
            value={field.value}
            onChange={(e) => handleUpdateFieldValue(key, e.target.value)}
            className="h-8 text-sm flex-1"
            type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
          />
        )
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Campos personalizados</p>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setIsAdding(true)}
        >
          <Plus className="h-3 w-3 mr-1" />
          Agregar
        </Button>
      </div>

      {Object.entries(task.customFields).map(([key, field]) => (
        <div key={key} className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground w-28 shrink-0">{field.label}</Label>
          {renderFieldInput(key, field)}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => removeCustomField(task.id, key)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}

      {isAdding && (
        <div className="rounded-lg border p-3 space-y-2">
          <Input
            placeholder="Nombre del campo"
            value={newFieldName}
            onChange={(e) => setNewFieldName(e.target.value)}
            className="h-8 text-sm"
          />
          <Select value={newFieldType} onValueChange={(v) => setNewFieldType(v as TaskCustomField['type'])}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">Texto</SelectItem>
              <SelectItem value="number">Numero</SelectItem>
              <SelectItem value="date">Fecha</SelectItem>
              <SelectItem value="boolean">Si/No (Check)</SelectItem>
              <SelectItem value="select">Selector unico</SelectItem>
              <SelectItem value="multiselect">Selector multiple</SelectItem>
            </SelectContent>
          </Select>
          
          {(newFieldType === 'select' || newFieldType === 'multiselect') && (
            <Input
              placeholder="Opciones separadas por coma (ej: Opcion 1, Opcion 2, Opcion 3)"
              value={newFieldOptions}
              onChange={(e) => setNewFieldOptions(e.target.value)}
              className="h-8 text-sm"
            />
          )}
          
          <div className="flex gap-2">
            <Button size="sm" className="h-8" onClick={handleAddField}>
              Agregar
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => {
              setIsAdding(false)
              setNewFieldName('')
              setNewFieldType('text')
              setNewFieldOptions('')
            }}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {Object.keys(task.customFields).length === 0 && !isAdding && (
        <p className="text-xs text-muted-foreground">Sin campos personalizados</p>
      )}
    </div>
  )
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export function TaskDetailPanel() {
  const router = useRouter()
  const { selectedTaskId, setSelectedTask, tasks, updateTask, deleteTask, toggleTaskActive } = useTaskStore()
  const task = tasks.find((t) => t.id === selectedTaskId)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [activeTab, setActiveTab] = useState('detalles')
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [tempTitle, setTempTitle] = useState('')
  const [typeSearch, setTypeSearch] = useState('')
  
  // Dynamic data from Supabase
  const [tiposTarea, setTiposTarea] = useState<TipoDeTarea[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])

  // Hito completion modal state
  const [hitoModalOpen, setHitoModalOpen] = useState(false)
  // Redactor modal state (para tareas de Hito de mensajes de semana)
  const [redactorOpen, setRedactorOpen] = useState(false)
  // Tester modal state (para tareas de Hito de Testing de Integración)
  const [testerOpen, setTesterOpen] = useState(false)
  // Analista modal state (para tareas de Hito de Informe de Cierre de Mes)
  const [analistaOpen, setAnalistaOpen] = useState(false)
  const [pendingStatus, setPendingStatus] = useState<TaskStatus | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  // Activity filters
  const [filterPersona, setFilterPersona] = useState<string | null>(null) // userId
  const [filterConAdjuntos, setFilterConAdjuntos] = useState(false)
  const [filterFechaDesde, setFilterFechaDesde] = useState<string>('')
  const [filterFechaHasta, setFilterFechaHasta] = useState<string>('')
  const [filterPersonaOpen, setFilterPersonaOpen] = useState(false)

  // Image viewer state
  const [expandedImage, setExpandedImage] = useState<{ url: string; name: string } | null>(null)
  const [imageZoom, setImageZoom] = useState(100)

  // Description editing state
  const descriptionRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load current user ID
  useEffect(() => {
    async function loadCurrentUser() {
      const supabase = createClient()
      const { data: { user } } = await getAuthUser()
      if (user?.email) {
        const { data: colab } = await supabase
          .from('colaboradores')
          .select('id')
          .eq('email', user.email)
          .single()
        if (colab) setCurrentUserId(colab.id)
      }
    }
    loadCurrentUser()
  }, [])

  // Load dynamic data on mount
  useEffect(() => {
    async function loadData() {
      const supabase = createClient()
      
      const [tiposRes, colabRes, clientesRes] = await Promise.all([
        supabase.from('tipo_de_tareas').select('id, nombre, activo').eq('activo', true).order('nombre'),
        supabase.from('colaboradores').select('id, nombre, apellido, avatar_url').order('nombre'),
        supabase.from('clientes').select('id, nombre_del_negocio, plan').order('nombre_del_negocio'),
      ])

      if (tiposRes.data) setTiposTarea(tiposRes.data)
      if (colabRes.data) setColaboradores(colabRes.data)
      if (clientesRes.data) setClientes(clientesRes.data)
    }
    
    loadData()
  }, [])

  if (!task) {
    return (
      <Sheet open={false}>
        <SheetContent />
      </Sheet>
    )
  }

  const statusConfig = STATUS_CONFIG[task.status]

  // Get client plan for the task's primary client (only for MDK clients)
  const taskClient = clientes.find(c => c.id === task.clientId)
  const clientPlan: ClientPlan = (taskClient?.unidad_negocio === 'MDK' && taskClient?.plan) ? taskClient.plan : 'Esencial'

  // Handle status change with hito_poe interception
  const handleStatusChange = async (newStatus: TaskStatus) => {
    // If changing to 'resuelto', check if task has hito_poe
    if (newStatus === 'resuelto') {
      // First check if we already have hitoPoe in memory
      if (task.hitoPoe) {
        setPendingStatus(newStatus)
        setHitoModalOpen(true)
        return
      }
      
      // If not, query Supabase directly
      try {
        const supabase = createClient()
        const { data: taskData } = await supabase
          .from('tareas')
          .select('hito_poe, cliente_id')
          .eq('id', task.id)
          .single()

        if (taskData?.hito_poe) {
          setPendingStatus(newStatus)
          setHitoModalOpen(true)
          return
        }
      } catch (error) {
        console.error('[task-detail] Error checking hito_poe:', error)
      }
    }
    
    // Otherwise, update normally
    updateTask(task.id, { status: newStatus })
  }

  // Called after hito modal completion
  const handleHitoComplete = () => {
    setHitoModalOpen(false)
    // Now complete the task
    if (pendingStatus) {
      updateTask(task.id, { status: pendingStatus })
    }
    setPendingStatus(null)
  }

  // Called if hito modal is cancelled
  const handleHitoCancel = () => {
    setHitoModalOpen(false)
    setPendingStatus(null)
  }

  const handleClose = () => {
    setIsFullscreen(false)
    setSelectedTask(null)
  }

  // Detectar si es una tarea de Hito de mensaje de inicio/cierre de semana
  // para mostrar el botón "Ejecutar redactor".
  const titleLower = (task.title || '').toLowerCase()
  const isHitoMensaje = titleLower.includes('[hito]') && titleLower.includes('mensaje')
  const redactorType: 'inicio' | 'cierre' | null = isHitoMensaje
    ? titleLower.includes('inicio')
      ? 'inicio'
      : titleLower.includes('cierre')
        ? 'cierre'
        : null
    : null
  // Detectar si es una tarea de Hito de Testing de Integración
  // para mostrar el botón "Ejecutar tester".
  const isHitoTesting = titleLower.includes('[hito]') && titleLower.includes('testing')
  // Detectar si es una tarea de Hito de Informe de Cierre de Mes O una tarea llamada "Informe de Cierre"
  // para mostrar el botón "Ejecutar Analista".
  const isHitoInformeCierre = 
    (titleLower.includes('[hito]') && titleLower.includes('informe') && titleLower.includes('cierre')) ||
    (titleLower.includes('informe') && titleLower.includes('cierre'))
  // Cliente de la tarea para autocompletar el redactor/tester/analista
  const redactorClientId = task.clients?.[0]?.id || task.clientId || undefined

  // Navigation between tasks
  const currentIndex = tasks.findIndex(t => t.id === selectedTaskId)
  const hasPrevious = currentIndex > 0
  const hasNext = currentIndex < tasks.length - 1

  const goToPrevious = () => {
    if (hasPrevious) {
      setSelectedTask(tasks[currentIndex - 1].id)
    }
  }

  const goToNext = () => {
    if (hasNext) {
      setSelectedTask(tasks[currentIndex + 1].id)
    }
  }

  return (
    <Sheet open={!!selectedTaskId} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent 
        className={cn(
          'p-0 flex flex-col',
          isFullscreen 
            ? '!w-full !max-w-full sm:!max-w-full' 
            : '!w-[920px] !max-w-[920px]'
        )} 
        side="right"
      >
        {/* Header - Navigation bar only */}
        <SheetHeader className="px-4 py-2 border-b shrink-0 pr-12">
          <div className="flex items-center justify-between gap-4">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0 flex-1">
              <span className="truncate max-w-[120px]">
                {task.clients?.[0]?.nombre_del_negocio || task.clientName || 'Sin cliente'}
              </span>
              <span>/</span>
              <span className="truncate max-w-[120px] text-foreground font-medium">{task.title}</span>
            </div>

            {/* Navigation + expand */}
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goToPrevious} disabled={!hasPrevious} title="Tarea anterior">
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums min-w-[3.5rem] text-center">
                {currentIndex + 1} / {tasks.length}
              </span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goToNext} disabled={!hasNext} title="Siguiente tarea">
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsFullscreen(!isFullscreen)}>
                {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
          {/* WhatsApp buttons */}
          {task.isSystemTask && task.systemTaskMeta?.whatsappLink && (
            <Button variant="outline" size="sm" className="mt-2 h-8 gap-2 border-green-500/50 text-green-400 hover:bg-green-500/10 hover:text-green-300 self-start"
              onClick={() => window.open(task.systemTaskMeta?.whatsappLink, '_blank')}>
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Enviar por WhatsApp
            </Button>
          )}
        </SheetHeader>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-6 mt-6 mb-0 shrink-0 bg-muted/50 p-1 h-auto">
            <TabsTrigger value="detalles" className="text-sm px-4 py-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">Detalles</TabsTrigger>
            <TabsTrigger value="cotizacion" className="text-sm px-4 py-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">Cotizacion</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-hidden">
            <TabsContent value="detalles" className="mt-0 h-full">
              <div className="h-full flex flex-row px-6 pb-6 gap-0">
                {/* LEFT / MAIN COLUMN - 50% */}
                <div className="w-1/2 overflow-y-auto flex flex-col min-w-0 pr-6">

                  {/* Title area */}
                  <div className="pt-0 pb-4">
                    {/* Type selector pill + actions */}
                    <div className="flex items-center gap-2 mb-5">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 gap-2 text-xs rounded-full px-3.5 bg-primary/10 border-primary/20 text-primary hover:bg-primary/20">
                            <span className="h-2 w-2 rounded-full bg-primary" />
                            {tiposTarea.find(t => t.id === task.type)?.nombre || 'Tarea'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-56 p-2" align="start">
                          <div className="space-y-2">
                            <input
                              type="text"
                              placeholder="Buscar tipo..."
                              value={typeSearch}
                              onChange={(e) => setTypeSearch(e.target.value)}
                              className="w-full px-2 py-1.5 text-xs border border-input rounded bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                            <div className="max-h-64 overflow-y-auto space-y-1">
                              {tiposTarea
                                .filter(t => t.nombre.toLowerCase().includes(typeSearch.toLowerCase()))
                                .map(t => (
                                  <button
                                    key={t.id}
                                    onClick={() => {
                                      updateTask(task.id, { type: t.id as TaskType, typeName: t.nombre })
                                      setTypeSearch('')
                                    }}
                                    className="w-full text-left rounded px-2 py-1.5 hover:bg-accent transition-colors flex items-center gap-2 text-sm"
                                  >
                                    <span className="h-2 w-2 rounded-full bg-primary" />
                                    {t.nombre}
                                    {task.type === t.id && <Check className="h-4 w-4 ml-auto text-primary" />}
                                  </button>
                                ))}
                              {tiposTarea.filter(t => t.nombre.toLowerCase().includes(typeSearch.toLowerCase())).length === 0 && (
                                <div className="py-4 text-center text-xs text-muted-foreground">
                                  No se encontraron tipos
                                </div>
                              )}
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>

                    {/* Title */}
                    {isEditingTitle ? (
                      <input
                        value={tempTitle}
                        onChange={(e) => setTempTitle(e.target.value)}
                        onBlur={() => {
                          if (tempTitle.trim() && tempTitle !== task.title) {
                            updateTask(task.id, { title: tempTitle.trim() })
                          }
                          setIsEditingTitle(false)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            if (tempTitle.trim() && tempTitle !== task.title) {
                              updateTask(task.id, { title: tempTitle.trim() })
                            }
                            setIsEditingTitle(false)
                          }
                          if (e.key === 'Escape') setIsEditingTitle(false)
                        }}
                        className="w-full text-2xl font-semibold bg-transparent border-0 outline-none focus:ring-0 p-0 text-foreground"
                        autoFocus
                      />
                    ) : (
                      <h1
                        className="text-2xl font-bold cursor-text hover:text-foreground/80 leading-tight transition-colors"
                        onClick={() => { setTempTitle(task.title); setIsEditingTitle(true) }}
                      >
                        {task.title}
                      </h1>
                    )}

                    {/* Ejecutar redactor - solo para tareas de Hito de mensaje de semana */}
                    {redactorType && (
                      <Button
                        size="sm"
                        className="mt-4 gap-2 bg-[#7F77DD] hover:bg-[#6B63C7] text-white"
                        onClick={() => setRedactorOpen(true)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Ejecutar redactor ({redactorType === 'inicio' ? 'inicio' : 'cierre'} de semana)
                      </Button>
                    )}

                    {/* Ejecutar tester - solo para tareas de Hito de Testing de Integración */}
                    {isHitoTesting && (
                      <Button
                        size="sm"
                        className="mt-4 gap-2 bg-[#7F77DD] hover:bg-[#6B63C7] text-white"
                        onClick={() => setTesterOpen(true)}
                      >
                        <FlaskConical className="h-3.5 w-3.5" />
                        Ejecutar tester
                      </Button>
                    )}

                    {/* Ejecutar Analista - solo para tareas de Hito de Informe de Cierre de Mes */}
                    {isHitoInformeCierre && (
                      <Button
                        size="sm"
                        className="mt-4 gap-2 bg-[#7F77DD] hover:bg-[#6B63C7] text-white"
                        onClick={() => setAnalistaOpen(true)}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Ejecutar Analista
                      </Button>
                    )}
                  </div>

                  {/* Time tracker - moved to header */}
                  <div className="px-0 py-2 border-b">
                    <TimeTracker task={task} />
                  </div>

                  {/* Metadata rows - ClickUp style */}
                  <div className="pb-5 space-y-1">
                    {/* Estado row */}
                    <div className="flex items-center min-h-[40px] py-1 hover:bg-accent/30 rounded-md px-2 -mx-2 transition-colors">
                      <div className="w-40 shrink-0 flex items-center gap-2.5 text-sm text-muted-foreground">
                        <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 flex items-center justify-center">
                          <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                        </div>
                        Estado
                      </div>
                      <Select value={task.status} onValueChange={(v) => handleStatusChange(v as TaskStatus)}>
                        <SelectTrigger className={cn(
                          'h-8 w-auto border-0 bg-transparent shadow-none px-2.5 text-sm font-medium gap-2 hover:bg-accent rounded-md'
                        )}>
                          <div className={cn('h-2 w-2 rounded-full', statusConfig.bgColor.replace('/10', '').replace('/20', ''))} />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_ORDER.map((s) => (
                            <SelectItem key={s} value={s}>
                              <div className="flex items-center gap-2">
                                <div className={cn('w-2.5 h-2.5 rounded-sm', STATUS_CONFIG[s].bgColor.replace('/10', '').replace('/20', ''))} />
                                {STATUS_CONFIG[s].label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Personas asignadas row */}
                    <div className="flex items-center min-h-[40px] py-1 hover:bg-accent/30 rounded-md px-2 -mx-2 transition-colors">
                      <div className="w-40 shrink-0 flex items-center gap-2.5 text-sm text-muted-foreground">
                        <User className="h-4 w-4 opacity-60" />
                        Personas asignadas
                      </div>
                      <MultiAssigneeSelect
                        assignees={task.assignees || []}
                        colaboradores={colaboradores}
                        onChange={(newAssignees) => {
                          updateTask(task.id, {
                            assignees: newAssignees,
                            assigneeId: newAssignees[0]?.id || '',
                            assigneeName: newAssignees[0]?.nombre || 'Sin asignar',
                            assigneeAvatar: newAssignees[0]?.avatar_url || null,
                          })
                        }}
                      />
                    </div>

                    {/* Fechas row */}
                    <div className="flex items-center min-h-[40px] py-1 hover:bg-accent/30 rounded-md px-2 -mx-2 transition-colors">
                      <div className="w-40 shrink-0 flex items-center gap-2.5 text-sm text-muted-foreground">
                        <CalendarIcon className="h-4 w-4 opacity-60" />
                        Fechas
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 gap-2 text-sm px-2.5 text-muted-foreground hover:text-foreground rounded-md">
                              <CalendarIcon className="h-3.5 w-3.5" />
                              Inicio
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={undefined}
                              onSelect={() => {}}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <span className="text-muted-foreground/30 text-sm font-light">—</span>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 gap-2 text-sm px-2.5 text-muted-foreground hover:text-foreground rounded-md">
                              <CalendarIcon className="h-3.5 w-3.5" />
                              {task.dueDate
                                ? format(task.dueDate, 'dd MMM yyyy', { locale: es })
                                : 'Fecha limite'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={task.dueDate ?? undefined}
                              onSelect={(date) => updateTask(task.id, { dueDate: date ?? null })}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>

                    {/* Prioridad row */}
                    <div className="flex items-center min-h-[40px] py-1 hover:bg-accent/30 rounded-md px-2 -mx-2 transition-colors">
                      <div className="w-40 shrink-0 flex items-center gap-2.5 text-sm text-muted-foreground">
                        <ArrowUpDown className="h-4 w-4 opacity-60" />
                        Prioridad
                      </div>
                      <Select value={task.priority} onValueChange={(v) => updateTask(task.id, { priority: v as TaskPriority })}>
                        <SelectTrigger className="h-8 w-auto border-0 bg-transparent shadow-none px-2.5 text-sm hover:bg-accent gap-2 rounded-md">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(['alta', 'media', 'baja'] as TaskPriority[]).map((p) => (
                            <SelectItem key={p} value={p}>
                              <Badge variant="outline" className={cn('text-xs border-0 font-medium', PRIORITY_CONFIG[p].bgColor, PRIORITY_CONFIG[p].color)}>
                                {PRIORITY_CONFIG[p].label}
                              </Badge>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Clientes row */}
                    <div className="flex items-center min-h-[40px] py-1 hover:bg-accent/30 rounded-md px-2 -mx-2 transition-colors">
                      <div className="w-40 shrink-0 flex items-center gap-2.5 text-sm text-muted-foreground">
                        <Building2 className="h-4 w-4 opacity-60" />
                        Clientes
                      </div>
                      <MultiClientSelect
                        clients={task.clients || []}
                        availableClients={clientes}
                        onChange={(newClients) => {
                          updateTask(task.id, {
                            clients: newClients,
                            clientIds: newClients.map(c => c.id),
                            clientId: newClients[0]?.id || '',
                            clientName: newClients[0]?.nombre_del_negocio || 'Sin cliente',
                          })
                        }}
                        onNavigateToClient={(clientId) => {
                          router.push(`/dashboard/clients/${clientId}`)
                        }}
                      />
                    </div>

                    {/* Creado por row */}
                    <div className="flex items-center min-h-[40px] py-1 hover:bg-accent/30 rounded-md px-2 -mx-2 transition-colors">
                      <div className="w-40 shrink-0 flex items-center gap-2.5 text-sm text-muted-foreground">
                        <User className="h-4 w-4 opacity-60" />
                        Creado por
                      </div>
                      <div className="flex items-center gap-2 px-2.5">
                        <Avatar className="h-6 w-6 ring-2 ring-background">
                          {task.createdByAvatar && <AvatarImage src={task.createdByAvatar} alt={task.createdByName} />}
                          <AvatarFallback className="text-[10px] font-medium">{getInitials(task.createdByName)}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{task.createdByName || 'Sin asignar'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Description area */}
                  <div className="py-5 border-y flex-shrink-0">
                    <div
                      ref={descriptionRef}
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={() => {
                        if (descriptionRef.current) {
                          const html = descriptionRef.current.innerHTML
                          if (html !== task.description) {
                            updateTask(task.id, { description: html || null })
                          }
                        }
                      }}
                      onInput={() => {
                        // No-op for now, save on blur
                      }}
                      className={cn(
                        "min-h-[100px] text-sm outline-none",
                        "prose prose-sm prose-invert max-w-none",
                        "[&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5",
                        "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/40 empty:before:pointer-events-none"
                      )}
                      data-placeholder="Añade una descripcion o escribe con / para comandos..."
                      dangerouslySetInnerHTML={{ __html: task.description || '' }}
                    />
                  </div>

                  {/* Files */}
                  <div className="py-4 border-t">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Adjuntos</p>
                    <TaskFilesSection
                      task={task}
                      currentUserId={currentUserId}
                      colaboradorNombre={colaboradores.find(c => c.id === currentUserId)?.nombre}
                    />
                  </div>

                  {/* Delete */}
                  <div className="py-4 border-t mt-auto">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive/70 hover:text-destructive hover:bg-destructive/10 text-sm gap-2"
                      onClick={async () => {
                        const confirmed = confirm(`¿Eliminar tarea "${task.title}"?`)
                        if (confirmed) {
                          await deleteTask(task.id)
                          handleClose()
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      Eliminar tarea
                    </Button>
                  </div>
                </div>

                {/* RIGHT COLUMN - Activity 50% */}
                <div className="w-1/2 border-l flex flex-col overflow-hidden">
                  {/* Activity header with filters */}
                  <div className="px-5 py-4 border-b flex items-center justify-between shrink-0">
                    <span className="text-sm font-semibold">Activity</span>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-6 w-6">
                        <Search className="h-3.5 w-3.5" />
                      </Button>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn("h-6 w-6", (filterPersona || filterConAdjuntos || filterFechaDesde || filterFechaHasta) && "text-primary")}
                          >
                            <SlidersHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-3" align="end">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-semibold">Filtros</span>
                            {(filterPersona || filterConAdjuntos || filterFechaDesde || filterFechaHasta) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 text-[10px] px-1 text-primary"
                                onClick={() => { setFilterPersona(null); setFilterConAdjuntos(false); setFilterFechaDesde(''); setFilterFechaHasta('') }}
                              >
                                Limpiar
                              </Button>
                            )}
                          </div>

                          {/* Filtro Persona */}
                          <div className="mb-3">
                            <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Persona</p>
                            <div className="space-y-1 max-h-32 overflow-y-auto">
                      {Array.from(new Set((task.comments || []).map(c => c.userId))).map(uid => {
                        const comment = (task.comments || []).find(c => c.userId === uid)
                                if (!comment) return null
                                return (
                                  <div
                                    key={uid}
                                    className={cn("flex items-center gap-2 py-1 px-1.5 rounded cursor-pointer hover:bg-accent text-xs", filterPersona === uid && "bg-accent")}
                                    onClick={() => setFilterPersona(filterPersona === uid ? null : uid)}
                                  >
                                    <Avatar className="h-5 w-5 shrink-0">
                                      <AvatarImage src={comment.userAvatar || undefined} />
                                      <AvatarFallback className="text-[8px]">{getInitials(comment.userName)}</AvatarFallback>
                                    </Avatar>
                                    <span>{comment.userName}</span>
                                    {filterPersona === uid && <Check className="h-3 w-3 text-primary ml-auto" />}
                                  </div>
                                )
                              })}
                              {(task.comments || []).length === 0 && <p className="text-[11px] text-muted-foreground">Sin comentarios</p>}
                            </div>
                          </div>

                          {/* Filtro Adjuntos */}
                          <div className="mb-3">
                            <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Adjuntos</p>
                            <div
                              className={cn("flex items-center gap-2 py-1 px-1.5 rounded cursor-pointer hover:bg-accent text-xs", filterConAdjuntos && "bg-accent")}
                              onClick={() => setFilterConAdjuntos(!filterConAdjuntos)}
                            >
                              <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>Solo con adjuntos</span>
                              {filterConAdjuntos && <Check className="h-3 w-3 text-primary ml-auto" />}
                            </div>
                          </div>

                          {/* Filtro Fecha */}
                          <div>
                            <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Fecha</p>
                            <div className="space-y-1.5">
                              <div>
                                <label className="text-[10px] text-muted-foreground">Desde</label>
                                <input
                                  type="date"
                                  value={filterFechaDesde}
                                  onChange={e => setFilterFechaDesde(e.target.value)}
                                  className="w-full text-xs px-2 py-1 rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-muted-foreground">Hasta</label>
                                <input
                                  type="date"
                                  value={filterFechaHasta}
                                  onChange={e => setFilterFechaHasta(e.target.value)}
                                  className="w-full text-xs px-2 py-1 rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                              </div>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  {/* Activity feed - filtered */}
                  <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
                    {(() => {
                      const filteredComments = (task.comments || []).filter(c => {
                        if (filterPersona && c.userId !== filterPersona) return false
                        if (filterConAdjuntos && (!c.attachments || c.attachments.length === 0)) return false
      if (filterFechaDesde && parseISO(c.createdAt) < parseISO(filterFechaDesde)) return false
      if (filterFechaHasta && parseISO(c.createdAt) > parseISO(filterFechaHasta + 'T23:59:59')) return false
                        return true
                      })
                      const hasFilters = filterPersona || filterConAdjuntos || filterFechaDesde || filterFechaHasta

                      if ((task.activities || []).length === 0 && (task.comments || []).length === 0) {
                        return (
                          <div className="flex items-center justify-center h-24">
                            <p className="text-xs text-muted-foreground">Sin actividad aun</p>
                          </div>
                        )
                      }

                      return (
                        <>
                          {/* Activities - hidden when filters active */}
                          {!hasFilters && (task.activities || []).slice(0, 20).map((activity) => (
                            <div key={activity.id} className="flex items-start gap-3 text-xs">
                              <Avatar className="h-6 w-6 mt-0.5 shrink-0">
                                <AvatarFallback className="text-[9px]">{getInitials(activity.userName)}</AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <span className="text-muted-foreground leading-relaxed">{activity.action}</span>
                                <p className="text-muted-foreground/50 mt-1">
                                  {format(new Date(activity.timestamp), "dd MMM 'a las' HH:mm", { locale: es })}
                                </p>
                              </div>
                            </div>
                          ))}

                          {/* Comments */}
                          {filteredComments.length === 0 && hasFilters ? (
                            <div className="flex items-center justify-center h-16">
                              <p className="text-xs text-muted-foreground">Sin resultados para los filtros aplicados</p>
                            </div>
                          ) : (
                            filteredComments.length > 0 && (
                              <div className={cn(!hasFilters && "pt-2 border-t mt-2")}>
                                {!hasFilters && <p className="text-xs font-semibold mb-3">Comentarios ({(task.comments || []).length})</p>}
                                {filteredComments.map((c) => (
                                  <div key={c.id} className="group flex items-start gap-3 text-xs mb-3">
                                    <Avatar className="h-5 w-5 mt-0.5 shrink-0">
                                      <AvatarImage src={c.userAvatar || undefined} alt={c.userName} />
                                      <AvatarFallback className="text-[8px]">{getInitials(c.userName)}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5 mb-0.5">
                                        <span className="text-xs font-medium text-foreground">{c.userName}</span>
                                        <span className="text-[11px] text-muted-foreground">
                                          {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true, locale: es })}
                                        </span>
                                        <Button
                                          variant="ghost" size="icon" className="h-4 w-4 ml-auto opacity-0 group-hover:opacity-100"
                                          onClick={() => deleteComment(task.id, c.id)}
                                        >
                                          <X className="h-2.5 w-2.5" />
                                        </Button>
                                      </div>
                                      <div
                                        className="text-[11px] text-foreground/80 break-words [&_img]:max-w-full [&_img]:rounded [&_img]:mt-1 [&_img]:cursor-pointer [&_img]:hover:opacity-80 [&_img]:transition-opacity"
                                        dangerouslySetInnerHTML={{ __html: linkifyText(c.content) }}
                                      />
                                      {/* Attachments */}
                                      {c.attachments && c.attachments.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                          {c.attachments.map((att: { url: string; name: string; mimeType: string }, i: number) => (
                                            att.mimeType.startsWith('image/') ? (
                                              <div
                                                key={i}
                                                className="relative group"
                                                onClick={() => setExpandedImage({ url: att.url, name: att.name })}
                                              >
                                                <img
                                                  src={att.url}
                                                  alt={att.name}
                                                  className="h-16 w-16 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity border border-border"
                                                />
                                                <div className="absolute inset-0 rounded bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                                                  <a
                                                    href={att.url}
                                                    download={att.name}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="p-1 bg-white/20 rounded hover:bg-white/30 transition-colors"
                                                    title="Descargar"
                                                  >
                                                    <Download className="h-3 w-3 text-white" />
                                                  </a>
                                                </div>
                                              </div>
                                            ) : (
                                              <a
                                                key={i}
                                                href={att.url}
                                                download={att.name}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border border-border bg-muted hover:bg-accent transition-colors"
                                              >
                                                <Paperclip className="h-3 w-3 shrink-0" />
                                                <span className="max-w-[100px] truncate">{att.name}</span>
                                              </a>
                                            )
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )
                          )}
                        </>
                      )
                    })()}
                  </div>

                  {/* Comment input at bottom - using CommentsSection component */}
                  <div className="border-t shrink-0">
                    <CommentsSection task={task} compact={true} />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="cotizacion" className="mt-0 p-4">
              <QuotationSection task={task} />
            </TabsContent>
          </div>
        </Tabs>

      </SheetContent>

      {/* Hito Completion Modal */}
      {task.hitoPoe && (
        <HitoCompletionModal
          open={hitoModalOpen}
          onOpenChange={setHitoModalOpen}
          tareaId={task.id}
          hitoPoeId={task.hitoPoe}
          clientPlan={clientPlan}
          completadoPor={currentUserId || ''}
          onComplete={handleHitoComplete}
          onCancel={handleHitoCancel}
        />
      )}

      {/* Redactor Modal - autocompletado desde la tarea de Hito */}
      {redactorType && (
        <RedactorModal
          open={redactorOpen}
          onOpenChange={setRedactorOpen}
          initialClientId={redactorClientId}
          initialType={redactorType}
        />
      )}

      {/* Tester Modal - autocompletado desde la tarea de Hito de Testing */}
      {isHitoTesting && (
        <TesterModal
          open={testerOpen}
          onOpenChange={setTesterOpen}
          initialClientId={redactorClientId}
        />
      )}

      {/* Analista Modal - para tareas de Hito de Informe de Cierre de Mes */}
      {isHitoInformeCierre && (
        <AnalistaModal
          open={analistaOpen}
          onOpenChange={setAnalistaOpen}
          initialClientId={redactorClientId}
        />
      )}

      {/* Image Viewer Dialog */}
      <Dialog open={!!expandedImage} onOpenChange={() => {
        setExpandedImage(null)
        setImageZoom(100)
      }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden p-0 flex flex-col">
          <DialogHeader className="bg-muted/50 p-4 border-b flex items-center justify-between">
            <DialogTitle className="text-sm truncate flex-1">{expandedImage?.name}</DialogTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{imageZoom}%</span>
            </div>
          </DialogHeader>
          <div className="flex-1 flex items-center justify-center bg-black/80 p-4 overflow-auto">
            {expandedImage && (
              <img
                src={expandedImage.url}
                alt={expandedImage.name}
                style={{ transform: `scale(${imageZoom / 100})` }}
                className="object-contain transition-transform duration-200"
                onWheel={(e) => {
                  e.preventDefault()
                  const newZoom = Math.max(50, Math.min(300, imageZoom + (e.deltaY > 0 ? -10 : 10)))
                  setImageZoom(newZoom)
                }}
              />
            )}
          </div>
          <div className="bg-muted/50 p-4 border-t flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setImageZoom(Math.max(50, imageZoom - 10))}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setImageZoom(100)}
              >
                <RotateCw className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setImageZoom(Math.min(300, imageZoom + 10))}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => expandedImage && window.open(expandedImage.url, '_blank')}
                title="Abrir en nueva pestaña"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
              <a
                href={expandedImage?.url}
                download={expandedImage?.name}
                className="inline-flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3 text-sm"
              >
                <Download className="h-4 w-4" />
              </a>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Sheet>
  )
}
