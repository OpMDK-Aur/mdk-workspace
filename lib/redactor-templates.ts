export const REDACTOR_TEMPLATES = {
  inicio_semana: {
    estrategico: `¡Hola [Nombre]! 👋 Buen lunes.
Desde el equipo de Operaciones de MDK te compartimos los hitos clave en los que vamos a estar trabajando en tu cuenta esta semana:

🎯 Foco principal: [Ej: Optimización de campañas post-informe de cierre / Lanzamiento de la nueva segmentación]

✅ Checklist de la semana:
— [Item 1: acción concreta]
— [Item 2: seguimiento o ajuste técnico]
— [Item 3: preparación de reporte o análisis]

📊 Métricas de referencia (período actual):
— Inversión: $[MONTO]
— Leads: [CANTIDAD]
— CPL: $[VALOR]

🚀 Objetivo: [Resultado esperado. Ej: Recuperar el CPL a los niveles de la semana 2 del mes anterior.]`,

    esencial: `¡Hola [Nombre]! 👋 Buen lunes.
Esta semana en tu cuenta vamos a estar trabajando en:

🎯 [Una sola línea con el foco de la semana. Ej: Optimización de campañas y revisión de trackeo.]

📊 Métricas de esta semana:
— Inversión: $[MONTO]
— Leads: [CANTIDAD]
— CPL: $[VALOR]

🚀 Objetivo: [Una sola línea. Ej: Mantener el CPL dentro del rango acordado.]

Cualquier consulta, acá estamos. 💪`
  },

  cierre_semana: {
    estrategico: `¡Hola [Nombre del Cliente]! 👋 Cerramos la semana en MDK con los avances y métricas clave de tu cuenta:

✅ Hitos Completados:
— Logro 1: [Ej: Campaña de X lanzada con éxito]
— Logro 2: [Ej: Ajuste técnico de la plataforma finalizado]

📊 Métricas de Gestión (Corte de la semana):
— Inversión: $[MONTO]
— Leads: [CANTIDAD]
— CPL: $[VALOR]

💡 Conclusión: [Una frase corta sobre qué significan estos números. Ej: "Los ajustes de pauta del martes ya muestran una mejora en el costo por conversión"].

⏭️ Próximos pasos: [Lo más importante para el lunes/martes].

¡Buen fin de semana para todo el equipo! 🥂`,

    esencial: `¡Hola [Nombre]! 👋 Cerramos la semana con tu cuenta al día.

✅ Lo que hicimos: [Una sola línea. Ej: Optimizamos las campañas de búsqueda y ajustamos el presupuesto diario.]

📊 Métricas de la semana:
— Inversión: $[MONTO]
— Leads: [CANTIDAD]
— CPL: $[VALOR]

⏭️ La semana que viene: [Una sola acción. Ej: Arrancamos con los nuevos creativos aprobados.]

¡Buen finde! 🙌`
  }
};

export function getTemplateForMessage(tipo: string, nivelCliente: 'estrategico' | 'esencial' = 'esencial'): string {
  const tipoNormalizado = tipo?.toLowerCase() || 'inicio_semana';
  
  if (tipoNormalizado.includes('cierre') || tipoNormalizado.includes('fin')) {
    return REDACTOR_TEMPLATES.cierre_semana[nivelCliente];
  }
  
  return REDACTOR_TEMPLATES.inicio_semana[nivelCliente];
}

export function formatTemplate(
  template: string,
  data: {
    nombre: string;
    inversion: number;
    leads: number;
    cpl: number;
    tareas?: string[];
    comentarios?: string;
  }
): string {
  let formatted = template
    .replace('[Nombre]', data.nombre)
    .replace('[Nombre del Cliente]', data.nombre)
    .replace('[MONTO]', data.inversion.toFixed(2))
    .replace('[CANTIDAD]', data.leads.toString())
    .replace('[VALOR]', data.cpl.toFixed(2));

  return formatted;
}
