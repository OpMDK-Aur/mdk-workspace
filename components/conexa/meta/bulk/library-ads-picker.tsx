'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { Check, Library, Play, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fetchLibraryAds } from '@/lib/bulk/api'
import { useBulkStore } from '@/lib/bulk/store'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function LibraryAdsPicker({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const addLibraryAds = useBulkStore((state) => state.addLibraryAds)
  const { data: ads = [], error, isLoading } = useSWR(open && clientId ? ['bulk-library', clientId] : null, () => fetchLibraryAds(clientId), { revalidateOnFocus: false })

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return ads
    return ads.filter((ad) => [ad.name, ad.campaignName, ad.primaryText, ad.headline].some((value) => value.toLowerCase().includes(term)))
  }, [ads, query])

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function confirm() {
    addLibraryAds(ads.filter((ad) => selected.has(ad.id)))
    setSelected(new Set())
    setOpen(false)
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e5e0] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#141414] hover:border-[#5B5FE8] hover:text-[#5B5FE8]">
        <Library className="size-3.5" aria-hidden="true" />
        Elegir de anuncios de la cuenta
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl bg-white text-[#141414]">
          <DialogHeader>
            <DialogTitle>Anuncios de la cuenta</DialogTitle>
            <DialogDescription className="text-[#777]">Se reutiliza la pieza y se traen el texto principal y el título. Después podés editarlos.</DialogDescription>
          </DialogHeader>
          <label className="flex items-center gap-2 rounded-lg border border-[#e5e5e0] px-3 py-2">
            <Search className="size-4 text-[#999]" aria-hidden="true" />
            <span className="sr-only">Buscar anuncios</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por anuncio, campaña o texto" className="w-full bg-transparent text-[13px] outline-none placeholder:text-[#aaa]" />
          </label>
          <div className="max-h-[420px] overflow-y-auto">
            {isLoading && <p className="py-8 text-center text-[12px] text-[#777]">Cargando anuncios…</p>}
            {error && <p className="py-8 text-center text-[12px] text-[#c0392b]">{error.message}</p>}
            {!isLoading && !error && !filtered.length && <p className="py-8 text-center text-[12px] text-[#777]">No hay anuncios con imagen o video para mostrar.</p>}
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {filtered.map((ad) => {
                const isSelected = selected.has(ad.id)
                return (
                  <li key={ad.id}>
                    <button type="button" onClick={() => toggle(ad.id)} aria-pressed={isSelected} className={cn('flex w-full gap-3 rounded-lg border p-2 text-left transition-colors', isSelected ? 'border-[#5B5FE8] bg-[#5B5FE8]/5' : 'border-[#ececea] hover:border-[#cfcfca]')}>
                      <span className="relative size-16 shrink-0 overflow-hidden rounded-md bg-[#f2f2ef]">
                        {ad.thumbnail && <img src={ad.thumbnail} alt="" className="size-full object-cover" />}
                        {ad.kind === 'video' && <Play className="absolute bottom-1 left-1 size-3.5 fill-white text-white" aria-label="Video" />}
                        {isSelected && <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-[#5B5FE8]"><Check className="size-3 text-white" aria-hidden="true" /></span>}
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate text-[12px] font-semibold">{ad.name}</span>
                        <span className="truncate text-[10.5px] text-[#999]">{ad.campaignName || 'Sin campaña'}{ad.status ? ` · ${ad.status.toLowerCase()}` : ''}</span>
                        <span className="line-clamp-2 text-[11px] leading-snug text-[#555]">{ad.headline ? `${ad.headline} — ` : ''}{ad.primaryText || 'Sin texto principal'}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
          <DialogFooter>
            <button type="button" onClick={confirm} disabled={!selected.size} className="rounded-full bg-[#141414] px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-40">
              {selected.size ? `Sumar ${selected.size} ${selected.size === 1 ? 'anuncio' : 'anuncios'}` : 'Elegí anuncios'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
