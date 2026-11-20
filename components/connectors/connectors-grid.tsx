'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { createClient } from '@/lib/supabase/client'
import { CONNECTORS, CONNECTOR_BY_ID, connectorAnchor, type ConnectorDefinition, type ConnectorId, type ConnectorStatus } from '@/lib/connectors/catalog'
import { cn } from '@/lib/utils'
import { CredentialsDialog } from './credentials-dialog'

const CONNECTED_MESSAGES: Record<string, ConnectorId> = {
  google: 'google_ads',
  google_ads: 'google_ads',
  google_analytics: 'google_analytics',
  google_sheets: 'google_sheets',
  google_calendar: 'google_calendar',
  google_docs: 'google_docs',
  meta: 'meta_ads',
}

const ERROR_MESSAGES: Record<string, string> = {
  oauth_error: 'Se canceló la autorización de Google.',
  no_code: 'Google no devolvió el código de autorización. Volvé a intentar.',
  token_error: 'Google no devolvió un token de acceso. Volvé a intentar.',
  not_authenticated: 'Tu sesión venció. Iniciá sesión y volvé a conectar.',
  db_error: 'No se pudo guardar la conexión.',
  config_error: 'Falta configurar las credenciales de Google en el servidor.',
  meta_denied: 'Se canceló la autorización de Meta.',
  meta_state: 'La autorización de Meta expiró. Volvé a intentar.',
  google_docs_scope: 'Google no otorgó acceso a Docs. Revisá que los permisos de Docs y Drive estén habilitados en Google Cloud.',
  google_docs_denied: 'Se canceló la autorización de Google Docs.',
}

const dateFormatter = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })

type Notice = { type: 'success' | 'error'; message: string }

export function ConnectorsGrid({ statuses }: { statuses: ConnectorStatus[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [notice, setNotice] = useState<Notice | null>(null)
  const [pending, setPending] = useState<ConnectorId | null>(null)
  const [confirming, setConfirming] = useState<ConnectorDefinition | null>(null)
  const [editing, setEditing] = useState<ConnectorDefinition | null>(null)
  const statusById = new Map(statuses.map((status) => [status.id, status]))

  useEffect(() => {
    const connected = searchParams.get('connected')
    const error = searchParams.get('error') ?? (searchParams.get('ga_error') ? 'oauth_error' : null)
    const discord = searchParams.get('discord')
    if (!connected && !error && !discord) return
    if (connected && CONNECTED_MESSAGES[connected]) setNotice({ type: 'success', message: `${CONNECTOR_BY_ID[CONNECTED_MESSAGES[connected]].name} quedó conectado con tu cuenta.` })
    else if (discord === 'connected') setNotice({ type: 'success', message: 'Discord quedó conectado con tu cuenta.' })
    else if (discord === 'error') setNotice({ type: 'error', message: 'No se pudo conectar Discord.' })
    else if (error) {
      const detail = searchParams.get('msg')
      const base = ERROR_MESSAGES[error] ?? 'No se pudo completar la conexión.'
      setNotice({ type: 'error', message: detail ? `${base} (${detail})` : base })
    }
    router.replace('/dashboard/apps', { scroll: false })
  }, [searchParams, router])

  const connect = async (connector: ConnectorDefinition) => {
    if (connector.kind === 'credentials') {
      setEditing(connector)
      return
    }
    setPending(connector.id)
    if (connector.connectPath) {
      window.location.href = connector.connectPath
      return
    }
    const { error } = await createClient().auth.signInWithOAuth({
      provider: 'discord',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/dashboard/apps`, scopes: 'identify email' },
    })
    if (error) {
      setNotice({ type: 'error', message: `No se pudo conectar Discord: ${error.message}` })
      setPending(null)
    }
  }

  const disconnect = async (connector: ConnectorDefinition) => {
    setConfirming(null)
    setPending(connector.id)
    const response = await fetch(`/api/connectors/${connector.id}`, { method: 'DELETE' })
    const payload = await response.json().catch(() => ({}))
    setPending(null)
    if (!response.ok) {
      setNotice({ type: 'error', message: payload.error ?? 'No se pudo desconectar la cuenta.' })
      return
    }
    setNotice({ type: 'success', message: `${connector.name} quedó desconectado de tu cuenta.` })
    router.refresh()
  }

  const saved = (connector: ConnectorDefinition, label: string, verified: boolean) => {
    setEditing(null)
    setNotice({ type: 'success', message: verified ? `${connector.name} quedó conectado (${label}).` : `Guardamos los datos de ${connector.name}.` })
    router.refresh()
  }

  const groups = [
    { key: 'google', title: 'Google', description: 'Cada persona conecta su propia cuenta de Google.' },
    { key: 'crm', title: 'CRM', description: 'Al conectar te pedimos los datos de acceso a la API.' },
    { key: 'hosting', title: 'Hosting, dominios y email', description: null },
    { key: 'other', title: 'Otras apps', description: null },
  ] as const

  return (
    <div className="flex flex-col gap-6">
      {notice && (
        <div role={notice.type === 'error' ? 'alert' : 'status'} className={cn('flex items-start gap-3 rounded-lg border px-4 py-3 text-sm leading-relaxed', notice.type === 'success' ? 'border-border bg-card text-foreground' : 'border-destructive/30 bg-destructive/5 text-destructive')}>
          {notice.type === 'success' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" /> : <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
          <span>{notice.message}</span>
        </div>
      )}

      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`connectors-${group.key}`} className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h3 id={`connectors-${group.key}`} className="text-sm font-semibold text-foreground">{group.title}</h3>
            {group.description && <p className="text-sm text-muted-foreground">{group.description}</p>}
          </div>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {CONNECTORS.filter((connector) => connector.group === group.key).map((connector) => (
              <ConnectorCard
                key={connector.id}
                connector={connector}
                status={statusById.get(connector.id)}
                pending={pending === connector.id}
                onConnect={() => connect(connector)}
                onDisconnect={() => setConfirming(connector)}
              />
            ))}
          </ul>
        </section>
      ))}

      <CredentialsDialog connector={editing} onClose={() => setEditing(null)} onSaved={saved} />

      <AlertDialog open={Boolean(confirming)} onOpenChange={(open) => { if (!open) setConfirming(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{`¿Desconectar ${confirming?.name ?? ''}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              Se elimina solo tu conexión. Las de tus compañeros siguen funcionando. {confirming?.fallbackLabel ?? 'Vas a dejar de ver los datos de tu cuenta hasta que la vuelvas a conectar.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirming && disconnect(confirming)}>Desconectar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ConnectorCard({ connector, status, pending, onConnect, onDisconnect }: { connector: ConnectorDefinition; status?: ConnectorStatus; pending: boolean; onConnect: () => void; onDisconnect: () => void }) {
  const connected = Boolean(status?.connected)
  const expired = Boolean(status?.expired)
  const unverified = connected && status?.verified === false
  const statusLabel = !connected ? 'Sin conectar' : expired ? 'Vencido' : unverified ? 'Guardado' : 'Conectado'

  return (
    <li id={connectorAnchor(connector.id)} className="flex scroll-mt-24 flex-col gap-4 rounded-xl border border-border bg-card p-4 target:ring-2 target:ring-primary/40">
      <div className="flex items-start gap-3">
        <div className="flex shrink-0 -space-x-2">
          {connector.logos.map((logo) => (
            <span key={logo} className="flex size-10 items-center justify-center rounded-lg border border-border bg-card">
              <img src={logo} alt="" className="size-6 object-contain" />
            </span>
          ))}
          {!connector.logos.length && connector.monogram && (
            <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-lg border border-border bg-card font-mono text-xs font-bold tracking-tight" style={{ color: connector.monogram.color }}>
              {connector.monogram.text}
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <h4 className="truncate text-sm font-semibold text-foreground">{connector.name}</h4>
            <span className={cn('inline-flex shrink-0 items-center gap-1.5 text-xs font-medium', connected && !expired ? 'text-foreground' : expired ? 'text-destructive' : 'text-muted-foreground')}>
              <span aria-hidden="true" className={cn('size-1.5 rounded-full', connected && !expired ? 'bg-primary' : expired ? 'bg-destructive' : 'bg-muted-foreground/40')} />
              {statusLabel}
            </span>
          </div>
          <p className="text-pretty text-sm leading-relaxed text-muted-foreground">{connector.description}</p>
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-3 border-t border-border pt-3">
        <p className="min-h-5 truncate text-xs text-muted-foreground">
          {connected
            ? <>{connector.kind === 'credentials' ? '' : 'Como '}<span className="font-medium text-foreground">{status?.email ?? 'tu cuenta'}</span>{unverified ? ' · sin prueba automática' : ''}{status?.connectedAt ? ` · desde ${dateFormatter.format(new Date(status.connectedAt))}` : ''}</>
            : connector.fallbackLabel ?? 'Conectá tu cuenta para usarlo.'}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant={connected && !expired ? 'outline' : 'default'} onClick={onConnect} disabled={pending}>
            {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
            {!connected ? 'Conectar' : expired ? 'Reconectar' : connector.kind === 'credentials' ? 'Editar datos' : 'Cambiar cuenta'}
          </Button>
          {connected && connector.platform && (
            <Button type="button" size="sm" variant="ghost" className="text-muted-foreground" onClick={onDisconnect} disabled={pending}>
              Desconectar
            </Button>
          )}
        </div>
      </div>
    </li>
  )
}
