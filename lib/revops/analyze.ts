// lib/revops/analyze.ts
import { generateObject } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { parseISO } from 'date-fns'
import {
  fetchGhlOpportunities,
  fetchGhlPipelines,
  fetchGhlContactTasks,
  fetchGhlConversations,
  fetchGhlConversationMessages,
  fetchGhlUsers,
  type GhlOpportunity,
  type GhlPipeline,
  type GhlUser,
} from './ghl-client'
import type { RevOpsResumen } from '@/lib/types'

// ── Configuración (ajustable sin tocar la lógica) ──────────────────────────

const SAMPLE_OPORTUNIDADES_TAREAS = 30
const MAX_INTENTOS_CONVERSACIONES = 60 // techo de llamadas a /messages para no disparar costo si hay muchos threads de un solo mensaje
const SAMPLE_CONVERSACIONES_CALIDAD = 15
const VENTANA_DIAS = 30
const SLA_HORAS_HANDOFF = 2
const DERIVACION_PHRASES = [
  'te derivo',
  'te paso con',
  'un asesor',
  'te contacta',
  'en breve te',
  'nuestro equipo te',
  'un vendedor te',
  'te va a contactar',
]
const ETAPAS_SOSPECHOSAS_KEYWORDS = ['basura', 'spam', 'descarte', 'sin contacto', 'duplicado', 'no calific']

// ── Horario laboral (default global; próximo paso: configurable por cliente) ─
// Argentina (ART) no observa horario de verano, así que el offset es fijo.
const ART_OFFSET_MS = 3 * 60 * 60 * 1000 // ART = UTC-3 → UTC = ART + 3hs
const HORARIO_INICIO = 9
const HORARIO_FIN = 18
const DIAS_HABILES = [1, 2, 3, 4, 5] // getUTCDay(): 0=domingo ... 6=sábado. Lunes a viernes.

// Minutos de overlap entre [fromMs, toMs] y la ventana laboral, sumados día por
// día en horario de Argentina. Salta noches y fines de semana.
function minutosHabilesEntre(fromMs: number, toMs: number): number {
  if (!isFinite(fromMs) || !isFinite(toMs) || toMs <= fromMs) return 0

  // Lee los campos de fecha en ART "como si fueran UTC" restando el offset.
  const aArt = (ms: number) => new Date(ms - ART_OFFSET_MS)
  // Reconstruye el instante UTC real correspondiente a una hora puntual en ART.
  const limiteArtAUtcMs = (y: number, m: number, d: number, h: number) => Date.UTC(y, m, d, h, 0, 0) + ART_OFFSET_MS

  let cursor = aArt(fromMs)
  let cy = cursor.getUTCFullYear()
  let cm = cursor.getUTCMonth()
  let cd = cursor.getUTCDate()

  const finCursor = aArt(toMs)
  const fy = finCursor.getUTCFullYear()
  const fm = finCursor.getUTCMonth()
  const fd = finCursor.getUTCDate()

  let totalMs = 0
  let guard = 0 // tope de seguridad por si hay datos corruptos con fechas absurdas

  while (guard < 400) {
    const diaSemana = new Date(Date.UTC(cy, cm, cd)).getUTCDay()
    if (DIAS_HABILES.includes(diaSemana)) {
      const inicioDia = limiteArtAUtcMs(cy, cm, cd, HORARIO_INICIO)
      const finDia = limiteArtAUtcMs(cy, cm, cd, HORARIO_FIN)
      const overlapStart = Math.max(fromMs, inicioDia)
      const overlapEnd = Math.min(toMs, finDia)
      if (overlapEnd > overlapStart) totalMs += overlapEnd - overlapStart
    }

    if (cy === fy && cm === fm && cd === fd) break

    const siguiente = new Date(Date.UTC(cy, cm, cd + 1))
    cy = siguiente.getUTCFullYear()
    cm = siguiente.getUTCMonth()
    cd = siguiente.getUTCDate()
    guard++
  }

  return totalMs / 60000
}

function daysSince(dateStr: string | null): number {
  if (!dateStr) return Infinity
  const d = parseISO(dateStr).getTime()
  if (isNaN(d)) return Infinity
  return (Date.now() - d) / (1000 * 60 * 60 * 24)
}

// Horas HÁBILES transcurridas desde dateStr hasta ahora (no horas de reloj corridas).
function horasHabilesDesde(dateStr: string | null): number {
  if (!dateStr) return Infinity
  const d = parseISO(dateStr).getTime()
  if (isNaN(d)) return Infinity
  return minutosHabilesEntre(d, Date.now()) / 60
}

// ── Módulo 1: Control de tareas (sobre una muestra de oportunidades abiertas) ─

async function analizarTareas(creds: { locationId: string; token: string }, oportunidadesAbiertas: GhlOpportunity[]) {
  const muestra = [...oportunidadesAbiertas]
    .sort((a, b) => parseISO(b.updatedAt).getTime() - parseISO(a.updatedAt).getTime())
    .slice(0, SAMPLE_OPORTUNIDADES_TAREAS)
    .filter((o) => !!o.contactId)

  let total = 0
  let vencidas = 0
  let completadas = 0
  let futuras = 0
  let sinFecha = 0
  let conTarea = 0
  let sinTarea = 0
  const now = Date.now()

  for (const op of muestra) {
    const tareas = await fetchGhlContactTasks(creds, op.contactId as string)
    if (tareas.length === 0) {
      sinTarea++
      continue
    }
    conTarea++
    for (const t of tareas) {
      total++
      if (t.completed) {
        completadas++
      } else if (!t.dueDate) {
        sinFecha++
      } else if (parseISO(t.dueDate).getTime() < now) {
        vencidas++
      } else {
        futuras++
      }
    }
  }

  const pctVencidas = total > 0 ? vencidas / total : 0
  const pctSinTarea = muestra.length > 0 ? sinTarea / muestra.length : 0

  return {
    oportunidades_en_muestra: muestra.length,
    con_tarea: conTarea,
    sin_tarea: sinTarea,
    total_tareas: total,
    tareas_vencidas: vencidas,
    tareas_completadas: completadas,
    tareas_futuras: futuras,
    tareas_sin_fecha: sinFecha,
    pct_vencidas: pctVencidas,
    alerta_colapso: total >= 5 && pctVencidas >= 0.9 && futuras === 0,
    // Caso distinto (y peor) al colapso: acá directamente no hay tareas
    // cargadas, por lo que pct_vencidas da 0/0 = 0% y parece "todo bien"
    // cuando en realidad no hay ningún seguimiento activo.
    alerta_sin_seguimiento: muestra.length >= 5 && sinTarea === muestra.length,
    pct_sin_tarea: pctSinTarea,
  }
}

// ── Módulo 4: Control de oportunidades (campos completos) ──────────────────

function analizarOportunidades(
  todas: GhlOpportunity[],
  totalConversacionesPeriodo: number,
  rango?: { desde: string; hasta: string }
) {
  const abiertas = todas.filter((o) => o.status === 'open')
  const total = abiertas.length || 1 // evita división por cero, los % se reportan en 0 si total real es 0

  const sinMonto = abiertas.filter((o) => !o.monetaryValue || o.monetaryValue <= 0).length
  const sinResponsable = abiertas.filter((o) => !o.assignedTo).length
  const sinActividad30 = abiertas.filter((o) => daysSince(o.updatedAt) > 30).length

  // Si hay un rango de fecha aplicado (para igualar el filtro de GHL), "creadas
  // en el período" usa ese mismo rango. Si no, cae al default de VENTANA_DIAS.
  const cutoff = rango ? new Date(`${rango.desde}T00:00:00`).getTime() : Date.now() - VENTANA_DIAS * 24 * 60 * 60 * 1000
  const hastaMs = rango ? new Date(`${rango.hasta}T23:59:59.999`).getTime() : Date.now()
  const creadasEnPeriodo = todas.filter((o) => {
    const t = parseISO(o.createdAt).getTime()
    return t >= cutoff && t <= hastaMs
  }).length

  return {
    total_abiertas: abiertas.length,
    sin_monto: sinMonto,
    pct_sin_monto: abiertas.length > 0 ? sinMonto / total : 0,
    sin_responsable: sinResponsable,
    pct_sin_responsable: abiertas.length > 0 ? sinResponsable / total : 0,
    sin_actividad_30d: sinActividad30,
    pct_sin_actividad_30d: abiertas.length > 0 ? sinActividad30 / total : 0,
    creadas_en_periodo: creadasEnPeriodo,
    conversaciones_en_periodo: totalConversacionesPeriodo,
  }
}

// ── Módulo 5: Higienización del embudo ─────────────────────────────────────

function analizarEmbudo(todas: GhlOpportunity[], pipelines: GhlPipeline[]) {
  const stageMap = new Map<string, { name: string; pipeline: string; position: number }>()
  for (const p of pipelines) {
    for (const s of p.stages) {
      stageMap.set(s.id, { name: s.name, pipeline: p.name, position: s.position })
    }
  }

  const abiertas = todas.filter((o) => o.status === 'open')

  const conteoPorEtapa = new Map<string, number>()
  for (const o of abiertas) {
    conteoPorEtapa.set(o.pipelineStageId, (conteoPorEtapa.get(o.pipelineStageId) ?? 0) + 1)
  }

  const porEtapa = Array.from(conteoPorEtapa.entries()).map(([stageId, cantidad]) => {
    const info = stageMap.get(stageId)
    return {
      etapa: info?.name ?? 'Etapa desconocida',
      pipeline: info?.pipeline ?? '—',
      cantidad,
      esEtapaInicial: (info?.position ?? 99) <= 1,
    }
  })

  const etapasInicialesSaturadas = porEtapa.some((e) => e.esEtapaInicial && e.cantidad > 50)

  const estancadas30 = abiertas.filter((o) => daysSince(o.updatedAt) >= 30).length
  const estancadas60 = abiertas.filter((o) => daysSince(o.updatedAt) >= 60).length
  const estancadas90 = abiertas.filter((o) => daysSince(o.updatedAt) >= 90).length

  const porContacto = new Map<string, number>()
  for (const o of abiertas) {
    if (!o.contactId) continue
    porContacto.set(o.contactId, (porContacto.get(o.contactId) ?? 0) + 1)
  }
  const duplicados = Array.from(porContacto.values()).filter((c) => c > 1).reduce((sum, c) => sum + (c - 1), 0)

  const etapasSospechosas = Array.from(new Set(porEtapa.map((e) => e.etapa))).filter((nombre) =>
    ETAPAS_SOSPECHOSAS_KEYWORDS.some((kw) => nombre.toLowerCase().includes(kw))
  )

  const inconsistencias = abiertas.filter((o) => {
    const nombre = stageMap.get(o.pipelineStageId)?.name?.toLowerCase() ?? ''
    return /ganad|won|perdid|lost/.test(nombre)
  }).length

  return {
    por_etapa: porEtapa,
    etapas_iniciales_saturadas: etapasInicialesSaturadas,
    estancadas_30: estancadas30,
    estancadas_60: estancadas60,
    estancadas_90: estancadas90,
    duplicados_probables: duplicados,
    etapas_sospechosas: etapasSospechosas,
    inconsistencias_estado: inconsistencias,
  }
}

// ── Ventas y facturación (oportunidades en estado "Ganado") ────────────────
//
// IMPORTANTE — historia de este criterio: la primera versión filtraba por
// updatedAt como proxy de "fecha de venta" (GHL no expone una fecha de cierre
// separada). Eso fallaba en la práctica: una oportunidad ganada y luego nunca
// vuelta a tocar en el CRM tiene un updatedAt que queda "congelado" en el
// pasado, y por lo tanto NUNCA cae dentro de ningún período que se mida —
// Ventas daba 0 aunque el Funnel Comercial (que filtra por createdAt) sí
// mostrara oportunidades en la etapa "Ganado".
//
// Ahora Ventas usa el MISMO criterio de período que el Funnel Comercial
// (createdAt dentro del rango, ya filtrado por quien llama a esta función)
// — así los dos números siempre son consistentes entre sí, y no dependemos
// de un campo de fecha de GHL que no es confiable para este propósito.
export function analizarVentasYFacturacion(pipelines: GhlPipeline[], opportunitiesDelPeriodo: GhlOpportunity[]) {
  const stageMap = new Map<string, string>() // stageId -> nombre de la etapa
  for (const p of pipelines) {
    for (const s of p.stages) {
      stageMap.set(s.id, s.name)
    }
  }

  // GHL no siempre actualiza el campo "status" a 'won' cuando una oportunidad
  // se mueve a la etapa "Ganado" del pipeline (depende de cómo esté
  // configurada esa etapa específica en GHL) — por eso NO confiamos solo en
  // o.status === 'won'. Se considera "venta" a toda oportunidad cuyo status
  // sea 'won' O cuya etapa actual tenga un nombre que sugiera "ganado"/"won"
  // (mismo criterio que ya usa analizarEmbudo para detectar inconsistencias).
  const esGanada = (o: GhlOpportunity) => {
    if (o.status === 'won') return true
    const nombreEtapa = (stageMap.get(o.pipelineStageId) || '').toLowerCase()
    return /ganad|won/.test(nombreEtapa)
  }

  const ganadas = opportunitiesDelPeriodo.filter(esGanada)
  const facturacion = ganadas.reduce((sum, o) => sum + (o.monetaryValue || 0), 0)

  return {
    ventas: ganadas.length,
    facturacion,
    supuesto_fecha:
      'Se cuenta como "venta del período" toda oportunidad creada dentro del período que hoy está en estado Ganado (mismo criterio de fecha que usa el Funnel Comercial, por createdAt) — GHL no expone una fecha de cierre/venta confiable para filtrar por otro criterio. Se considera "Ganado" tanto status=won como oportunidades cuya etapa actual se llama "Ganado" — GHL no siempre sincroniza el status al mover de etapa.',
  }
}

// ── Funnel comercial por vendedor ──────────────────────────────────────────

export function analizarFunnelPorVendedor(todas: GhlOpportunity[], pipelines: GhlPipeline[], usuarios: GhlUser[]) {
  const stageMap = new Map<string, { name: string; position: number }>()
  for (const p of pipelines) {
    for (const s of p.stages) {
      stageMap.set(s.id, { name: s.name, position: s.position })
    }
  }
  const userMap = new Map(usuarios.map((u) => [u.id, u.name]))

  const vendedoresSet = new Set<string>()
  const etapasConPosicion = new Map<string, number>()
  const matriz = new Map<string, Map<string, number>>() // etapa -> (vendedor -> cantidad)

  for (const o of todas) {
    const etapaInfo = stageMap.get(o.pipelineStageId)
    const etapaNombre = etapaInfo?.name ?? 'Etapa desconocida'
    const vendedorNombre = o.assignedTo ? userMap.get(o.assignedTo) ?? 'Sin asignar' : 'Sin asignar'

    vendedoresSet.add(vendedorNombre)
    etapasConPosicion.set(etapaNombre, etapaInfo?.position ?? 99)

    if (!matriz.has(etapaNombre)) matriz.set(etapaNombre, new Map())
    const fila = matriz.get(etapaNombre)!
    fila.set(vendedorNombre, (fila.get(vendedorNombre) ?? 0) + 1)
  }

  const vendedores = Array.from(vendedoresSet).sort()
  const etapasOrdenadas = Array.from(etapasConPosicion.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([nombre]) => nombre)

  const totalGeneral = todas.length || 1

  const filas = etapasOrdenadas.map((etapa) => {
    const fila = matriz.get(etapa) ?? new Map()
    const porVendedor = vendedores.map((v) => fila.get(v) ?? 0)
    const total = porVendedor.reduce((a, b) => a + b, 0)
    return { etapa, porVendedor, total, pctGeneral: (total / totalGeneral) * 100 }
  })

  return { vendedores, filas, totalOportunidades: todas.length }
}

// ── Módulo 3: Inbox sin leer ────────────────────────────────────────────────

async function analizarInbox(
  creds: { locationId: string; token: string },
  conversaciones: Array<{ id: string; contactId: string; contactName: string; unreadCount: number; lastMessageDate: string | null }>
) {
  const sinLeer = conversaciones.filter((c) => c.unreadCount > 0)
  const criticas: Array<{ conversacionId: string; contacto: string; horasSinResponder: number }> = []

  // Solo revisamos mensajes de las no leídas más recientes para no disparar la cuota de la API
  const aRevisar = sinLeer
    .sort((a, b) => new Date(b.lastMessageDate ?? 0).getTime() - new Date(a.lastMessageDate ?? 0).getTime())
    .slice(0, 30)

  for (const conv of aRevisar) {
    const horas = horasHabilesDesde(conv.lastMessageDate)
    if (horas > SLA_HORAS_HANDOFF) {
      criticas.push({ conversacionId: conv.id, contacto: conv.contactName || conv.contactId, horasSinResponder: Math.round(horas * 10) / 10 })
    }
  }

  return {
    total_conversaciones_activas: conversaciones.length,
    total_sin_leer: sinLeer.length,
    mas_2hs_sin_respuesta: criticas.length,
    conversaciones_criticas: criticas,
    sla_configurado: false, // próximo paso: configuración de SLA y horario laboral por cliente
  }
}

// ── Módulos 2 y 6: requieren leer mensajes de una muestra de conversaciones ─

const calidadSchema = z.object({
  escucha_antes_de_ofrecer: z.boolean(),
  personaliza_respuesta: z.boolean(),
  hace_preguntas_indagacion: z.boolean(),
  genera_confianza: z.number().min(1).max(5),
  propone_proximo_paso: z.boolean(),
  resumen: z.string(),
  score: z.number().min(1).max(10),
})

// Cliente OpenAI dedicado a RevOps, con su propia API key (variable OPENIAREVOPS)
// para poder medir el consumo de este agente por separado del resto.
const openaiRevOps = createOpenAI({
  apiKey: process.env.OPENIAREVOPS,
})

async function auditarConversacion(transcript: string) {
  if (!process.env.OPENIAREVOPS) {
    throw new Error('Falta la variable de entorno OPENIAREVOPS')
  }

  const { object } = await generateObject({
    model: openaiRevOps('gpt-4o-mini'),
    schema: calidadSchema,
    system: `Sos un auditor de calidad comercial para una agencia de marketing digital. Vas a recibir la transcripción de una conversación entre un vendedor (o un bot que debería derivar a un vendedor) y un cliente potencial (lead), proveniente de WhatsApp/CRM.

Evaluá ÚNICAMENTE con base en el texto:
- Si el vendedor escuchó antes de ofrecer, o lanzó el producto de entrada sin indagar.
- Si personalizó la respuesta (nombre, destino, situación puntual del cliente) o mandó algo genérico tipo plantilla.
- Si hizo preguntas de indagación (fechas, presupuesto, quiénes participan, qué espera el cliente).
- Si generó confianza en el trato o solo informó datos fríamente (escala 1-5).
- Si al cerrar la conversación (o hasta donde llega la transcripción) propuso un próximo paso concreto.

Sé estricto: si no hay evidencia clara de algo, marcalo como falso/bajo. Score 1-10 global de calidad comercial.`,
    prompt: transcript,
  })
  return object
}

async function analizarConversacionesYTiempos(
  creds: { locationId: string; token: string },
  conversaciones: Array<{ id: string; contactId: string; contactName: string; lastMessageDate: string | null }>
) {
  const cutoff = Date.now() - VENTANA_DIAS * 24 * 60 * 60 * 1000
  const poolOrdenado = conversaciones
    .filter((c) => c.lastMessageDate && parseISO(c.lastMessageDate).getTime() >= cutoff)
    .sort((a, b) => (b.lastMessageDate ? parseISO(b.lastMessageDate).getTime() : 0) - (a.lastMessageDate ? parseISO(a.lastMessageDate).getTime() : 0))

  const detalleCalidad: Array<{
    conversacionId: string
    contacto: string
    score: number
    escucha_antes_de_ofrecer: boolean
    personaliza_respuesta: boolean
    hace_preguntas_indagacion: boolean
    genera_confianza: number
    propone_proximo_paso: boolean
    resumen: string
  }> = []

  const primeraRespuestaMin: number[] = []
  const handoffMin: number[] = []
  let handoffsDetectados = 0
  let handoffsSinTomar = 0
  let conConversacionReal = 0 // conversaciones con 2+ mensajes reales, las únicas que cuentan como "muestreadas"

  for (let i = 0; i < poolOrdenado.length && i < MAX_INTENTOS_CONVERSACIONES && conConversacionReal < SAMPLE_CONVERSACIONES_CALIDAD; i++) {
    const conv = poolOrdenado[i]
    const mensajesCrudos = await fetchGhlConversationMessages(creds, conv.id)

    // Sacamos eventos de sistema (ej. "Opportunity updated/created") que GHL marca
    // como outbound pero no son una respuesta real a nadie, ANTES de decidir si
    // esta conversación cuenta como "diálogo real" — si no lo hacemos acá, una
    // conversación que es 100% ruido de sistema igual se cuela y se le manda al
    // modelo de IA un transcript vacío, que inventa una evaluación genérica en vez
    // de no tener nada que juzgar.
    const mensajes = mensajesCrudos.filter((m) => !m.messageType?.startsWith('TYPE_ACTIVITY'))
    if (mensajes.length < 2) continue // sin diálogo real: solo logs de sistema o un único mensaje suelto

    conConversacionReal++

    // Tiempo de primera respuesta
    const primerInbound = mensajes.find((m) => m.direction === 'inbound')
    let huboPrimeraRespuesta = false
    if (primerInbound) {
      const primeraOutbound = mensajes.find(
        (m) => m.direction === 'outbound' && parseISO(m.dateAdded).getTime() > parseISO(primerInbound.dateAdded).getTime()
      )
      if (primeraOutbound) {
        const diffMin = minutosHabilesEntre(parseISO(primerInbound.dateAdded).getTime(), parseISO(primeraOutbound.dateAdded).getTime())
        primeraRespuestaMin.push(diffMin)
        huboPrimeraRespuesta = true
      }
    }
    console.log(
      `[v0][revops] conv ${conv.id}: ${mensajesCrudos.length} msgs crudos, ${mensajes.length} reales, hayInbound=${!!primerInbound}, huboRespuesta=${huboPrimeraRespuesta}`
    )

    // Tiempo de handoff: mensaje con frase de derivación -> siguiente outbound con userId (humano)
    const derivacionMsg = mensajes.find(
      (m) => m.direction === 'outbound' && DERIVACION_PHRASES.some((p) => m.body.toLowerCase().includes(p))
    )
    if (derivacionMsg) {
      handoffsDetectados++
      const tomaHumana = mensajes.find(
        (m) => m.direction === 'outbound' && !!m.userId && parseISO(m.dateAdded).getTime() > parseISO(derivacionMsg.dateAdded).getTime()
      )
      if (tomaHumana) {
        const diffMin = minutosHabilesEntre(parseISO(derivacionMsg.dateAdded).getTime(), parseISO(tomaHumana.dateAdded).getTime())
        handoffMin.push(diffMin)
      } else {
        handoffsSinTomar++
      }
    }

    // Auditoría de calidad
    const transcript = mensajes
      .map((m) => `${m.direction === 'inbound' ? 'Cliente' : 'Vendedor/Bot'}: ${m.body}`)
      .join('\n')
      .slice(0, 8000) // límite razonable de tokens por conversación

    try {
      const evalResult = await auditarConversacion(transcript)
      detalleCalidad.push({
        conversacionId: conv.id,
        contacto: conv.contactName || conv.contactId,
        ...evalResult,
      })
    } catch (err) {
      console.error('[v0][revops] Error auditando conversación', conv.id, err instanceof Error ? err.message : err)
    }
  }

  const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null)

  return {
    moduloConversaciones: {
      muestreadas: detalleCalidad.length,
      promedio_score: avg(detalleCalidad.map((d) => d.score)),
      detalle: detalleCalidad,
    },
    moduloTiempos: {
      muestreadas: conConversacionReal,
      promedio_primera_respuesta_min: avg(primeraRespuestaMin),
      promedio_handoff_min: avg(handoffMin),
      handoffs_detectados: handoffsDetectados,
      handoffs_sin_tomar: handoffsSinTomar,
    },
  }
}

// ── Score de salud (0-100) ──────────────────────────────────────────────────

function calcularScoreSalud(resumen: RevOpsResumen): number {
  const componentes: Array<{ valor: number; peso: number }> = []

  if (resumen.tareas.total_tareas > 0) {
    componentes.push({ valor: 100 - resumen.tareas.pct_vencidas * 100, peso: 20 })
  } else if (resumen.tareas.oportunidades_en_muestra > 0) {
    // Sin ninguna tarea cargada no es "neutro": es el peor caso posible de
    // seguimiento, así que penaliza en vez de excluirse del score.
    componentes.push({ valor: 100 - resumen.tareas.pct_sin_tarea * 100, peso: 20 })
  }
  if (resumen.conversaciones_calidad.promedio_score !== null) {
    componentes.push({ valor: resumen.conversaciones_calidad.promedio_score * 10, peso: 25 })
  }
  componentes.push({ valor: Math.max(0, 100 - resumen.inbox.mas_2hs_sin_respuesta * 10), peso: 15 })
  if (resumen.oportunidades.total_abiertas > 0) {
    const penalizacion = (resumen.oportunidades.pct_sin_monto + resumen.oportunidades.pct_sin_responsable) * 50
    componentes.push({ valor: Math.max(0, 100 - penalizacion), peso: 20 })
  }
  const penalEmbudo =
    resumen.embudo.estancadas_90 * 2 + resumen.embudo.duplicados_probables * 3 + resumen.embudo.inconsistencias_estado * 3
  componentes.push({ valor: Math.max(0, 100 - Math.min(100, penalEmbudo)), peso: 10 })
  if (resumen.tiempos_respuesta.promedio_primera_respuesta_min !== null) {
    componentes.push({ valor: Math.max(0, 100 - resumen.tiempos_respuesta.promedio_primera_respuesta_min / 2), peso: 10 })
  }

  const pesoTotal = componentes.reduce((s, c) => s + c.peso, 0) || 1
  const score = componentes.reduce((s, c) => s + c.valor * c.peso, 0) / pesoTotal
  return Math.round(Math.max(0, Math.min(100, score)))
}

function construirAlertas(resumen: RevOpsResumen): { mensaje: string; calculo: string }[] {
  const alertas: { mensaje: string; calculo: string }[] = []
  if (resumen.tareas.alerta_colapso) {
    alertas.push({
      mensaje: 'Colapso de seguimiento: 90%+ de las tareas están vencidas y no hay ninguna futura agendada.',
      calculo: `Sobre una muestra de ${resumen.tareas.oportunidades_en_muestra} oportunidades abiertas (las más recientes), se encontraron ${resumen.tareas.total_tareas} tareas en total. ${resumen.tareas.tareas_vencidas} están vencidas (${Math.round(resumen.tareas.pct_vencidas * 100)}%) y ${resumen.tareas.tareas_futuras} son futuras. Se dispara cuando hay 5+ tareas, 90%+ vencidas y 0 futuras.`,
    })
  }
  if (resumen.tareas.alerta_sin_seguimiento) {
    alertas.push({
      mensaje: `Ninguna de las ${resumen.tareas.oportunidades_en_muestra} oportunidades muestreadas tiene tareas cargadas en GHL: no hay seguimiento comercial activo.`,
      calculo: `Sobre una muestra de ${resumen.tareas.oportunidades_en_muestra} oportunidades abiertas (las más recientes), se consultaron las tareas del contacto asociado en GHL para cada una. Las ${resumen.tareas.sin_tarea} no tienen ninguna tarea creada (ni vencida, ni futura, ni completada). El "% vencidas" da 0% porque no hay tareas para calcular sobre eso, pero eso no significa que el seguimiento esté al día — significa que no se está usando el módulo de tareas.`,
    })
  }
  if (resumen.inbox.mas_2hs_sin_respuesta > 0) {
    alertas.push({
      mensaje: `${resumen.inbox.mas_2hs_sin_respuesta} conversaciones llevan más de ${SLA_HORAS_HANDOFF}hs hábiles sin respuesta humana.`,
      calculo: `De ${resumen.inbox.total_conversaciones_activas} conversaciones activas en el inbox, se cuentan las que tienen el último mensaje entrante (del contacto) sin una respuesta saliente posterior, y donde el tiempo transcurrido en horario hábil (lun-vie 9-18hs ART) supera ${SLA_HORAS_HANDOFF}hs.`,
    })
  }
  if (resumen.tiempos_respuesta.handoffs_sin_tomar > 0) {
    alertas.push({
      mensaje: `${resumen.tiempos_respuesta.handoffs_sin_tomar} casos donde la IA prometió derivar y nadie tomó la conversación.`,
      calculo: `Sobre las conversaciones con diálogo real muestreadas, se buscan mensajes salientes del bot que contengan frases de derivación (ej. "te derivo", "un asesor te contacta") y se verifica si hubo un mensaje saliente posterior con userId (un humano) en esa misma conversación. De ${resumen.tiempos_respuesta.handoffs_detectados} derivaciones detectadas, ${resumen.tiempos_respuesta.handoffs_sin_tomar} nunca tuvieron una toma humana registrada.`,
    })
  }
  if (resumen.oportunidades.pct_sin_monto > 0.5) {
    alertas.push({
      mensaje: 'Más de la mitad de las oportunidades abiertas no tienen monto cargado.',
      calculo: `${resumen.oportunidades.sin_monto} de ${resumen.oportunidades.total_abiertas} oportunidades abiertas (${Math.round(resumen.oportunidades.pct_sin_monto * 100)}%) tienen "monetaryValue" vacío o en 0 en GHL. Se dispara a partir del 50%.`,
    })
  }
  if (resumen.embudo.etapas_iniciales_saturadas) {
    alertas.push({
      mensaje: 'Hay etapas iniciales del embudo saturadas de oportunidades sin calificar.',
      calculo: 'Se marca como saturada una etapa cuando es de las dos primeras posiciones del pipeline (posición 0 o 1) y concentra una porción desproporcionada del total de oportunidades abiertas respecto al resto de las etapas.',
    })
  }
  if (resumen.embudo.duplicados_probables > 0) {
    alertas.push({
      mensaje: `${resumen.embudo.duplicados_probables} oportunidades duplicadas probables sobre el mismo contacto.`,
      calculo: 'Se agrupan las oportunidades abiertas por contactId; cuando un mismo contacto tiene más de una oportunidad abierta en el pipeline, se cuenta como duplicado probable (a partir de la 2da oportunidad del mismo contacto).',
    })
  }
  if (resumen.embudo.inconsistencias_estado > 0) {
    alertas.push({
      mensaje: `${resumen.embudo.inconsistencias_estado} oportunidades en etapa de ganado/perdido pero marcadas como abiertas.`,
      calculo: 'Se compara el nombre de la etapa (pipelineStageId → nombre de etapa) contra el status de la oportunidad: si el nombre de la etapa sugiere "ganado" o "perdido" pero el status en GHL sigue siendo "open", se marca como inconsistencia.',
    })
  }
  if (resumen.embudo.etapas_sospechosas.length > 0) {
    alertas.push({
      mensaje: `Etapas con nombre sospechoso en el embudo: ${resumen.embudo.etapas_sospechosas.join(', ')}.`,
      calculo: `Se revisan los nombres de todas las etapas de los pipelines buscando palabras clave como: ${ETAPAS_SOSPECHOSAS_KEYWORDS.join(', ')}. Cualquier etapa que contenga alguna de esas palabras en su nombre se lista acá.`,
    })
  }
  const muestraDialogoReal = resumen.tiempos_respuesta.muestreadas
  if (muestraDialogoReal > 0 && muestraDialogoReal < 5) {
    alertas.push({
      mensaje: `Solo se encontraron ${muestraDialogoReal} conversaciones con diálogo humano real al revisar hasta ${MAX_INTENTOS_CONVERSACIONES} conversaciones recientes: la enorme mayoría son solo actividad automática del CRM sin interacción real. Los promedios de tiempos de respuesta no son representativos con una muestra tan chica.`,
      calculo: `Se revisaron hasta ${MAX_INTENTOS_CONVERSACIONES} conversaciones recientes de GHL. De cada una se descartan los mensajes de tipo actividad automática (TYPE_ACTIVITY_*, cambios de etapa, notas internas, etc.) y solo se cuentan como "diálogo real" las conversaciones que, tras ese filtro, tienen al menos un mensaje entrante y uno saliente. Solo ${muestraDialogoReal} calificaron.`,
    })
  } else if (muestraDialogoReal === 0) {
    alertas.push({
      mensaje: `No se encontró ninguna conversación con diálogo humano real entre las últimas ${MAX_INTENTOS_CONVERSACIONES} conversaciones revisadas: parecen ser solo registros automáticos del CRM sin interacción real con los leads.`,
      calculo: `Se revisaron hasta ${MAX_INTENTOS_CONVERSACIONES} conversaciones recientes de GHL, descartando en cada una los mensajes de actividad automática del sistema (TYPE_ACTIVITY_*). Ninguna conversación tuvo intercambio real (mensaje entrante + saliente) después de ese filtro.`,
    })
  }
  return alertas
}

// ── Orquestador principal ───────────────────────────────────────────────────

export interface RevOpsAnalysisResult {
  estado: 'ok' | 'parcial' | 'error'
  error_detalle?: string
  score_salud: number | null
  resumen: RevOpsResumen | null
}

export async function runRevOpsAnalysis(
  supabase: SupabaseClient,
  clienteId: string,
  rango?: { desde: string; hasta: string } // filtro de fecha (por createdAt) para que Oportunidades/Embudo coincidan con el rango que se esté mirando en GHL
): Promise<RevOpsAnalysisResult> {
  const { data: cliente, error } = await supabase
    .from('clientes')
    .select('id, nombre_del_negocio, crm_type, ghl_location_id, ghl_token')
    .eq('id', clienteId)
    .single()

  if (error || !cliente) {
    return { estado: 'error', error_detalle: 'Cliente no encontrado', score_salud: null, resumen: null }
  }

  if (cliente.crm_type !== 'ghl') {
    return {
      estado: 'error',
      error_detalle: `CRM "${cliente.crm_type ?? 'no configurado'}" todavía no está soportado por RevOps. Por ahora solo GoHighLevel.`,
      score_salud: null,
      resumen: null,
    }
  }

  if (!cliente.ghl_location_id || !cliente.ghl_token) {
    return { estado: 'error', error_detalle: 'Credenciales de GHL no configuradas para este cliente.', score_salud: null, resumen: null }
  }

  const creds = { locationId: cliente.ghl_location_id as string, token: cliente.ghl_token as string }

  try {
    const [opportunities, pipelines, conversaciones, usuarios] = await Promise.all([
      fetchGhlOpportunities(creds),
      fetchGhlPipelines(creds),
      fetchGhlConversations(creds),
      fetchGhlUsers(creds), // ← necesario para resolver assignedTo → nombre de vendedor
    ])

    // Oportunidades, Embudo, Ventas y Funnel por Vendedor se calculan sobre el
    // rango de fecha (por fecha de creación) que se le haya pasado, para poder
    // igualar el filtro que el paid media tenga aplicado en la vista de GHL.
    // Tareas/Conversaciones/Inbox no se filtran: operan siempre sobre las
    // oportunidades abiertas actuales.
    const opportunitiesParaEmbudo = rango
      ? opportunities.filter((o) => {
          const t = parseISO(o.createdAt).getTime()
          if (isNaN(t)) return false
          const desdeMs = new Date(`${rango.desde}T00:00:00`).getTime()
          const hastaMs = new Date(`${rango.hasta}T23:59:59.999`).getTime()
          return t >= desdeMs && t <= hastaMs
        })
      : opportunities

    const abiertas = opportunities.filter((o) => o.status === 'open')

    const [tareas, { moduloConversaciones, moduloTiempos }, inbox] = await Promise.all([
      analizarTareas(creds, abiertas),
      analizarConversacionesYTiempos(creds, conversaciones),
      analizarInbox(creds, conversaciones),
    ])

    const oportunidades = analizarOportunidades(opportunitiesParaEmbudo, conversaciones.length, rango)
    const embudo = analizarEmbudo(opportunitiesParaEmbudo, pipelines)

    // Ventas usa el MISMO set ya filtrado por período (opportunitiesParaEmbudo)
    // que usan Embudo y Funnel — así los tres módulos son consistentes entre sí.
    const ventas = analizarVentasYFacturacion(pipelines, opportunitiesParaEmbudo)
    const funnelPorVendedor = analizarFunnelPorVendedor(opportunitiesParaEmbudo, pipelines, usuarios)

    const resumenSinAlertas: RevOpsResumen = {
      tareas,
      conversaciones_calidad: moduloConversaciones,
      inbox,
      oportunidades,
      embudo,
      tiempos_respuesta: moduloTiempos,
      ventas,
      funnel_por_vendedor: funnelPorVendedor,
      alertas: [],
    }

    const resumen: RevOpsResumen = { ...resumenSinAlertas, alertas: construirAlertas(resumenSinAlertas) }
    const score = calcularScoreSalud(resumen)

    return { estado: 'ok', score_salud: score, resumen }
  } catch (err) {
    return {
      estado: 'error',
      error_detalle: err instanceof Error ? err.message : 'Error desconocido al analizar el CRM',
      score_salud: null,
      resumen: null,
    }
  }
}
