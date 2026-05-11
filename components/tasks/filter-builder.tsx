'use client'

import { useState } from 'react'
import { Plus, X, ChevronDown, Filter, Trash2, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { PRIORITY_CONFIG, TYPE_CONFIG, STATUS_CONFIG, ASSIGNEES, STATUS_ORDER } from '@/lib/tasks/task-store'
import type { TaskPriority, TaskType, TaskStatus } from '@/lib/types'

// ── Types ─────────────────────────────────────────────────────────────────────

export type FilterOperator = 
  | 'equals' 
  | 'not_equals' 
  | 'contains' 
  | 'not_contains'
  | 'is_empty'
  | 'is_not_empty'
  | 'greater_than'
  | 'less_than'

export type FilterField = 
  | 'status'
  | 'priority'
  | 'assignee'
  | 'type'
  | 'client'
  | 'title'
  | 'dueDate'
  | 'createdAt'
  | 'isActive'
  | 'createdBy'

export interface FilterRule {
  id: string
  field: FilterField
  operator: FilterOperator
  value: string | string[] | boolean | null
}

export interface FilterGroup {
  id: string
  connector: 'and' | 'or'
  rules: FilterRule[]
}

export interface SavedFilter {
  id: string
  name: string
  groups: FilterGroup[]
}

// ── Field Configuration ───────────────────────────────────────────────────────

const FILTER_FIELDS: { value: FilterField; label: string; type: 'select' | 'multiselect' | 'text' | 'date' | 'boolean' }[] = [
  { value: 'status', label: 'Estado', type: 'multiselect' },
  { value: 'priority', label: 'Prioridad', type: 'select' },
  { value: 'assignee', label: 'Asignado', type: 'select' },
  { value: 'createdBy', label: 'Creado por', type: 'select' },
  { value: 'type', label: 'Tipo', type: 'select' },
  { value: 'client', label: 'Cliente', type: 'text' },
  { value: 'title', label: 'Titulo', type: 'text' },
  { value: 'dueDate', label: 'Fecha limite', type: 'date' },
  { value: 'createdAt', label: 'Fecha creacion', type: 'date' },
  { value: 'isActive', label: 'Activa', type: 'boolean' },
]

const OPERATORS_BY_TYPE: Record<string, { value: FilterOperator; label: string }[]> = {
  select: [
    { value: 'equals', label: 'es' },
    { value: 'not_equals', label: 'no es' },
    { value: 'is_empty', label: 'esta vacio' },
    { value: 'is_not_empty', label: 'no esta vacio' },
  ],
  multiselect: [
    { value: 'equals', label: 'es' },
    { value: 'not_equals', label: 'no es' },
    { value: 'contains', label: 'contiene' },
    { value: 'not_contains', label: 'no contiene' },
    { value: 'is_empty', label: 'esta vacio' },
    { value: 'is_not_empty', label: 'no esta vacio' },
  ],
  text: [
    { value: 'equals', label: 'es' },
    { value: 'not_equals', label: 'no es' },
    { value: 'contains', label: 'contiene' },
    { value: 'not_contains', label: 'no contiene' },
    { value: 'is_empty', label: 'esta vacio' },
    { value: 'is_not_empty', label: 'no esta vacio' },
  ],
  date: [
    { value: 'equals', label: 'es' },
    { value: 'greater_than', label: 'despues de' },
    { value: 'less_than', label: 'antes de' },
    { value: 'is_empty', label: 'esta vacio' },
    { value: 'is_not_empty', label: 'no esta vacio' },
  ],
  boolean: [
    { value: 'equals', label: 'es' },
  ],
}

// ── Filter Value Options ──────────────────────────────────────────────────────

function getFieldOptions(field: FilterField): { value: string; label: string; color?: string }[] {
  switch (field) {
    case 'status':
      return STATUS_ORDER.map(s => ({
        value: s,
        label: STATUS_CONFIG[s].label,
        color: STATUS_CONFIG[s].color,
      }))
    case 'priority':
      return (['alta', 'media', 'baja'] as TaskPriority[]).map(p => ({
        value: p,
        label: PRIORITY_CONFIG[p].label,
        color: PRIORITY_CONFIG[p].color,
      }))
    case 'type':
      return (Object.keys(TYPE_CONFIG) as TaskType[]).map(t => ({
        value: t,
        label: TYPE_CONFIG[t].label,
        color: TYPE_CONFIG[t].color,
      }))
    case 'assignee':
      return ASSIGNEES.map(a => ({
        value: a.id,
        label: a.name,
      }))
    case 'createdBy':
      return ASSIGNEES.map(a => ({
        value: a.id,
        label: a.name,
      }))
    case 'isActive':
      return [
        { value: 'true', label: 'Si' },
        { value: 'false', label: 'No' },
      ]
    default:
      return []
  }
}

// ── Components ────────────────────────────────────────────────────────────────

interface FilterBuilderProps {
  filters: FilterGroup[]
  savedFilters: SavedFilter[]
  onChange: (filters: FilterGroup[]) => void
  onSaveFilter: (name: string, groups: FilterGroup[]) => void
  onLoadFilter: (filter: SavedFilter) => void
  onDeleteSavedFilter: (id: string) => void
}

export function FilterBuilder({
  filters,
  savedFilters,
  onChange,
  onSaveFilter,
  onLoadFilter,
  onDeleteSavedFilter,
}: FilterBuilderProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [saveFilterName, setSaveFilterName] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)

  const totalRules = filters.reduce((acc, g) => acc + g.rules.length, 0)

  const addFilterGroup = () => {
    const newGroup: FilterGroup = {
      id: crypto.randomUUID(),
      connector: 'and',
      rules: [{
        id: crypto.randomUUID(),
        field: 'status',
        operator: 'equals',
        value: null,
      }],
    }
    onChange([...filters, newGroup])
  }

  const removeFilterGroup = (groupId: string) => {
    onChange(filters.filter(g => g.id !== groupId))
  }

  const updateGroupConnector = (groupId: string, connector: 'and' | 'or') => {
    onChange(filters.map(g => g.id === groupId ? { ...g, connector } : g))
  }

  const addRule = (groupId: string) => {
    onChange(filters.map(g => {
      if (g.id !== groupId) return g
      return {
        ...g,
        rules: [...g.rules, {
          id: crypto.randomUUID(),
          field: 'status',
          operator: 'equals',
          value: null,
        }],
      }
    }))
  }

  const removeRule = (groupId: string, ruleId: string) => {
    onChange(filters.map(g => {
      if (g.id !== groupId) return g
      const newRules = g.rules.filter(r => r.id !== ruleId)
      return { ...g, rules: newRules }
    }).filter(g => g.rules.length > 0))
  }

  const updateRule = (groupId: string, ruleId: string, updates: Partial<FilterRule>) => {
    onChange(filters.map(g => {
      if (g.id !== groupId) return g
      return {
        ...g,
        rules: g.rules.map(r => {
          if (r.id !== ruleId) return r
          const updated = { ...r, ...updates }
          // Reset value when field changes
          if (updates.field && updates.field !== r.field) {
            updated.operator = 'equals'
            updated.value = null
          }
          return updated
        }),
      }
    }))
  }

  const handleSaveFilter = () => {
    if (!saveFilterName.trim()) return
    onSaveFilter(saveFilterName.trim(), filters)
    setSaveFilterName('')
    setShowSaveInput(false)
  }

  const clearAllFilters = () => {
    onChange([])
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'gap-1.5 h-8',
            totalRules > 0 && 'bg-primary/10 border-primary/30 text-primary'
          )}
        >
          <Filter className="h-3.5 w-3.5" />
          Filtros
          {totalRules > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-xs ml-1">
              {totalRules}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[600px] p-0" align="start">
        <div className="p-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-sm">Filtros</span>
          </div>
          <div className="flex items-center gap-1">
            {/* Saved filters dropdown */}
            {savedFilters.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                    Guardados
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {savedFilters.map(sf => (
                    <DropdownMenuItem
                      key={sf.id}
                      className="flex items-center justify-between"
                    >
                      <span onClick={() => onLoadFilter(sf)}>{sf.name}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 ml-2"
                        onClick={(e) => {
                          e.stopPropagation()
                          onDeleteSavedFilter(sf.id)
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            
            {totalRules > 0 && (
              <>
                {showSaveInput ? (
                  <div className="flex items-center gap-1">
                    <Input
                      value={saveFilterName}
                      onChange={(e) => setSaveFilterName(e.target.value)}
                      placeholder="Nombre..."
                      className="h-7 w-28 text-xs"
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveFilter()}
                    />
                    <Button size="sm" className="h-7 text-xs" onClick={handleSaveFilter}>
                      <Save className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowSaveInput(false)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowSaveInput(true)}>
                    <Save className="h-3 w-3 mr-1" />
                    Guardar
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={clearAllFilters}>
                  <Trash2 className="h-3 w-3 mr-1" />
                  Limpiar
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="p-3 max-h-[400px] overflow-y-auto space-y-3">
          {filters.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <p className="text-sm">Sin filtros aplicados</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={addFilterGroup}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Agregar filtro
              </Button>
            </div>
          ) : (
            filters.map((group, groupIndex) => (
              <div key={group.id} className="space-y-2">
                {groupIndex > 0 && (
                  <div className="flex items-center gap-2 py-1">
                    <Separator className="flex-1" />
                    <Select
                      value={group.connector}
                      onValueChange={(v) => updateGroupConnector(group.id, v as 'and' | 'or')}
                    >
                      <SelectTrigger className="w-16 h-6 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="and">Y</SelectItem>
                        <SelectItem value="or">O</SelectItem>
                      </SelectContent>
                    </Select>
                    <Separator className="flex-1" />
                  </div>
                )}
                
                <div className="space-y-2 p-2 rounded-lg border bg-muted/30">
                  {group.rules.map((rule, ruleIndex) => (
                    <FilterRuleRow
                      key={rule.id}
                      rule={rule}
                      showConnector={ruleIndex > 0}
                      groupConnector={group.connector}
                      onUpdate={(updates) => updateRule(group.id, rule.id, updates)}
                      onRemove={() => removeRule(group.id, rule.id)}
                    />
                  ))}
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs w-full"
                    onClick={() => addRule(group.id)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Agregar condicion
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {filters.length > 0 && (
          <div className="p-2 border-t">
            <Button
              variant="outline"
              size="sm"
              className="w-full h-8 text-xs"
              onClick={addFilterGroup}
            >
              <Plus className="h-3 w-3 mr-1" />
              Agregar grupo de filtros
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

// ── Filter Rule Row ───────────────────────────────────────────────────────────

function FilterRuleRow({
  rule,
  showConnector,
  groupConnector,
  onUpdate,
  onRemove,
}: {
  rule: FilterRule
  showConnector: boolean
  groupConnector: 'and' | 'or'
  onUpdate: (updates: Partial<FilterRule>) => void
  onRemove: () => void
}) {
  const fieldConfig = FILTER_FIELDS.find(f => f.value === rule.field)!
  const operators = OPERATORS_BY_TYPE[fieldConfig.type]
  const options = getFieldOptions(rule.field)
  const needsValue = !['is_empty', 'is_not_empty'].includes(rule.operator)

  return (
    <div className="flex items-center gap-2">
      {showConnector && (
        <span className="text-xs text-muted-foreground w-6 text-center shrink-0">
          {groupConnector === 'and' ? 'Y' : 'O'}
        </span>
      )}
      {!showConnector && <div className="w-6 shrink-0" />}
      
      {/* Field selector */}
      <Select value={rule.field} onValueChange={(v) => onUpdate({ field: v as FilterField })}>
        <SelectTrigger className="h-8 w-32 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FILTER_FIELDS.map(f => (
            <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Operator selector */}
      <Select value={rule.operator} onValueChange={(v) => onUpdate({ operator: v as FilterOperator })}>
        <SelectTrigger className="h-8 w-32 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {operators.map(op => (
            <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Value input */}
      {needsValue && (
        <>
          {fieldConfig.type === 'text' ? (
            <Input
              value={(rule.value as string) || ''}
              onChange={(e) => onUpdate({ value: e.target.value })}
              placeholder="Valor..."
              className="h-8 flex-1 text-xs"
            />
          ) : fieldConfig.type === 'date' ? (
            <Input
              type="date"
              value={(rule.value as string) || ''}
              onChange={(e) => onUpdate({ value: e.target.value })}
              className="h-8 flex-1 text-xs"
            />
          ) : fieldConfig.type === 'multiselect' ? (
            <MultiSelectValue
              options={options}
              value={(rule.value as string[]) || []}
              onChange={(v) => onUpdate({ value: v })}
            />
          ) : (
            <Select 
              value={(rule.value as string) || ''} 
              onValueChange={(v) => onUpdate({ value: v })}
            >
              <SelectTrigger className="h-8 flex-1 text-xs">
                <SelectValue placeholder="Seleccionar..." />
              </SelectTrigger>
              <SelectContent>
                {options.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className={opt.color}>{opt.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </>
      )}

      {!needsValue && <div className="flex-1" />}

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

// ── Multi Select Value ────────────────────────────────────────────────────────

function MultiSelectValue({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string; color?: string }[]
  value: string[]
  onChange: (value: string[]) => void
}) {
  const toggleOption = (optValue: string) => {
    if (value.includes(optValue)) {
      onChange(value.filter(v => v !== optValue))
    } else {
      onChange([...value, optValue])
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-8 flex-1 justify-start text-xs font-normal">
          {value.length === 0 ? (
            <span className="text-muted-foreground">Seleccionar...</span>
          ) : (
            <div className="flex gap-1 flex-wrap">
              {value.slice(0, 2).map(v => {
                const opt = options.find(o => o.value === v)
                return (
                  <Badge key={v} variant="secondary" className="text-xs h-5">
                    {opt?.label}
                  </Badge>
                )
              })}
              {value.length > 2 && (
                <Badge variant="secondary" className="text-xs h-5">
                  +{value.length - 2}
                </Badge>
              )}
            </div>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="start">
        <div className="space-y-1">
          {options.map(opt => (
            <div
              key={opt.value}
              className={cn(
                'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm',
                value.includes(opt.value) ? 'bg-primary/10' : 'hover:bg-muted'
              )}
              onClick={() => toggleOption(opt.value)}
            >
              <div className={cn(
                'h-4 w-4 rounded border flex items-center justify-center',
                value.includes(opt.value) && 'bg-primary border-primary'
              )}>
                {value.includes(opt.value) && (
                  <svg className="h-3 w-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className={opt.color}>{opt.label}</span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
