'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Task, TaskStatus, TaskPriority, TaskType, TaskCustomField, TaskQuotation } from '@/lib/types'
import { cn } from '@/lib/utils'
import {
  useTaskStore,
  STATUS_CONFIG,
  STATUS_ORDER,
  PRIORITY_CONFIG,
  TYPE_CONFIG,
  ASSIGNEES,
  CLIENTS,
  HOURLY_RATE,
  IVA_RATE,
  calculateQuotation,
  formatCurrency,
} from '@/lib/tasks/task-store'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
import { Calendar } from '@/components/ui/calendar'
import {
  Play,
  Pause,
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
  Download,
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
  DollarSign,
  Calculator,
  Power,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatTimeShort(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function getInitials(name: string): string {
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
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={insertTable}>
          <Table className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('formatBlock', 'blockquote')}>
          <Quote className="h-3.5 w-3.5" />
        </Button>
      </div>
      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        className="min-h-[120px] p-3 text-sm focus:outline-none prose prose-sm prose-invert max-w-none [&_table]:w-full [&_th]:bg-muted [&_td]:p-2 [&_th]:p-2 [&_td]:border [&_th]:border [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded-md [&_blockquote]:border-l-2 [&_blockquote]:border-primary [&_blockquote]:pl-3 [&_blockquote]:italic"
        data-placeholder={placeholder}
        style={{ minHeight: '120px' }}
      />
    </div>
  )
}

// ── Time Tracker Component ────────────────────────────────────────────────────

function TimeTracker({ task }: { task: Task }) {
  const { startTimer, stopTimer, updateTask } = useTaskStore()
  const [liveSeconds, setLiveSeconds] = useState(0)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (task.isTimerRunning && task.timerStartedAt) {
      intervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - new Date(task.timerStartedAt!).getTime()) / 1000)
        setLiveSeconds(elapsed)
      }, 1000)
    } else {
      setLiveSeconds(0)
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [task.isTimerRunning, task.timerStartedAt])

  const totalDisplay = task.totalTimeSec + (task.isTimerRunning ? liveSeconds : 0)

  const handleReset = () => {
    if (task.isTimerRunning) stopTimer(task.id)
    updateTask(task.id, { totalTimeSec: 0, timeSessions: [] })
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Time Tracker</span>
      </div>

      <div className="flex items-center justify-center mb-4">
        <span
          className={cn(
            'text-4xl font-mono tabular-nums tracking-tight',
            task.isTimerRunning && 'text-green-400'
          )}
        >
          {formatTime(totalDisplay)}
        </span>
      </div>

      <div className="flex items-center justify-center gap-2 mb-4">
        {task.isTimerRunning ? (
          <Button
            size="sm"
            variant="destructive"
            className="gap-1.5"
            onClick={() => stopTimer(task.id)}
          >
            <Pause className="h-4 w-4" />
            Pausar
          </Button>
        ) : (
          <Button
            size="sm"
            className="gap-1.5 bg-green-600 hover:bg-green-700"
            onClick={() => startTimer(task.id)}
          >
            <Play className="h-4 w-4" />
            Iniciar
          </Button>
        )}
        <Button size="sm" variant="outline" className="gap-1.5" onClick={handleReset}>
          <RotateCcw className="h-4 w-4" />
          Reset
        </Button>
      </div>

      {task.timeSessions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground font-medium">Sesiones anteriores</p>
          <div className="max-h-24 overflow-y-auto space-y-1">
            {task.timeSessions.slice(-3).map((session) => (
              <div key={session.id} className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{format(new Date(session.startedAt), 'dd/MM HH:mm', { locale: es })}</span>
                <span className="font-mono">{formatTimeShort(session.durationSec)}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-xs pt-1 border-t border-border">
            <span className="font-medium">Total acumulado</span>
            <span className="font-mono font-medium">{formatTimeShort(task.totalTimeSec)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Quotation Section ─────────────────────────────────────────────────────────

function QuotationSection({ task }: { task: Task }) {
  const { updateQuotation } = useTaskStore()
  const [hours, setHours] = useState(task.quotation?.hours || 0)
  const [notes, setNotes] = useState(task.quotation?.notes || '')

  const quotation = calculateQuotation(hours, notes)

  const handleSave = () => {
    if (hours > 0) {
      updateQuotation(task.id, quotation)
    } else {
      updateQuotation(task.id, null)
    }
  }

  const handleExportPDF = () => {
    // Create a simple PDF export using browser print
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Cotizacion - ${task.title}</title>
        <style>
          body { font-family: system-ui, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
          h1 { font-size: 24px; margin-bottom: 8px; }
          .subtitle { color: #666; margin-bottom: 32px; }
          .client { font-size: 18px; color: #333; margin-bottom: 24px; }
          table { width: 100%; border-collapse: collapse; margin: 24px 0; }
          th, td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; }
          th { background: #f5f5f5; font-weight: 600; }
          .total-row { font-weight: bold; font-size: 18px; }
          .total-row td { border-top: 2px solid #333; padding-top: 16px; }
          .notes { margin-top: 24px; padding: 16px; background: #f9f9f9; border-radius: 8px; }
          .footer { margin-top: 48px; color: #999; font-size: 12px; }
        </style>
      </head>
      <body>
        <h1>Cotizacion de Servicio</h1>
        <p class="subtitle">${task.title}</p>
        <p class="client">Cliente: <strong>${task.clientName}</strong></p>
        
        <table>
          <thead>
            <tr>
              <th>Concepto</th>
              <th style="text-align:right">Cantidad</th>
              <th style="text-align:right">Precio Unitario</th>
              <th style="text-align:right">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Horas de trabajo</td>
              <td style="text-align:right">${hours}</td>
              <td style="text-align:right">${formatCurrency(HOURLY_RATE)}</td>
              <td style="text-align:right">${formatCurrency(quotation.subtotal)}</td>
            </tr>
            <tr>
              <td colspan="3">IVA (21%)</td>
              <td style="text-align:right">${formatCurrency(quotation.iva)}</td>
            </tr>
            <tr class="total-row">
              <td colspan="3">TOTAL</td>
              <td style="text-align:right">${formatCurrency(quotation.total)}</td>
            </tr>
          </tbody>
        </table>
        
        ${notes ? `<div class="notes"><strong>Notas:</strong><br/>${notes}</div>` : ''}
        
        <div class="footer">
          <p>Cotizacion generada el ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: es })}</p>
          <p>MDK Workspace</p>
        </div>
      </body>
      </html>
    `

    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(printContent)
      printWindow.document.close()
      printWindow.print()
    }
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Cotizacion</span>
        </div>
        {hours > 0 && (
          <Button size="sm" variant="outline" className="gap-1.5 h-7" onClick={handleExportPDF}>
            <Download className="h-3 w-3" />
            Exportar PDF
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Horas estimadas</Label>
          <Input
            type="number"
            min="0"
            step="0.5"
            value={hours}
            onChange={(e) => setHours(parseFloat(e.target.value) || 0)}
            onBlur={handleSave}
            className="h-9 mt-1"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Valor hora</Label>
          <Input
            value={formatCurrency(HOURLY_RATE)}
            disabled
            className="h-9 mt-1 bg-muted"
          />
        </div>
      </div>

      {hours > 0 && (
        <>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatCurrency(quotation.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">IVA (21%)</span>
              <span>{formatCurrency(quotation.iva)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-semibold text-base">
              <span>Total</span>
              <span className="text-green-400">{formatCurrency(quotation.total)}</span>
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Notas</Label>
            <Textarea
              placeholder="Notas adicionales para la cotizacion..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={handleSave}
              className="mt-1 min-h-[60px] text-sm"
            />
          </div>
        </>
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

// ── Comments Section ──────────────────────────────────────────────────────────

function CommentsSection({ task }: { task: Task }) {
  const { addComment, deleteComment } = useTaskStore()
  const [comment, setComment] = useState('')

  const handleSubmit = () => {
    if (!comment.trim()) return
    addComment(task.id, comment, 'current', 'Usuario')
    setComment('')
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Comentarios ({task.comments.length})</p>

      {task.comments.length > 0 && (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {task.comments.map((c) => (
            <div key={c.id} className="group">
              <div className="flex items-start gap-3">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="text-xs">{getInitials(c.userName)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{c.userName}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true, locale: es })}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      · {format(new Date(c.createdAt), 'dd/MM/yyyy HH:mm', { locale: es })}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{c.content}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  onClick={() => deleteComment(task.id, c.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="text-xs">US</AvatarFallback>
        </Avatar>
        <div className="flex-1 flex gap-2">
          <Input
            placeholder="Escribe un comentario..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            className="h-8 text-sm"
          />
          <Button size="icon" className="h-8 w-8 shrink-0" onClick={handleSubmit} disabled={!comment.trim()}>
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Custom Fields Component ───────────────────────────────────────────────────

function CustomFields({ task }: { task: Task }) {
  const { addCustomField, removeCustomField, updateTask } = useTaskStore()
  const [isAdding, setIsAdding] = useState(false)
  const [newFieldName, setNewFieldName] = useState('')
  const [newFieldType, setNewFieldType] = useState<TaskCustomField['type']>('text')

  const handleAddField = () => {
    if (!newFieldName.trim()) return
    const key = newFieldName.toLowerCase().replace(/\s+/g, '_')
    addCustomField(task.id, key, {
      label: newFieldName,
      type: newFieldType,
      value: '',
    })
    setNewFieldName('')
    setNewFieldType('text')
    setIsAdding(false)
  }

  const handleUpdateFieldValue = (key: string, value: string) => {
    const updated = {
      ...task.customFields,
      [key]: { ...task.customFields[key], value },
    }
    updateTask(task.id, { customFields: updated })
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
          <Input
            value={field.value}
            onChange={(e) => handleUpdateFieldValue(key, e.target.value)}
            className="h-8 text-sm"
            type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
          />
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
          <div className="flex gap-2">
            <Select value={newFieldType} onValueChange={(v) => setNewFieldType(v as TaskCustomField['type'])}>
              <SelectTrigger className="h-8 text-sm flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Texto</SelectItem>
                <SelectItem value="number">Numero</SelectItem>
                <SelectItem value="date">Fecha</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" className="h-8" onClick={handleAddField}>
              Agregar
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setIsAdding(false)}>
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

  const handleDescriptionChange = (html: string) => {
    updateTask(task.id, { description: html })
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
        <SheetHeader className="p-4 pb-3 border-b shrink-0">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-lg leading-tight pr-8">{task.title}</SheetTitle>
              <p className="text-xs text-muted-foreground mt-1">{task.clientName}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {/* Active Toggle */}
              <div className="flex items-center gap-2 mr-2 px-2 py-1 rounded-md bg-muted/50">
                <Power className={cn('h-3.5 w-3.5', task.isActive ? 'text-green-400' : 'text-muted-foreground')} />
                <span className="text-xs">{task.isActive ? 'Activa' : 'Inactiva'}</span>
                <Switch
                  checked={task.isActive}
                  onCheckedChange={() => toggleTaskActive(task.id)}
                  className="scale-75"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setIsFullscreen(!isFullscreen)}
              >
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </SheetHeader>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-4 mt-3 mb-0 shrink-0">
            <TabsTrigger value="detalles" className="text-xs">Detalles</TabsTrigger>
            <TabsTrigger value="descripcion" className="text-xs">Descripcion</TabsTrigger>
            <TabsTrigger value="archivos" className="text-xs">Archivos ({task.files.length})</TabsTrigger>
            <TabsTrigger value="cotizacion" className="text-xs">Cotizacion</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto p-4">
            <TabsContent value="detalles" className="mt-0 space-y-5">
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
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Cliente</Label>
                  <Select
                    value={task.clientId}
                    onValueChange={(v) => {
                      const client = CLIENTS.find((c) => c.id === v)
                      if (client) updateTask(task.id, { clientId: v, clientName: client.name })
                    }}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CLIENTS.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Asignado</Label>
                  <Select
                    value={task.assigneeId}
                    onValueChange={(v) => {
                      const assignee = ASSIGNEES.find((a) => a.id === v)
                      if (assignee) updateTask(task.id, { assigneeId: v, assigneeName: assignee.name })
                    }}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ASSIGNEES.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-5 w-5">
                              <AvatarFallback className="text-[9px]">{getInitials(a.name)}</AvatarFallback>
                            </Avatar>
                            {a.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Type & Due Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Tipo</Label>
                  <Select
                    value={task.type}
                    onValueChange={(v) => updateTask(task.id, { type: v as TaskType })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TYPE_CONFIG) as TaskType[]).map((t) => (
                        <SelectItem key={t} value={t}>
                          <Badge variant="outline" className={cn('text-xs border-0', TYPE_CONFIG[t].color)}>
                            {TYPE_CONFIG[t].label}
                          </Badge>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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

              {/* Time Tracker */}
              <TimeTracker task={task} />

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
                onClick={() => {
                  deleteTask(task.id)
                  handleClose()
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Eliminar tarea
              </Button>
            </TabsContent>

            <TabsContent value="descripcion" className="mt-0">
              <RichTextEditor
                content={task.description || ''}
                onChange={handleDescriptionChange}
                placeholder="Describe la tarea, agrega listas, tablas, codigo..."
              />
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
