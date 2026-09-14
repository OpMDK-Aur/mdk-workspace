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
  { label: 'Chat / Análisis', icon: MessageCircle },
  { label: 'Reportes', icon: BarChart3 },
  { label: 'Aprobaciones', icon: WalletCards, badge: '3' },
  { label: 'Alertas', icon: CircleHelp, badge: '5' },
  { label: 'Actividad', icon: GitBranch },
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

  return <div className="flex h-screen w-full overflow-hidden bg-[#f5f5f3] text-[#101010]" style={{ fontFamily: 'Arial, sans-serif' }}>
    <aside className={cn('flex shrink-0 flex-col border-r border-[#e6e6e3] bg-white transition-[width] duration-200', sidebarOpen ? 'w-[158px]' : 'w-[44px]')}>
      <div className={cn('flex h-[60px] shrink-0 items-center gap-2 border-b border-[#f0f0ee] px-[18px]', !sidebarOpen && 'justify-center px-0')}>
        <span className="flex size-[16px] shrink-0 items-center justify-center rounded-[5px] bg-[#5b5fe8] text-[10px] text-white">✦</span>
        {sidebarOpen && <span className="text-[16px] font-bold tracking-[-.02em]">CONEXA</span>}
      </div>
      <nav className="flex-1 overflow-y-auto px-1.5 py-3">
        <p className={cn('mb-1.5 px-2.5 text-[9px] font-bold uppercase tracking-[.08em] text-[#9a9a9a]', !sidebarOpen && 'sr-only')}>Trabajo</p>
        {baseNav.map((item) => <button key={item.label} type="button" onClick={() => setActive(item.label)} className={cn('mb-0.5 flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[10.5px] font-medium', active === item.label ? 'bg-[#eeefff] text-[#5b5fe8]' : 'text-[#5c5c5c] hover:bg-[#f5f5f8]', !sidebarOpen && 'justify-center px-0')}><item.icon className="size-[17px] shrink-0" />{sidebarOpen && <span className="flex-1">{item.label}</span>}{sidebarOpen && item.badge && <span className="rounded-full bg-[#ff0049] px-1.5 text-[10px] font-bold text-white">{item.badge}</span>}</button>)}
        {sidebarOpen && <p className="mb-1.5 mt-5 px-2.5 text-[9px] font-bold uppercase tracking-[.08em] text-[#9a9a9a]">Plataformas</p>}
        {platforms.map((item) => <button key={item.key} type="button" onClick={() => setActive(item.name)} className={cn('mb-0.5 flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[10.5px]', active === item.name ? 'bg-[#eeefff] text-[#5b5fe8]' : 'text-[#5c5c5c] hover:bg-[#f5f5f8]', !sidebarOpen && 'justify-center px-0')}><span className="flex size-[18px] items-center justify-center overflow-hidden rounded-[5px] bg-white">{item.iconUrl ? <img src={item.iconUrl} alt="" className="size-full object-contain" /> : <Globe2 className="size-[15px] text-[#11A683]" />}</span>{sidebarOpen && <span className="flex-1 truncate">{item.name}</span>}{sidebarOpen && <span className={cn('size-1.5 rounded-full', item.connected ? 'bg-[#1e9e6b]' : 'bg-[#d6d6d6]')} />}</button>)}
        {sidebarOpen && <p className="mb-1.5 mt-5 px-2.5 text-[9px] font-bold uppercase tracking-[.08em] text-[#9a9a9a]">Cliente</p>}
        {sidebarOpen && <button type="button" className="mb-0.5 flex w-full items-center rounded-md px-2 py-1.5 text-left text-[10.5px] text-[#222]">Contexto del cliente</button>}
        {sidebarOpen && <p className="mb-1.5 mt-5 px-2.5 text-[9px] font-bold uppercase tracking-[.08em] text-[#9a9a9a]">Configuración</p>}
        {sidebarOpen && <button type="button" className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-[10.5px] text-[#222]">Conexiones</button>}
      </nav>
      <button type="button" onClick={() => setSidebarOpen((value) => !value)} className="flex items-center gap-2 border-t border-[#f0f0ee] px-[18px] py-3 text-left text-xs text-[#9a9a9a]">{sidebarOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}{sidebarOpen && 'Colapsar menú'}</button>
    </aside>

    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-[41px] shrink-0 items-center gap-2.5 border-b border-[#dededb] bg-white px-[16px]">
        <div className="relative"><button type="button" onClick={() => setClientMenu((value) => !value)} className="flex items-center gap-1.5 rounded-lg border border-[#e6e6e3] px-3 py-1.5 text-[13px] font-medium">{client?.nombre_del_negocio ?? 'Seleccionar cliente'} <ChevronDown className="size-3 text-[#9a9a9a]" /></button>{clientMenu && <div className="absolute left-0 top-10 z-20 min-w-[210px] rounded-[10px] border border-[#e6e6e3] bg-white p-1.5 shadow-lg">{clients.map((item) => <button type="button" key={item.id} onClick={() => { setClient(item); setClientMenu(false) }} className="block w-full rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-[#f5f5f5]">{item.nombre_del_negocio}</button>)}</div>}</div>
        <div className="relative"><button type="button" onClick={() => setPeriodMenu((value) => !value)} className="flex items-center gap-1.5 rounded-lg border border-[#e6e6e3] px-3 py-1.5 text-[13px] font-medium text-[#5c5c5c]">{period} <ChevronDown className="size-3 text-[#9a9a9a]" /></button>{periodMenu && <div className="absolute left-0 top-10 z-20 min-w-[170px] rounded-[10px] border border-[#e6e6e3] bg-white p-1.5 shadow-lg">{['Últimos 7 días', 'Últimos 30 días', 'Este mes', 'Mes anterior'].map((item) => <button type="button" key={item} onClick={() => { setPeriod(item); setPeriodMenu(false) }} className="block w-full rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-[#f5f5f5]">{item}</button>)}</div>}</div>
        <span className="ml-1.5 flex items-center gap-1.5 text-xs text-[#9a9a9a]"><span className="size-1.5 rounded-full bg-[#1e9e6b]" /> Actualizado hace 8 min</span><div className="flex-1" /><CircleHelp className="size-4 text-[#9a9a9a]" /><div className="flex size-6 items-center justify-center rounded-full bg-[#141414] text-[10px] font-semibold text-white">AP</div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {active === 'Inicio' ? <Home client={client} platforms={platforms} connected={connected} onAsk={() => setActive('Chat / Análisis')} /> : active === 'Chat / Análisis' ? <Chat question={question} setQuestion={setQuestion} client={client} /> : <PlatformView platform={platforms.find((item) => item.name === active) ?? platforms[0]} />}
      </main>
    </section>
  </div>
}

function Home({ client, platforms, connected, onAsk }: { client: Client | null; platforms: Platform[]; connected: number; onAsk: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const business = [['Inversión total', '$ 84.230'], ['Ingresos', '$ 312.400'], ['ROAS', '3,71x'], ['Conversiones', '248'], ['Sesiones', '12.430'], ['Leads', '186']]
  const attention = platforms.filter((item) => !item.connected)
  return <div className="mx-auto max-w-[1180px] px-6 py-5">
    <div className="mb-5"><p className="mb-1 text-[11px] text-[#9a9a9a]">Últimos 30 días</p><h1 className="text-[20px] font-bold tracking-[-.02em]">{client?.nombre_del_negocio ?? 'Soy Aurelia'}</h1><p className="mt-0.5 text-[11px] text-[#9a9a9a]">Conexiones, tracking y alertas</p></div>
    <div className="mb-6 grid grid-cols-[220px_1fr] gap-4"><div className="rounded-2xl bg-[#141414] p-5 text-white"><p className="text-[11px] text-white/60">SCORE GENERAL</p><div className="mt-3 text-[38px] font-bold leading-none">82<span className="text-[20px]">/100</span></div><p className="mt-2 text-xs text-white/60">Conexiones, tracking y alertas</p></div><div className="rounded-2xl border border-[#e6e6e3] bg-white p-[18px_22px]">{platforms.map((item) => <div key={item.key} className="flex items-center justify-between py-1 text-[13.5px]"><span className="flex items-center gap-2 font-medium"><span className="flex size-6 items-center justify-center overflow-hidden rounded-md bg-white">{item.iconUrl ? <img src={item.iconUrl} alt="" className="size-full object-contain" /> : <Globe2 className="size-5 text-[#11A683]" />}</span>{item.name}</span><span className={cn('flex items-center gap-1.5 font-medium', item.connected ? 'text-[#1e9e6b]' : 'text-[#9a9a9a]')}><span className={cn('size-1.5 rounded-full', item.connected ? 'bg-[#1e9e6b]' : 'bg-[#d6d6d6]')} />{item.connected ? 'Conectado' : 'Pendiente'}</span></div>)}</div></div>
    <div className="mb-6 grid grid-cols-2 gap-4"><InfoCard title="Cuentas que requieren atención">{attention.length ? attention.map((item) => <Row key={item.key} text={item.name} value="Conectar" />) : <Row text="Todas las cuentas están conectadas" value="OK" />}</InfoCard><InfoCard title="Trabajo pendiente"><Row text="Revisar eventos sin atribución" value="→" /><Row text="Actualizar objetivos del mes" value="→" /><Row text="Analizar rendimiento semanal" value="→" /></InfoCard></div>
    <p className="mb-3 text-[11px] uppercase tracking-[.08em] text-[#9a9a9a]">Resumen del negocio</p><div className="mb-7 grid grid-cols-6 gap-3">{business.map(([label, value]) => <div key={label} className="rounded-xl border border-[#e6e6e3] bg-white p-4"><p className="mb-2 text-[11.5px] text-[#9a9a9a]">{label}</p><p className="text-[19px] font-bold">{value}</p></div>)}</div>
    <div className="grid grid-cols-[1.3fr_1fr] gap-4"><div className="rounded-2xl border border-[#e6e6e3] bg-white p-[22px]"><p className="mb-4 text-[11px] uppercase tracking-[.08em] text-[#9a9a9a]">Funnel</p><div className="flex items-end gap-1">{[['Alcance','82K','100%'],['Visitas','12K','70%'],['Leads','1.4K','45%'],['Oportunidades','420','28%'],['Ventas','86','16%']].map(([label, value, height]) => <div key={label} className="flex flex-1 flex-col items-center"><div className="w-full max-w-[64px] rounded-t-md bg-[#5b5fe8]" style={{ height }} /><p className="mt-2 text-xs font-semibold">{value}</p><p className="text-center text-[10.5px] text-[#9a9a9a]">{label}</p></div>)}</div></div><InfoCard title="Alertas"><Row text="2 eventos sin nombre detectados" value="!" /><Row text="Meta Ads requiere revisión" value="!" /><Row text="La tasa de conversión subió 18%" value="✓" /></InfoCard></div>
    <div className="mt-7 rounded-[18px] bg-gradient-to-br from-[#5b5fe8] to-[#3f43c4] p-[26px_28px] text-white"><div className="mb-4 flex items-center gap-2 text-[13px] font-bold">✦ Insights de Conexa</div><p className="border-b border-white/15 py-2.5 text-sm">Meta Ads concentra el 68% de la inversión y genera el 74% de las conversiones.</p><p className="border-b border-white/15 py-2.5 text-sm">Google Analytics detectó una oportunidad de mejora en la landing de webinar.</p><Button onClick={onAsk} variant="ghost" className="mt-3 h-auto p-0 text-sm font-semibold text-white hover:bg-transparent">Ver análisis completo →</Button></div>
  </div>
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) { return <div className="rounded-2xl border border-[#e6e6e3] bg-white p-5"><p className="mb-3 text-[11px] uppercase tracking-[.08em] text-[#9a9a9a]">{title}</p>{children}</div> }
function Row({ text, value }: { text: string; value: string }) { return <div className="flex items-center justify-between border-b border-[#f5f5f3] py-[9px] text-[13px]"><span>{text}</span><span className="font-semibold text-[#5b5fe8]">{value}</span></div> }

function PlatformView({ platform }: { platform: Platform }) {
  const configs: Record<string, { tabs: string[]; metrics: [string, string][]; rows: string[]; chart: string }> = {
    meta: { tabs: ['Resumen', 'Campañas', 'Conjuntos', 'Anuncios', 'Creativos', 'Audiencias', 'Redes', 'Tracking'], metrics: [['Inversión', '$630.000'], ['Impresiones', '1,24M'], ['Clicks', '22.320'], ['CTR', '1,8%'], ['Leads', '219'], ['CPL', '$2.877']], rows: ['Meta Prospecting', 'Meta Remarketing'], chart: 'Inversión diaria' },
    google: { tabs: ['Resumen', 'Campañas', 'Grupos de anuncios', 'Palabras clave', 'Conversiones'], metrics: [['Inversión', '$412.500'], ['Impresiones', '842K'], ['Clicks', '18.640'], ['CTR', '2,2%'], ['Conversiones', '186'], ['CPA', '$2.218']], rows: ['Search · Marca', 'Search · Prospecting', 'Performance Max'], chart: 'Gasto diario' },
    analytics: { tabs: ['Resumen', 'Adquisición', 'Participación', 'Conversiones', 'Páginas'], metrics: [['Usuarios', '42.820'], ['Sesiones', '58.430'], ['Eventos', '184K'], ['Conversión', '3,8%'], ['Ingresos', '$312.400'], ['Rebote', '42,1%']], rows: ['Google / cpc', 'Meta / paid-social', 'Direct / none'], chart: 'Sesiones diarias' },
    tag_manager: { tabs: ['Resumen', 'Contenedores', 'Tags', 'Triggers', 'Variables'], metrics: [['Contenedor', '1'], ['Tags activos', '38'], ['Triggers', '24'], ['Variables', '16'], ['Errores', '2'], ['Última versión', 'v42']], rows: ['GA4 - Page View', 'Meta Pixel - Lead', 'Google Ads - Conversion'], chart: 'Eventos por día' },
    crm: { tabs: ['Resumen', 'Contactos', 'Oportunidades', 'Actividades', 'Pipeline'], metrics: [['Contactos', '1.402'], ['Oportunidades', '680'], ['Ventas', '94'], ['Conversión', '6,7%'], ['Pipeline', '$840.000'], ['Ciclo medio', '18 días']], rows: ['Nuevo lead', 'Oportunidad calificada', 'Venta cerrada'], chart: 'Pipeline por etapa' },
  }
  const config = configs[platform.key] ?? configs.meta
  const [selectedTab, setSelectedTab] = useState(config.tabs[0])
  const tabData: Record<string, { metrics: [string, string][]; rows: string[]; chart: string }> = {
    Resumen: { metrics: config.metrics, rows: config.rows, chart: config.chart },
    Campañas: { metrics: config.metrics.slice(0, 6), rows: config.rows, chart: platform.key === 'meta' ? 'Inversión diaria por campaña' : 'Rendimiento diario' },
    Conjuntos: { metrics: [['Conjuntos activos', '12'], ['Presupuesto', '$280.000'], ['Alcance', '842K'], ['Frecuencia', '2,4'], ['Leads', '146'], ['CPL', '$1.918']], rows: ['Prospecting · Mujeres 25-44', 'Remarketing · Visitantes', 'Lookalike · Compradores'], chart: 'Distribución por conjunto' },
    Anuncios: { metrics: [['Anuncios activos', '24'], ['Impresiones', '1,24M'], ['Clicks', '22.320'], ['CTR', '1,8%'], ['Conversiones', '219'], ['CPA', '$2.877']], rows: ['Video · Testimonial', 'Carrusel · Producto', 'Imagen · Oferta'], chart: 'Resultados por anuncio' },
    Creativos: { metrics: [['Creativos', '18'], ['Mejor CTR', '4,8%'], ['Reproducciones', '286K'], ['Retención', '38%'], ['Variantes', '42'], ['Fatiga', 'Baja']], rows: ['Video testimonial', 'Carrusel de beneficios', 'UGC · Cliente real'], chart: 'Engagement de creativos' },
    Audiencias: { metrics: [['Audiencias', '16'], ['Alcance', '1,8M'], ['Superposición', '12%'], ['Tamaño medio', '246K'], ['Nuevas', '4'], ['Excluidas', '8']], rows: ['Prospecting', 'Remarketing 30 días', 'Lookalike 1%'], chart: 'Alcance por audiencia' },
    Redes: { metrics: [['Facebook', '62%'], ['Instagram', '31%'], ['Audience Network', '7%'], ['CPM', '$1.240'], ['CTR', '1,8%'], ['Leads', '219']], rows: ['Facebook Feed', 'Instagram Stories', 'Instagram Reels'], chart: 'Distribución por red' },
    Tracking: { metrics: [['Eventos', '38'], ['Recibidos', '98,4%'], ['Sin atribuir', '2'], ['Pixel', 'Activo'], ['CAPI', 'Activo'], ['Calidad', '9,2/10']], rows: ['Lead', 'Purchase', 'ViewContent'], chart: 'Eventos recibidos' },
    Adquisición: { metrics: [['Usuarios', '42.820'], ['Nuevos', '28.430'], ['Sesiones', '58.430'], ['Engagement', '64%'], ['Conversión', '3,8%'], ['Ingresos', '$312.400']], rows: ['Google / cpc', 'Meta / paid-social', 'Direct / none'], chart: 'Usuarios por canal' },
    Participación: { metrics: [['Sesiones', '58.430'], ['Duración', '2m 48s'], ['Páginas', '3,4'], ['Engagement', '64%'], ['Eventos', '184K'], ['Rebote', '42,1%']], rows: ['Landing principal', 'Webinar', 'Checkout'], chart: 'Participación diaria' },
    Conversiones: { metrics: [['Conversiones', '1.402'], ['Tasa', '3,8%'], ['Valor', '$312.400'], ['Leads', '680'], ['Ventas', '94'], ['ROAS', '3,71x']], rows: ['Generar lead', 'Compra', 'Enviar formulario'], chart: 'Conversiones por día' },
    Páginas: { metrics: [['Vistas', '184K'], ['Usuarios', '42.820'], ['Tiempo', '2m 12s'], ['Salida', '31%'], ['Landing', '68K'], ['Checkout', '12K']], rows: ['/', '/webinar', '/checkout'], chart: 'Vistas por página' },
    Contenedores: { metrics: config.metrics, rows: ['Web · Producción', 'Web · Staging'], chart: 'Contenedores activos' },
    Tags: { metrics: [['Tags publicados', '38'], ['Sin publicar', '4'], ['Errores', '2'], ['GA4', '12'], ['Ads', '9'], ['Meta', '8']], rows: ['GA4 - Page View', 'Meta Pixel - Lead', 'Google Ads - Conversion'], chart: 'Tags activados' },
    Triggers: { metrics: [['Triggers', '24'], ['Activos', '21'], ['Eventos', '86K'], ['Clicks', '22K'], ['Formularios', '1.402'], ['Errores', '2']], rows: ['All Pages', 'Form Submission', 'Custom Event'], chart: 'Triggers ejecutados' },
    Variables: { metrics: [['Variables', '16'], ['Constantes', '6'], ['Data Layer', '8'], ['Lookup', '2'], ['Errores', '0'], ['Actualizadas', '14']], rows: ['GA4 Measurement ID', 'Meta Pixel ID', 'Google Ads ID'], chart: 'Uso de variables' },
    Contactos: { metrics: config.metrics, rows: ['Lead nuevo', 'Contacto activo', 'Contacto inactivo'], chart: 'Contactos incorporados' },
    Oportunidades: { metrics: config.metrics, rows: ['Nuevo lead', 'Oportunidad calificada', 'Propuesta enviada'], chart: 'Oportunidades por etapa' },
    Actividades: { metrics: config.metrics, rows: ['Llamada de seguimiento', 'Email enviado', 'Reunión agendada'], chart: 'Actividades por día' },
    Pipeline: { metrics: config.metrics, rows: ['Prospecto', 'Calificado', 'Ganado'], chart: 'Pipeline por etapa' },
  }
  const view = tabData[selectedTab] ?? tabData.Resumen
  return <div className="mx-auto max-w-[1180px] px-6 py-5"><div className="mb-3 flex items-start justify-between"><div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center overflow-hidden rounded-lg bg-white">{platform.iconUrl ? <img src={platform.iconUrl} alt="" className="size-full object-contain" /> : <Globe2 className="size-7 text-[#11A683]" />}</span><div><h1 className="text-[20px] font-bold">{platform.name}</h1><p className="text-[11px] text-[#777]">{platform.detail} <span className="ml-2 text-[#1e9e6b]">● Conectado</span></p></div></div><Button variant="outline" className="h-8 rounded-full px-4 text-[11px]">Administrar conexión</Button></div><div className="mb-4 flex gap-7 border-b border-[#dededb] text-[10px] font-semibold text-[#777]">{config.tabs.map((tab) => <button type="button" key={tab} onClick={() => setSelectedTab(tab)} className={cn('border-b-2 px-1 pb-3', selectedTab === tab ? 'border-[#5b5fe8] text-[#5b5fe8]' : 'border-transparent')}>{tab}</button>)}</div><div className="mb-4 grid grid-cols-6 gap-3">{view.metrics.map(([label, value]) => <div key={label} className="rounded-xl border border-[#dcdcd8] bg-white p-3 shadow-[0_2px_5px_rgba(0,0,0,.06)]"><p className="text-[10px] text-[#888]">{label}</p><p className="mt-1 text-[16px] font-bold">{value}</p></div>)}</div><div className="mb-4 rounded-xl border border-[#dcdcd8] bg-white p-4"><p className="mb-3 text-[10px] font-bold uppercase text-[#999]">{view.chart}</p><div className="flex h-28 items-end gap-2">{[42, 55, 35, 70, 62, 78, 52, 65, 48, 72, 60, 84, 67, 76].map((height, index) => <div key={index} className="flex-1 rounded-t-sm bg-[#8587e8]" style={{ height: `${height}%` }} />)}</div></div><div className="rounded-xl border border-[#dcdcd8] bg-white"><div className="grid grid-cols-5 border-b border-[#e9e9e6] px-4 py-3 text-[10px] font-bold text-[#888]"><span>Entidad</span><span>Estado</span><span>Objetivo</span><span>Resultados</span><span className="text-right">Acción</span></div>{view.rows.map((row, index) => <div key={row} className="grid grid-cols-5 items-center border-b border-[#f0f0ee] px-4 py-3 text-[11px] last:border-0"><span className="font-semibold">{row}</span><span className="text-[#1e9e6b]">{platform.connected ? 'Activo' : 'Pendiente'}</span><span>{index === 0 ? 'Leads' : 'Conversiones'}</span><span>{[128, 91, 64][index] ?? 42}</span><button type="button" className="text-right font-bold text-[#5b5fe8]">✦ Analizar</button></div>)}</div></div>
}

function Chat({ question, setQuestion, client }: { question: string; setQuestion: (value: string) => void; client: Client | null }) { return <div className="flex h-full min-h-[620px]"><aside className="w-[260px] shrink-0 border-r border-[#e6e6e3] bg-white p-4"><Button variant="outline" className="mb-5 w-full justify-start">+ Nuevo análisis</Button><p className="mb-2 px-2 text-[10.5px] uppercase tracking-[.08em] text-[#9a9a9a]">Hoy</p>{['Rendimiento de campañas', 'Análisis del funnel', 'Resumen semanal'].map((item, index) => <button type="button" key={item} className={cn('mb-0.5 w-full rounded-lg p-2.5 text-left', index === 0 ? 'bg-[#eeefff]' : 'hover:bg-[#f5f5f5]')}><p className="text-[13px] font-semibold">{item}</p><p className="mt-1 text-[11.5px] text-[#9a9a9a]">{client?.nombre_del_negocio ?? 'Cliente'}</p></button>)}</aside><div className="flex min-w-0 flex-1 flex-col bg-[#fafaf8]"><div className="border-b border-[#e6e6e3] bg-white p-4"><p className="text-[15px] font-bold">Rendimiento de campañas</p><p className="mt-0.5 text-xs text-[#9a9a9a]">Conexa · {client?.nombre_del_negocio ?? 'Cliente'} · Últimos 30 días</p></div><div className="flex-1 p-7"><div className="max-w-2xl rounded-2xl border border-[#e6e6e3] bg-white p-5"><p className="mb-2 text-[11px] font-bold uppercase tracking-[.08em] text-[#5b5fe8]">✦ Conexa · Análisis</p><p className="text-sm leading-6">El análisis combina las conexiones activas de Meta Ads, Google Ads, Analytics, Tag Manager y CRM para explicar el rendimiento del período seleccionado.</p></div></div><div className="border-t border-[#e6e6e3] bg-white p-4"><div className="flex items-center gap-2 rounded-xl border border-[#e6e6e3] p-2"><input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) setQuestion('') }} placeholder="Preguntale algo a Conexa..." className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none" /><Button size="sm" className="bg-[#5b5fe8] text-white">Enviar</Button></div></div></div></div> }
