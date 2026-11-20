'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { ChevronRight, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { CONEXA_NEW_UNTIL } from '@/lib/conexa/views'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import {
  CONEXA_CLIENT_LINKS,
  CONEXA_PATH,
  CONEXA_PLATFORM_LINKS,
  CONEXA_VIEW_PARAM,
  CONEXA_VIEWS,
  CONEXA_WORK_LINKS,
  DEFAULT_CONEXA_VIEW,
  conexaViewHref,
  type ConexaViewSlug,
} from '@/lib/conexa/views'

const GROUPS: Array<{ label: string; links: ConexaViewSlug[] }> = [
  { label: 'Trabajo', links: CONEXA_WORK_LINKS },
  { label: 'Plataformas', links: CONEXA_PLATFORM_LINKS },
  { label: 'Cliente', links: CONEXA_CLIENT_LINKS },
]

/** Conexa en el sidebar expandido: el acceso principal y sus vistas como sub-opciones. */
export function ConexaNavGroup() {
  const pathname = usePathname()
  const inConexa = pathname === CONEXA_PATH || pathname.startsWith(`${CONEXA_PATH}/`)
  const [open, setOpen] = useState(inConexa)
  // Al entrar a Conexa (por el link o desde otra pantalla) se despliegan sus opciones.
  useEffect(() => { if (inConexa) setOpen(true) }, [inConexa])

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center">
        <Link
          href={CONEXA_PATH}
          onClick={() => setOpen(true)}
          aria-current={inConexa ? 'page' : undefined}
          className={cn(
            'flex flex-1 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            inConexa ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted',
          )}
        >
          <Sparkles className="h-4 w-4" />
          <span>Conexa</span>
          {new Date() < new Date(CONEXA_NEW_UNTIL) && <Badge className="ml-auto h-5 px-1.5 text-[10px] font-semibold uppercase tracking-wider bg-primary text-primary-foreground">Nuevo</Badge>}
        </Link>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={open ? 'Ocultar opciones de Conexa' : 'Ver opciones de Conexa'}>
            <ChevronRight className={cn('h-4 w-4 transition-transform', open && 'rotate-90')} />
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="mt-1 flex flex-col gap-3">
        <Suspense fallback={<ConexaLinks activeSlug={null} />}>
          <ConexaLinksWithActive inConexa={inConexa} />
        </Suspense>
      </CollapsibleContent>
    </Collapsible>
  )
}

function ConexaLinksWithActive({ inConexa }: { inConexa: boolean }) {
  const searchParams = useSearchParams()
  const slug = searchParams.get(CONEXA_VIEW_PARAM)
  const activeSlug = inConexa ? ((slug && slug in CONEXA_VIEWS ? slug : DEFAULT_CONEXA_VIEW) as ConexaViewSlug) : null
  return <ConexaLinks activeSlug={activeSlug} />
}

function ConexaLinks({ activeSlug }: { activeSlug: ConexaViewSlug | null }) {
  return GROUPS.map((group) => (
    <div key={group.label} className="flex flex-col gap-0.5">
      <p className="pl-7 pr-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</p>
      {group.links.map((slug) => (
        <Link
          key={slug}
          href={conexaViewHref(slug)}
          aria-current={activeSlug === slug ? 'page' : undefined}
          className={cn(
            'rounded-lg py-1.5 pl-7 pr-3 text-sm transition-colors',
            activeSlug === slug ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          {CONEXA_VIEWS[slug]}
        </Link>
      ))}
    </div>
  ))
}
