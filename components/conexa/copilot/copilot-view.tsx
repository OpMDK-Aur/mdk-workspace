'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, ArrowDownToLine, ArrowRight, BarChart3, Check, ChevronDown, Clock3, Database, FileEdit, Lightbulb, LoaderCircle, Lock, Maximize2, MessageCircle, Minimize2, Search, Send, Sparkles, Tag, Users, X, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useCopilot } from './use-copilot'
import type { ContextAssessment, ProfileUpdate } from '@/lib/conexa/copilot/client-profile'
import { PROFILE_FIELD_LABEL } from '@/lib/conexa/copilot/profile-fields'
import { describeOperation, executionLines, PLATFORM_LABEL, RECOMMENDATION_TYPE_LABEL, type DecisionRecord, type ExecutionPlan, type PlanStep, type Recommendation, type RecommendationOperation, type RecommendationPlatform, type RecommendationPriority, type RecommendationType } from '@/lib/conexa/copilot/types'

type Client = {
  id: string
  nombre_del_negocio?: string
  meta_ads_account_id?: string | null
  meta_ads_account_ids?: string[] | null
  google_ads_customer_id?: string | null
  google_ads_customer_ids?: string[] | null
  analytics_property_id?: string | null
  tag_manager_container_id?: string | null
  crm_type?: string | null
  cuentas_publicitarias?: Array<{ plataforma?: string | null; id_cuenta?: string | null; activo?: boolean | null }> | null
}
type Panel = 'chat' | 'recommendations' | 'history'
const PANEL_LABEL: Record<Panel, string> = { chat: 'Chat de contexto', recommendations: 'Recomendaciones', history: 'Histórico' }
const STATUS_LABEL = { draft: 'Borrador', executing: 'Ejecutando', published: 'Publicada', discarded: 'Descartada' } as const
const TYPE_OPTIONS: RecommendationType[] = ['presupuesto', 'creatividades', 'segmentacion', 'estructura', 'tracking', 'crm', 'otro']
const PLATFORM_OPTIONS: RecommendationPlatform[] = ['meta', 'google_ads', 'ga4', 'tag_manager', 'crm']
const PLATFORM_LOGOS: Partial<Record<RecommendationPlatform, string>> = {
  meta: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Facebook_Logo_%282019%29-8hLkShXu9caNijxaYTMKGdv1bWipbV.png',
  google_ads: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/google_ads_logo_icon_171064-I8kGtiPKqG0TZoeHB7Lb1GwQziRNBX.webp',
  ga4: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/google-analytics-icon-VuL4g3NfPdL5bzHIQRZacQjTq6Vcfk.webp',
  tag_manager: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/google-tag-manager-l5o0anuls2kqtf2xmhtl-ItmMvsOnhnmedg5kb6tJwJOQzpJ1uy.webp',
}
const PRIORITY_OPTIONS: RecommendationPriority[] = ['alta', 'media', 'baja']
const FILTER_ALL = 'all'
const COMPLETE_CONTEXT_MESSAGE = 'Ayudame a completar el contexto del cliente. Preguntame lo que falta de a uno o dos datos por vez.'

export function CopilotView({ client }: { client: Client | null }) {
  if (!client) return <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">Elegí un cliente para ver sus recomendaciones.</div>
  return <RecommendationsWorkspace key={client.id} client={client} />
}

function RecommendationsWorkspace({ client }: { client: Client }) {
  const copilot = useCopilot(client.id)
  const [collapsed, setCollapsed] = useState<Record<Panel, boolean>>({ chat: false, recommendations: false, history: false })
  const [mobilePanel, setMobilePanel] = useState<Panel>('recommendations')
  const [fullPanel, setFullPanel] = useState<Panel | null>(null)
  const [filters, setFilters] = useState({ platform: FILTER_ALL, type: FILTER_ALL, priority: FILTER_ALL, status: FILTER_ALL })
  const [search, setSearch] = useState('')
  const [historySearch, setHistorySearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [messageInput, setMessageInput] = useState('')
  const [editingRecommendationId, setEditingRecommendationId] = useState<string | undefined>()
  const [selected, setSelected] = useState<Recommendation | null>(null)
  const [editTarget, setEditTarget] = useState<Recommendation | null>(null)
  const [publishTarget, setPublishTarget] = useState<Recommendation | null>(null)
  const [discardTarget, setDiscardTarget] = useState<Recommendation | null>(null)
  const [discardReason, setDiscardReason] = useState('')
  const [manualContextOpen, setManualContextOpen] = useState(false)
  const [manualContext, setManualContext] = useState('')
  const [hydratedPanels, setHydratedPanels] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`conexa-recommendation-panels:${client.id}`)
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<Record<Panel, boolean>>
        setCollapsed({ chat: Boolean(parsed.chat), recommendations: Boolean(parsed.recommendations), history: Boolean(parsed.history) })
      }
    } catch { /* Layout preferences are optional. */ }
    setHydratedPanels(true)
  }, [client.id])

  useEffect(() => {
    if (!hydratedPanels) return
    try { localStorage.setItem(`conexa-recommendation-panels:${client.id}`, JSON.stringify(collapsed)) } catch { /* Browser storage may be disabled. */ }
  }, [collapsed, hydratedPanels, client.id])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setFullPanel(null) }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ block: 'end' }) }, [copilot.messages.length, busy])

  const [publishing, setPublishing] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [prepareError, setPrepareError] = useState<string | null>(null)
  const [plan, setPlan] = useState<ExecutionPlan | null>(null)
  const [scanning, setScanning] = useState(false)
  const drafts = useMemo(() => copilot.recommendations.filter((item) => item.status === 'draft' || item.status === 'executing'), [copilot.recommendations])
  const history = useMemo(() => copilot.recommendations.filter((item) => item.status === 'published' || item.status === 'discarded').sort((a, b) => new Date(b.status === 'published' ? b.published_at ?? b.updated_at : b.discarded_at ?? b.updated_at).getTime() - new Date(a.status === 'published' ? a.published_at ?? a.updated_at : a.discarded_at ?? a.updated_at).getTime()), [copilot.recommendations])
  const filteredDrafts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es')
    return drafts.filter((item) => (filters.platform === FILTER_ALL || item.platforms.includes(filters.platform as RecommendationPlatform))
      && (filters.type === FILTER_ALL || item.type === filters.type)
      && (filters.priority === FILTER_ALL || item.priority === filters.priority)
      && (!query || `${item.title} ${item.description} ${item.rationale}`.toLocaleLowerCase('es').includes(query)))
  }, [drafts, filters, search])
  const filteredHistory = useMemo(() => {
    const query = historySearch.trim().toLocaleLowerCase('es')
    return history.filter((item) => (filters.status === FILTER_ALL || item.status === filters.status)
      && (!query || `${item.title} ${item.description} ${item.rationale}`.toLocaleLowerCase('es').includes(query)))
  }, [history, filters.status, historySearch])
  const connectedPlatforms = useMemo(() => {
    const connected: RecommendationPlatform[] = []
    if (client.meta_ads_account_id || client.meta_ads_account_ids?.length || client.cuentas_publicitarias?.some((account) => account.activo !== false && account.plataforma === 'meta')) connected.push('meta')
    if (client.google_ads_customer_id || client.google_ads_customer_ids?.length || client.cuentas_publicitarias?.some((account) => account.activo !== false && account.plataforma === 'google')) connected.push('google_ads')
    if (client.analytics_property_id) connected.push('ga4')
    if (client.tag_manager_container_id) connected.push('tag_manager')
    if (client.crm_type) connected.push('crm')
    return connected
  }, [client])

  const showPanel = (panel: Panel) => { setFullPanel(panel); setMobilePanel(panel) }
  const focusChat = (recommendation?: Recommendation) => {
    setEditingRecommendationId(recommendation?.id)
    if (recommendation) setMessageInput(`Quiero editar esta recomendación. Conservá su fundamento y modificá solo lo que te indico: ${recommendation.title}\n\n`)
    if (window.matchMedia('(max-width: 1023px)').matches) setMobilePanel('chat')
    window.setTimeout(() => document.getElementById('recommendation-chat-input')?.focus(), 30)
  }

  const missingContext = useMemo(() => copilot.assessment?.fields.filter((field) => field.core && !field.filled).map((field) => field.label) ?? [], [copilot.assessment])
  const [profileProposal, setProfileProposal] = useState<ProfileUpdate[]>([])
  const [savingProfile, setSavingProfile] = useState(false)

  async function saveProfileProposal(updates: ProfileUpdate[]) {
    if (savingProfile || !updates.length) return
    setSavingProfile(true)
    try {
      await copilot.saveProfile(updates)
      setProfileProposal([])
      toast.success('Guardado en Contexto del cliente')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo guardar el contexto') } finally { setSavingProfile(false) }
  }

  function sendMessage(event: FormEvent) {
    event.preventDefault()
    void submitMessage(messageInput)
  }

  async function submitMessage(text: string) {
    const message = text.trim()
    if (!message || busy) return
    setMessageInput('')
    setBusy(true)
    try {
      const result = await copilot.send(message, editingRecommendationId)
      if (result.profileProposal?.length) setProfileProposal(result.profileProposal)
      if (result.recommendations.length) { setMobilePanel('recommendations'); toast.success(`${result.recommendations.length} borrador(es) agregados`) }
      if (result.editedRecommendation) { setMobilePanel('recommendations'); toast.success('La recomendación quedó actualizada como borrador') }
      if (result.contextSaved) toast.success('El contexto nuevo quedó guardado para próximas conversaciones')
      if (result.editedRecommendation) setEditingRecommendationId(undefined)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo enviar el mensaje')
      setMessageInput(message)
    } finally { setBusy(false) }
  }

  async function saveManualContext(event: FormEvent) {
    event.preventDefault()
    if (manualContext.trim().length < 3) return
    try {
      await copilot.addContext(manualContext.trim())
      setManualContext('')
      setManualContextOpen(false)
      toast.success('Contexto guardado para este cliente')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo guardar el contexto') }
  }

  async function publish() {
    if (!publishTarget || !plan || publishing) return
    setPublishing(true)
    setPrepareError(null)
    try {
      const published = await copilot.publish(publishTarget.id, plan.hash)
      setPublishTarget(null)
      setPlan(null)
      setMobilePanel('history')
      toast.success(`Aplicado en la plataforma. ${executionLines(published.execution_result).join(' · ')}`)
    } catch (error) {
      await copilot.mutateRecommendations()
      setPlan(null)
      setPrepareError(error instanceof Error ? error.message : 'No se pudo ejecutar la recomendación en la plataforma.')
    } finally { setPublishing(false) }
  }

  async function openPublish(item: Recommendation) {
    setPublishTarget(item)
    setPlan(null)
    setPrepareError(null)
    setPreparing(true)
    try {
      const result = await copilot.previewPublish(item.id)
      setPublishTarget(result.recommendation)
      setPlan(result.plan)
    } catch (error) {
      setPrepareError(error instanceof Error ? error.message : 'No se pudo leer el estado actual en la plataforma.')
    } finally { setPreparing(false) }
  }

  async function scan() {
    if (scanning) return
    setScanning(true)
    try {
      const result = await copilot.scan()
      if (result.recommendations.length) toast.success(`${result.recommendations.length} recomendación(es) nueva(s) para revisar`)
      else toast.message(result.skippedDuplicates ? 'Las propuestas encontradas ya tienen un borrador vigente.' : 'No encontramos recomendaciones nuevas con los datos actuales.', { description: [result.reply, ...result.questions].join(' ').slice(0, 400) })
    } catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudieron generar recomendaciones') } finally { setScanning(false) }
  }

  async function markDone(item: Recommendation) {
    try {
      await copilot.markDone(item.id)
      setMobilePanel('history')
      toast.success('Recomendación marcada como hecha')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo marcar como hecha') }
  }

  async function discard() {
    if (!discardTarget) return
    try {
      await copilot.discard(discardTarget.id, discardReason.trim() || undefined)
      setDiscardTarget(null)
      setDiscardReason('')
      toast.success('Recomendación descartada y agregada al histórico')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo descartar la recomendación') }
  }

  const panels: Record<Panel, ReactNode> = {
    chat: <ChatPanel clientName={client.nombre_del_negocio ?? 'Cliente'} connectedPlatforms={connectedPlatforms} messages={copilot.messages} assessment={copilot.assessment} contextUnavailable={Boolean(copilot.profileError)} competitors={{ suggesting: copilot.suggestingCompetitors, onSuggest: async () => { const result = await copilot.suggestCompetitors(); toast.message(result.suggested ? `Conexa sugirió ${result.suggested} competidor(es). Quitá los que no correspondan.` : 'No se encontraron competidores nuevos.') }, onAdd: copilot.addCompetitor, onRemove: copilot.removeCompetitor }} proposal={profileProposal} savingProfile={savingProfile} onSaveProposal={saveProfileProposal} onDismissProposal={() => setProfileProposal([])} onCompleteContext={() => submitMessage(COMPLETE_CONTEXT_MESSAGE)} busy={busy} input={messageInput} editing={Boolean(editingRecommendationId)} onInput={setMessageInput} onSubmit={sendMessage} onAddManual={() => setManualContextOpen(true)} onClearEditing={() => { setEditingRecommendationId(undefined); setMessageInput('') }} endRef={messagesEndRef} />,
    recommendations: <RecommendationsPanel items={filteredDrafts} total={drafts.length} missingContext={missingContext} onCompleteContext={() => { setMobilePanel('chat'); void submitMessage(COMPLETE_CONTEXT_MESSAGE) }} filters={filters} search={search} loading={copilot.isLoading || busy || scanning} scanning={scanning} onScan={scan} onMarkDone={markDone} error={copilot.error?.message} onSearch={setSearch} onFilters={setFilters} onSelect={setSelected} onEdit={setEditTarget} onEditWithChat={focusChat} onPublish={openPublish} onDiscard={(item) => { setDiscardTarget(item); setDiscardReason('') }} />,
    history: <HistoryPanel items={filteredHistory} loading={copilot.isLoading} error={copilot.error?.message} filters={filters} search={historySearch} onSearch={setHistorySearch} onStatus={(value) => setFilters((current) => ({ ...current, status: value }))} onSelect={setSelected} onRestore={async (item) => { try { await copilot.restore(item.id); toast.success('Recomendación restaurada como borrador') } catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo restaurar') } }} />,
  }

  const fullContent = fullPanel ? <PanelShell panel={fullPanel} full onCollapse={() => setCollapsed((current) => ({ ...current, [fullPanel]: true }))} onExpand={() => setFullPanel(null)}>{panels[fullPanel]}</PanelShell> : null
  const panelOrder: Panel[] = ['chat', 'recommendations', 'history']
  const columns = panelOrder.map((panel) => collapsed[panel] ? '42px' : panel === 'recommendations' ? 'minmax(430px, 2fr)' : 'minmax(250px, 1fr)').join(' ')

  return <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-white text-[#252525]">
    <div role="tablist" aria-label="Paneles de Recomendaciones" className="flex shrink-0 border-b border-[#e7e7e5] bg-white lg:hidden">
      {panelOrder.map((panel) => <button key={panel} type="button" role="tab" aria-selected={mobilePanel === panel} onClick={() => setMobilePanel(panel)} className={cn('flex-1 border-b-2 px-2 py-2.5 text-xs font-medium', mobilePanel === panel ? 'border-[#f97316] text-[#c55208]' : 'border-transparent text-[#777]')}>{panel === 'recommendations' ? `Activas ${drafts.length}` : PANEL_LABEL[panel]}</button>)}
    </div>
    <div className={cn('min-h-0 flex-1 lg:grid', fullPanel ? 'hidden' : 'flex')} style={{ gridTemplateColumns: columns }}>
      {panelOrder.map((panel) => <div key={panel} className={cn('min-h-0 min-w-0 overflow-hidden border-r border-[#e7e7e5] last:border-r-0 lg:flex', mobilePanel === panel ? 'flex' : 'hidden')}>
        {collapsed[panel] ? <>
          <button type="button" onClick={() => setCollapsed((current) => ({ ...current, [panel]: false }))} aria-label={`Expandir panel ${PANEL_LABEL[panel]}`} title={`Expandir ${PANEL_LABEL[panel]}`} className="hidden h-full w-[42px] shrink-0 flex-col items-center gap-3 bg-[#fafaf9] py-4 text-[#555] lg:flex"><PanelIcon panel={panel} /><span className="text-[10px] font-semibold [writing-mode:vertical-rl] rotate-180">{PANEL_LABEL[panel]}</span></button>
          <div className="flex min-h-0 min-w-0 flex-1 lg:hidden"><PanelShell panel={panel} onCollapse={() => setCollapsed((current) => ({ ...current, [panel]: true }))} onExpand={() => showPanel(panel)}>{panels[panel]}</PanelShell></div>
        </> : <PanelShell panel={panel} onCollapse={() => setCollapsed((current) => ({ ...current, [panel]: true }))} onExpand={() => showPanel(panel)}>{panels[panel]}</PanelShell>}
      </div>)}
    </div>
    {fullPanel && <div className="absolute inset-0 z-40 flex min-h-0 flex-col bg-white">{fullContent}</div>}

    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null) }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        {selected && <RecommendationDetail item={selected} readonly={selected.status !== 'draft'} onRestore={selected.status === 'discarded' ? async () => { await copilot.restore(selected.id); setSelected(null); toast.success('Recomendación restaurada como borrador') } : undefined} />}
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(editTarget)} onOpenChange={(open) => { if (!open) setEditTarget(null) }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        {editTarget && <EditRecommendationDialog item={editTarget} onCancel={() => setEditTarget(null)} onSave={async (patch) => { try { await copilot.edit(editTarget.id, patch); setEditTarget(null); toast.success('Borrador actualizado') } catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo editar') } }} />}
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(publishTarget)} onOpenChange={(open) => { if (!open && !publishing && !preparing) { setPublishTarget(null); setPlan(null) } }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Publicar en {publishTarget?.operation ? PLATFORM_LABEL[publishTarget.operation.platform] : 'la plataforma'}</DialogTitle><DialogDescription>Se aplica en la cuenta real del cliente exactamente lo que ves abajo, leído recién de la plataforma. Si algo cambia antes de confirmar, se te vuelve a mostrar.</DialogDescription></DialogHeader>
        {publishTarget && <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold leading-snug">{publishTarget.title}</p>
          {preparing && <p role="status" className="flex items-center gap-2 rounded-md bg-[#fafaf9] px-3 py-2.5 text-xs text-[#666]"><LoaderCircle className="size-3.5 animate-spin text-[#f97316]" />Leyendo los valores actuales en la plataforma…</p>}
          {plan && <PlanSteps steps={plan.steps} />}
          {prepareError && <p role="alert" className="rounded-md bg-[#fff0ec] px-3 py-2.5 text-xs leading-relaxed text-[#b42318]">{prepareError}</p>}
        </div>}
        <DialogFooter><Button variant="outline" disabled={publishing || preparing} onClick={() => { setPublishTarget(null); setPlan(null) }}>{prepareError ? 'Cerrar' : 'Cancelar'}</Button>{prepareError && !plan && publishTarget && !preparing ? <Button variant="outline" onClick={() => openPublish(publishTarget)}>Volver a leer</Button> : <Button onClick={publish} disabled={publishing || preparing || !plan || plan.steps.every((item) => item.alreadyApplied)} className="bg-[#f97316] text-white hover:bg-[#e7650c]">{publishing ? <><LoaderCircle className="size-3.5 animate-spin" />Ejecutando…</> : 'Confirmar'}</Button>}</DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(discardTarget)} onOpenChange={(open) => { if (!open) setDiscardTarget(null) }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Descartar recomendación</DialogTitle><DialogDescription>Se moverá al histórico. El motivo es opcional.</DialogDescription></DialogHeader>
        <label className="flex flex-col gap-1.5 text-xs font-medium" htmlFor="discard-reason">Motivo de descarte<Textarea id="discard-reason" value={discardReason} maxLength={1000} onChange={(event) => setDiscardReason(event.target.value)} placeholder="¿Por qué no aplica?" /></label>
        <DialogFooter><Button variant="outline" onClick={() => setDiscardTarget(null)}>Cancelar</Button><Button variant="destructive" onClick={discard}>Descartar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={manualContextOpen} onOpenChange={setManualContextOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Agregar contexto del cliente</DialogTitle><DialogDescription>Este dato se suma al contexto de Recomendaciones, sin modificar el formulario existente del cliente.</DialogDescription></DialogHeader>
        <form onSubmit={saveManualContext} className="flex flex-col gap-3"><label htmlFor="manual-recommendation-context" className="text-xs font-medium">Contexto para tener en cuenta</label><Textarea id="manual-recommendation-context" value={manualContext} maxLength={2000} onChange={(event) => setManualContext(event.target.value)} placeholder="Objetivos, estacionalidad, promociones o restricciones…" /><DialogFooter><Button type="button" variant="outline" onClick={() => setManualContextOpen(false)}>Cancelar</Button><Button type="submit" disabled={manualContext.trim().length < 3}>Guardar contexto</Button></DialogFooter></form>
      </DialogContent>
    </Dialog>
  </div>
}

function PanelIcon({ panel }: { panel: Panel }) {
  if (panel === 'chat') return <MessageCircle className="size-4 text-[#f97316]" />
  if (panel === 'recommendations') return <Lightbulb className="size-4 text-[#f97316]" />
  return <ArrowDownToLine className="size-4 text-[#f97316]" />
}

function PanelShell({ panel, full = false, onCollapse, onExpand, children }: { panel: Panel; full?: boolean; onCollapse: () => void; onExpand: () => void; children: ReactNode }) {
  const title = PANEL_LABEL[panel]
  return <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-white" aria-label={title}>
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[#eeeeec] bg-white px-3">
      <PanelIcon panel={panel} />
      <h2 className="min-w-0 flex-1 truncate text-xs font-semibold">{title}</h2>
      {panel === 'recommendations' && <span className="rounded-full bg-[#fff2e9] px-2 py-0.5 text-[10px] font-semibold text-[#c55208]">Activas</span>}
      {!full && <button type="button" onClick={onCollapse} aria-label={`Colapsar ${title}`} title="Colapsar panel" className="hidden rounded-md p-1.5 text-[#777] hover:bg-[#f5f5f4] lg:inline-flex"><Minimize2 className="size-4" /></button>}
      <button type="button" onClick={onExpand} aria-label={full ? 'Volver a la posición original' : `Expandir ${title} a pantalla completa`} title={full ? 'Volver al panel' : 'Pantalla completa'} className="rounded-md p-1.5 text-[#777] hover:bg-[#f5f5f4]">{full ? <X className="size-4" /> : <Maximize2 className="size-4" />}</button>
    </header>
    {children}
  </section>
}

function ChatPanel({ clientName, connectedPlatforms, messages, assessment, contextUnavailable, competitors, proposal, savingProfile, onSaveProposal, onDismissProposal, onCompleteContext, busy, input, editing, onInput, onSubmit, onAddManual, onClearEditing, endRef }: {
  clientName: string
  connectedPlatforms: RecommendationPlatform[]
  messages: ReturnType<typeof useCopilot>['messages']
  assessment: ContextAssessment | null
  contextUnavailable: boolean
  competitors: CompetitorControls
  proposal: ProfileUpdate[]
  savingProfile: boolean
  onSaveProposal: (updates: ProfileUpdate[]) => void
  onDismissProposal: () => void
  onCompleteContext: () => void
  busy: boolean
  input: string
  editing: boolean
  onInput: (value: string) => void
  onSubmit: (event: FormEvent) => void
  onAddManual: () => void
  onClearEditing: () => void
  endRef: React.RefObject<HTMLDivElement | null>
}) {
  return <div className="flex min-h-0 flex-1 flex-col">
    <ContextStatus assessment={assessment} unavailable={contextUnavailable} busy={busy} competitors={competitors} onAddManual={onAddManual} onComplete={onCompleteContext} />
    {!connectedPlatforms.length && <p role="status" className="border-b border-[#f0e5d9] bg-[#fff8f1] px-3 py-2 text-[10px] leading-relaxed text-[#8a541e]">Este cliente no tiene plataformas conectadas. El chat recomendará únicamente a partir del contexto, las tareas y los comentarios.</p>}
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      {!messages.length && <div className="mt-4 rounded-xl border border-[#eeeeec] bg-[#fafaf9] p-4"><p className="text-xs font-semibold">Contame qué está pasando con {clientName}</p><p className="mt-2 text-[11px] leading-5 text-[#777]">Objetivos, estacionalidad, promociones, restricciones o feedback del cliente. Conexa lo tendrá en cuenta en futuras recomendaciones.</p><div className="mt-3 flex flex-wrap gap-1.5">{['Proponé una campaña nueva en Meta para captar más leads', '¿Cuáles son los competidores y qué están haciendo?', 'Tiene una promoción este mes'].map((suggestion) => <button key={suggestion} type="button" onClick={() => onInput(suggestion)} className="rounded-full border border-[#e7e7e5] bg-white px-2.5 py-1.5 text-left text-[10px] hover:border-[#f97316]/50">{suggestion}</button>)}</div></div>}
      <div className="flex flex-col gap-3">{messages.map((message) => <article key={message.id} className={cn('max-w-[96%] rounded-xl px-3 py-2.5 text-[11px] leading-5', message.role === 'user' ? 'self-end bg-[#fff2e9] text-[#4a2b18]' : 'self-start border border-[#eeeeec] bg-[#fafaf9] text-[#444]')}><p className="mb-1 text-[9px] font-semibold uppercase tracking-wide opacity-60">{message.role === 'user' ? 'Vos' : 'Conexa'}</p><p className="whitespace-pre-wrap">{message.content}</p></article>)}</div>
      {proposal.length > 0 && <ProfileProposalCard key={proposal.map((item) => `${item.field}:${item.value}`).join('|')} proposal={proposal} saving={savingProfile} onSave={onSaveProposal} onDismiss={onDismissProposal} />}
      {busy && <div role="status" className="mt-3 flex items-center gap-2 text-[10px] text-[#777]"><LoaderCircle className="size-3.5 animate-spin text-[#f97316]" />Conexa está analizando contexto y datos…</div>}
      <div ref={endRef} />
    </div>
    <form onSubmit={onSubmit} className="border-t border-[#eeeeec] p-3">
      {editing && <div className="mb-2 flex items-center justify-between rounded-md bg-[#fff5ee] px-2.5 py-1.5 text-[10px] text-[#9a4d13]"><span>Editando un borrador</span><button type="button" onClick={onClearEditing} className="underline">Cancelar edición</button></div>}
      <label htmlFor="recommendation-chat-input" className="sr-only">Mensaje para Conexa</label>
      <div className="flex items-end gap-2 rounded-lg border border-[#e5e5e3] bg-white p-1.5 focus-within:border-[#f97316]"><Textarea id="recommendation-chat-input" value={input} rows={2} maxLength={4000} onChange={(event) => onInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} disabled={busy} placeholder="Sumá contexto o pedí recomendaciones…" className="min-h-10 resize-none border-0 text-[11px] shadow-none focus-visible:ring-0" /><Button type="submit" size="icon" aria-label="Enviar mensaje" disabled={!input.trim() || busy} className="size-8 shrink-0 bg-[#f97316] text-white hover:bg-[#e7650c]"><Send className="size-3.5" /></Button></div>
      <p className="mt-2 text-[9px] leading-4 text-[#999]">Conexa no publica ni ejecuta cambios. Los mensajes solo se usan como contexto de Recomendaciones.</p>
    </form>
  </div>
}

const LEVEL_STYLE = {
  debil: { label: 'Débil', badge: 'bg-[#fff0ec] text-[#b42318]', bar: 'bg-[#e5533d]', segments: 1 },
  intermedio: { label: 'Intermedio', badge: 'bg-[#fff4e5] text-[#8a541e]', bar: 'bg-[#f59e0b]', segments: 2 },
  completo: { label: 'Completo', badge: 'bg-[#e7f5ec] text-[#1b6b38]', bar: 'bg-[#22a05a]', segments: 3 },
} as const

type CompetitorControls = { suggesting: boolean; onSuggest: () => Promise<unknown>; onAdd: (name: string) => Promise<unknown>; onRemove: (noteId: string) => Promise<unknown> }

function CompetitorEditor({ assessment, controls }: { assessment: ContextAssessment; controls: CompetitorControls }) {
  const [name, setName] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const run = async (key: string, task: () => Promise<unknown>, success?: string) => {
    setPending(key)
    try { await task(); if (success) toast.success(success) } catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo actualizar la competencia') } finally { setPending(null) }
  }
  const searching = controls.suggesting || pending === 'suggest'
  const canSuggest = assessment.level !== 'debil'
  return <section aria-labelledby="competitors-title" className="flex flex-col gap-2 rounded-lg border border-[#ececea] bg-[#ffffff] p-2.5">
    <div className="flex items-center justify-between gap-2">
      <h3 id="competitors-title" className="text-[11px] font-semibold text-[#252525]">Competencia</h3>
      <Button type="button" variant="ghost" size="sm" disabled={searching || !canSuggest || Boolean(pending)} title={canSuggest ? undefined : 'Completá los datos base para buscar competidores'} onClick={() => run('suggest', controls.onSuggest)} className="h-6 gap-1 px-1.5 text-[10px] text-[#c55208] hover:bg-[#fff2e9] hover:text-[#a8440c]">{searching ? <LoaderCircle className="size-3 animate-spin" aria-hidden="true" /> : <Sparkles className="size-3" aria-hidden="true" />}{searching ? 'Buscando…' : 'Sugerir con IA'}</Button>
    </div>
    {searching && !assessment.competitorEntries.length && <p role="status" className="text-[10px] text-[#777]">Conexa está buscando competidores en la web…</p>}
    {!searching && !assessment.competitorEntries.length && <p className="text-[10px] italic text-[#a3a3a0]">{canSuggest ? 'Sin competidores todavía.' : 'Completá industria, objetivo y qué vende para que Conexa los busque.'}</p>}
    {assessment.competitorEntries.length > 0 && <ul className="flex flex-col gap-1.5">{assessment.competitorEntries.map((entry) => <li key={entry.noteId} className="flex items-start gap-2 rounded-md bg-[#fafaf9] px-2 py-1.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-[#252525]">{entry.name}{entry.suggested && <span className="rounded-full bg-[#fff2e9] px-1.5 py-px text-[9px] font-semibold text-[#c55208]">IA</span>}</span>
        {entry.detail && <span className="text-[10px] leading-snug text-[#777]">{entry.detail.replace(/^Sugerido por Conexa\s*—\s*/, '')}</span>}
      </div>
      <button type="button" onClick={() => run(entry.noteId, () => controls.onRemove(entry.noteId))} disabled={Boolean(pending)} aria-label={`Quitar ${entry.name}`} title="No es competidor" className="rounded p-1 text-[#999] hover:bg-[#f0f0ee] hover:text-[#b42318] disabled:opacity-50">{pending === entry.noteId ? <LoaderCircle className="size-3 animate-spin" /> : <X className="size-3" />}</button>
    </li>)}</ul>}
    <form onSubmit={(event) => { event.preventDefault(); const value = name.trim(); if (value.length < 2) return; void run('add', async () => { await controls.onAdd(value); setName('') }) }} className="flex items-center gap-1.5">
      <label htmlFor="competitor-name" className="sr-only">Agregar competidor</label>
      <Input id="competitor-name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Agregar competidor…" className="h-7 border-[#e5e5e3] bg-[#ffffff] text-[11px] text-[#252525]" />
      <Button type="submit" variant="outline" size="sm" disabled={name.trim().length < 2 || Boolean(pending)} className="h-7 shrink-0 border-[#e5e5e3] bg-[#ffffff] px-2 text-[10px] text-[#252525] hover:bg-[#f5f5f4] hover:text-[#252525]">{pending === 'add' ? <LoaderCircle className="size-3 animate-spin" /> : 'Agregar'}</Button>
    </form>
    {assessment.discardedCompetitors.length > 0 && <p className="text-[9px] leading-relaxed text-[#a3a3a0]">Descartados (no se vuelven a sugerir): {assessment.discardedCompetitors.join(', ')}</p>}
  </section>
}

function ContextStatus({ assessment, unavailable, busy, competitors, onAddManual, onComplete }: { assessment: ContextAssessment | null; unavailable: boolean; busy: boolean; competitors: CompetitorControls; onAddManual: () => void; onComplete: () => void }) {
  const [open, setOpen] = useState(false)
  const style = assessment ? LEVEL_STYLE[assessment.level] : null
  const formatValue = (value: string | number | null) => (typeof value === 'number' ? value.toLocaleString('es-AR') : String(value ?? '').replace(/_/g, ' '))
  return <div className="shrink-0 border-b border-[#eeeeec]">
    <div className="flex items-center gap-2 px-3 py-2">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="context-status-detail" className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left">
        <span className="text-[11px] font-semibold text-[#252525]">Contexto</span>
        {style ? <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', style.badge)}>{style.label}</span> : unavailable ? <span className="text-[10px] text-[#999]">No disponible</span> : <Skeleton className="h-4 w-14 rounded-full" />}
        {style && <span className="flex items-center gap-0.5" aria-hidden="true">{[1, 2, 3].map((segment) => <span key={segment} className={cn('h-1.5 w-4 rounded-full', segment <= style.segments ? style.bar : 'bg-[#ececea]')} />)}</span>}
        {competitors.suggesting && <span role="status" className="flex items-center gap-1 truncate text-[10px] text-[#777]"><LoaderCircle className="size-3 shrink-0 animate-spin text-[#f97316]" aria-hidden="true" />Buscando competidores</span>}
        <ChevronDown className={cn('ml-auto size-3.5 shrink-0 text-[#777] transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      <Button type="button" variant="outline" size="sm" onClick={onAddManual} className="h-7 shrink-0 px-2 text-[10px]">+ Contexto</Button>
    </div>
    {open && assessment && <div id="context-status-detail" className="flex flex-col gap-3 border-t border-[#f2f2f0] bg-[#fafaf9] px-3 py-3">
      <ul className="flex flex-col gap-1.5">
        {assessment.fields.map((field) => <li key={field.key} className="flex items-start gap-2 text-[11px] leading-snug">
          {field.filled ? <Check className="mt-0.5 size-3 shrink-0 text-[#22a05a]" aria-label="Cargado" /> : <span className="mt-1 size-2 shrink-0 rounded-full border border-[#c9c9c6]" aria-label="Falta" />}
          <span className="w-28 shrink-0 text-[#777]">{field.label}{field.core && <span className="sr-only"> (obligatorio)</span>}</span>
          <span className={cn('min-w-0 flex-1 break-words', field.filled ? 'text-[#252525]' : 'italic text-[#a3a3a0]')}>{field.filled ? formatValue(field.value) : 'Falta'}</span>
        </li>)}
      </ul>
      <CompetitorEditor assessment={assessment} controls={competitors} />
      <p className="text-[10px] leading-relaxed text-[#777]">{assessment.notesCount} nota(s) de contexto guardadas. Lo que confirmes en el chat se guarda en el formulario Contexto del cliente.</p>
      {assessment.level !== 'completo' && <Button type="button" size="sm" disabled={busy} onClick={() => { setOpen(false); onComplete() }} className="h-8 self-start bg-[#f97316] px-3 text-[11px] text-[#ffffff] hover:bg-[#e7650c]"><Sparkles className="size-3.5" />Completar con Conexa</Button>}
    </div>}
  </div>
}

function ProfileProposalCard({ proposal, saving, onSave, onDismiss }: { proposal: ProfileUpdate[]; saving: boolean; onSave: (updates: ProfileUpdate[]) => void; onDismiss: () => void }) {
  const [values, setValues] = useState(proposal)
  return <section aria-label="Datos para el Contexto del cliente" className="mt-3 flex flex-col gap-3 rounded-xl border border-[#f3dcc9] bg-[#fff8f2] p-3 text-[#252525]">
    <div className="flex flex-col gap-1"><p className="text-[11px] font-semibold">¿Guardo esto en Contexto del cliente?</p><p className="text-[10px] leading-relaxed text-[#777]">Revisá o corregí los valores antes de guardar.</p></div>
    <div className="flex flex-col gap-2">{values.map((item, index) => <label key={item.field} className="flex flex-col gap-1 text-[10px] font-medium text-[#5a3a22]">{PROFILE_FIELD_LABEL[item.field]}<Input value={item.value} maxLength={600} onChange={(event) => setValues((current) => current.map((entry, position) => (position === index ? { ...entry, value: event.target.value } : entry)))} className="h-8 border-[#ecd9c6] bg-[#ffffff] text-[11px] text-[#252525]" /></label>)}</div>
    <div className="flex justify-end gap-2"><Button type="button" variant="ghost" size="sm" onClick={onDismiss} disabled={saving} className="h-8 px-3 text-[11px] text-[#666] hover:bg-[#fdeee2] hover:text-[#252525]">Descartar</Button><Button type="button" size="sm" disabled={saving || values.some((item) => !item.value.trim())} onClick={() => onSave(values.map((item) => ({ ...item, value: item.value.trim() })))} className="h-8 bg-[#f97316] px-3 text-[11px] text-[#ffffff] hover:bg-[#e7650c]">{saving ? <><LoaderCircle className="size-3.5 animate-spin" />Guardando…</> : 'Guardar'}</Button></div>
  </section>
}

function RecommendationsPanel({ items, total, filters, search, loading, scanning, error, missingContext, onCompleteContext, onScan, onMarkDone, onSearch, onFilters, onSelect, onEdit, onEditWithChat, onPublish, onDiscard }: {
  items: Recommendation[]; total: number; filters: { platform: string; type: string; priority: string; status: string }; search: string; loading: boolean; scanning: boolean; error?: string
  missingContext: string[]
  onCompleteContext: () => void
  onScan: () => void
  onMarkDone: (item: Recommendation) => void
  onSearch: (value: string) => void
  onFilters: (value: { platform: string; type: string; priority: string; status: string }) => void
  onSelect: (item: Recommendation) => void
  onEdit: (item: Recommendation) => void
  onEditWithChat: (item: Recommendation) => void
  onPublish: (item: Recommendation) => void
  onDiscard: (item: Recommendation) => void
}) {
  const blocked = missingContext.length > 0
  return <div className="flex min-h-0 flex-1 flex-col bg-[#fafaf9]">
    <div className="flex shrink-0 flex-col gap-2 border-b border-[#e7e7e5] bg-white px-3 py-2.5">
      <div className="flex items-center gap-2"><span className="text-xs font-semibold">Borradores</span><span className="rounded-full bg-[#fff2e9] px-2 py-0.5 text-[10px] font-semibold text-[#c55208]">{total} pendientes</span><Button type="button" size="sm" onClick={onScan} disabled={scanning || blocked} title={blocked ? 'Completá el contexto del cliente para generar recomendaciones' : undefined} className="ml-auto h-7 bg-[#f97316] px-2.5 text-[10px] text-white hover:bg-[#e7650c]">{scanning ? <><LoaderCircle className="size-3 animate-spin" />Analizando cuentas…</> : <><Sparkles className="size-3" />Generar recomendaciones</>}</Button></div>
      <div className="flex flex-wrap gap-1.5">
        <select aria-label="Filtrar por plataforma" value={filters.platform} onChange={(event) => onFilters({ ...filters, platform: event.target.value })} className="h-8 rounded-md border border-[#e5e5e3] bg-white px-2 text-[10px]"><option value="all">Todas las plataformas</option>{PLATFORM_OPTIONS.map((platform) => <option key={platform} value={platform}>{PLATFORM_LABEL[platform]}</option>)}</select>
        <select aria-label="Filtrar por tipo" value={filters.type} onChange={(event) => onFilters({ ...filters, type: event.target.value })} className="h-8 rounded-md border border-[#e5e5e3] bg-white px-2 text-[10px]"><option value="all">Todos los tipos</option>{TYPE_OPTIONS.map((type) => <option key={type} value={type}>{RECOMMENDATION_TYPE_LABEL[type]}</option>)}</select>
        <select aria-label="Filtrar por prioridad" value={filters.priority} onChange={(event) => onFilters({ ...filters, priority: event.target.value })} className="h-8 rounded-md border border-[#e5e5e3] bg-white px-2 text-[10px]"><option value="all">Toda prioridad</option>{PRIORITY_OPTIONS.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select>
        <div className="flex min-w-[140px] flex-1 items-center gap-1 rounded-md border border-[#e5e5e3] bg-white px-2"><Search className="size-3.5 text-[#888]" /><Input value={search} onChange={(event) => onSearch(event.target.value)} aria-label="Buscar recomendaciones" placeholder="Buscar…" className="h-7 border-0 px-0 text-[10px] shadow-none focus-visible:ring-0" /></div>
      </div>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      {blocked && <section aria-labelledby="context-gate-title" className="mb-3 flex flex-col gap-3 rounded-xl border border-[#f3dcc9] bg-[#ffffff] p-4 text-[#252525]">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#fff2e9]"><Lock className="size-4 text-[#c55208]" aria-hidden="true" /></span>
          <div className="flex min-w-0 flex-col gap-1">
            <h3 id="context-gate-title" className="text-sm font-semibold text-balance">Completá el contexto para usar Recomendaciones</h3>
            <p className="text-[11px] leading-relaxed text-[#666] text-pretty">Sin saber qué vende el cliente y qué busca lograr, Conexa no puede juzgar si una campaña rinde. Respondé en el chat y se guarda en Contexto del cliente.</p>
          </div>
        </div>
        <ul className="flex flex-wrap gap-1.5" aria-label="Datos que faltan">{missingContext.map((label) => <li key={label} className="rounded-full border border-[#f3dcc9] bg-[#fff8f2] px-2.5 py-1 text-[10px] font-medium text-[#8a541e]">{label}</li>)}</ul>
        <Button type="button" size="sm" onClick={onCompleteContext} className="h-8 self-start bg-[#f97316] px-3 text-[11px] text-[#ffffff] hover:bg-[#e7650c]"><MessageCircle className="size-3.5" />Completar en el chat</Button>
      </section>}
      {error && <p role="alert" className="mb-3 rounded-md bg-[#fff3ed] px-3 py-2 text-[11px] text-[#9a3412]">{error}</p>}
      {scanning && <p role="status" className="mb-3 flex items-center gap-2 rounded-md bg-white px-3 py-2 text-[11px] text-[#666]"><LoaderCircle className="size-3.5 animate-spin text-[#f97316]" />Conexa está revisando los últimos 30 días de las cuentas, el CRM y el contexto. Puede tardar un par de minutos.</p>}
      {loading && !error ? <div className="flex flex-col gap-3" aria-label="Generando recomendaciones"><Skeleton className="h-36 w-full bg-[#f0f0ee]" /><Skeleton className="h-36 w-full bg-[#f0f0ee]" /></div> : items.length ? <ul className="flex flex-col gap-3">{items.map((item) => <RecommendationCard key={item.id} item={item} onSelect={() => onSelect(item)} onEdit={() => onEdit(item)} onEditWithChat={() => onEditWithChat(item)} onPublish={() => onPublish(item)} onMarkDone={() => onMarkDone(item)} onDiscard={() => onDiscard(item)} />)}</ul> : <div className="mt-8 rounded-xl border border-dashed border-[#dededb] bg-white p-8 text-center"><Lightbulb className="mx-auto size-5 text-[#f97316]" /><p className="mt-3 text-sm font-semibold">No hay recomendaciones pendientes.</p><p className="mt-1 text-xs text-[#777]">Usá «Generar recomendaciones» o contale al chat sobre el cliente.</p></div>}
    </div>
  </div>
}

function RecommendationCard({ item, onSelect, onEdit, onEditWithChat, onPublish, onMarkDone, onDiscard }: { item: Recommendation; onSelect: () => void; onEdit: () => void; onEditWithChat: () => void; onPublish: () => void; onMarkDone: () => void; onDiscard: () => void }) {
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const manualOnly = !item.operation && Boolean(item.non_executable_reason)
  return <li className="rounded-xl border border-[#e5e5e1] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,.03)]">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="text-sm font-semibold leading-snug"><button type="button" onClick={onSelect} className="text-left hover:text-[#c55208]">{item.title}</button></h3><div className="mt-2 flex flex-wrap items-center gap-1.5">{item.platforms.length ? item.platforms.map((platform) => <PlatformBadge key={platform} platform={platform} />) : <span className="rounded-full bg-[#f2f2f0] px-2 py-1 text-[9px] text-[#555]">Basada en contexto</span>}<span className="rounded-full bg-[#f3f3f1] px-2 py-1 text-[9px]">{RECOMMENDATION_TYPE_LABEL[item.type]}</span><PriorityBadge priority={item.priority} />{item.operation && <span className="inline-flex items-center gap-1 rounded-full bg-[#e7f5ec] px-2 py-1 text-[9px] font-semibold text-[#1b6b38]"><Zap className="size-2.5" aria-hidden="true" />Ejecutable</span>}</div></div><span className="shrink-0 rounded-full bg-[#fff4e9] px-2 py-1 text-[9px] font-semibold text-[#a8440c]">{STATUS_LABEL[item.status]}</span></div>
    <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-[#555]">{item.description}</p>
    <button type="button" aria-expanded={evidenceOpen} onClick={() => setEvidenceOpen((open) => !open)} className="mt-3 inline-flex items-center gap-1 text-[10px] font-semibold text-[#a8440c]">Fundamento <ChevronDown className={cn('size-3 transition-transform', evidenceOpen && 'rotate-180')} /></button>
    {evidenceOpen && <div className="mt-2 flex flex-col gap-2 rounded-lg bg-[#fafaf9] p-3"><p className="text-[11px] leading-relaxed text-[#555]">{item.rationale}</p><ul className="flex flex-col gap-1.5">{item.evidence.map((evidence) => <li key={evidence.id} className="border-l-2 border-[#f97316] pl-2 text-[10px] leading-relaxed text-[#666]"><span className="font-semibold">{evidence.label}: </span>{evidence.excerpt}</li>)}</ul></div>}
    <div className="mt-3"><p className="text-[10px] font-semibold text-[#555]">Acciones sugeridas</p><ol className="mt-1 list-decimal pl-4 text-[10px] leading-relaxed text-[#666]">{item.suggested_actions.map((action, index) => <li key={`${index}-${action}`}>{action}</li>)}</ol></div>
    <p className="mt-2 text-[10px] text-[#555]"><span className="font-semibold">Impacto esperado:</span> {item.expected_impact}</p>
    <div className="mt-3 rounded-lg border border-[#f3dcc9] bg-[#fff8f2] px-3 py-2 text-[10px] leading-relaxed">{item.operation ? <><span className="font-semibold text-[#a8440c]">Al publicar · {PLATFORM_LABEL[item.operation.platform]}:</span> <span className="text-[#5a3a22]">{describeOperation(item.operation)}</span></> : manualOnly ? <><span className="font-semibold text-[#5a3a22]">Acción manual:</span> <span className="text-[#666]">{item.non_executable_reason}</span></> : <span className="text-[#777]">Al publicar, Conexa buscará en Meta Ads o Google Ads la entidad que corresponde y te mostrará el cambio exacto antes de ejecutarlo.</span>}</div>
    {item.execution_error && <p role="alert" className="mt-2 rounded-md bg-[#fff0ec] px-3 py-2 text-[10px] leading-relaxed text-[#b42318]">Último intento falló: {item.execution_error}</p>}
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#eeeeeb] pt-3"><div className="flex flex-wrap gap-1.5"><Button variant="outline" size="sm" onClick={onEdit} className="h-7 px-2 text-[10px]"><FileEdit className="size-3" />Editar</Button><Button variant="outline" size="sm" onClick={onEditWithChat} className="h-7 px-2 text-[10px]"><MessageCircle className="size-3" />Editar con chat</Button><Button variant="ghost" size="sm" onClick={onDiscard} className="h-7 px-2 text-[10px] text-[#777]">Descartar</Button></div>{manualOnly ? <Button size="sm" variant="outline" onClick={onMarkDone} className="h-8 px-3 text-[10px]"><Check className="size-3" />Marcar como hecha</Button> : <Button size="sm" onClick={onPublish} disabled={item.status === 'executing'} className="h-8 bg-[#f97316] px-3 text-[10px] text-white hover:bg-[#e7650c]">{item.status === 'executing' ? <><LoaderCircle className="size-3 animate-spin" />Ejecutando…</> : 'Publicar'}</Button>}</div>
  </li>
}

function HistoryPanel({ items, loading, error, filters, search, onSearch, onStatus, onSelect, onRestore }: { items: Recommendation[]; loading: boolean; error?: string; filters: { status: string }; search: string; onSearch: (value: string) => void; onStatus: (value: string) => void; onSelect: (item: Recommendation) => void; onRestore: (item: Recommendation) => void }) {
  return <div className="flex min-h-0 flex-1 flex-col bg-white">
    <div className="flex shrink-0 flex-col gap-2 border-b border-[#e7e7e5] px-3 py-2.5"><div className="flex items-center gap-2 text-xs font-semibold"><Clock3 className="size-3.5 text-[#f97316]" />Recomendaciones cerradas</div><select aria-label="Filtrar histórico por estado" value={filters.status} onChange={(event) => onStatus(event.target.value)} className="h-8 rounded-md border border-[#e5e5e3] bg-white px-2 text-[10px]"><option value="all">Publicadas y descartadas</option><option value="published">Publicadas</option><option value="discarded">Descartadas</option></select><div className="flex items-center gap-1 rounded-md border border-[#e5e5e3] px-2"><Search className="size-3.5 text-[#888]" /><Input value={search} onChange={(event) => onSearch(event.target.value)} aria-label="Buscar en histórico" placeholder="Buscar en histórico…" className="h-7 border-0 px-0 text-[10px] shadow-none focus-visible:ring-0" /></div></div>
    <div className="min-h-0 flex-1 overflow-y-auto">{error ? <p role="alert" className="m-3 rounded-md bg-[#fff3ed] p-3 text-[10px] text-[#9a3412]">{error}</p> : loading ? <p className="p-4 text-xs text-[#777]">Cargando histórico…</p> : items.length ? <ul className="divide-y divide-[#eeeeeb]">{items.map((item) => <li key={item.id} className="px-3 py-3"><button type="button" onClick={() => onSelect(item)} className="block w-full text-left"><span className={cn('rounded-full px-2 py-0.5 text-[9px] font-semibold', item.status === 'published' ? 'bg-[#e7f5ec] text-[#1b6b38]' : 'bg-[#f1f1ef] text-[#666]')}>{STATUS_LABEL[item.status]}</span><span className="mt-2 block text-xs font-semibold leading-relaxed">{item.title}</span><span className="mt-1 block text-[10px] text-[#777]">{item.platforms.map((platform) => PLATFORM_LABEL[platform]).join(' · ') || 'Basada en contexto'}</span><ExecutionSummary item={item} compact /><span className="mt-1 block text-[9px] text-[#999]">{new Date(item.status === 'published' ? item.published_at ?? item.updated_at : item.discarded_at ?? item.updated_at).toLocaleString('es-AR')} · {item.status === 'published' ? item.published_by_name ?? 'Usuario MDK' : item.discarded_by_name ?? 'Usuario MDK'}</span></button>{item.status === 'discarded' && <Button type="button" variant="outline" size="sm" onClick={() => onRestore(item)} className="mt-2 h-7 px-2 text-[10px]">Restaurar como borrador</Button>}</li>)}</ul> : <div className="px-5 py-12 text-center"><Clock3 className="mx-auto size-5 text-[#b0b0aa]" /><p className="mt-2 text-xs font-medium">Todavía no hay recomendaciones publicadas o descartadas.</p></div>}</div>
  </div>
}

function RecommendationDetail({ item, readonly, onRestore }: { item: Recommendation; readonly: boolean; onRestore?: () => void }) {
  return <>
    <DialogHeader><DialogTitle>{item.title}</DialogTitle><DialogDescription>{readonly ? `${STATUS_LABEL[item.status]} · vista de solo lectura` : 'Detalle de la recomendación'}</DialogDescription></DialogHeader>
    <div className="flex flex-col gap-3 text-sm"><div className="flex flex-wrap gap-1.5">{item.platforms.map((platform) => <PlatformBadge key={platform} platform={platform} />)}<span className="rounded-full bg-[#f3f3f1] px-2 py-1 text-[10px]">{RECOMMENDATION_TYPE_LABEL[item.type]}</span><PriorityBadge priority={item.priority} /></div><p className="whitespace-pre-wrap text-xs leading-relaxed">{item.description}</p><section><h3 className="mb-1 text-xs font-semibold">Fundamento</h3><p className="text-xs leading-relaxed text-[#666]">{item.rationale}</p><ul className="mt-2 flex flex-col gap-2">{item.evidence.map((evidence) => <li key={evidence.id} className="border-l-2 border-[#f97316] pl-2 text-[11px] leading-relaxed"><b>{evidence.label}: </b>{evidence.excerpt}</li>)}</ul></section><section><h3 className="mb-1 text-xs font-semibold">Acciones sugeridas</h3><ol className="list-decimal pl-5 text-xs leading-relaxed">{item.suggested_actions.map((action, index) => <li key={`${index}-${action}`}>{action}</li>)}</ol></section><p className="text-xs"><b>Impacto esperado:</b> {item.expected_impact}</p>{item.operation && <p className="rounded-md bg-[#fff8f2] p-3 text-xs"><b>Acción en {PLATFORM_LABEL[item.operation.platform]}:</b> {describeOperation(item.operation)}</p>}{!item.operation && item.non_executable_reason && <p className="rounded-md bg-[#fafaf9] p-3 text-xs"><b>Acción manual:</b> {item.non_executable_reason}</p>}{item.execution_result && <div className="rounded-md bg-[#f4faf6] p-3 text-xs text-[#1b6b38]"><p className="font-semibold">Ejecutado el {new Date(item.execution_result.executedAt).toLocaleString('es-AR')}</p><ExecutionSummary item={item} /></div>}{item.discard_reason && <p className="rounded-md bg-[#f5f5f4] p-3 text-xs"><b>Motivo del descarte:</b> {item.discard_reason}</p>}</div>
    {onRestore && <DialogFooter><Button onClick={onRestore}>Restaurar como borrador</Button></DialogFooter>}
  </>
}

function EditRecommendationDialog({ item, onCancel, onSave }: { item: Recommendation; onCancel: () => void; onSave: (patch: Recommendation) => Promise<void> }) {
  const [draft, setDraft] = useState(() => ({ ...item, suggested_actions: [...item.suggested_actions] }))
  const [actionText, setActionText] = useState(item.suggested_actions.join('\n'))
  const [saving, setSaving] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try { await onSave({ ...draft, suggested_actions: actionText.split('\n').map((action) => action.trim()).filter(Boolean) }) } finally { setSaving(false) }
  }
  return <form onSubmit={submit} className="flex flex-col gap-3">
    <DialogHeader><DialogTitle>Editar borrador</DialogTitle><DialogDescription>Los cambios solo modifican esta recomendación; no afectan al cliente ni a las plataformas.</DialogDescription></DialogHeader>
    <label className="flex flex-col gap-1 text-xs font-medium">Título<Input value={draft.title} maxLength={140} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
    <div className="grid grid-cols-2 gap-3"><label className="flex flex-col gap-1 text-xs font-medium">Tipo<select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as RecommendationType })} className="h-9 rounded-md border border-[#e5e5e3] bg-white px-2 text-xs">{TYPE_OPTIONS.map((type) => <option key={type} value={type}>{RECOMMENDATION_TYPE_LABEL[type]}</option>)}</select></label><label className="flex flex-col gap-1 text-xs font-medium">Prioridad<select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as RecommendationPriority })} className="h-9 rounded-md border border-[#e5e5e3] bg-white px-2 text-xs">{PRIORITY_OPTIONS.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select></label></div>
    <fieldset className="flex flex-col gap-1.5"><legend className="text-xs font-medium">Plataformas involucradas</legend><div className="flex flex-wrap gap-2">{PLATFORM_OPTIONS.map((platform) => <label key={platform} className="flex items-center gap-1.5 rounded-md border border-[#e7e7e5] px-2 py-1.5 text-[10px]"><input type="checkbox" checked={draft.platforms.includes(platform)} onChange={(event) => setDraft({ ...draft, platforms: event.target.checked ? [...draft.platforms, platform] : draft.platforms.filter((item) => item !== platform) })} />{PLATFORM_LABEL[platform]}</label>)}</div></fieldset>
    <label className="flex flex-col gap-1 text-xs font-medium">Descripción<Textarea value={draft.description} maxLength={900} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
    <label className="flex flex-col gap-1 text-xs font-medium">Fundamento<Textarea value={draft.rationale} maxLength={1000} onChange={(event) => setDraft({ ...draft, rationale: event.target.value })} /></label>
    <label className="flex flex-col gap-1 text-xs font-medium">Acciones sugeridas (una por línea)<Textarea value={actionText} onChange={(event) => setActionText(event.target.value)} /></label>
    <label className="flex flex-col gap-1 text-xs font-medium">Impacto esperado<Input value={draft.expected_impact} maxLength={400} onChange={(event) => setDraft({ ...draft, expected_impact: event.target.value })} /></label>
    {draft.operation && <OperationFields operation={draft.operation} onChange={(operation) => setDraft({ ...draft, operation })} />}
    <DialogFooter><Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</Button></DialogFooter>
  </form>
}

function OperationFields({ operation, onChange }: { operation: RecommendationOperation; onChange: (operation: RecommendationOperation) => void }) {
  const numberValue = (value: string) => (value === '' ? Number.NaN : Number(value))
  return <fieldset className="flex flex-col gap-2 rounded-lg border border-[#f3dcc9] bg-[#fff8f2] p-3">
    <legend className="px-1 text-xs font-semibold text-[#a8440c]">Acción que ejecuta Publicar</legend>
    <p className="text-[11px] text-[#5a3a22]">{describeOperation(operation)}</p>
    {operation.kind === 'set_status' && <label className="flex flex-col gap-1 text-xs font-medium">Estado<select value={operation.status} onChange={(event) => onChange(operation.platform === 'meta' ? { ...operation, status: event.target.value as 'ACTIVE' | 'PAUSED' } : { ...operation, status: event.target.value as 'ENABLED' | 'PAUSED' })} className="h-9 rounded-md border border-[#e5e5e3] bg-white px-2 text-xs"><option value={operation.platform === 'meta' ? 'ACTIVE' : 'ENABLED'}>Activar</option><option value="PAUSED">Pausar</option></select></label>}
    {operation.kind === 'set_daily_budget' && <label className="flex flex-col gap-1 text-xs font-medium">Presupuesto diario nuevo (en la moneda de la cuenta)<Input type="number" min={0} step="0.01" value={Number.isNaN(operation.dailyBudget) ? '' : operation.dailyBudget} onChange={(event) => onChange({ ...operation, dailyBudget: numberValue(event.target.value) })} /></label>}
    {operation.kind === 'create_campaign' && <>
      <label className="flex flex-col gap-1 text-xs font-medium">Nombre de la campaña<Input value={operation.campaignName} maxLength={120} onChange={(event) => onChange({ ...operation, campaignName: event.target.value })} /></label>
      <label className="flex flex-col gap-1 text-xs font-medium">Nombre del conjunto<Input value={operation.adsetName} maxLength={120} onChange={(event) => onChange({ ...operation, adsetName: event.target.value })} /></label>
      <label className="flex flex-col gap-1 text-xs font-medium">Presupuesto diario (en la moneda de la cuenta)<Input type="number" min={0} step="0.01" value={Number.isNaN(operation.dailyBudget) ? '' : operation.dailyBudget} onChange={(event) => onChange({ ...operation, dailyBudget: numberValue(event.target.value) })} /></label>
      <div className="grid grid-cols-2 gap-3"><label className="flex flex-col gap-1 text-xs font-medium">Edad mínima (vacío = la del modelo)<Input type="number" min={18} max={65} value={operation.ageMin ?? ''} onChange={(event) => onChange({ ...operation, ageMin: event.target.value === '' ? null : numberValue(event.target.value) })} /></label><label className="flex flex-col gap-1 text-xs font-medium">Edad máxima (65 = 65+)<Input type="number" min={18} max={65} value={operation.ageMax ?? ''} onChange={(event) => onChange({ ...operation, ageMax: event.target.value === '' ? null : numberValue(event.target.value) })} /></label></div>
      <p className="text-[11px] text-[#5a3a22]">Modelo: «{operation.templateAdsetName}» · Creatividades: {operation.ads.map((ad) => `«${ad.name}»`).join(', ')}</p>
    </>}
    {operation.kind === 'set_age_range' && <div className="grid grid-cols-2 gap-3"><label className="flex flex-col gap-1 text-xs font-medium">Edad mínima<Input type="number" min={18} max={65} value={Number.isNaN(operation.ageMin) ? '' : operation.ageMin} onChange={(event) => onChange({ ...operation, ageMin: numberValue(event.target.value) })} /></label><label className="flex flex-col gap-1 text-xs font-medium">Edad máxima (65 = 65+)<Input type="number" min={18} max={65} value={Number.isNaN(operation.ageMax) ? '' : operation.ageMax} onChange={(event) => onChange({ ...operation, ageMax: numberValue(event.target.value) })} /></label></div>}
    <p className="text-[10px] leading-relaxed text-[#777]">Al guardar se valida contra las cuentas vinculadas y el tope de ±30% de presupuesto.</p>
  </fieldset>
}

function PlanSteps({ steps }: { steps: PlanStep[] }) {
  return <ul className="flex flex-col gap-2">{steps.map((step) => <li key={`${step.entityId}-${step.field}`} className={cn('rounded-lg border p-3', step.alreadyApplied ? 'border-[#e7e7e5] bg-[#fafaf9] opacity-70' : 'border-[#f3dcc9] bg-[#fff8f2]')}>
    <div className="flex items-start justify-between gap-2"><p className="text-xs font-semibold leading-snug">{step.entityName}</p><span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[9px] font-medium text-[#666]">{PLATFORM_LABEL[step.platform]} · {step.entityType === 'campaign' ? 'Campaña' : step.entityType === 'adset' ? 'Conjunto' : 'Anuncio'}</span></div>
    {step.alreadyApplied ? <p className="mt-1.5 text-[11px] text-[#666]">Ya aplicado ({step.afterLabel}); se omite.</p> : <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]"><span className="text-[#666]">{step.beforeLabel}</span><ArrowRight className="size-3 text-[#a8440c]" aria-label="pasa a" /><span className="font-semibold text-[#a8440c]">{step.afterLabel}</span>{step.pctChange !== null && <span className="rounded-full bg-white px-1.5 py-0.5 text-[9px] font-semibold text-[#5a3a22]">{step.pctChange > 0 ? '+' : ''}{Math.round(step.pctChange * 100)}%</span>}</p>}
    {step.warnings.map((warning) => <p key={warning} className="mt-1.5 flex items-start gap-1.5 text-[10px] leading-relaxed text-[#8a541e]"><AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden="true" />{warning}</p>)}
  </li>)}</ul>
}

/** Antes → después por entidad desde las decisiones registradas, con respaldo en execution_result para filas anteriores. */
function ExecutionSummary({ item, compact = false }: { item: Recommendation; compact?: boolean }) {
  const decisions = (item.decisions ?? []).filter((decision: DecisionRecord) => decision.action === 'publish')
  const lines = decisions.length
    ? decisions.map((decision) => ({ key: decision.id, text: `${decision.payload?.step?.entityName ?? 'Entidad'}: ${decision.value_before?.label ?? String(decision.value_before?.value ?? '')} → ${decision.value_after?.label ?? String(decision.value_after?.value ?? '')}`, failed: decision.outcome === 'failed', who: decision.user_name }))
    : executionLines(item.execution_result).map((text, index) => ({ key: String(index), text, failed: text.endsWith('(falló)'), who: null as string | null | undefined }))
  if (!lines.length) return null
  return <span className={cn('flex flex-col gap-1', compact ? 'mt-1.5 rounded-md bg-[#f4faf6] px-2 py-1.5 text-[10px] leading-relaxed text-[#1b6b38]' : 'mt-1 text-xs')}>{lines.map((line) => <span key={line.key} className={cn('block', line.failed && 'text-[#b42318]')}>{line.text}{line.failed && decisions.length ? ' (falló)' : ''}{!compact && line.who ? ` · ${line.who}` : ''}</span>)}</span>
}

function PlatformBadge({ platform }: { platform: RecommendationPlatform }) {
  const Icon = platform === 'meta' ? Users : platform === 'google_ads' ? Search : platform === 'ga4' ? BarChart3 : platform === 'tag_manager' ? Tag : Database
  const logo = PLATFORM_LOGOS[platform]
  return <span className="inline-flex items-center gap-1 rounded-full border border-[#e8e8e5] bg-white px-2 py-1 text-[9px] font-medium">{logo ? <img src={logo} alt="" className="size-3 object-contain" /> : <Icon className="size-3 text-[#f97316]" aria-hidden="true" />}{PLATFORM_LABEL[platform]}</span>
}

function PriorityBadge({ priority }: { priority: RecommendationPriority }) {
  const colors = priority === 'alta' ? 'bg-[#fff0ec] text-[#b42318]' : priority === 'media' ? 'bg-[#fff5e9] text-[#9a5b10]' : 'bg-[#eff5f0] text-[#486653]'
  return <span className={cn('rounded-full px-2 py-1 text-[9px] font-semibold', colors)}>{priority}</span>
}
