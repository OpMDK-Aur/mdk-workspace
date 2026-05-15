'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Task, TaskStatus, TaskPriority, TaskType, TaskCustomField, TaskQuotation } from '@/lib/types'
import { cn, linkifyText } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
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
  avatar_url: string | null
  }

interface Cliente {
  id: string
  nombre_del_negocio: string
}
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'

import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { Check, ChevronsUpDown, ChevronLeft, ChevronRight, Pencil, ArrowUpDown } from 'lucide-react'
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
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
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
  onChange
}: {
  clients: Array<{ id: string; nombre_del_negocio: string }>
  availableClients: Array<{ id: string; nombre_del_negocio: string }>
  onChange: (clients: Array<{ id: string; nombre_del_negocio: string }>) => void
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
              <span className="text-xs">{c.nombre_del_negocio}</span>
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
  assignees: Array<{ id: string; nombre: string; avatar_url: string | null }>
  colaboradores: Array<{ id: string; nombre: string; avatar_url: string | null }>
  onChange: (assignees: Array<{ id: string; nombre: string; avatar_url: string | null }>) => void
}) {
  const [open, setOpen] = useState(false)

  const addAssignee = (colabId: string) => {
    const colab = colaboradores.find(c => c.id === colabId)
    if (colab && !assignees.find(a => a.id === colabId)) {
      onChange([...assignees, { id: colab.id, nombre: colab.nombre, avatar_url: colab.avatar_url }])
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
                {a.avatar_url && <AvatarImage src={a.avatar_url} alt={a.nombre} />}
                <AvatarFallback className="text-[9px]">{getInitials(a.nombre)}</AvatarFallback>
              </Avatar>
              <span className="text-xs">{a.nombre.split(' ')[0]}</span>
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
                    value={c.nombre}
                    onSelect={() => {
                      addAssignee(c.id)
                      setOpen(false)
                    }}
                  >
                    <Avatar className="h-5 w-5 mr-2">
                      {c.avatar_url && <AvatarImage src={c.avatar_url} alt={c.nombre} />}
                      <AvatarFallback className="text-[9px]">{getInitials(c.nombre)}</AvatarFallback>
                    </Avatar>
                    {c.nombre}
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

// ── Files Section ─────────────────────────────────────────────────────────────

function FilesSection({ task }: { task: Task }) {
  const { addFile, deleteFile } = useTaskStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    // In a real app, this would upload to Google Drive
    // For now, we'll simulate adding the file
    for (const file of Array.from(files)) {
      addFile(task.id, {
        name: file.name,
        url: URL.createObjectURL(file), // Simulated URL
        mimeType: file.type,
        size: file.size,
        uploadedBy: 'current',
        uploadedByName: 'Usuario',
      })
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Archivos</p>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 h-7"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-3 w-3" />
          Subir
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileUpload}
        />
      </div>

      {task.files.length > 0 ? (
        <div className="space-y-2">
          {task.files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 p-2 rounded-lg bg-muted/50 group"
            >
              <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
                <FileIcon className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(file.size)} · {file.uploadedByName} · {format(new Date(file.createdAt), 'dd/MM HH:mm', { locale: es })}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => deleteFile(task.id, file.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Sin archivos adjuntos</p>
      )}
    </div>
  )
}

// ── Comments Section (with rich text editor) ──────────────────────────────────

function CommentsSection({ task }: { task: Task }) {
  const { addComment, updateComment, deleteComment } = useTaskStore()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [currentUser, setCurrentUser] = useState<{ id: string; nombre: string; avatar_url: string | null } | null>(null)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const editorRef = useRef<HTMLDivElement>(null)
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)
  
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
    return [...task.comments].sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime()
      const dateB = new Date(b.createdAt).getTime()
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB
    })
  }, [task.comments, sortOrder])

  useEffect(() => {
    async function loadUser() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
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
    if (!items) return

    for (const item of Array.from(items)) {
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
    if (!content || content === '<br>') return
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
      await addComment(task.id, content, userId, userName, currentUser?.avatar_url, mentionedIds)
      editorRef.current.innerHTML = ''
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Comentarios ({task.comments.length})</p>
        {task.comments.length > 1 && (
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

      {task.comments.length > 0 && (
        <div className="space-y-4 max-h-[400px] overflow-y-auto overflow-x-hidden pr-1 w-full">
          {sortedComments.map((c) => (
            <div key={c.id} className="group rounded-lg border bg-muted/30 p-3 w-full overflow-hidden">
              <div className="flex items-start gap-3 min-w-0 w-full">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src={c.userAvatar || undefined} alt={c.userName} />
                  <AvatarFallback className="text-xs">{getInitials(c.userName)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{c.userName}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true, locale: es })}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(c.createdAt), 'dd/MM/yyyy HH:mm', { locale: es })}
                    </span>
                  </div>
                  {editingCommentId === c.id ? (
                    <div className="mt-2 space-y-2">
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
                        className="w-full min-h-[60px] p-2 text-sm rounded-md border border-border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleEditComment(c.id)}>
                          Guardar
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => { setEditingCommentId(null); setEditingContent('') }}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div 
                      className="text-sm text-foreground/80 mt-2 break-words whitespace-pre-wrap [&_p]:my-1 [&_a]:text-primary [&_a]:underline [&_a]:hover:opacity-80 [&_strong]:text-foreground [&_strong]:font-semibold [&_em]:italic [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_img]:max-w-full [&_img]:rounded-lg [&_img]:mt-2 [&_img]:max-h-[300px] [&_img]:object-contain [&_img]:block [&_img]:cursor-pointer [&_img]:hover:opacity-90 [&_img]:transition-opacity"
                      dangerouslySetInnerHTML={{ __html: linkifyText(c.content) }}
                      onClick={handleImageClick}
                    />
                  )}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => { setEditingCommentId(c.id); setEditingContent(c.content.replace(/<[^>]*>/g, '')) }}
                    title="Editar"
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => deleteComment(task.id, c.id)}
                    title="Eliminar"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Avatar className="h-7 w-7 shrink-0">
            {currentUser?.avatar_url && <AvatarImage src={currentUser.avatar_url} alt={currentUser.nombre} />}
            <AvatarFallback className="text-xs">
              {currentUser ? getInitials(currentUser.nombre) : 'US'}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm text-muted-foreground">Nuevo comentario</span>
        </div>
        <div className="relative">
          <div
            ref={editorRef}
            contentEditable
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            data-placeholder="Escribe un comentario... usa @ para mencionar (podes pegar imagenes con Ctrl+V)"
            className="w-full min-h-[80px] p-3 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground [&_img]:max-w-full [&_img]:max-h-[200px] [&_img]:rounded-lg [&_img]:inline-block [&_img]:align-middle [&_img]:my-1 [&_.mention]:bg-primary/20 [&_.mention]:text-primary [&_.mention]:px-1 [&_.mention]:rounded"
          />
          
          {/* Mention dropdown */}
          {showMentions && filteredAssignees.length > 0 && (
            <div 
              className="absolute z-50 bg-popover border rounded-md shadow-lg py-1 min-w-[200px]"
              style={{ top: mentionPosition.top, left: mentionPosition.left }}
            >
              {filteredAssignees.map((assignee, index) => (
                <button
                  key={assignee.id}
                  type="button"
                  className={cn(
                    'w-full px-3 py-2 text-sm text-left flex items-center gap-2 hover:bg-muted',
                    index === selectedMentionIndex && 'bg-muted'
                  )}
                  onClick={() => insertMention(assignee)}
                  onMouseEnter={() => setSelectedMentionIndex(index)}
                >
                  <Avatar className="h-6 w-6">
                    {assignee.avatar_url && <AvatarImage src={assignee.avatar_url} />}
                    <AvatarFallback className="text-xs">{getInitials(assignee.name)}</AvatarFallback>
                  </Avatar>
                  <span>{assignee.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        
        <div className="flex items-center justify-end">
          <Button 
            size="sm" 
            className="gap-1.5" 
            onClick={handleSubmit} 
            disabled={isSubmitting}
          >
            <Send className="h-3.5 w-3.5" />
            {isSubmitting ? 'Enviando...' : 'Enviar'}
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

// ── Custom Fields Component ──────────────────────�������─────����──────────────────────

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
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
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
  const { selectedTaskId, setSelectedTask, tasks, updateTask, deleteTask, toggleTaskActive } = useTaskStore()
  const task = tasks.find((t) => t.id === selectedTaskId)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [activeTab, setActiveTab] = useState('detalles')
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [tempTitle, setTempTitle] = useState('')
  
  // Dynamic data from Supabase
  const [tiposTarea, setTiposTarea] = useState<TipoDeTarea[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])

  // Load dynamic data on mount
  useEffect(() => {
    async function loadData() {
      const supabase = createClient()
      
      const [tiposRes, colabRes, clientesRes] = await Promise.all([
        supabase.from('tipo_de_tareas').select('id, nombre, activo').eq('activo', true).order('nombre'),
        supabase.from('colaboradores').select('id, nombre, avatar_url').order('nombre'),
        supabase.from('clientes').select('id, nombre_del_negocio').order('nombre_del_negocio'),
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

  const handleClose = () => {
    setIsFullscreen(false)
    setSelectedTask(null)
  }

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
            : '!w-[520px] !max-w-[520px]'
        )} 
        side="right"
      >
        {/* Header */}
        <SheetHeader className="px-4 pt-4 pb-3 border-b shrink-0">
          {/* Línea 1: título + acciones */}
          <div className="flex items-center gap-2 pr-10">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {isEditingTitle ? (
                  <Input
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
                    className="h-8 text-base font-medium"
                    autoFocus
                  />
                ) : (
                  <SheetTitle
                    className="text-base font-medium leading-tight cursor-text hover:text-primary truncate"
                    onClick={() => {
                      setTempTitle(task.title)
                      setIsEditingTitle(true)
                    }}
                  >
                    {task.title}
                  </SheetTitle>
                )}
                {task.isSystemTask && (
                  <Badge className="bg-teal-500/20 text-teal-400 border-teal-500/30 text-[10px] shrink-0">
                    Recurrente
                  </Badge>
                )}
              </div>
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

          {/* Línea 2: cliente */}
          <p className="text-xs text-muted-foreground mt-0.5">
            {task.clients && task.clients.length > 0
              ? task.clients.map(c => c.nombre_del_negocio).join(', ')
              : task.clientName}
          </p>

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
          {(task.typeName?.toLowerCase().includes('seguimiento') || task.title?.toLowerCase().includes('seguimiento')) && (
            <Button variant="outline" size="sm" className="mt-2 h-8 gap-2 border-green-500/50 text-green-400 hover:bg-green-500/10 hover:text-green-300 self-start"
              onClick={() => {
                const text = task.description?.replace(/<[^>]*>/g, '') || ''
                navigator.clipboard.writeText(text)
                toast.success('Mensaje copiado al portapapeles')
                window.open('https://web.whatsapp.com', '_blank')
              }}>
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Enviar por WhatsApp
            </Button>
          )}
        </SheetHeader>

        {/* Time Tracker bar — debajo del header, antes de los tabs */}
        <div className="flex items-center gap-3 px-4 h-9 bg-muted/40 border-b shrink-0">
          <TimeTracker task={task} />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-4 mt-3 mb-0 shrink-0">
            <TabsTrigger value="detalles" className="text-xs">Detalles</TabsTrigger>
            <TabsTrigger value="archivos" className="text-xs">Archivos ({task.files.length})</TabsTrigger>
            <TabsTrigger value="cotizacion" className="text-xs">Cotizacion</TabsTrigger>
          </TabsList>

          <div className={cn(
              "flex-1 overflow-y-auto p-4",
              isFullscreen && "p-6"
            )}>
            <TabsContent value="detalles" className={cn(
              "mt-0",
              isFullscreen ? "grid grid-cols-[1fr_400px] gap-8" : "space-y-5"
            )}>
              {/* Main content - Comments in fullscreen, details in normal */}
              {isFullscreen ? (
                <>
                  {/* Left column - Comments & Activity */}
                  <div className="space-y-6">
                    {/* Description */}
                    {task.description && (
                      <div className="rounded-xl border bg-card/50 p-5">
                        <Label className="text-xs text-muted-foreground mb-2 block">Descripcion</Label>
                        <div 
                          className="text-sm prose prose-sm prose-invert max-w-none whitespace-pre-wrap"
                          dangerouslySetInnerHTML={{ __html: task.description }}
                        />
                      </div>
                    )}
                    
                    <div className="rounded-xl border bg-card/50 p-5">
                      <CommentsSection task={task} />
                    </div>
                    
                    <div className="rounded-xl border bg-card/50 p-5">
                      <div className="space-y-3">
                        <p className="text-sm font-medium">Actividad reciente</p>
                        {task.activities.length > 0 ? (
                          <div className="space-y-3">
                            {task.activities.slice(0, 10).map((activity) => (
                              <div key={activity.id} className="flex items-start gap-3 text-sm">
                                <Avatar className="h-6 w-6 mt-0.5 shrink-0">
                                  <AvatarFallback className="text-[9px]">{getInitials(activity.userName)}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1">
                                  <span className="text-foreground/80">{activity.action}</span>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {format(new Date(activity.timestamp), "dd MMM yyyy 'a las' HH:mm", { locale: es })}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">Sin actividad reciente</p>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Right column - Details */}
                  <div className="space-y-5">
                    {/* Status & Priority */}
                    <div className="rounded-xl border bg-card/50 p-4 space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1.5 block">Estado</Label>
                          <Select
                            value={task.status}
                            onValueChange={(v) => updateTask(task.id, { status: v as TaskStatus })}
                          >
                            <SelectTrigger className={cn('h-9', statusConfig.bgColor, statusConfig.color)}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUS_ORDER.map((s) => (
                                <SelectItem key={s} value={s}>
                                  <div className="flex items-center gap-2">
                                    <div className={cn('w-2 h-2 rounded-full', STATUS_CONFIG[s].bgColor.replace('/10', ''))} />
                                    {STATUS_CONFIG[s].label}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1.5 block">Prioridad</Label>
                          <Select
                            value={task.priority}
                            onValueChange={(v) => updateTask(task.id, { priority: v as TaskPriority })}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(['alta', 'media', 'baja'] as TaskPriority[]).map((p) => (
                                <SelectItem key={p} value={p}>
                                  <Badge variant="outline" className={cn('text-xs border-0', PRIORITY_CONFIG[p].bgColor, PRIORITY_CONFIG[p].color)}>
                                    {PRIORITY_CONFIG[p].label}
                                  </Badge>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1.5 block">Clientes</Label>
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
                        />
                      </div>
                      
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1.5 block">Asignados</Label>
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

  <div>
  <Label className="text-xs text-muted-foreground mb-1.5 block">Creado por</Label>
  <div className="flex items-center gap-2 h-9 px-3 rounded-md border bg-muted/30">
    <Avatar className="h-5 w-5">
      {task.createdByAvatar && <AvatarImage src={task.createdByAvatar} alt={task.createdByName} />}
      <AvatarFallback className="text-[9px]">{getInitials(task.createdByName)}</AvatarFallback>
    </Avatar>
    <span className="text-sm">{task.createdByName}</span>
  </div>
  </div>
  
  <div className="space-y-3">
  <div>
  <Label className="text-xs text-muted-foreground mb-1.5 block">Tipo de tarea</Label>
                          <SearchableTaskTypeSelect 
                            tiposTarea={tiposTarea}
                            value={task.type}
                            onValueChange={(v) => updateTask(task.id, { type: v as TaskType })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1.5 block">Vencimiento</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className="h-9 w-full justify-start text-left font-normal text-sm">
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {task.dueDate ? format(task.dueDate, 'dd MMM', { locale: es }) : 'Sin fecha'}
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
                    </div>
                    
                    {/* Custom Fields */}
                    <div className="rounded-xl border bg-card/50 p-4">
                      <CustomFields task={task} />
                    </div>
                    
                    {/* Delete */}
                    <Button
                      variant="ghost"
                      className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={async () => {
                        const confirmed = confirm(`¿Eliminar tarea "${task.title}"? Esta acción no se puede deshacer.`)
                        if (confirmed) {
                          await deleteTask(task.id)
                          handleClose()
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Eliminar tarea
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  {/* Description */}
                  {task.description && (
                    <div className="rounded-lg border bg-card/50 p-4">
                      <Label className="text-xs text-muted-foreground mb-2 block">Descripcion</Label>
                      <div 
                        className="text-sm prose prose-sm prose-invert max-w-none whitespace-pre-wrap"
                        dangerouslySetInnerHTML={{ __html: task.description }}
                      />
                    </div>
                  )}
                  
                  {/* Status & Priority */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Estado</Label>
                      <Select
                        value={task.status}
                        onValueChange={(v) => updateTask(task.id, { status: v as TaskStatus })}
                      >
                        <SelectTrigger className={cn('h-9', statusConfig.bgColor, statusConfig.color)}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_ORDER.map((s) => (
                            <SelectItem key={s} value={s}>
                              <div className="flex items-center gap-2">
                                <div className={cn('w-2 h-2 rounded-full', STATUS_CONFIG[s].bgColor.replace('/10', ''))} />
                                {STATUS_CONFIG[s].label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Prioridad</Label>
                      <Select
                        value={task.priority}
                        onValueChange={(v) => updateTask(task.id, { priority: v as TaskPriority })}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(['alta', 'media', 'baja'] as TaskPriority[]).map((p) => (
                            <SelectItem key={p} value={p}>
                              <Badge variant="outline" className={cn('text-xs border-0', PRIORITY_CONFIG[p].bgColor, PRIORITY_CONFIG[p].color)}>
                                {PRIORITY_CONFIG[p].label}
                              </Badge>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Client & Assignee */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Clientes</Label>
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
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Asignados</Label>
                      <MultiAssigneeSelect
                        assignees={task.assignees || []}
                        colaboradores={colaboradores}
                        onChange={(newAssignees) => {
                          updateTask(task.id, { 
                            assignees: newAssignees,
                            // Keep legacy fields in sync with first assignee
                            assigneeId: newAssignees[0]?.id || '',
                            assigneeName: newAssignees[0]?.nombre || 'Sin asignar',
                            assigneeAvatar: newAssignees[0]?.avatar_url || null,
                          })
                        }}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Creado por</Label>
                      <div className="flex items-center gap-2 h-9 px-3 rounded-md border bg-muted/30">
                        <Avatar className="h-5 w-5">
                          <AvatarFallback className="text-[9px]">{getInitials(task.createdByName)}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{task.createdByName}</span>
                      </div>
                    </div>
                  </div>

                  {/* Type & Due Date */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Tipo de tarea</Label>
                      <SearchableTaskTypeSelect 
                        tiposTarea={tiposTarea}
                        value={task.type}
                        onValueChange={(v) => updateTask(task.id, { type: v as TaskType })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Vencimiento</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="h-9 w-full justify-start text-left font-normal">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {task.dueDate ? format(task.dueDate, 'dd MMM yyyy', { locale: es }) : 'Sin fecha'}
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

                  <Separator />

                  {/* Custom Fields */}
                  <CustomFields task={task} />

                  <Separator />

                  {/* Comments */}
                  <CommentsSection task={task} />

                  <Separator />

                  {/* Activity Log */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Actividad reciente</p>
                    {task.activities.length > 0 ? (
                      <div className="space-y-2">
                        {task.activities.slice(0, 5).map((activity) => (
                          <div key={activity.id} className="flex items-start gap-2 text-xs">
                            <Avatar className="h-5 w-5 mt-0.5">
                              <AvatarFallback className="text-[8px]">{getInitials(activity.userName)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <span className="text-muted-foreground">{activity.action}</span>
                              <span className="text-muted-foreground/60 ml-1">
                                · {format(new Date(activity.timestamp), 'dd/MM HH:mm', { locale: es })}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Sin actividad reciente</p>
                    )}
                  </div>

                  <Separator />

                  {/* Delete */}
                  <Button
                    variant="ghost"
                    className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={async () => {
                      const confirmed = confirm(`¿Eliminar tarea "${task.title}"? Esta acción no se puede deshacer.`)
                      if (confirmed) {
                        await deleteTask(task.id)
                        handleClose()
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Eliminar tarea
                  </Button>
                </>
              )}
            </TabsContent>

            <TabsContent value="archivos" className="mt-0">
              <FilesSection task={task} />
            </TabsContent>

            <TabsContent value="cotizacion" className="mt-0">
              <QuotationSection task={task} />
            </TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}
