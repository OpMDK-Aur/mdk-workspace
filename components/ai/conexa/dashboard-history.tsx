'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { Download, FileText, Search, Trash2, X } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { buildClaudeDesignPrompt, buildDashboardSnapshotHtml } from '@/lib/conexa/dashboard-snapshot-html'

type Report = { id: string; client_id: string; dashboard_id: string | null; name: string; config: Record<string, unknown>; data_snapshot: Parameters<typeof buildDashboardSnapshotHtml>[0]['data_snapshot']; period_start: string | null; period_end: string | null; created_at: string }
const fetchReports = async (url: string) => { const response = await fetch(url); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error ?? 'No se pudo cargar el histórico.'); return (payload.reports ?? []) as Report[] }
const saveDownload = (name: string, content: string, type: string) => { const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000) }

export function DashboardHistory({ clientId }: { clientId: string | null }) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Report | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const url = clientId ? `/api/conexa/dashboard/reports?clientId=${encodeURIComponent(clientId)}` : null
  const { data: reports, error, mutate } = useSWR<Report[]>(url, fetchReports, { revalidateOnFocus: false })
  const visible = (reports ?? []).filter((report) => report.name.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es')))

  useEffect(() => {
    const refresh = () => { void mutate() }
    window.addEventListener('conexa-dashboard-report-saved', refresh)
    return () => window.removeEventListener('conexa-dashboard-report-saved', refresh)
  }, [mutate])

  const remove = async (report: Report) => {
    if (!window.confirm(`¿Eliminar el informe “${report.name}”? Esta acción no se puede deshacer.`)) return
    setRemoving(report.id)
    try {
      const response = await fetch('/api/conexa/dashboard/reports', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: report.id, clientId: report.client_id }) })
      if (!response.ok) throw new Error('No se pudo eliminar el informe.')
      await mutate((current) => (current ?? []).filter((item) => item.id !== report.id), { revalidate: false })
      if (selected?.id === report.id) setSelected(null)
    } catch {
      window.alert('No se pudo eliminar el informe. Verificá la conexión e intentá de nuevo.')
    } finally { setRemoving(null) }
  }

  const openPdf = (report: Report) => {
    const popup = window.open('', '_blank')
    if (!popup) { window.alert('El navegador bloqueó la ventana de impresión.'); return }
    popup.opener = null
    popup.document.write(buildDashboardSnapshotHtml(report).replace('</body>', '<script>window.onload=()=>window.print()</script></body>'))
    popup.document.close()
  }

  return <section className="flex min-h-0 flex-1 flex-col bg-white" aria-label="Histórico de informes">
    <header className="border-b border-[#eeeeec] p-4"><p className="text-sm font-semibold text-[#222]">Informes guardados</p><label className="relative mt-3 block"><Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#888]" aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Buscar informe guardado" placeholder="Buscar informe..." className="h-9 w-full rounded-md border border-[#e7e7e5] pl-8 pr-3 text-xs outline-none focus:border-[#F97316]" /></label></header>
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      {!clientId ? <p className="px-2 py-8 text-center text-xs text-[#888]">Seleccioná un cliente para ver los informes.</p> : !reports && !error ? <div role="status" aria-label="Cargando informes" className="flex flex-col gap-3 p-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div> : error ? <p role="alert" className="px-2 py-8 text-center text-xs text-[#777]">No se pudo cargar el histórico. Verificá que las tablas del Dashboard estén instaladas.</p> : visible.length === 0 ? <p className="px-2 py-10 text-center text-xs leading-5 text-[#888]">Todavía no guardaste informes{search ? ' con ese nombre' : ''}.</p> : <ul className="flex flex-col gap-2">{visible.map((report) => <li key={report.id} className="rounded-lg border border-[#ececea] p-3"><div className="flex items-start gap-2"><FileText aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[#F97316]" /><div className="min-w-0 flex-1"><button type="button" onClick={() => setSelected(report)} className="block w-full truncate text-left text-xs font-semibold text-[#333] hover:text-[#F97316]">{report.name}</button><p className="mt-1 text-[10px] text-[#888]">{new Date(report.created_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</p></div><button type="button" onClick={() => void remove(report)} disabled={removing === report.id} aria-label={`Eliminar ${report.name}`} className="rounded p-1 text-[#999] hover:bg-[#f5f5f4] hover:text-[#b42318] disabled:opacity-50"><Trash2 className="size-3.5" /></button></div><div className="mt-3 flex flex-wrap gap-1.5"><button type="button" onClick={() => setSelected(report)} className="rounded-md border border-[#e7e7e5] px-2 py-1 text-[10px] font-medium hover:bg-[#f7f7f6]">Preview</button><button type="button" onClick={() => saveDownload(`${report.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.html`, buildDashboardSnapshotHtml(report), 'text/html;charset=utf-8')} className="inline-flex items-center gap-1 rounded-md border border-[#e7e7e5] px-2 py-1 text-[10px] font-medium hover:bg-[#f7f7f6]"><Download className="size-3" />HTML</button><button type="button" onClick={() => openPdf(report)} className="rounded-md border border-[#e7e7e5] px-2 py-1 text-[10px] font-medium hover:bg-[#f7f7f6]">PDF</button><button type="button" onClick={() => saveDownload(`${report.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-claude-design.txt`, buildClaudeDesignPrompt(report), 'text/plain;charset=utf-8')} className="rounded-md border border-[#e7e7e5] px-2 py-1 text-[10px] font-medium hover:bg-[#f7f7f6]">Prompt Claude Design</button></div></li>)}</ul>}
    </div>
    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="dashboard-report-preview-title"><div className="flex h-[min(90vh,900px)] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"><header className="flex items-center justify-between border-b border-[#eee] px-4 py-3"><h2 id="dashboard-report-preview-title" className="truncate text-sm font-semibold">{selected.name}</h2><button type="button" onClick={() => setSelected(null)} aria-label="Cerrar preview" className="rounded-md p-1.5 hover:bg-[#f4f4f3]"><X className="size-4" /></button></header><iframe title={`Vista previa de ${selected.name}`} srcDoc={buildDashboardSnapshotHtml(selected)} className="min-h-0 flex-1 border-0" /></div></div>}
  </section>
}
