'use client'

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react'
import type { DashboardRecord } from '@/components/conexa/dashboard-types'

export type DashboardColumn = {
  key: string
  label: string
  format?: 'number' | 'money' | 'percent'
  link?: boolean
  right?: boolean
}

type DashboardDataTableProps = {
  title: string
  columns: DashboardColumn[]
  rows: DashboardRecord[]
  description?: string
  emptyMessage?: string
  searchable?: boolean
  maxRows?: number
}

const numberFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const moneyFormat = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
const percentFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 })
const toNumber = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  let text = String(value ?? '').trim().replace(/[^\d,.-]/g, '')
  if (!text) return 0
  const comma = text.lastIndexOf(',')
  const dot = text.lastIndexOf('.')
  if (comma > dot) text = text.replace(/\./g, '').replace(',', '.')
  else text = text.replace(/,/g, '')
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatCell(value: unknown, format?: DashboardColumn['format']) {
  if (value === null || value === undefined || value === '') return '—'
  if (format === 'money') return moneyFormat.format(toNumber(value))
  if (format === 'percent') return `${percentFormat.format(toNumber(value))}%`
  if (format === 'number') return numberFormat.format(toNumber(value))
  return String(value)
}

export function DashboardDataTable({ title, columns, rows, description, emptyMessage = 'Sin datos para el período seleccionado.', searchable = true, maxRows }: DashboardDataTableProps) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [descending, setDescending] = useState(true)

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('es-AR')
    let result = needle ? rows.filter((row) => columns.some((column) => String(row[column.key] ?? '').toLocaleLowerCase('es-AR').includes(needle))) : [...rows]
    if (sortKey) {
      result = result.sort((left, right) => {
        const leftValue = left[sortKey]
        const rightValue = right[sortKey]
        const leftNumber = Number(leftValue)
        const rightNumber = Number(rightValue)
        const bothNumeric = leftValue !== '' && rightValue !== '' && Number.isFinite(leftNumber) && Number.isFinite(rightNumber)
        const compare = bothNumeric ? leftNumber - rightNumber : String(leftValue ?? '').localeCompare(String(rightValue ?? ''), 'es-AR', { numeric: true, sensitivity: 'base' })
        return descending ? -compare : compare
      })
    }
    return typeof maxRows === 'number' ? result.slice(0, maxRows) : result
  }, [columns, descending, maxRows, query, rows, sortKey])

  const toggleSort = (key: string) => {
    if (sortKey === key) setDescending((value) => !value)
    else { setSortKey(key); setDescending(true) }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-[#e6e6e3] bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ededeb] px-4 py-3">
        <div>
          <h3 className="text-[12px] font-semibold text-[#303030]">{title}</h3>
          {description && <p className="mt-1 text-[10px] leading-4 text-[#878787]">{description}</p>}
        </div>
        {searchable && rows.length > 0 && (
          <label className="flex h-8 items-center gap-2 rounded-lg border border-[#e6e6e3] bg-white px-2.5 text-[#777]">
            <Search className="size-3.5" aria-hidden="true" />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Buscar ${title.toLowerCase()}`} aria-label={`Buscar en ${title}`} className="w-40 bg-transparent text-[11px] text-[#333] outline-none placeholder:text-[#9b9b9b]" />
          </label>
        )}
      </header>
      {visibleRows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[11px]">
            <thead className="bg-[#fafaf8] text-[#777]">
              <tr>{columns.map((column) => (
                <th key={column.key} scope="col" aria-sort={sortKey === column.key ? descending ? 'descending' : 'ascending' : 'none'} className={`px-4 py-2.5 font-medium ${column.right ? 'text-right' : ''}`}>
                  <button type="button" onClick={() => toggleSort(column.key)} className={`inline-flex items-center gap-1 hover:text-[#5b5fe8] ${column.right ? 'ml-auto' : ''}`}>
                    {column.label}
                    {sortKey === column.key ? descending ? <ArrowDown className="size-3" aria-hidden="true" /> : <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowUpDown className="size-3 opacity-40" aria-hidden="true" />}
                  </button>
                </th>
              ))}</tr>
            </thead>
            <tbody>
              {visibleRows.map((row, rowIndex) => (
                <tr key={`${title}-${rowIndex}`} className="border-t border-[#f0f0ed] text-[#424242]">
                  {columns.map((column) => {
                    const value = row[column.key]
                    return (
                      <td key={`${rowIndex}-${column.key}`} className={`max-w-[280px] px-4 py-2.5 ${column.right ? 'text-right tabular-nums' : ''}`}>
                        {column.link ? typeof value === 'string' && /^https:\/\//.test(value) ? <a href={value} target="_blank" rel="noopener noreferrer" className="font-medium text-[#4f53d9] underline-offset-2 hover:underline">Vista previa</a> : <button type="button" disabled className="cursor-not-allowed text-[#999]">Vista previa</button> : formatCell(value, column.format)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 py-5 text-[11px] text-[#858585]">{rows.length && query ? 'No hay coincidencias con la búsqueda.' : emptyMessage}</p>
      )}
    </section>
  )
}
