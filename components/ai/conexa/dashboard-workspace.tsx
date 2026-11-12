'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import useSWR from 'swr'
import { ArrowDownToLine, Check, ChevronDown, FilePlus2, FileText, LayoutDashboard, LoaderCircle, Maximize2, Minimize2, Paperclip, Pencil, RefreshCw, Send, Trash2, X } from 'lucide-react'
import { DashboardConfigSchema, type DashboardConfig } from '@/lib/conexa/dashboard-presets'
import { DashboardBlockRenderer, getDashboardBlockRows } from './dashboard-block-renderer'
import { DashboardHistory } from './dashboard-history'
import { withDerivedDashboardMetrics } from '@/lib/conexa/dashboard-derived-metrics'
import { cn } from '@/lib/utils'
import { dashboardApiFetch } from '@/lib/conexa/dashboard-fetch'
import { MessageContent } from '@/components/chat/message-content'

type Platform = { name: string; key: string; color: string; iconUrl: string | null; connected: boolean; detail: string }
type MetricMap = Record<string, Array<{ label: string; value: number }>>
type DashboardRecord = { id: string; client_id: string; name: string; config: DashboardConfig; created_at: string; updated_at: string; is_default: boolean }
type ChatResponse = { kind: 'answer' | 'clarification' | 'proposal'; text: string; summary: string | null; config: DashboardConfig | null }
type ChatAttachment = { filename: string; mediaType: string }
type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string; response?: ChatResponse; attachments?: ChatAttachment[] }
type Props = { clientId: string | null; clientName: string | null; userId: string | null; period: string; platforms: Platform[]; metrics: MetricMap; platformData: Record<string, unknown>; loading: boolean; updatedAt: number | null; onRefresh: () => void; onConnections: () => void; defaultDashboard: (hiddenPlatforms: string[]) => ReactNode }
const jsonFetcher = async (url: string) => { const response = await dashboardApiFetch(url); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error ?? 'No se pudo cargar la información.'); return payload }
const dateLabel = (date: Date) => new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
const DASHBOARD_FILE_LIMIT = 5
const DASHBOARD_FILE_SIZE_LIMIT = 15 * 1024 * 1024
const DASHBOARD_FILE_TYPES = new Set(['csv', 'xls', 'xlsx', 'pdf', 'docx', 'png', 'jpg', 'jpeg', 'webp', 'gif'])
const periods = (data: Record<string, unknown>) => { const range = data.range && typeof data.range === 'object' ? data.range as Record<string, unknown> : {}; return { dateFrom: String(range.dateFrom ?? ''), dateTo: String(range.dateTo ?? '') } }
const describeUpdate = (updatedAt: number | null, now: number) => { if (!updatedAt) return 'Esperando datos'; const minutes = Math.max(0, Math.floor((now - updatedAt) / 60_000)); return minutes < 1 ? 'Actualizado hace menos de 1 min' : `Actualizado hace ${minutes} min` }
const defaultDashboardConfig = (period: string): DashboardConfig => ({ version: 1, period, useDefaultLayout: true, hiddenPlatforms: [], hiddenBlockIds: [], blocks: [] })

function applyDashboardConfigDelta(base: DashboardConfig, proposal: DashboardConfig, target: DashboardConfig): DashboardConfig {
  if (base.useDefaultLayout !== proposal.useDefaultLayout) return proposal

  const baseIds = new Set(base.blocks.map((block) => block.id))
  const proposalIds = new Set(proposal.blocks.map((block) => block.id))
  const removedIds = new Set(base.blocks.filter((block) => !proposalIds.has(block.id)).map((block) => block.id))
  const changedBlocks = proposal.blocks.filter((block) => {
    const original = base.blocks.find((candidate) => candidate.id === block.id)
    return original && JSON.stringify(original) !== JSON.stringify(block)
  })
  const addedBlocks = proposal.blocks.filter((block) => !baseIds.has(block.id))
  const blocks = target.blocks
    .filter((block) => !removedIds.has(block.id))
    .map((block) => changedBlocks.find((candidate) => candidate.id === block.id) ?? block)
  const existingIds = new Set(blocks.map((block) => block.id))
  for (const block of addedBlocks) if (!existingIds.has(block.id)) blocks.push(block)

  const hiddenPlatforms = new Set(target.hiddenPlatforms)
  for (const platform of base.hiddenPlatforms) if (!proposal.hiddenPlatforms.includes(platform)) hiddenPlatforms.delete(platform)
  for (const platform of proposal.hiddenPlatforms) if (!base.hiddenPlatforms.includes(platform)) hiddenPlatforms.add(platform)

  const hiddenBlockIds = new Set(target.hiddenBlockIds)
  for (const id of base.hiddenBlockIds) if (!proposal.hiddenBlockIds.includes(id)) hiddenBlockIds.delete(id)
  for (const id of proposal.hiddenBlockIds) if (!base.hiddenBlockIds.includes(id)) hiddenBlockIds.add(id)
  const validBlockIds = new Set(blocks.map((block) => block.id))

  return {
    ...target,
    period: base.period !== proposal.period ? proposal.period : target.period,
    hiddenPlatforms: [...hiddenPlatforms],
    hiddenBlockIds: [...hiddenBlockIds].filter((id) => validBlockIds.has(id)),
    blocks,
  }
}

function chatMessage(row: Record<string, unknown>): ChatMessage | null {
  if ((row.role !== 'assistant' && row.role !== 'user') || typeof row.content !== 'string') return null
  const messageData = row.message_data && typeof row.message_data === 'object' ? row.message_data as Record<string, unknown> : null
  const attachments = Array.isArray(messageData?.attachments) ? messageData.attachments.filter((item): item is ChatAttachment => Boolean(item && typeof item === 'object' && typeof (item as ChatAttachment).filename === 'string' && typeof (item as ChatAttachment).mediaType === 'string')) : undefined
  if (row.role === 'assistant') {
    const dashboardResponse = messageData?.dashboard_response as ChatResponse | undefined
    if (dashboardResponse && typeof dashboardResponse.text === 'string') {
      return { id: String(row.id), role: 'assistant', content: row.content, response: dashboardResponse }
    }
    try {
      const parsed = JSON.parse(row.content) as ChatResponse
      if (parsed && typeof parsed.text === 'string') return { id: String(row.id), role: 'assistant', content: parsed.text, response: parsed }
    } catch { /* Older plain-text messages remain readable. */ }
  }
  return { id: String(row.id), role: row.role, content: row.content, attachments }
}

export function DashboardWorkspace({ clientId, clientName, userId, period, platforms, metrics, platformData, loading, updatedAt, onRefresh, onConnections, defaultDashboard }: Props) {
  const [selectedBoardId, setSelectedBoardId] = useState('default')
  const [draftConfig, setDraftConfig] = useState<DashboardConfig | null>(null)
  const [proposalConfig, setProposalConfig] = useState<DashboardConfig | null>(null)
  const [proposalBaseConfig, setProposalBaseConfig] = useState<DashboardConfig | null>(null)
  const [draftSummary, setDraftSummary] = useState<string | null>(null)
  const [saveMode, setSaveMode] = useState<'new' | 'existing' | null>(null)
  const [targetBoardId, setTargetBoardId] = useState('')
  const [newBoardName, setNewBoardName] = useState('')
  const [boardMenuOpen, setBoardMenuOpen] = useState(false)
  const [mobilePanel, setMobilePanel] = useState<'chat' | 'board' | 'history'>('board')
  const [collapsed, setCollapsed] = useState({ chat: false, board: false, history: false })
  const [hydratedPanels, setHydratedPanels] = useState(false)
  const [fullPanel, setFullPanel] = useState<'chat' | 'board' | 'history' | null>(null)
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<File[]>([])
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const chatRequestControllerRef = useRef<AbortController | null>(null)
  const [chatBusy, setChatBusy] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportName, setReportName] = useState('')
  const [reportBusy, setReportBusy] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [refreshFeedback, setRefreshFeedback] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const selectedDashboardId = selectedBoardId === 'default' ? null : selectedBoardId
  const boardUrl = clientId ? `/api/conexa/dashboard/boards?clientId=${encodeURIComponent(clientId)}` : null
  const messagesUrl = clientId ? `/api/conexa/dashboard/messages?clientId=${encodeURIComponent(clientId)}` : null
  const { data: boardResult, error: boardError, mutate: mutateBoards } = useSWR<{ dashboards: DashboardRecord[] }>(boardUrl, jsonFetcher, { revalidateOnFocus: false })
  const { data: messageResult, error: messagesError, mutate: mutateMessages } = useSWR<{ conversationId: string; messages: Record<string, unknown>[] }>(messagesUrl, jsonFetcher, { revalidateOnFocus: false, revalidateOnMount: true })
  const conversationId = messageResult?.conversationId ?? null
  const boards = boardResult?.dashboards ?? []
  const messages = useMemo(() => (messageResult?.messages ?? []).map(chatMessage).filter((item): item is ChatMessage => Boolean(item)), [messageResult])
  const selectedBoard = boards.find((board) => board.id === selectedBoardId) ?? null
  const activeConfig = draftConfig ?? selectedBoard?.config ?? null
  const hiddenPlatforms = activeConfig?.hiddenPlatforms ?? []
  const hiddenBlockIds = activeConfig?.hiddenBlockIds ?? []
  const visibleBlocks = activeConfig?.blocks.filter((block) => !hiddenPlatforms.includes(block.platform) && !hiddenBlockIds.includes(block.id)) ?? []
  const blockPlatforms = activeConfig?.blocks.some((block) => block.platform === 'file')
    ? [...platforms, { name: 'Archivo adjunto', key: 'file', color: '#F97316', iconUrl: null, connected: true, detail: 'Datos guardados en este tablero' }]
    : platforms
  const displayName = draftConfig ? 'Vista previa sin guardar' : selectedBoard?.name ?? 'Tablero por defecto'
  const defaultRange = useMemo(() => periods(platformData), [platformData])
  const needsComparison = Boolean(activeConfig?.blocks.some((block) => block.type === 'kpi' && block.metric))
  const comparisonKey = clientId && needsComparison && defaultRange.dateFrom && defaultRange.dateTo ? ['conexa-dashboard-previous', clientId, defaultRange.dateFrom, defaultRange.dateTo] as const : null
  const { data: previousMetrics } = useSWR<MetricMap>(comparisonKey, async ([, selectedClientId, currentFrom, currentTo]) => {
    const currentStart = new Date(`${currentFrom}T00:00:00Z`)
    const currentEnd = new Date(`${currentTo}T00:00:00Z`)
    const dayCount = Math.max(1, Math.round((currentEnd.getTime() - currentStart.getTime()) / 86_400_000) + 1)
    const previousEnd = new Date(currentStart.getTime() - 86_400_000)
    const previousStart = new Date(previousEnd.getTime() - (dayCount - 1) * 86_400_000)
    const formatDate = (date: Date) => date.toISOString().slice(0, 10)
    const response = await fetch('/api/conexa/data', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId: selectedClientId, period: 'Personalizado', customRange: { from: formatDate(previousStart), to: formatDate(previousEnd) }, selectedAccounts: {}, crmFilters: {} }) })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error ?? 'No se pudo consultar el período anterior.')
    return (payload.platformMetrics ?? {}) as MetricMap
  }, { refreshInterval: 60 * 60 * 1000, revalidateOnFocus: false })
  const displayMetrics = useMemo(() => withDerivedDashboardMetrics(metrics), [metrics])
  const displayPreviousMetrics = useMemo(() => withDerivedDashboardMetrics(previousMetrics ?? {}), [previousMetrics])

  useEffect(() => {
    chatRequestControllerRef.current?.abort()
    chatRequestControllerRef.current = null
    setInput('')
    setAttachments([])
    setAttachmentError(null)
    setChatError(null)
    setChatBusy(false)
    setSelectedBoardId('default')
    setDraftConfig(null)
    setProposalConfig(null)
    setProposalBaseConfig(null)
    setDraftSummary(null)
    setSaveMode(null)
    setTargetBoardId('')
  }, [clientId])

  useEffect(() => {
    const key = `conexa-dashboard-panels:${userId ?? 'guest'}`
    try {
      const saved = localStorage.getItem(key)
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<typeof collapsed>
        setCollapsed({ chat: Boolean(parsed.chat), board: Boolean(parsed.board), history: Boolean(parsed.history) })
      }
    } catch { /* Ignore invalid local layout preferences. */ }
    setHydratedPanels(true)
  }, [userId])

  useEffect(() => {
    if (!hydratedPanels) return
    try { localStorage.setItem(`conexa-dashboard-panels:${userId ?? 'guest'}`, JSON.stringify(collapsed)) } catch { /* Browser storage can be disabled by policy. */ }
  }, [collapsed, hydratedPanels, userId])

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { setFullPanel(null); setReportOpen(false) } }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ block: 'end' }) }, [messages.length, chatBusy])

  const showPanel = useCallback((panel: 'chat' | 'board' | 'history') => {
    setFullPanel(panel)
    setMobilePanel(panel)
  }, [])

  const focusChat = () => {
    if (window.matchMedia('(max-width: 1023px)').matches) setMobilePanel('chat')
    setInput(`Quiero modificar el tablero “${selectedBoard?.name ?? 'Tablero por defecto'}”. `)
    window.setTimeout(() => inputRef.current?.focus(), 30)
  }

  const handleFilesSelected = (fileList: FileList | null) => {
    if (!fileList?.length) return
    const incoming = Array.from(fileList)
    setAttachmentError(null)
    const unsupported = incoming.find((file) => !DASHBOARD_FILE_TYPES.has(file.name.split('.').pop()?.toLowerCase() ?? ''))
    if (unsupported) { setAttachmentError(`El formato de “${unsupported.name}” no está admitido.`); return }
    const tooLarge = incoming.find((file) => file.size > DASHBOARD_FILE_SIZE_LIMIT)
    if (tooLarge) { setAttachmentError(`“${tooLarge.name}” supera el límite de 15 MB.`); return }
    setAttachments((current) => {
      if (current.length + incoming.length > DASHBOARD_FILE_LIMIT) {
        setAttachmentError(`Podés adjuntar hasta ${DASHBOARD_FILE_LIMIT} archivos por mensaje.`)
        return current
      }
      return [...current, ...incoming]
    })
  }

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault()
    const message = input.trim() || (attachments.length > 0 ? 'Analizá los archivos adjuntos y proponé ítems para el tablero.' : '')
    if (!clientId || !conversationId || !message || chatBusy) return
    setChatError(null)
    setAttachmentError(null)
    setChatBusy(true)
    const controller = new AbortController()
    chatRequestControllerRef.current = controller
    const sendingAttachments = [...attachments]
    setInput('')
    const optimisticUser = {
      id: `pending-${crypto.randomUUID()}`,
      role: 'user',
      content: message,
      created_at: new Date().toISOString(),
      message_data: sendingAttachments.length ? { attachments: sendingAttachments.map((file) => ({ filename: file.name, mediaType: file.type })) } : null,
    }
    void mutateMessages((current) => ({ conversationId: current?.conversationId ?? conversationId, messages: [...(current?.messages ?? []), optimisticUser] }), { revalidate: false })
    try {
      const body = { clientId, dashboardId: selectedDashboardId, conversationId, clientName: clientName ?? '', dashboardName: draftConfig ? 'Vista previa sin guardar' : selectedBoard?.name ?? 'Tablero por defecto', message, period, platforms: blockPlatforms.map(({ key, name, connected }) => ({ key, name, connected })), platformMetrics: displayMetrics, platformData, currentConfig: activeConfig ?? defaultDashboardConfig(period) }
      let response: Response
      if (sendingAttachments.length > 0) {
        const form = new FormData()
        form.set('payload', JSON.stringify(body))
        sendingAttachments.forEach((file) => form.append('files', file, file.name))
        response = await dashboardApiFetch('/api/conexa/dashboard/assistant', { method: 'POST', body: form, signal: controller.signal })
      } else {
        response = await dashboardApiFetch('/api/conexa/dashboard/assistant', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal })
      }
      const payload = await response.json().catch(() => ({})) as ChatResponse & { error?: string }
      if (!response.ok) throw new Error(response.status === 401 ? 'Tu sesión de MDK no está activa. Iniciá sesión y volvé a intentar.' : payload.error ?? 'No se pudo enviar el mensaje.')
      setAttachments([])
      if (payload.kind === 'proposal' && payload.config) {
        const validation = DashboardConfigSchema.safeParse(payload.config)
        if (!validation.success) throw new Error('La propuesta no pasó la validación del tablero.')
        setDraftConfig(validation.data)
        setProposalConfig(validation.data)
        setProposalBaseConfig(activeConfig ?? defaultDashboardConfig(period))
        setDraftSummary(payload.summary)
        setSaveMode(null)
        setTargetBoardId('')
      }
      await mutateMessages()
    } catch (cause) {
      if (controller.signal.aborted) return
      setChatError(cause instanceof Error ? cause.message : 'Conexa no pudo responder.')
      void mutateMessages()
    } finally {
      if (chatRequestControllerRef.current === controller) {
        chatRequestControllerRef.current = null
        setChatBusy(false)
      }
    }
  }

  const saveBoard = async () => {
    if (!clientId || !draftConfig || !saveMode) return
    if (saveMode === 'new' && !newBoardName.trim()) return
    if (saveMode === 'existing' && !targetBoardId) return
    const targetBoard = boards.find((board) => board.id === targetBoardId)
    const configToSave = saveMode === 'existing' && targetBoard && proposalBaseConfig && proposalConfig
      ? applyDashboardConfigDelta(proposalBaseConfig, proposalConfig, targetBoard.config)
      : draftConfig
    const response = await dashboardApiFetch('/api/conexa/dashboard/boards', {
      method: saveMode === 'new' ? 'POST' : 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(saveMode === 'new' ? { clientId, name: newBoardName.trim(), config: configToSave } : { id: targetBoardId, clientId, config: configToSave }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) { setChatError(payload.error ?? 'No se pudo guardar el tablero.'); return }
    await mutateBoards()
    setSelectedBoardId(payload.dashboard.id)
    setDraftConfig(null)
    setProposalConfig(null)
    setProposalBaseConfig(null)
    setDraftSummary(null)
    setSaveMode(null)
    setNewBoardName('')
    setTargetBoardId('')
  }

  const deleteBoard = async (board: DashboardRecord) => {
    if (!clientId || !window.confirm(`¿Eliminar el tablero “${board.name}”? Los informes guardados como snapshot se conservan.`)) return
    try {
      const response = await dashboardApiFetch('/api/conexa/dashboard/boards', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: board.id, clientId }) })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo eliminar el tablero.')
      await mutateBoards()
      setBoardMenuOpen(false)
      if (selectedBoardId === board.id) {
        setSelectedBoardId('default')
        setDraftConfig(null)
        setProposalConfig(null)
        setProposalBaseConfig(null)
        setDraftSummary(null)
        setSaveMode(null)
        setTargetBoardId('')
      }
    } catch (cause) {
      window.alert(cause instanceof Error ? cause.message : 'No se pudo eliminar el tablero.')
    }
  }

  const saveReport = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!clientId || !reportName.trim()) return
    setReportBusy(true)
    setReportError(null)
    const config = activeConfig ?? defaultDashboardConfig(period)
    const hidden = new Set(config.hiddenPlatforms)
    const visibleMetrics = Object.fromEntries(Object.entries(displayMetrics).filter(([platform]) => !hidden.has(platform)))
    const visiblePreviousMetrics = Object.fromEntries(Object.entries(displayPreviousMetrics).filter(([platform]) => !hidden.has(platform)))
    const hiddenDataKeys = new Set(config.hiddenPlatforms.flatMap((platform) => platform === 'tag_manager' ? ['tag_manager', 'tagManager'] : [platform]))
    const visiblePlatformData = Object.fromEntries(Object.entries(platformData).filter(([key]) => !hiddenDataKeys.has(key)))
    const tables = config.blocks.filter((block) => block.type === 'table' && !config.hiddenBlockIds.includes(block.id) && !hidden.has(block.platform)).map((block) => ({ title: block.title, platform: block.platform, columns: block.columns, rows: getDashboardBlockRows(block, platformData) }))
    const snapshot = { clientName, period: config.period ?? period, range: defaultRange, platformMetrics: visibleMetrics, previousPlatformMetrics: visiblePreviousMetrics, platformData: visiblePlatformData, tables, savedAt: new Date().toISOString() }
    try {
      const response = await dashboardApiFetch('/api/conexa/dashboard/reports', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId, dashboardId: draftConfig ? null : selectedDashboardId, name: reportName.trim(), config, snapshot, periodStart: defaultRange.dateFrom || null, periodEnd: defaultRange.dateTo || null }) })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo guardar el informe.')
      setReportOpen(false)
      setReportName('')
      window.dispatchEvent(new CustomEvent('conexa-dashboard-report-saved'))
    } catch (cause) { setReportError(cause instanceof Error ? cause.message : 'No se pudo guardar el informe.') }
    finally { setReportBusy(false) }
  }

  const openReportDialog = () => {
    setReportError(null)
    setReportName(`${displayName.replace('Vista previa sin guardar', selectedBoard?.name ?? 'Tablero por defecto')} – ${dateLabel(new Date())}`)
    setReportOpen(true)
  }

  const requestRefresh = () => {
    onRefresh()
    setRefreshFeedback(true)
    window.setTimeout(() => setRefreshFeedback(false), 1800)
  }

  const columns = useMemo(() => {
    const desktop = [collapsed.chat ? '42px' : 'minmax(240px, 1fr)', collapsed.board ? '42px' : 'minmax(430px, 2fr)', collapsed.history ? '42px' : 'minmax(240px, 1fr)']
    return desktop.join(' ')
  }, [collapsed])

  const panelHeader = (panel: 'chat' | 'board' | 'history', title: string, icon: ReactNode, collapseLabel: string, children?: ReactNode) => {
    const isCollapsed = collapsed[panel]
    const isFull = fullPanel === panel
    if (isCollapsed && !isFull) return <button type="button" onClick={() => setCollapsed((current) => ({ ...current, [panel]: false }))} aria-label={`Expandir panel ${title}`} className="hidden h-full w-[42px] shrink-0 flex-col items-center justify-start gap-3 border-r border-[#e7e7e5] bg-[#fafaf9] py-4 text-[#555] lg:flex"><span className="text-[#F97316]">{icon}</span><span className="text-[10px] font-semibold [writing-mode:vertical-rl] rotate-180">{title}</span></button>
    return <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[#eeeeec] bg-white px-3"><span className="text-[#F97316]">{icon}</span><h2 className="min-w-0 flex-1 truncate text-xs font-semibold text-[#2a2a2a]">{title}</h2>{children}<button type="button" onClick={() => { setCollapsed((current) => ({ ...current, [panel]: true })); if (isFull) setFullPanel(null) }} aria-label={collapseLabel} title={collapseLabel} className="hidden rounded-md p-1.5 text-[#777] hover:bg-[#f5f5f4] lg:inline-flex"><Minimize2 className="size-4" /></button>{!isFull && <button type="button" onClick={() => showPanel(panel)} aria-label={`Expandir ${title} a pantalla completa`} title="Pantalla completa" className="rounded-md p-1.5 text-[#777] hover:bg-[#f5f5f4]"><Maximize2 className="size-4" /></button>}{isFull && <button type="button" onClick={() => setFullPanel(null)} aria-label="Cerrar pantalla completa" className="rounded-md p-1.5 text-[#555] hover:bg-[#f5f5f4]"><X className="size-4" /></button>}</header>
  }

  const chatPanel = <section className="flex min-h-0 min-w-0 flex-col bg-white" aria-label="Chat Conexa">
    {panelHeader('chat', 'Chat Conexa', <span className="text-sm font-bold">✦</span>, 'Colapsar Chat Conexa')}
    {messagesError && <p role="alert" className="border-b border-[#f0e5d9] bg-[#fff8f1] px-3 py-2 text-[10px] text-[#8a541e]">{messagesError.message}</p>}
    {!userId && <p role="status" className="border-b border-[#f0e5d9] bg-[#fff8f1] px-3 py-2 text-[10px] text-[#8a541e]">Iniciá sesión con tu usuario de MDK para editar tableros. <a href="/auth/login" className="font-semibold underline">Iniciar sesión</a></p>}
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      {messages.length === 0 && <div className="mt-5 rounded-xl border border-[#eeeeec] bg-[#fafaf9] p-4"><p className="text-xs font-semibold text-[#333]">¿Qué querés analizar?</p><p className="mt-2 text-[11px] leading-5 text-[#777]">Puedo responder sobre los datos disponibles o proponer cambios en este tablero. Antes de guardar, vas a revisar el cambio.</p><div className="mt-3 flex flex-col gap-1.5">{['¿Qué métricas tengo disponibles?', 'Mostrame las campañas con más inversión'].map((suggestion) => <button type="button" key={suggestion} onClick={() => setInput(suggestion)} className="rounded-md border border-[#e7e7e5] bg-white px-2.5 py-2 text-left text-[10px] text-[#555] hover:border-[#F97316]/50">{suggestion}</button>)}</div></div>}
      <div className="flex flex-col gap-3">{messages.map((message) => <div key={message.id} className={cn('max-w-[95%] rounded-xl px-3 py-2.5 text-[11px] leading-5', message.role === 'user' ? 'self-end bg-[#fff2e9] text-[#4a2b18]' : 'self-start border border-[#eeeeec] bg-[#fafaf9] text-[#444]')}>{message.role === 'user' ? <><p className="whitespace-pre-wrap">{message.content}</p>{message.attachments?.map((file) => <span key={`${message.id}-${file.filename}`} className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2 py-1 text-[10px]"><FileText className="size-3" />{file.filename}</span>)}</> : <MessageContent content={message.content} />}{message.response?.kind === 'proposal' && <div className="mt-3 border-t border-[#e8e8e6] pt-3"><p className="font-semibold text-[#333]">{message.response.summary ?? 'Vista previa lista'}</p><p className="mt-1 text-[10px] text-[#777]">La propuesta se muestra en el tablero central. ¿Cómo querés guardarla?</p><div className="mt-2 flex flex-col gap-1.5"><button type="button" onClick={() => { setDraftConfig(proposalConfig ?? message.response?.config ?? draftConfig); setProposalConfig((current) => current ?? message.response?.config ?? null); setProposalBaseConfig((current) => current ?? selectedBoard?.config ?? defaultDashboardConfig(period)); setDraftSummary(message.response?.summary ?? null); setSaveMode('new'); setNewBoardName('') }} className="rounded-md border border-[#e6e6e5] bg-white px-2 py-1.5 text-left text-[10px] font-medium hover:border-[#F97316]">Crear tablero nuevo</button><button type="button" onClick={() => { setDraftConfig(proposalConfig ?? message.response?.config ?? draftConfig); setProposalConfig((current) => current ?? message.response?.config ?? null); setProposalBaseConfig((current) => current ?? selectedBoard?.config ?? defaultDashboardConfig(period)); setDraftSummary(message.response?.summary ?? null); setSaveMode('existing') }} className="rounded-md border border-[#e6e6e5] bg-white px-2 py-1.5 text-left text-[10px] font-medium hover:border-[#F97316]">Aplicar a un tablero existente</button></div>{saveMode === 'new' && draftConfig && <div className="mt-2 flex flex-col gap-2"><label className="text-[10px] font-medium text-[#555]">Nombre del tablero<input value={newBoardName} onChange={(event) => setNewBoardName(event.target.value)} maxLength={120} placeholder="Ej. Performance mensual" className="mt-1 h-8 w-full rounded-md border border-[#e6e6e5] px-2 text-xs outline-none focus:border-[#F97316]" /></label><button type="button" onClick={() => void saveBoard()} disabled={!newBoardName.trim()} className="rounded-md bg-[#F97316] px-3 py-2 text-[10px] font-semibold text-white disabled:opacity-50">Guardar tablero nuevo</button></div>}{saveMode === 'existing' && draftConfig && <div className="mt-2 flex flex-col gap-2"><label className="text-[10px] font-medium text-[#555]">Elegir tablero guardado<select value={targetBoardId} onChange={(event) => { const id = event.target.value; setTargetBoardId(id); const target = boards.find((board) => board.id === id); if (target && proposalBaseConfig && proposalConfig) setDraftConfig(applyDashboardConfigDelta(proposalBaseConfig, proposalConfig, target.config)) }} className="mt-1 h-8 w-full rounded-md border border-[#e6e6e5] bg-white px-2 text-xs"><option value="">Seleccionar...</option>{boards.filter((board) => !board.is_default).map((board) => <option key={board.id} value={board.id}>{board.name}</option>)}</select></label><button type="button" onClick={() => void saveBoard()} disabled={!targetBoardId} className="rounded-md bg-[#F97316] px-3 py-2 text-[10px] font-semibold text-white disabled:opacity-50">Actualizar tablero seleccionado</button><button type="button" onClick={() => setSaveMode(null)} className="text-[10px] text-[#777] underline">Cancelar</button></div>}</div>}</div>)}</div>
      {chatError && <div role="alert" className="mt-3 max-w-[95%] self-start rounded-xl border border-[#f0e5d9] bg-[#fff8f1] px-3 py-2.5 text-[11px] leading-5 text-[#8a541e]">{chatError}{chatError.includes('sesión de MDK') && <> <a href="/auth/login" className="font-semibold underline">Iniciar sesión</a></>}</div>}
      {chatBusy && <div role="status" className="mt-3 flex items-center gap-2 text-[10px] text-[#777]"><LoaderCircle className="size-3.5 animate-spin text-[#F97316]" />Conexa está pensando…</div>}
      <div ref={messagesEndRef} />
    </div>
    <form onSubmit={sendMessage} className="flex shrink-0 flex-col gap-2 border-t border-[#eeeeec] p-3">
      {attachments.length > 0 && <ul className="flex flex-wrap gap-1.5">{attachments.map((file, index) => <li key={`${file.name}-${index}`} className="flex max-w-full items-center gap-1.5 rounded-full border border-[#e7e7e5] bg-[#fafaf9] px-2 py-1 text-[10px] text-[#555]"><FileText className="size-3.5 shrink-0" /><span className="max-w-36 truncate">{file.name}</span><button type="button" onClick={() => setAttachments((current) => current.filter((_, currentIndex) => currentIndex !== index))} aria-label={`Quitar ${file.name}`} className="rounded-full px-1 text-[#888] hover:text-[#b42318]">×</button></li>)}</ul>}
      <input ref={fileInputRef} type="file" multiple accept=".csv,.xls,.xlsx,.pdf,.docx,.png,.jpg,.jpeg,.webp,.gif" className="sr-only" aria-label="Adjuntar CSV, Excel, PDF, Word o imagen" onChange={(event) => { handleFilesSelected(event.currentTarget.files); event.currentTarget.value = '' }} />
      <label htmlFor="conexa-dashboard-chat" className="sr-only">Mensaje para Conexa</label>
      <div className="flex items-center gap-2 rounded-lg border border-[#e5e5e3] bg-white p-1.5 focus-within:border-[#F97316]">
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={!userId || !conversationId || chatBusy || attachments.length >= DASHBOARD_FILE_LIMIT} aria-label="Adjuntar archivos" className="rounded-md p-2 text-[#777] hover:bg-[#f4f4f3] disabled:opacity-40"><Paperclip className="size-3.5" /></button>
        <input ref={inputRef} id="conexa-dashboard-chat" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} disabled={!clientId || !userId || !conversationId || chatBusy} placeholder="Preguntá o pedí un cambio..." className="min-w-0 flex-1 bg-transparent px-1.5 text-[11px] outline-none placeholder:text-[#aaa]" />
        <button type="submit" disabled={(!input.trim() && attachments.length === 0) || chatBusy || !clientId || !userId || !conversationId} aria-label="Enviar mensaje" className="rounded-md bg-[#F97316] p-2 text-white disabled:opacity-40"><Send className="size-3.5" /></button>
      </div>
      {attachmentError && <p role="alert" className="text-[10px] text-[#b42318]">{attachmentError}</p>}
      <p className="text-[9px] leading-4 text-[#999]">Conexa solo edita el tablero. Los archivos no guardados no se conservan como originales.</p>
    </form>
  </section>

  const blockGrid = visibleBlocks.length > 0 ? <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">{visibleBlocks.map((block) => <DashboardBlockRenderer key={block.id} block={block} platforms={blockPlatforms} metrics={displayMetrics} previousMetrics={displayPreviousMetrics} platformData={platformData} loading={loading} onConnections={onConnections} />)}</div> : null
  const emptyBoardNotice = activeConfig && !activeConfig.useDefaultLayout && visibleBlocks.length === 0 ? <div className="rounded-lg border border-dashed border-[#e2e2e0] bg-white p-6 text-center text-xs text-[#777]">{activeConfig.blocks.length === 0 ? 'Este tablero no tiene bloques configurados.' : 'No hay bloques visibles en este tablero. Pedile a Conexa que vuelva a mostrarlos.'}</div> : null

  const boardPanel = <section className="flex min-h-0 min-w-0 flex-col bg-[#fafaf9]" aria-label="Tablero de métricas">
    {panelHeader('board', 'Tablero de métricas', <LayoutDashboard className="size-4" />, 'Colapsar Tablero', <div className="relative"><button type="button" onClick={() => setBoardMenuOpen((open) => !open)} disabled={!clientId} aria-haspopup="listbox" aria-expanded={boardMenuOpen} className="inline-flex max-w-44 items-center gap-1 rounded-md border border-[#e7e7e5] bg-white px-2 py-1.5 text-[10px] font-medium text-[#444] disabled:opacity-50"><span className="truncate">{displayName}</span><ChevronDown className="size-3 shrink-0" /></button>{boardMenuOpen && <div role="listbox" aria-label="Tableros guardados" className="absolute right-0 top-9 z-30 w-56 rounded-lg border border-[#e7e7e5] bg-white p-1.5 shadow-lg"><button type="button" role="option" aria-selected={selectedBoardId === 'default'} onClick={() => { setSelectedBoardId('default'); setDraftConfig(null); setProposalConfig(null); setProposalBaseConfig(null); setDraftSummary(null); setSaveMode(null); setTargetBoardId(''); setBoardMenuOpen(false) }} className="w-full rounded-md px-2.5 py-2 text-left text-[11px] hover:bg-[#f6f6f5]">Tablero por defecto</button>{boards.map((board) => <div key={board.id} className="flex items-center gap-1"><button type="button" role="option" aria-selected={selectedBoardId === board.id} onClick={() => { setSelectedBoardId(board.id); setDraftConfig(null); setProposalConfig(null); setProposalBaseConfig(null); setDraftSummary(null); setSaveMode(null); setTargetBoardId(''); setBoardMenuOpen(false) }} className="min-w-0 flex-1 truncate rounded-md px-2.5 py-2 text-left text-[11px] hover:bg-[#f6f6f5]">{board.name}</button><button type="button" onClick={() => void deleteBoard(board)} aria-label={`Eliminar tablero ${board.name}`} title="Eliminar tablero" className="rounded-md p-2 text-[#888] hover:bg-[#fff2e9] hover:text-[#b42318]"><Trash2 className="size-3.5" /></button></div>)}</div>}</div>)}
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#e7e7e5] bg-white px-3 py-2"><span className="min-w-0 flex-1 truncate text-[10px] text-[#888]">{draftSummary ?? `${clientName ?? 'Cliente'} · ${period}`}</span><span aria-live="polite" className="hidden text-[9px] text-[#888] xl:inline">{describeUpdate(updatedAt, now)}</span><button type="button" onClick={focusChat} aria-label="Editar tablero conversando con Conexa" title="Editar con Conexa" className="rounded-md p-1.5 text-[#666] hover:bg-[#f4f4f3]"><Pencil className="size-3.5" /></button><button type="button" onClick={requestRefresh} disabled={loading} aria-label="Actualizar datos del tablero" title="Actualizar datos" className="rounded-md p-1.5 text-[#666] hover:bg-[#f4f4f3] disabled:opacity-50">{loading ? <LoaderCircle className="size-3.5 animate-spin" /> : refreshFeedback ? <Check className="size-3.5 text-[#F97316]" /> : <RefreshCw className="size-3.5" />}</button><button type="button" onClick={openReportDialog} disabled={!userId} aria-label="Guardar informe" title="Guardar informe" className="inline-flex items-center gap-1 rounded-md bg-[#F97316] px-2.5 py-1.5 text-[10px] font-semibold text-white hover:bg-[#e7650c]"><FilePlus2 className="size-3" />Guardar informe</button></div>
    {boardError && <p role="alert" className="bg-[#fff8f1] px-3 py-2 text-[10px] text-[#8a541e]">{boardError.message}</p>}
    <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">{activeConfig?.useDefaultLayout ? <>{defaultDashboard(hiddenPlatforms)}{blockGrid}</> : activeConfig ? <div className="flex flex-col gap-3"><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-[#222]">{displayName}</h3><p className="mt-1 text-[10px] text-[#888]">{activeConfig.period} · {clientName ?? 'Cliente'}</p></div>{draftConfig && <button type="button" onClick={() => { setDraftConfig(null); setProposalConfig(null); setProposalBaseConfig(null); setDraftSummary(null); setSaveMode(null) }} className="text-[10px] text-[#777] underline">Descartar vista previa</button>}</div>{blockGrid}{emptyBoardNotice}</div> : defaultDashboard([])}</div>
  </section>

  const historyPanel = <section className="flex min-h-0 min-w-0 flex-col bg-white" aria-label="Histórico de informes">{panelHeader('history', 'Histórico', <ArrowDownToLine className="size-4" />, 'Colapsar Histórico')}<DashboardHistory clientId={clientId} /></section>
  const panelContent = { chat: chatPanel, board: boardPanel, history: historyPanel }
  const fullContent = fullPanel ? panelContent[fullPanel] : null

  return <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-white">
    <div role="tablist" aria-label="Paneles del Dashboard" className="flex shrink-0 border-b border-[#e7e7e5] bg-white lg:hidden">{([['chat', 'Chat'], ['board', 'Tablero'], ['history', 'Histórico']] as const).map(([panel, label]) => <button key={panel} type="button" role="tab" aria-selected={mobilePanel === panel} onClick={() => setMobilePanel(panel)} className={cn('flex-1 border-b-2 px-2 py-2.5 text-xs font-medium', mobilePanel === panel ? 'border-[#F97316] text-[#c55208]' : 'border-transparent text-[#777]')}>{label}</button>)}</div>
    <div className={cn('min-h-0 flex-1', fullPanel ? 'hidden' : 'flex lg:grid')} style={{ gridTemplateColumns: columns }}>
      <div className={cn('min-h-0 min-w-0 overflow-hidden border-r border-[#e7e7e5] lg:flex', mobilePanel === 'chat' ? 'flex' : 'hidden', collapsed.chat && 'lg:hidden')}>{chatPanel}</div>
      <div className={cn('min-h-0 min-w-0 overflow-hidden border-r border-[#e7e7e5] lg:flex', mobilePanel === 'board' ? 'flex' : 'hidden', collapsed.board && 'lg:hidden')}>{boardPanel}</div>
      <div className={cn('min-h-0 min-w-0 overflow-hidden lg:flex', mobilePanel === 'history' ? 'flex' : 'hidden', collapsed.history && 'lg:hidden')}>{historyPanel}</div>
      {(['chat', 'board', 'history'] as const).map((panel) => collapsed[panel] && <div key={panel} className="hidden min-h-0 overflow-hidden lg:block">{panelHeader(panel, panel === 'chat' ? 'Chat Conexa' : panel === 'board' ? 'Tablero' : 'Histórico', panel === 'chat' ? <span className="text-sm font-bold">✦</span> : panel === 'board' ? <LayoutDashboard className="size-4" /> : <ArrowDownToLine className="size-4" />, 'Expandir panel')}</div>)}
    </div>
    {fullPanel && <div className="absolute inset-0 z-40 flex min-h-0 flex-col bg-white">{fullContent}</div>}
    {reportOpen && <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/35 p-4" role="dialog" aria-modal="true" aria-labelledby="dashboard-save-report-title"><form onSubmit={saveReport} className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"><header className="mb-4 flex items-start justify-between gap-3"><div><h2 id="dashboard-save-report-title" className="text-base font-semibold text-[#222]">Guardar informe</h2><p className="mt-1 text-xs leading-5 text-[#777]">Se guardará una copia fija del tablero, sus datos, período y cliente.</p></div><button type="button" onClick={() => setReportOpen(false)} aria-label="Cerrar" className="rounded-md p-1.5 hover:bg-[#f4f4f3]"><X className="size-4" /></button></header><label htmlFor="dashboard-report-name" className="text-xs font-medium text-[#555]">Nombre del informe</label><input id="dashboard-report-name" autoFocus required maxLength={180} value={reportName} onChange={(event) => setReportName(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-[#e5e5e3] px-3 text-sm outline-none focus:border-[#F97316]" />{reportError && <p role="alert" className="mt-2 text-xs text-[#b42318]">{reportError}</p>}<footer className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setReportOpen(false)} className="rounded-md border border-[#e5e5e3] px-3 py-2 text-xs font-medium text-[#555]">Cancelar</button><button type="submit" disabled={reportBusy || !reportName.trim()} className="inline-flex items-center gap-2 rounded-md bg-[#F97316] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{reportBusy && <LoaderCircle className="size-3.5 animate-spin" />}{reportBusy ? 'Guardando…' : 'Guardar snapshot'}</button></footer></form></div>}
  </div>
}
