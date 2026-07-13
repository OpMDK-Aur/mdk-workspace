// ── RevOps Agent Types ────────────────────────────────────────────────────
export interface RevOpsModuloTareas {
  oportunidades_en_muestra: number
  con_tarea: number
  sin_tarea: number
  total_tareas: number
  tareas_vencidas: number
  tareas_completadas: number
  tareas_futuras: number
  tareas_sin_fecha: number
  pct_vencidas: number // 0-1
  alerta_colapso: boolean
  alerta_sin_seguimiento: boolean
  pct_sin_tarea: number // 0-1
}
export interface RevOpsConversacionAuditada {
  conversacionId: string
  contacto: string
  score: number // 1-10
  escucha_antes_de_ofrecer: boolean
  personaliza_respuesta: boolean
  hace_preguntas_indagacion: boolean
  genera_confianza: number // 1-5
  propone_proximo_paso: boolean
  resumen: string
}
export interface RevOpsModuloConversaciones {
  muestreadas: number
  promedio_score: number | null
  detalle: RevOpsConversacionAuditada[]
}
export interface RevOpsModuloInbox {
  total_conversaciones_activas: number
  total_sin_leer: number
  mas_2hs_sin_respuesta: number
  conversaciones_criticas: Array<{ conversacionId: string; contacto: string; horasSinResponder: number }>
  sla_configurado: boolean
}
export interface RevOpsModuloOportunidades {
  total_abiertas: number
  sin_monto: number
  pct_sin_monto: number
  sin_responsable: number
  pct_sin_responsable: number
  sin_actividad_30d: number
  pct_sin_actividad_30d: number
  creadas_en_periodo: number
  conversaciones_en_periodo: number
}
export interface RevOpsModuloEmbudo {
  por_etapa: Array<{ etapa: string; pipeline: string; cantidad: number; esEtapaInicial: boolean }>
  etapas_iniciales_saturadas: boolean
  estancadas_30: number
  estancadas_60: number
  estancadas_90: number
  duplicados_probables: number
  etapas_sospechosas: string[]
  inconsistencias_estado: number
}
export interface RevOpsModuloTiempos {
  muestreadas: number
  promedio_primera_respuesta_min: number | null
  promedio_handoff_min: number | null
  handoffs_detectados: number
  handoffs_sin_tomar: number
}
export interface RevOpsAlerta {
  mensaje: string
  calculo: string
}

// ── NUEVO: Ventas y facturación (oportunidades en estado "Ganado") ────────
export interface RevOpsModuloVentas {
  ventas: number
  facturacion: number
  // Documenta el supuesto tomado porque GHL no expone una fecha de "cierre"
  // separada de updatedAt — si en algún momento se agrega ese campo en GHL,
  // hay que revisar este módulo.
  supuesto_fecha: string
}

// ── NUEVO: Funnel comercial por vendedor ───────────────────────────────────
export interface RevOpsFunnelFila {
  etapa: string
  porVendedor: number[] // mismo orden que RevOpsModuloFunnelPorVendedor.vendedores
  total: number
  pctGeneral: number // 0-100
}
export interface RevOpsModuloFunnelPorVendedor {
  vendedores: string[]
  filas: RevOpsFunnelFila[]
  totalOportunidades: number
}

export interface RevOpsResumen {
  tareas: RevOpsModuloTareas
  conversaciones_calidad: RevOpsModuloConversaciones
  inbox: RevOpsModuloInbox
  oportunidades: RevOpsModuloOportunidades
  embudo: RevOpsModuloEmbudo
  tiempos_respuesta: RevOpsModuloTiempos
  ventas: RevOpsModuloVentas // ← NUEVO
  funnel_por_vendedor: RevOpsModuloFunnelPorVendedor // ← NUEVO
  alertas: RevOpsAlerta[]
}
export interface RevOpsEjecucion {
  id: string
  cliente_id: string
  crm_type: string | null
  ejecutado_por: string | null
  ejecutado_en: string
  estado: 'ok' | 'parcial' | 'error'
  error_detalle: string | null
  score_salud: number | null
  periodo_desde: string | null
  periodo_hasta: string | null
  resumen: RevOpsResumen
}
export interface ClienteConRevOps {
  id: string
  nombre_del_negocio: string
  crm_type: string | null
  ghl_location_id: string | null
  ultima_ejecucion: RevOpsEjecucion | null
}
export interface RevOpsBoardProps {
  clientes: ClienteConRevOps[]
}
export interface RevOpsDetailSheetProps {
  cliente: ClienteConRevOps | null
  open: boolean
  onOpenChange: (open: boolean) => void
}