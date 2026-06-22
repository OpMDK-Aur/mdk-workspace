// Platform config component - v4 (Google multi-select + MCC sub-account listing)
'use client'

import { useState, useEffect } from 'react'
import { updateClientPlatformIds } from '@/app/actions/platform-config'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Save,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Loader2,
  Link2,
  Unlink,
  ChevronDown,
  ChevronUp,
  Search,
  Map,
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import Link from 'next/link'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClientItem {
  id: string
  business_name: string
  meta_ads_account_id: string | null
  google_ads_customer_id: string | null
  crm_type: string | null
  ghl_location_id: string | null
  ghl_token: string | null
  project_manager_id?: string | null
  project_manager_name?: string | null
  account_manager_id?: string | null
  account_manager_name?: string | null
}

interface MetaAccount {
  id: string
  name: string
  status: number
  status_label: string
  currency: string
  is_active: boolean
}

interface GoogleAccount {
  id: string
  name: string
  currency: string
  status: string
  level: number
  is_active: boolean
  is_test: boolean
}

type MatchStatus =
  | 'matched'
  | 'multiple'
  | 'not_found'
  | 'manual'
  | 'saved'
  | 'idle'

interface ClientMatchResult {
  status: MatchStatus
  candidates: MetaAccount[] | GoogleAccount[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function matchScore(clientName: string, accountName: string): number {
  const clientWords = normalizeName(clientName).split(' ').filter(Boolean)
  const normAccount = normalizeName(accountName)
  if (clientWords.length === 0) return 0
  const matched = clientWords.filter(w => normAccount.includes(w))
  return matched.length / clientWords.length
}

function autoMatch(client: ClientItem, accounts: MetaAccount[]): ClientMatchResult {
  if (client.meta_ads_account_id) return { status: 'saved', candidates: [] }
  const THRESHOLD = 0.8
  const scored = accounts
    .filter(a => matchScore(client.business_name, a.name) >= THRESHOLD)
    .sort((a, b) => matchScore(client.business_name, b.name) - matchScore(client.business_name, a.name))
  if (scored.length === 0) return { status: 'not_found', candidates: [] }
  if (scored.length === 1) return { status: 'matched', candidates: scored }
  return { status: 'multiple', candidates: scored }
}

function autoMatchGoogle(client: ClientItem, accounts: GoogleAccount[]): ClientMatchResult {
  // Already saved — check if the saved IDs still exist
  if (client.google_ads_customer_id) return { status: 'saved', candidates: [] }
  const THRESHOLD = 0.8
  const scored = accounts
    .filter(a => matchScore(client.business_name, a.name) >= THRESHOLD)
    .sort((a, b) => matchScore(client.business_name, b.name) - matchScore(client.business_name, a.name))
  if (scored.length === 0) return { status: 'not_found', candidates: [] }
  if (scored.length === 1) return { status: 'matched', candidates: scored }
  return { status: 'multiple', candidates: scored }
}

/** Parse comma-separated IDs string into array */
function parseIds(val: string | null): string[] {
  if (!val) return []
  return val.split(',').map(s => s.trim()).filter(Boolean)
}

/** Serialize array of IDs into comma-separated string */
function serializeIds(ids: string[]): string {
  return ids.join(',')
}

// ---------------------------------------------------------------------------
// Sub-component: Meta multi-select with search
// ---------------------------------------------------------------------------

interface MetaMultiSelectProps {
  accounts: MetaAccount[]
  selectedIds: string[]
  matchResult: ClientMatchResult | undefined
  onChange: (ids: string[]) => void
  loading: boolean
}

function MetaMultiSelect({ accounts, selectedIds, matchResult, onChange, loading }: MetaMultiSelectProps) {
  const [expanded, setExpanded] = useState(false)
  const [search, setSearch] = useState('')

  const toggleId = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter(x => x !== id)
      : [...selectedIds, id]
    onChange(next)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Cargando cuentas de Meta...
      </div>
    )
  }

  if (accounts.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic py-1">
        Hacé clic en &quot;Cuentas Meta&quot; para cargar las cuentas publicitarias.
      </p>
    )
  }

  // Filter by search
  const searchLower = search.toLowerCase()
  const filteredAccounts = search
    ? accounts.filter(acc => 
        acc.name.toLowerCase().includes(searchLower) || 
        acc.id.includes(searchLower)
      )
    : accounts

  // Show candidates first if match found
  const displayAccounts = (matchResult?.status === 'multiple' || matchResult?.status === 'matched') && !search
    ? (matchResult.candidates as MetaAccount[])
    : filteredAccounts

  const visibleAccounts = expanded || search ? displayAccounts : displayAccounts.slice(0, 5)
  const hasMore = displayAccounts.length > 5 && !search

  return (
    <div className="space-y-2">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Buscar cuenta..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 pl-8 text-sm"
        />
      </div>

      {/* Accounts list */}
      <div className="rounded-lg border border-border bg-muted/30 divide-y divide-border overflow-hidden max-h-[280px] overflow-y-auto">
        {visibleAccounts.length === 0 ? (
          <p className="text-xs text-muted-foreground p-3 text-center">
            No se encontraron cuentas
          </p>
        ) : (
          visibleAccounts.map(acc => (
            <label
              key={acc.id}
              className={cn(
                'flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/60 transition-colors',
                selectedIds.includes(acc.id) && 'bg-primary/5'
              )}
            >
              <Checkbox
                checked={selectedIds.includes(acc.id)}
                onCheckedChange={() => toggleId(acc.id)}
                className="mt-0.5 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium leading-tight">{acc.name}</span>
                  {!acc.is_active && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-400/40">
                      {acc.status_label}
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                  ID: {acc.id} · {acc.currency}
                </p>
              </div>
            </label>
          ))
        )}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          {expanded ? (
            <><ChevronUp className="h-3 w-3" />Ver menos</>
          ) : (
            <><ChevronDown className="h-3 w-3" />Ver {displayAccounts.length - 5} más</>
          )}
        </button>
      )}

      {selectedIds.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {selectedIds.length} cuenta{selectedIds.length !== 1 ? 's' : ''} seleccionada{selectedIds.length !== 1 ? 's' : ''}
        </p>
      )}

      {matchResult?.status === 'not_found' && !search && (
        <p className="text-xs text-amber-600 flex items-center gap-1">
          <AlertCircle className="h-3 w-3 shrink-0" />
          Ninguna cuenta de Meta coincide con el nombre del cliente.
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-component: Google multi-select checkboxes with search
// ---------------------------------------------------------------------------

interface GoogleMultiSelectProps {
  accounts: GoogleAccount[]
  selectedIds: string[]
  matchResult: ClientMatchResult | undefined
  onChange: (ids: string[]) => void
  loading: boolean
}

function GoogleMultiSelect({ accounts, selectedIds, matchResult, onChange, loading }: GoogleMultiSelectProps) {
  const [expanded, setExpanded] = useState(false)
  const [search, setSearch] = useState('')

  const toggleId = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter(x => x !== id)
      : [...selectedIds, id]
    onChange(next)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Cargando cuentas del MCC...
      </div>
    )
  }

  if (accounts.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic py-1">
        Hacé clic en &quot;Cuentas Google&quot; para cargar las sub-cuentas del MCC.
      </p>
    )
  }

  // Filter by search
  const searchLower = search.toLowerCase()
  const filteredAccounts = search
    ? accounts.filter(acc => 
        acc.name.toLowerCase().includes(searchLower) || 
        acc.id.includes(searchLower)
      )
    : accounts

  // Show candidates first if match found, else filtered accounts
  const displayAccounts = (matchResult?.status === 'multiple' || matchResult?.status === 'matched') && !search
    ? (matchResult.candidates as GoogleAccount[])
    : filteredAccounts

  const visibleAccounts = expanded || search ? displayAccounts : displayAccounts.slice(0, 5)
  const hasMore = displayAccounts.length > 5 && !search

  return (
    <div className="space-y-2">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Buscar cuenta..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 pl-8 text-sm"
        />
      </div>

      {/* Accounts list */}
      <div className="rounded-lg border border-border bg-muted/30 divide-y divide-border overflow-hidden max-h-[280px] overflow-y-auto">
        {visibleAccounts.length === 0 ? (
          <p className="text-xs text-muted-foreground p-3 text-center">
            No se encontraron cuentas
          </p>
        ) : (
          visibleAccounts.map(acc => (
            <label
              key={acc.id}
              className={cn(
                'flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/60 transition-colors',
                selectedIds.includes(acc.id) && 'bg-primary/5'
              )}
            >
              <Checkbox
                checked={selectedIds.includes(acc.id)}
                onCheckedChange={() => toggleId(acc.id)}
                className="mt-0.5 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium leading-tight">{acc.name}</span>
                  {!acc.is_active && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-400/40">
                      {acc.status}
                    </Badge>
                  )}
                  {acc.is_test && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                      Test
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                  ID: {acc.id} · {acc.currency}
                </p>
              </div>
            </label>
          ))
        )}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          {expanded ? (
            <><ChevronUp className="h-3 w-3" />Ver menos</>
          ) : (
            <><ChevronDown className="h-3 w-3" />Ver {displayAccounts.length - 5} más</>
          )}
        </button>
      )}

      {selectedIds.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {selectedIds.length} cuenta{selectedIds.length !== 1 ? 's' : ''} seleccionada{selectedIds.length !== 1 ? 's' : ''}
        </p>
      )}

      {matchResult?.status === 'not_found' && !search && (
        <p className="text-xs text-amber-600 flex items-center gap-1">
          <AlertCircle className="h-3 w-3 shrink-0" />
          Ninguna cuenta de Google coincide con el nombre del cliente.
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ClientsPlatformConfigProps {
  clients: ClientItem[]
  isMaster?: boolean
}

export function ClientsPlatformConfig({ clients, isMaster = false }: ClientsPlatformConfigProps) {
  const [metaAccounts, setMetaAccounts] = useState<MetaAccount[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [accountsError, setAccountsError] = useState<string | null>(null)
  const [matchResults, setMatchResults] = useState<Record<string, ClientMatchResult>>({})

  const [googleAccounts, setGoogleAccounts] = useState<GoogleAccount[]>([])
  const [loadingGoogleAccounts, setLoadingGoogleAccounts] = useState(false)
  const [googleAccountsError, setGoogleAccountsError] = useState<string | null>(null)
  const [googleMatchResults, setGoogleMatchResults] = useState<Record<string, ClientMatchResult>>({})

  // configs: meta = single ID string, google = comma-separated IDs string, crm fields
  const [configs, setConfigs] = useState<Record<string, { meta: string; google: string; crmType: string; ghlLocationId: string; ghlToken: string }>>(() =>
    Object.fromEntries(
      clients.map(c => [
        c.id,
        {
          meta: c.meta_ads_account_id ?? '',
          google: c.google_ads_customer_id ?? '',
          crmType: c.crm_type ?? '',
          ghlLocationId: c.ghl_location_id ?? '',
          ghlToken: c.ghl_token ?? '',
        },
      ])
    )
  )
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [autoSaving, setAutoSaving] = useState(false)

  // Filters
  const [filterClientName, setFilterClientName] = useState('')
  const [filterProjectManager, setFilterProjectManager] = useState('')
  const [filterAccountManager, setFilterAccountManager] = useState('')

  useEffect(() => {
    fetchMetaAccounts()
    fetchGoogleAccounts()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchMetaAccounts() {
    setLoadingAccounts(true)
    setAccountsError(null)
    try {
      const res = await fetch('/api/ads/meta/accounts')
      const data = await res.json()
      if (data.error) { setAccountsError(data.error); setMetaAccounts([]); return }
      const accounts: MetaAccount[] = data.accounts ?? []
      setMetaAccounts(accounts)

      const results: Record<string, ClientMatchResult> = {}
      const toAutoSave: Array<{ clientId: string; metaId: string }> = []

      for (const client of clients) {
        const result = autoMatch(client, accounts)
        results[client.id] = result
        if (result.status === 'matched') {
          const metaId = result.candidates[0].id
          setConfigs(prev => ({ ...prev, [client.id]: { ...prev[client.id], meta: metaId } }))
          // Queue auto-save only if value differs from what's in DB
          if (client.meta_ads_account_id !== metaId) {
            toAutoSave.push({ clientId: client.id, metaId })
          }
        }
      }
      setMatchResults(results)

      // Auto-persist all Meta matches silently — pass undefined for Google to avoid overwriting it
      if (toAutoSave.length > 0) {
        setAutoSaving(true)
        await Promise.all(
          toAutoSave.map(({ clientId, metaId }) =>
            updateClientPlatformIds(clientId, metaId, undefined)
          )
        )
        setAutoSaving(false)
        setSaved(prev => Object.fromEntries(toAutoSave.map(({ clientId }) => [clientId, true])))
        setTimeout(() => setSaved(prev => Object.fromEntries(toAutoSave.map(({ clientId }) => [clientId, false]))), 3000)
      }
    } catch {
      setAccountsError('No se pudo conectar con la API de Meta Ads.')
    } finally {
      setLoadingAccounts(false)
    }
  }

  async function fetchGoogleAccounts() {
    setLoadingGoogleAccounts(true)
    setGoogleAccountsError(null)
    try {
      const res = await fetch('/api/ads/google/accounts')
      const data = await res.json()
      if (data.error) { setGoogleAccountsError(data.error); setGoogleAccounts([]); return }
      const accounts: GoogleAccount[] = data.accounts ?? []
      setGoogleAccounts(accounts)

      const results: Record<string, ClientMatchResult> = {}
      const toAutoSave: Array<{ clientId: string; googleIds: string[] }> = []

      for (const client of clients) {
        const result = autoMatchGoogle(client, accounts)
        results[client.id] = result
        if (result.status === 'matched') {
          const ids = (result.candidates as GoogleAccount[]).map(a => a.id)
          const serialized = serializeIds(ids)
          setConfigs(prev => ({ ...prev, [client.id]: { ...prev[client.id], google: serialized } }))
          if (client.google_ads_customer_id !== serialized) {
            toAutoSave.push({ clientId: client.id, googleIds: ids })
          }
        }
      }
      setGoogleMatchResults(results)

      if (toAutoSave.length > 0) {
        setAutoSaving(true)
        await Promise.all(
          toAutoSave.map(({ clientId, googleIds }) =>
            updateClientPlatformIds(clientId, undefined, serializeIds(googleIds))
          )
        )
        setAutoSaving(false)
        setSaved(prev => ({ ...prev, ...Object.fromEntries(toAutoSave.map(({ clientId }) => [clientId, true])) }))
        setTimeout(() => setSaved(prev => ({ ...prev, ...Object.fromEntries(toAutoSave.map(({ clientId }) => [clientId, false])) })), 3000)
      }
    } catch {
      setGoogleAccountsError('No se pudo conectar con la API de Google Ads.')
    } finally {
      setLoadingGoogleAccounts(false)
    }
  }

  async function handleSave(clientId: string) {
    setSaving(prev => ({ ...prev, [clientId]: true }))
    setErrors(prev => ({ ...prev, [clientId]: '' }))
    setSaved(prev => ({ ...prev, [clientId]: false }))

    const config = configs[clientId]
    const result = await updateClientPlatformIds(
      clientId,
      config.meta.trim() || null,
      config.google.trim() || null,
      config.crmType.trim() || null,
      config.ghlLocationId.trim() || null,
      config.ghlToken.trim() || null,
    )

    setSaving(prev => ({ ...prev, [clientId]: false }))
    if (result.error) {
      setErrors(prev => ({ ...prev, [clientId]: result.error! }))
    } else {
      setSaved(prev => ({ ...prev, [clientId]: true }))
      setMatchResults(prev => ({ ...prev, [clientId]: { status: 'saved', candidates: [] } }))
      setGoogleMatchResults(prev => ({ ...prev, [clientId]: { status: 'saved', candidates: [] } }))
      setTimeout(() => setSaved(prev => ({ ...prev, [clientId]: false })), 3000)
    }
  }

  function updateField(clientId: string, field: 'meta' | 'google' | 'crmType' | 'ghlLocationId' | 'ghlToken', value: string) {
    setConfigs(prev => ({ ...prev, [clientId]: { ...prev[clientId], [field]: value } }))
    setSaved(prev => ({ ...prev, [clientId]: false }))
    if (field === 'meta') setMatchResults(prev => ({ ...prev, [clientId]: { status: 'manual', candidates: [] } }))
    if (field === 'google') setGoogleMatchResults(prev => ({ ...prev, [clientId]: { status: 'manual', candidates: [] } }))
  }

  function handleMetaIdsChange(clientId: string, ids: string[]) {
    setConfigs(prev => ({ ...prev, [clientId]: { ...prev[clientId], meta: serializeIds(ids) } }))
    setSaved(prev => ({ ...prev, [clientId]: false }))
    setMatchResults(prev => ({ ...prev, [clientId]: { status: 'manual', candidates: [] } }))
  }

  function handleGoogleIdsChange(clientId: string, ids: string[]) {
    setConfigs(prev => ({ ...prev, [clientId]: { ...prev[clientId], google: serializeIds(ids) } }))
    setSaved(prev => ({ ...prev, [clientId]: false }))
    setGoogleMatchResults(prev => ({ ...prev, [clientId]: { status: 'manual', candidates: [] } }))
  }

  // Get unique project managers and account managers for filter dropdowns
  const projectManagers = Array.from(new Map(
    clients
      .filter(c => c.project_manager_name)
      .map(c => [c.project_manager_id, c.project_manager_name])
  ).values())
  
  const accountManagers = Array.from(new Map(
    clients
      .filter(c => c.account_manager_name)
      .map(c => [c.account_manager_id, c.account_manager_name])
  ).values())

  // Filter clients based on selected filters
  const filteredClients = clients.filter(c => {
    const matchesClient = c.business_name.toLowerCase().includes(filterClientName.toLowerCase())
    const matchesProjectManager = !filterProjectManager || c.project_manager_name?.toLowerCase().includes(filterProjectManager.toLowerCase())
    const matchesAccountManager = !filterAccountManager || c.account_manager_name?.toLowerCase().includes(filterAccountManager.toLowerCase())
    return matchesClient && matchesProjectManager && matchesAccountManager
  })

  const connectedCount = filteredClients.filter(c => configs[c.id]?.meta || configs[c.id]?.google).length
  const alertCount =
    filteredClients.filter(c => {
      const match = matchResults[c.id]
      const googleMatch = googleMatchResults[c.id]
      return match?.status === 'not_found' || match?.status === 'multiple' || googleMatch?.status === 'not_found'
    }).length

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Cliente</Label>
          <Input
            placeholder="Buscar por nombre..."
            value={filterClientName}
            onChange={(e) => setFilterClientName(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Project Manager</Label>
          <Select value={filterProjectManager} onValueChange={setFilterProjectManager}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todos</SelectItem>
              {projectManagers.map((pm) => (
                <SelectItem key={pm} value={pm}>
                  {pm}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Account Manager</Label>
          <Select value={filterAccountManager} onValueChange={setFilterAccountManager}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todos</SelectItem>
              {accountManagers.map((am) => (
                <SelectItem key={am} value={am}>
                  {am}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Header bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>
            <span className="font-semibold text-foreground">{connectedCount}</span> de{' '}
            <span className="font-semibold text-foreground">{filteredClients.length}</span> clientes conectados
          </span>
          {alertCount > 0 && (
            <Badge variant="outline" className="border-amber-500/40 text-amber-600 bg-amber-500/5 text-xs gap-1">
              <AlertCircle className="h-3 w-3" />
              {alertCount} requieren atencion
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 gap-2 text-xs" onClick={fetchMetaAccounts} disabled={loadingAccounts}>
            {loadingAccounts ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {loadingAccounts ? 'Cargando Meta...' : 'Cuentas Meta'}
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-2 text-xs" onClick={fetchGoogleAccounts} disabled={loadingGoogleAccounts}>
            {loadingGoogleAccounts ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {loadingGoogleAccounts ? 'Cargando Google...' : 'Cuentas Google'}
          </Button>
        </div>
      </div>

      {/* Service Map Config Link (Master only) */}
      {isMaster && (
        <Link 
          href="/dashboard/config/hitos"
          className="flex items-center gap-2 px-4 py-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors text-sm"
        >
          <Map className="h-4 w-4 text-primary" />
          <span className="font-medium">Configuración del Mapa de Servicio</span>
          <span className="text-muted-foreground ml-auto">Administrar hitos y checklists</span>
        </Link>
      )}

      {/* Auto-save progress banner */}
      {autoSaving && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm text-primary">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          Guardando cuentas detectadas automaticamente...
        </div>
      )}

      {/* Error banners */}
      {accountsError && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1">
            <span className="font-semibold">Error Meta Ads</span>
            <span>{accountsError.includes('log in to') || accountsError.includes('OAuthException') 
              ? 'El token de acceso ha expirado. Debes renovar el META_ADS_ACCESS_TOKEN desde Meta Business Suite.'
              : accountsError
            }</span>
          </div>
        </div>
      )}
      {googleAccountsError && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span><span className="font-semibold">Error Google Ads: </span>{googleAccountsError}</span>
        </div>
      )}

      {clients.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No hay clientes cargados todavia.</p>
      )}

      {clients.map(client => {
        const config = configs[client.id]
        if (!config) return null

        const match = matchResults[client.id]
        const googleMatch = googleMatchResults[client.id]
        const selectedMetaIds = parseIds(config.meta)
        const selectedGoogleIds = parseIds(config.google)

        const hasChanges =
          config.meta !== (client.meta_ads_account_id ?? '') ||
          config.google !== (client.google_ads_customer_id ?? '') ||
          config.crmType !== (client.crm_type ?? '') ||
          config.ghlLocationId !== (client.ghl_location_id ?? '') ||
          config.ghlToken !== (client.ghl_token ?? '')
        const isConnected = Boolean(config.meta || config.google)

        const showAlert =
          match?.status === 'not_found' || match?.status === 'multiple' ||
          googleMatch?.status === 'not_found'
        const showSuccess = match?.status === 'saved' && googleMatch?.status === 'saved'

        return (
          <Card
            key={client.id}
            className={cn(
              showAlert ? 'border-amber-500/40' :
              showSuccess ? 'border-green-500/30' :
              isConnected ? 'border-border' :
              'border-dashed border-muted-foreground/30'
            )}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <CardTitle className="text-base">{client.business_name}</CardTitle>

                  {isConnected ? (
                    <Badge className="bg-green-500/15 text-green-600 border-green-500/20 text-xs">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Conectado
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground text-xs">Sin conectar</Badge>
                  )}

                  {match?.status === 'matched' && !client.meta_ads_account_id && (
                    <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20 text-xs gap-1">
                      <Link2 className="h-3 w-3" />Meta detectada
                    </Badge>
                  )}
                  {match?.status === 'multiple' && (
                    <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-xs gap-1">
                      <AlertCircle className="h-3 w-3" />Meta: multiples coincidencias
                    </Badge>
                  )}
                  {match?.status === 'not_found' && !client.meta_ads_account_id && (
                    <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-xs gap-1">
                      <Unlink className="h-3 w-3" />Meta no detectada
                    </Badge>
                  )}
                  {googleMatch?.status === 'matched' && !client.google_ads_customer_id && (
                    <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20 text-xs gap-1">
                      <Link2 className="h-3 w-3" />Google detectada
                    </Badge>
                  )}
                  {googleMatch?.status === 'not_found' && !client.google_ads_customer_id && (
                    <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-xs gap-1">
                      <Unlink className="h-3 w-3" />Google no detectada
                    </Badge>
                  )}
                </div>
                {saved[client.id] && (
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />Guardado
                  </span>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

                {/* ── Meta Ads (multi-select) ── */}
                <div className="space-y-2">
                  <Label className="text-sm flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-blue-600 text-white text-[10px] font-bold shrink-0">f</span>
                    Meta Ads
                    {selectedMetaIds.length > 0 && (
                      <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] px-1.5">
                        {selectedMetaIds.length}
                      </Badge>
                    )}
                  </Label>
                  <MetaMultiSelect
                    accounts={metaAccounts}
                    selectedIds={selectedMetaIds}
                    matchResult={match}
                    onChange={(ids) => handleMetaIdsChange(client.id, ids)}
                    loading={loadingAccounts}
                  />
                </div>

                {/* ── Google Ads (multi-select) ── */}
                <div className="space-y-2">
                  <Label className="text-sm flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-white border text-[10px] font-bold text-red-500 shrink-0">G</span>
                    Google Ads
                    {selectedGoogleIds.length > 0 && (
                      <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] px-1.5">
                        {selectedGoogleIds.length}
                      </Badge>
                    )}
                  </Label>
                  <GoogleMultiSelect
                    accounts={googleAccounts}
                    selectedIds={selectedGoogleIds}
                    matchResult={googleMatch}
                    onChange={(ids) => handleGoogleIdsChange(client.id, ids)}
                    loading={loadingGoogleAccounts}
                  />
                </div>
              </div>

              {/* ── CRM ── */}
              <div className="pt-2 border-t border-border space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-violet-600 text-white text-[10px] font-bold shrink-0">C</span>
                    CRM
                  </Label>
                  <Select
                    value={config.crmType || '__none__'}
                    onValueChange={val => updateField(client.id, 'crmType', val === '__none__' ? '' : val)}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Seleccionar CRM..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">
                        <span className="text-muted-foreground">Sin CRM</span>
                      </SelectItem>
                      <SelectItem value="ghl">Go High Level</SelectItem>
                      <SelectItem value="aurelia">Aurelia CRM</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {config.crmType === 'ghl' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Location ID</Label>
                      <Input
                        placeholder="ej: ABC123xyz..."
                        value={config.ghlLocationId}
                        onChange={e => updateField(client.id, 'ghlLocationId', e.target.value)}
                        className="h-9 font-mono text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">API Token</Label>
                      <Input
                        type="password"
                        placeholder="eyJ..."
                        value={config.ghlToken}
                        onChange={e => updateField(client.id, 'ghlToken', e.target.value)}
                        className="h-9 font-mono text-sm"
                      />
                    </div>
                  </div>
                )}

                {config.crmType === 'aurelia' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">API Token</Label>
                    <Input
                      type="password"
                      placeholder="Token de Aurelia CRM..."
                      value={config.ghlToken}
                      onChange={e => updateField(client.id, 'ghlToken', e.target.value)}
                      className="h-9 font-mono text-sm"
                    />
                  </div>
                )}
              </div>

              {errors[client.id] && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />{errors[client.id]}
                </p>
              )}

              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={() => handleSave(client.id)}
                  disabled={saving[client.id] || !hasChanges}
                  className="h-8 gap-2"
                >
                  {saving[client.id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {saving[client.id] ? 'Guardando...' : 'Guardar'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
