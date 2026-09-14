'use client'

import { useEffect, useMemo, useState } from 'react'
import { BarChart3, ChevronDown, CircleHelp, Database, Gauge, GitBranch, Globe2, LayoutDashboard, MessageCircle, PanelLeftClose, PanelLeftOpen, Search, Settings2, Sparkles, Tags, Users, WalletCards, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Client = { id: string; nombre_del_negocio: string; meta_ads_account_id?: string | null; google_ads_customer_id?: string | null; analytics_property_id?: string | null; tag_manager_container_id?: string | null; crm_type?: string | null }

type Platform = { name: string; key: string; icon: typeof BarChart3; color: string; iconUrl: string | null; connected: boolean; detail: string }

const baseNav = [
  { label: 'Inicio', icon: LayoutDashboard },
  { label: 'Conexa Chat', icon: MessageCircle, badge: '3' },
  { label: 'Reportes', icon: BarChart3 },
]

export function ConexaWorkspace() {
  const [clients, setClients] = useState<Client[]>([])
  const [client, setClient] = useState<Client | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [active, setActive] = useState('Inicio')
  const [period, setPeriod] = useState('Últimos 30 días')
  const [clientMenu, setClientMenu] = useState(false)
  const [periodMenu, setPeriodMenu] = useState(false)
  const [question, setQuestion] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.from('clientes').select('id, nombre_del_negocio, meta_ads_account_id, google_ads_customer_id, analytics_property_id, tag_manager_container_id, crm_type').order('nombre_del_negocio').then(({ data }) => {
      const rows = (data ?? []) as Client[]
      setClients(rows)
      setClient(rows[0] ?? null)
    })
  }, [])

  const platforms = useMemo<Platform[]>(() => [
    { name: 'Meta Ads', key: 'meta', icon: BarChart3, color: '#1877F2', iconUrl: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/6033716-kis9XwIi28W3Bn80f2wS2NTRWqhxew.png', connected: Boolean(client?.meta_ads_account_id), detail: client?.meta_ads_account_id ? `Cuenta ${client.meta_ads_account_id}` : 'Sin cuenta conectada' },
    { name: 'Google Ads', key: 'google', icon: Search, color: '#4285F4', iconUrl: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/google_ads_logo_icon_171064-I8kGtiPKqG0TZoeHB7Lb1GwQziRNBX.webp', connected: Boolean(client?.google_ads_customer_id), detail: client?.google_ads_customer_id ? `Cuenta ${client.google_ads_customer_id}` : 'Sin cuenta conectada' },
    { name: 'Google Analytics', key: 'analytics', icon: Gauge, color: '#F9AB00', iconUrl: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/google-analytics-icon-VuL4g3NfPdL5bzHIQRZacQjTq6Vcfk.webp', connected: Boolean(client?.analytics_property_id), detail: client?.analytics_property_id ? `Propiedad ${client.analytics_property_id}` : 'Sin propiedad conectada' },
    { name: 'Tag Manager', key: 'tag_manager', icon: Tags, color: '#246FDB', iconUrl: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/google-tag-manager-l5o0anuls2kqtf2xmhtl-ItmMvsOnhnmedg5kb6tJwJOQzpJ1uy.webp', connected: Boolean(client?.tag_manager_container_id), detail: client?.tag_manager_container_id ? `Contenedor ${client.tag_manager_container_id}` : 'Sin contenedor conectado' },
    { name: 'CRM Aurelia', key: 'crm', icon: Users, color: '#11A683', iconUrl: null, connected: Boolean(client?.crm_type), detail: client?.crm_type ? `Conectado · ${client.crm_type}` : 'Sin CRM conectado' },
  ], [client])

  const connected = platforms.filter((item) => item.connected).length

  return <div className="flex h-screen w-full overflow-hidden bg-[#f4f4f1] text-[#141414]" style={{ fontFamily: 'Arial, sans-serif' }}>
    <aside className={cn('flex shrink-0 flex-col border-r border-[#e6e6e3] bg-white transition-[width] duration-200', sidebarOpen ? 'w-[238px]' : 'w-[68px]')}>
      <div className={cn('flex h-[60px] shrink-0 items-center gap-2 border-b border-[#f0f0ee] px-[18px]', !sidebarOpen && 'justify-center px-0')}>
        <span className="flex size-[22px] shrink-0 items-center justify-center rounded-[7px] bg-[#5b5fe8] text-[13px] text-white">✦</span>
        {sidebarOpen && <span className="text-[16px] font-bold tracking-[-.02em]">CONEXA</span>}
      </div>
      <nav className="flex-1 overflow-y-auto px-2.5 py-3.5">
        <p className={cn('mb-1.5 px-2.5 text-[10px] font-bold uppercase tracking-[.08em] text-[#9a9a9a]', !sidebarOpen && 'sr-only')}>Workspace</p>
        {baseNav.map((item) => <button key={item.label} type="button" onClick={() => setActive(item.label)} className={cn('mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] font-medium', active === item.label ? 'bg-[#eeefff] text-[#5b5fe8]' : 'text-[#5c5c5c] hover:bg-[#f5f5f8]', !sidebarOpen && 'justify-center px-0')}><item.icon className="size-[17px] shrink-0" />{sidebarOpen && <span className="flex-1">{item.label}</span>}{sidebarOpen && item.badge && <span className="rounded-full bg-[#ff0049] px-1.5 text-[10px] font-bold text-white">{item.badge}</span>}</button>)}
        {sidebarOpen && <p className="mb-1.5 mt-5 px-2.5 text-[10px] font-bold uppercase tracking-[.08em] text-[#9a9a9a]">Conexiones</p>}
        {platforms.map((item) => <button key={item.key} type="button" onClick={() => setActive(item.name)} className={cn('mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px]', active === item.name ? 'bg-[#eeefff] text-[#5b5fe8]' : 'text-[#5c5c5c] hover:bg-[#f5f5f8]', !sidebarOpen && 'justify-center px-0')}><span className="flex size-[18px] items-center justify-center overflow-hidden rounded-[5px] bg-white">{item.iconUrl ? <img src={item.iconUrl} alt="" className="size-full object-contain" /> : <Globe2 className="size-[15px] text-[#11A683]" />}</span>{sidebarOpen && <span className="flex-1 truncate">{item.name}</span>}{sidebarOpen && <span className={cn('size-1.5 rounded-full', item.connected ? 'bg-[#1e9e6b]' : 'bg-[#d6d6d6]')} />}</button>)}
      </nav>
      <button type="button" onClick={() => setSidebarOpen((value) => !value)} className="flex items-center gap-2 border-t border-[#f0f0ee] px-[18px] py-3 text-left text-xs text-[#9a9a9a]">{sidebarOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}{sidebarOpen && 'Colapsar menú'}</button>
    </aside>

    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-[60px] shrink-0 items-center gap-2.5 border-b border-[#e6e6e3] bg-white px-[22px]">
        <div className="relative"><button type="button" onClick={() => setClientMenu((value) => !value)} className="flex items-center gap-1.5 rounded-lg border border-[#e6e6e3] px-3 py-1.5 text-[13px] font-medium">{client?.nombre_del_negocio ?? 'Seleccionar cliente'} <ChevronDown className="size-3 text-[#9a9a9a]" /></button>{clientMenu && <div className="absolute left-0 top-10 z-20 min-w-[210px] rounded-[10px] border border-[#e6e6e3] bg-white p-1.5 shadow-lg">{clients.map((item) => <button type="button" key={item.id} onClick={() => { setClient(item); setClientMenu(false) }} className="block w-full rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-[#f5f5f5]">{item.nombre_del_negocio}</button>)}</div>}</div>
        <div className="relative"><button type="button" onClick={() => setPeriodMenu((value) => !value)} className="flex items-center gap-1.5 rounded-lg border border-[#e6e6e3] px-3 py-1.5 text-[13px] font-medium text-[#5c5c5c]">{period} <ChevronDown className="size-3 text-[#9a9a9a]" /></button>{periodMenu && <div className="absolute left-0 top-10 z-20 min-w-[170px] rounded-[10px] border border-[#e6e6e3] bg-white p-1.5 shadow-lg">{['Últimos 7 días', 'Últimos 30 días', 'Este mes', 'Mes anterior'].map((item) => <button type="button" key={item} onClick={() => { setPeriod(item); setPeriodMenu(false) }} className="block w-full rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-[#f5f5f5]">{item}</button>)}</div>}</div>
        <span className="ml-1.5 flex items-center gap-1.5 text-xs text-[#9a9a9a]"><span className="size-1.5 rounded-full bg-[#1e9e6b]" /> Actualizado hace 8 min</span><div className="flex-1" /><CircleHelp className="size-4 text-[#9a9a9a]" /><div className="flex size-8 items-center justify-center rounded-full bg-[#141414] text-xs font-semibold text-white">MD</div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {active === 'Inicio' ? <Home client={client} platforms={platforms} connected={connected} onAsk={() => setActive('Conexa Chat')} /> : active === 'Conexa Chat' ? <Chat question={question} setQuestion={setQuestion} client={client} /> : <PlatformView platform={platforms.find((item) => item.name === active) ?? platforms[0]} />}
      </main>
    </section>
  </div>
}

function Home({ client, platforms, connected, onAsk }: { client: Client | null; platforms: Platform[]; connected: number; onAsk: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const business = [['Inversión total', '$ 84.230'], ['Ingresos', '$ 312.400'], ['ROAS', '3,71x'], ['Conversiones', '248'], ['Sesiones', '12.430'], ['Leads', '186']]
  const attention = platforms.filter((item) => !item.connected)
  return <div className="mx-auto max-w-[1180px] px-8 py-8">
    <div className="mb-7"><p className="mb-1 text-[13px] text-[#9a9a9a]">Buenos días, Martín</p><h1 className="text-[28px] font-bold tracking-[-.02em]">{client?.nombre_del_negocio ?? 'Tu espacio de trabajo'}</h1><p className="mt-0.5 text-[13px] text-[#9a9a9a]">Últimos 30 días · {connected} de {platforms.length} conexiones activas</p></div>
    <div className="mb-6 grid grid-cols-[220px_1fr] gap-4"><div className="rounded-2xl bg-[#141414] p-5 text-white"><p className="text-[11px] text-white/60">SCORE GENERAL</p><div className="mt-3 text-[48px] font-bold leading-none">{connected === platforms.length ? 100 : connected * 20}</div><p className="mt-2 text-xs text-white/60">Conexiones, tracking y alertas</p></div><div className="rounded-2xl border border-[#e6e6e3] bg-white p-[18px_22px]">{platforms.map((item) => <div key={item.key} className="flex items-center justify-between py-1 text-[13.5px]"><span className="flex items-center gap-2 font-medium"><span className="flex size-6 items-center justify-center overflow-hidden rounded-md bg-white">{item.iconUrl ? <img src={item.iconUrl} alt="" className="size-full object-contain" /> : <Globe2 className="size-5 text-[#11A683]" />}</span>{item.name}</span><span className={cn('flex items-center gap-1.5 font-medium', item.connected ? 'text-[#1e9e6b]' : 'text-[#9a9a9a]')}><span className={cn('size-1.5 rounded-full', item.connected ? 'bg-[#1e9e6b]' : 'bg-[#d6d6d6]')} />{item.connected ? 'Conectado' : 'Pendiente'}</span></div>)}</div></div>
    <div className="mb-6 grid grid-cols-2 gap-4"><InfoCard title="Cuentas que requieren atención">{attention.length ? attention.map((item) => <Row key={item.key} text={item.name} value="Conectar" />) : <Row text="Todas las cuentas están conectadas" value="OK" />}</InfoCard><InfoCard title="Trabajo pendiente"><Row text="Revisar eventos sin atribución" value="→" /><Row text="Actualizar objetivos del mes" value="→" /><Row text="Analizar rendimiento semanal" value="→" /></InfoCard></div>
    <p className="mb-3 text-[11px] uppercase tracking-[.08em] text-[#9a9a9a]">Resumen del negocio</p><div className="mb-7 grid grid-cols-6 gap-3">{business.map(([label, value]) => <div key={label} className="rounded-xl border border-[#e6e6e3] bg-white p-4"><p className="mb-2 text-[11.5px] text-[#9a9a9a]">{label}</p><p className="text-[19px] font-bold">{value}</p></div>)}</div>
    <div className="grid grid-cols-[1.3fr_1fr] gap-4"><div className="rounded-2xl border border-[#e6e6e3] bg-white p-[22px]"><p className="mb-4 text-[11px] uppercase tracking-[.08em] text-[#9a9a9a]">Funnel</p><div className="flex items-end gap-1">{[['Alcance','82K','100%'],['Visitas','12K','70%'],['Leads','1.4K','45%'],['Oportunidades','420','28%'],['Ventas','86','16%']].map(([label, value, height]) => <div key={label} className="flex flex-1 flex-col items-center"><div className="w-full max-w-[64px] rounded-t-md bg-[#5b5fe8]" style={{ height }} /><p className="mt-2 text-xs font-semibold">{value}</p><p className="text-center text-[10.5px] text-[#9a9a9a]">{label}</p></div>)}</div></div><InfoCard title="Alertas"><Row text="2 eventos sin nombre detectados" value="!" /><Row text="Meta Ads requiere revisión" value="!" /><Row text="La tasa de conversión subió 18%" value="✓" /></InfoCard></div>
    <div className="mt-7 rounded-[18px] bg-gradient-to-br from-[#5b5fe8] to-[#3f43c4] p-[26px_28px] text-white"><div className="mb-4 flex items-center gap-2 text-[13px] font-bold">✦ Insights de Conexa</div><p className="border-b border-white/15 py-2.5 text-sm">Meta Ads concentra el 68% de la inversión y genera el 74% de las conversiones.</p><p className="border-b border-white/15 py-2.5 text-sm">Google Analytics detectó una oportunidad de mejora en la landing de webinar.</p><Button onClick={onAsk} variant="ghost" className="mt-3 h-auto p-0 text-sm font-semibold text-white hover:bg-transparent">Ver análisis completo →</Button></div>
  </div>
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) { return <div className="rounded-2xl border border-[#e6e6e3] bg-white p-5"><p className="mb-3 text-[11px] uppercase tracking-[.08em] text-[#9a9a9a]">{title}</p>{children}</div> }
function Row({ text, value }: { text: string; value: string }) { return <div className="flex items-center justify-between border-b border-[#f5f5f3] py-[9px] text-[13px]"><span>{text}</span><span className="font-semibold text-[#5b5fe8]">{value}</span></div> }

function PlatformView({ platform }: { platform: Platform }) { return <div className="mx-auto max-w-[1180px] px-8 py-8"><p className="mb-1 text-[13px] text-[#9a9a9a]">Conexiones / {platform.name}</p><div className="mb-7 flex items-center justify-between"><div><h1 className="text-[28px] font-bold">{platform.name}</h1><p className="mt-1 text-sm text-[#9a9a9a]">{platform.detail}</p></div><span className={cn('rounded-full px-3 py-1 text-xs font-semibold', platform.connected ? 'bg-[#e5f7ee] text-[#1e9e6b]' : 'bg-[#f0f0ee] text-[#9a9a9a]')}>{platform.connected ? 'Conectado' : 'Pendiente'}</span></div><div className="grid grid-cols-3 gap-4"><InfoCard title="Estado de sincronización"><p className="text-2xl font-bold">{platform.connected ? 'Activo' : 'Pendiente'}</p><p className="mt-2 text-xs text-[#9a9a9a]">Conexa reutiliza la conexión existente.</p></InfoCard><InfoCard title="Última lectura"><p className="text-2xl font-bold">Hace 8 min</p><p className="mt-2 text-xs text-[#9a9a9a]">Datos disponibles para el agente.</p></InfoCard><InfoCard title="Próximo paso"><p className="text-2xl font-bold">{platform.connected ? 'Analizar' : 'Conectar'}</p><p className="mt-2 text-xs text-[#9a9a9a]">La configuración se mantiene independiente.</p></InfoCard></div></div> }

function Chat({ question, setQuestion, client }: { question: string; setQuestion: (value: string) => void; client: Client | null }) { return <div className="flex h-full min-h-[620px]"><aside className="w-[260px] shrink-0 border-r border-[#e6e6e3] bg-white p-4"><Button variant="outline" className="mb-5 w-full justify-start">+ Nuevo análisis</Button><p className="mb-2 px-2 text-[10.5px] uppercase tracking-[.08em] text-[#9a9a9a]">Hoy</p>{['Rendimiento de campañas', 'Análisis del funnel', 'Resumen semanal'].map((item, index) => <button type="button" key={item} className={cn('mb-0.5 w-full rounded-lg p-2.5 text-left', index === 0 ? 'bg-[#eeefff]' : 'hover:bg-[#f5f5f5]')}><p className="text-[13px] font-semibold">{item}</p><p className="mt-1 text-[11.5px] text-[#9a9a9a]">{client?.nombre_del_negocio ?? 'Cliente'}</p></button>)}</aside><div className="flex min-w-0 flex-1 flex-col bg-[#fafaf8]"><div className="border-b border-[#e6e6e3] bg-white p-4"><p className="text-[15px] font-bold">Rendimiento de campañas</p><p className="mt-0.5 text-xs text-[#9a9a9a]">Conexa · {client?.nombre_del_negocio ?? 'Cliente'} · Últimos 30 días</p></div><div className="flex-1 p-7"><div className="max-w-2xl rounded-2xl border border-[#e6e6e3] bg-white p-5"><p className="mb-2 text-[11px] font-bold uppercase tracking-[.08em] text-[#5b5fe8]">✦ Conexa · Análisis</p><p className="text-sm leading-6">El análisis combina las conexiones activas de Meta Ads, Google Ads, Analytics, Tag Manager y CRM para explicar el rendimiento del período seleccionado.</p></div></div><div className="border-t border-[#e6e6e3] bg-white p-4"><div className="flex items-center gap-2 rounded-xl border border-[#e6e6e3] p-2"><input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) setQuestion('') }} placeholder="Preguntale algo a Conexa..." className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none" /><Button size="sm" className="bg-[#5b5fe8] text-white">Enviar</Button></div></div></div></div> }
