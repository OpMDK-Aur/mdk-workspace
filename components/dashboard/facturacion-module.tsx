'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Minus,
  Receipt,
  X,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

export interface FacturacionRow {
  id: string
  cliente_id: string | null
  cliente_nombre_raw: string | null
  unidad_de_negocio_id: string | null
  tipo_fee: string
  concepto: string
  monto_sin_iva: number | null
  monto_con_iva: number | null
  estado_emision: string
  estado_cobro: string
  tipo_cliente: string
  mes: number
  anio: number
  clientes: { nombre_del_negocio: string } | null
  unidad_de_negocio: { nombre: string } | null
}

interface FacturacionModuleProps {
  rows: FacturacionRow[]
}

// ── Constants & helpers ────────────────────────────────────────────────────────

const ACCENT = '#7F77DD'

const MONTH_NAMES = [
  '', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
]

function formatAmount(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function clienteName(r: FacturacionRow): string {
  return r.clientes?.nombre_del_negocio || r.cliente_nombre_raw || 'Sin cliente'
}

function unidadName(r: FacturacionRow): string {
  return r.unidad_de_negocio?.nombre || 'Sin unidad'
}

// Normalize unidad de negocio into one of the known buckets for coloring
function unidadColor(unidad: string): string {
  const u = unidad.toLowerCase()
  if (u.includes('mdk')) return ACCENT
  if (u.includes('aurelia')) return '#E8822E'
  if (u.includes('consult')) return '#6B7280'
  return '#6B7280'
}

function variation(current: number, previous: number): number | null {
  if (previous === 0 || previous === undefined) return null
  return ((current - previous) / previous) * 100
}

// ── Variation badge ──────────────────────────────────────────────────────────

function VariationBadge({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" />
        n/a
      </span>
    )
  }
  const rounded = Math.round(value * 10) / 10
  if (Math.abs(rounded) < 0.05) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" />
        0%
      </span>
    )
  }
  const up = rounded > 0
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium',
        up
          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
          : 'bg-red-500/15 text-red-600 dark:text-red-400',
      )}
    >
      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {up ? '+' : ''}
      {rounded}%
    </span>
  )
}

// ── Estado cobro badge ─────────────────────────────────────────────────────────

function EstadoCobroBadge({ estado }: { estado: string }) {
  const e = estado.toUpperCase()
  const styles: Record<string, string> = {
    COBRADA: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    PENDIENTE: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20',
    'COMPROMISO DE PAGO': 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20',
  }
  return (
    <Badge variant="outline" className={cn('font-medium', styles[e] ?? 'bg-muted text-muted-foreground')}>
      {estado}
    </Badge>
  )
}

// ── Estado emision badge ───────────────────────────────────────────────────────

function EstadoEmisionBadge({ estado }: { estado: string }) {
  const e = estado.toUpperCase()
  const isEmitida = e === 'EMITIDA'
  return (
    <Badge
      variant="outline"
      className={cn(
        'font-medium',
        isEmitida
          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
          : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20',
      )}
    >
      {estado}
    </Badge>
  )
}

// ── Unidad badge ───────────────────────────────────────────────────────────────

function UnidadBadge({ unidad }: { unidad: string }) {
  const color = unidadColor(unidad)
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${color}22`, color }}
    >
      {unidad}
    </span>
  )
}

// ── Main module ────────────────────────────────────────────────────────────────

export function FacturacionModule({ rows }: FacturacionModuleProps) {
  const years = useMemo(() => {
    const set = new Set(rows.map((r) => r.anio))
    return Array.from(set).sort((a, b) => b - a)
  }, [rows])

  const defaultYear = years.includes(2026) ? 2026 : years[0] ?? 2026
  const [year, setYear] = useState<number>(defaultYear)

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${ACCENT}22`, color: ACCENT }}
        >
          <Receipt className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Facturación</h1>
          <p className="text-sm text-muted-foreground">
            Resumen y detalle por cliente y unidad de negocio
          </p>
        </div>
      </div>

      <Tabs defaultValue="resumen" className="w-full">
        <TabsList>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="detalle">Detalle</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="mt-6">
          <ResumenTab rows={rows} year={year} setYear={setYear} years={years} />
        </TabsContent>

        <TabsContent value="detalle" className="mt-6">
          <DetalleTab rows={rows} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ── Resumen tab ──────────────────────────────────────────────────────────────

function ResumenTab({
  rows,
  year,
  setYear,
  years,
}: {
  rows: FacturacionRow[]
  year: number
  setYear: (y: number) => void
  years: number[]
}) {
  const yearRows = useMemo(() => rows.filter((r) => r.anio === year), [rows, year])

  const months = useMemo(() => {
    const set = new Set(yearRows.map((r) => r.mes))
    return Array.from(set).sort((a, b) => a - b)
  }, [yearRows])

  // Totals per month + breakdown per unidad
  const monthData = useMemo(() => {
    return months.map((m) => {
      const monthRows = yearRows.filter((r) => r.mes === m)
      const total = monthRows.reduce((s, r) => s + (r.monto_sin_iva ?? 0), 0)
      const byUnidad: Record<string, number> = {}
      for (const r of monthRows) {
        const u = unidadName(r)
        byUnidad[u] = (byUnidad[u] ?? 0) + (r.monto_sin_iva ?? 0)
      }
      return { mes: m, total, byUnidad }
    })
  }, [months, yearRows])

  // Per-client matrix
  const [sortBy, setSortBy] = useState<'nombre' | 'variacion'>('nombre')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const clientMatrix = useMemo(() => {
    const map = new Map<string, { cliente: string; perMonth: Record<number, number> }>()
    for (const r of yearRows) {
      const name = clienteName(r)
      if (!map.has(name)) map.set(name, { cliente: name, perMonth: {} })
      const entry = map.get(name)!
      entry.perMonth[r.mes] = (entry.perMonth[r.mes] ?? 0) + (r.monto_sin_iva ?? 0)
    }
    const list = Array.from(map.values()).map((entry) => {
      const last = months[months.length - 1]
      const prev = months[months.length - 2]
      const lastVal = last !== undefined ? entry.perMonth[last] ?? 0 : 0
      const prevVal = prev !== undefined ? entry.perMonth[prev] ?? 0 : 0
      return { ...entry, varValue: variation(lastVal, prevVal) }
    })
    list.sort((a, b) => {
      let cmp = 0
      if (sortBy === 'nombre') {
        cmp = a.cliente.localeCompare(b.cliente)
      } else {
        const av = a.varValue ?? -Infinity
        const bv = b.varValue ?? -Infinity
        cmp = av - bv
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [yearRows, months, sortBy, sortDir])

  function toggleSort(col: 'nombre' | 'variacion') {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(col)
      setSortDir(col === 'nombre' ? 'asc' : 'desc')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          Totales mensuales (sin IVA)
        </h2>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Month cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {monthData.map((md, idx) => {
          const prev = idx > 0 ? monthData[idx - 1].total : undefined
          const varValue = prev !== undefined ? variation(md.total, prev) : null
          return (
            <Card key={md.mes} className="border-border/60">
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">
                    {MONTH_NAMES[md.mes]} {year}
                  </span>
                  <VariationBadge value={varValue} />
                </div>
                <span className="text-2xl font-semibold text-foreground">
                  {formatAmount(md.total)}
                </span>
                <div className="flex flex-col gap-1.5 border-t border-border/60 pt-3">
                  {Object.entries(md.byUnidad)
                    .sort((a, b) => b[1] - a[1])
                    .map(([unidad, amount]) => (
                      <div key={unidad} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: unidadColor(unidad) }}
                          />
                          {unidad}
                        </span>
                        <span className="font-medium text-foreground">
                          {formatAmount(amount)}
                        </span>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )
        })}
        {monthData.length === 0 && (
          <p className="text-sm text-muted-foreground">No hay datos para {year}.</p>
        )}
      </div>

      {/* Per-client table */}
      <Card className="border-border/60">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-card">
                    <button
                      onClick={() => toggleSort('nombre')}
                      className="inline-flex items-center gap-1 font-medium hover:text-foreground"
                    >
                      Cliente
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  {months.map((m) => (
                    <TableHead key={m} className="text-right">
                      {MONTH_NAMES[m]}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">
                    <button
                      onClick={() => toggleSort('variacion')}
                      className="inline-flex items-center gap-1 font-medium hover:text-foreground"
                    >
                      Variación
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientMatrix.map((c) => (
                  <TableRow key={c.cliente}>
                    <TableCell className="sticky left-0 bg-card font-medium">
                      {c.cliente}
                    </TableCell>
                    {months.map((m) => (
                      <TableCell key={m} className="text-right tabular-nums">
                        {c.perMonth[m] ? formatAmount(c.perMonth[m]) : '—'}
                      </TableCell>
                    ))}
                    <TableCell className="text-right">
                      <VariationBadge value={c.varValue} />
                    </TableCell>
                  </TableRow>
                ))}
                {clientMatrix.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={months.length + 2} className="text-center text-muted-foreground">
                      No hay datos para {year}.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Detalle tab ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 25

function DetalleTab({ rows }: { rows: FacturacionRow[] }) {
  const allMonths = useMemo(() => {
    const set = new Set(rows.map((r) => r.mes))
    return Array.from(set).sort((a, b) => a - b)
  }, [rows])

  const allUnidades = useMemo(() => {
    const set = new Set(rows.map((r) => unidadName(r)))
    return Array.from(set).sort()
  }, [rows])

  const allEstadosCobro = useMemo(() => {
    const set = new Set(rows.map((r) => r.estado_cobro))
    return Array.from(set).sort()
  }, [rows])

  const allClientes = useMemo(() => {
    const set = new Set(rows.map((r) => clienteName(r)))
    return Array.from(set).sort()
  }, [rows])

  const [selectedMonths, setSelectedMonths] = useState<number[]>([])
  const [unidad, setUnidad] = useState<string>('all')
  const [estadoCobro, setEstadoCobro] = useState<string>('all')
  const [cliente, setCliente] = useState<string>('all')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (selectedMonths.length > 0 && !selectedMonths.includes(r.mes)) return false
      if (unidad !== 'all' && unidadName(r) !== unidad) return false
      if (estadoCobro !== 'all' && r.estado_cobro !== estadoCobro) return false
      if (cliente !== 'all' && clienteName(r) !== cliente) return false
      return true
    })
  }, [rows, selectedMonths, unidad, estadoCobro, cliente])

  const totalSinIva = useMemo(
    () => filtered.reduce((s, r) => s + (r.monto_sin_iva ?? 0), 0),
    [filtered],
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const hasFilters =
    selectedMonths.length > 0 || unidad !== 'all' || estadoCobro !== 'all' || cliente !== 'all'

  function clearFilters() {
    setSelectedMonths([])
    setUnidad('all')
    setEstadoCobro('all')
    setCliente('all')
    setPage(1)
  }

  function toggleMonth(m: number) {
    setPage(1)
    setSelectedMonths((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m],
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Multi-select months */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="justify-between gap-2">
              {selectedMonths.length === 0
                ? 'Meses'
                : `${selectedMonths.length} mes(es)`}
              <ChevronsUpDown className="h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="start">
            <div className="flex flex-col gap-1">
              {allMonths.map((m) => (
                <button
                  key={m}
                  onClick={() => toggleMonth(m)}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                >
                  {MONTH_NAMES[m]}
                  {selectedMonths.includes(m) && (
                    <Check className="h-4 w-4" style={{ color: ACCENT }} />
                  )}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Unidad */}
        <Select
          value={unidad}
          onValueChange={(v) => {
            setUnidad(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Unidad de negocio" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las unidades</SelectItem>
            {allUnidades.map((u) => (
              <SelectItem key={u} value={u}>
                {u}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Estado cobro */}
        <Select
          value={estadoCobro}
          onValueChange={(v) => {
            setEstadoCobro(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Estado de cobro" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {allEstadosCobro.map((e) => (
              <SelectItem key={e} value={e}>
                {e}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Cliente searchable */}
        <ClienteCombobox
          clientes={allClientes}
          value={cliente}
          onChange={(v) => {
            setCliente(v)
            setPage(1)
          }}
        />

        {hasFilters && (
          <Button variant="ghost" onClick={clearFilters} className="gap-1.5 text-muted-foreground">
            <X className="h-4 w-4" />
            Limpiar
          </Button>
        )}
      </div>

      {/* Table */}
      <Card className="border-border/60">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead>Tipo fee</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead className="text-right">Monto s/IVA</TableHead>
                  <TableHead className="text-right">Monto c/IVA</TableHead>
                  <TableHead>Emisión</TableHead>
                  <TableHead>Cobro</TableHead>
                  <TableHead className="text-right">Mes/Año</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{clienteName(r)}</TableCell>
                    <TableCell>
                      <UnidadBadge unidad={unidadName(r)} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.tipo_fee}</TableCell>
                    <TableCell className="max-w-xs truncate" title={r.concepto}>
                      {r.concepto}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatAmount(r.monto_sin_iva ?? 0)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatAmount(r.monto_con_iva ?? 0)}
                    </TableCell>
                    <TableCell>
                      <EstadoEmisionBadge estado={r.estado_emision} />
                    </TableCell>
                    <TableCell>
                      <EstadoCobroBadge estado={r.estado_cobro} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {MONTH_NAMES[r.mes]}/{r.anio}
                    </TableCell>
                  </TableRow>
                ))}
                {pageRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                      No hay registros con los filtros seleccionados.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Footer */}
          <div className="flex flex-col gap-3 border-t border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span>
                <span className="font-medium text-foreground">{filtered.length}</span> registros
              </span>
              <span>
                Total s/IVA:{' '}
                <span className="font-medium text-foreground">{formatAmount(totalSinIva)}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Página {currentPage} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Cliente searchable combobox ────────────────────────────────────────────────

function ClienteCombobox({
  clientes,
  value,
  onChange,
}: {
  clientes: string[]
  value: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-56 justify-between gap-2">
          <span className="truncate">{value === 'all' ? 'Todos los clientes' : value}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar cliente..." />
          <CommandList>
            <CommandEmpty>Sin resultados.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="all"
                onSelect={() => {
                  onChange('all')
                  setOpen(false)
                }}
              >
                <Check
                  className={cn('mr-2 h-4 w-4', value === 'all' ? 'opacity-100' : 'opacity-0')}
                  style={{ color: ACCENT }}
                />
                Todos los clientes
              </CommandItem>
              {clientes.map((c) => (
                <CommandItem
                  key={c}
                  value={c}
                  onSelect={() => {
                    onChange(c)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn('mr-2 h-4 w-4', value === c ? 'opacity-100' : 'opacity-0')}
                    style={{ color: ACCENT }}
                  />
                  {c}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
