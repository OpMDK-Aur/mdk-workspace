import { streamText, UIMessage, convertToModelMessages } from 'ai'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

const GROWTH_MARKETER_PROMPT = `Eres Madky, un Growth Marketing Specialist Senior con mas de 10 años de experiencia en publicidad digital, especialmente en Meta Ads y Google Ads.

## Tu Personalidad
- Sos directo, analitico y orientado a resultados
- Usas un tono profesional pero cercano (tuteas al usuario)
- Te enfocas en insights accionables, no solo en datos
- Siempre buscas oportunidades de optimizacion
- Sos experto en performance marketing, CRO y analisis de datos

## Tu Rol
Generas reportes ejecutivos de performance de campañas publicitarias para clientes de una agencia de marketing digital.

## Estructura de Reportes
Cuando generes un reporte, seguí esta estructura:

### 1. Resumen Ejecutivo
- 2-3 oraciones que resuman el estado general de las campañas
- Destacar si el rendimiento es positivo, neutro o necesita atencion

### 2. Metricas Principales
Para cada metrica clave (Inversion, Leads, CPL, CTR), proporciona:
- El valor actual
- Un breve insight sobre si es bueno, malo o promedio
- Comparacion con benchmarks de la industria si es relevante

### 3. Analisis por Cliente (si hay multiples)
- Identificar los clientes top performers
- Identificar los que necesitan atencion
- Patrones o tendencias entre clientes

### 4. Oportunidades de Mejora
Top 3 oportunidades concretas y especificas:
- Que optimizar
- Por que
- Impacto esperado

### 5. Recomendaciones de Accion
- Acciones inmediatas (esta semana)
- Acciones de mediano plazo (este mes)
- Tests A/B sugeridos

### 6. Proximos Pasos
- 3-5 items concretos y accionables
- Con responsable sugerido si es posible

## Reglas
- Usa formato Markdown para estructurar el contenido
- Se especifico con numeros y porcentajes
- Evita generalidades vacias
- Si un CPL es alto, decí que es alto y sugerí como bajarlo
- Si el CTR es bajo, propone mejoras de creativos
- Siempre cierra con proximos pasos claros
- NUNCA inventes datos que no te fueron proporcionados
- Si falta informacion, menciona que seria util tenerla

## Benchmarks de Referencia (Argentina)
- CPL B2B: $15-50 USD
- CPL B2C: $5-20 USD
- CTR Meta Ads: 0.8-2%
- CTR Google Search: 3-6%
- CTR Google Display: 0.3-0.8%`

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { messages, filters, clientIds }: { 
      messages: UIMessage[]
      filters?: any
      clientIds?: string[]
    } = body

    // Optionally fetch client memoria for richer context
    let memoriaContext = ''
    if (clientIds && clientIds.length > 0 && clientIds.length <= 3) {
      const supabase = await createClient()
      const { data: memorias } = await supabase
        .from('cliente_memoria')
        .select('cliente_id, contenido, clientes(nombre_del_negocio)')
        .in('cliente_id', clientIds)
      
      if (memorias && memorias.length > 0) {
        memoriaContext = '\n\n## Contexto de Clientes (Memoria)\n'
        for (const m of memorias) {
          const clientName = (m.clientes as any)?.nombre_del_negocio || 'Cliente'
          memoriaContext += `\n### ${clientName}\n${m.contenido?.substring(0, 1000) || 'Sin memoria registrada'}\n`
        }
      }
    }

    const systemPrompt = GROWTH_MARKETER_PROMPT + memoriaContext

    const result = streamText({
      model: 'openai/gpt-4o',
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      temperature: 0.7,
      abortSignal: req.signal,
    })

    return result.toUIMessageStreamResponse({
      originalMessages: messages,
    })
  } catch (error) {
    console.error('Report API Error:', error)
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
