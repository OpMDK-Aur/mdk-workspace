/**
 * Motor de plantillas minimalista para los informes HTML → PDF.
 *
 * No usamos una librería como Handlebars a propósito: solo necesitamos dos
 * operaciones (reemplazo de token y repetición de bloque), y mantenerlo así
 * de simple hace que sea trivial de auditar y no agrega una dependencia más
 * al pipeline de generación de PDFs.
 */

export type TemplateRow = Record<string, string>

/**
 * Escapa texto para insertarlo de forma segura dentro de HTML.
 * Todo el contenido que viene del análisis de la IA pasa por acá antes de
 * insertarse en el documento — nunca insertamos texto crudo en el HTML.
 */
export function escapeHtml(value: string | undefined | null): string {
  if (value === undefined || value === null) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Reemplaza todas las ocurrencias de {{clave}} en el HTML por el valor
 * correspondiente en `data`, escapado. Las claves con `raw: true` marcadas
 * en `rawKeys` se insertan SIN escapar (uso exclusivo para HTML de confianza
 * generado por nuestro propio código, como fuentes/imágenes en base64 o
 * fragmentos de fila ya escapados individualmente — nunca para texto libre
 * de la IA).
 */
export function fillTemplate(html: string, data: TemplateRow, rawKeys: string[] = []): string {
  return html.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    if (!(key in data)) return match // deja el token visible si falta la clave (ayuda a detectar bugs)
    const value = data[key] ?? ''
    return rawKeys.includes(key) ? value : escapeHtml(value)
  })
}

/**
 * Busca un bloque marcado como:
 *   <!--REPEAT:nombre--> ... plantilla de una fila ... <!--END:nombre-->
 * y lo reemplaza por la concatenación de esa plantilla rellenada una vez
 * por cada elemento de `rows`. Si `rows` está vacío, se deja una única fila
 * con el `emptyRow` provisto (para no dejar una tabla/lista visualmente rota).
 */
export function repeatBlock(
  html: string,
  blockName: string,
  rows: TemplateRow[],
  emptyRow?: TemplateRow
): string {
  const re = new RegExp(`<!--REPEAT:${blockName}-->([\\s\\S]*?)<!--END:${blockName}-->`, 'm')
  const match = html.match(re)
  if (!match) {
    console.warn(`[report-pdf] Bloque REPEAT:${blockName} no encontrado en la plantilla`)
    return html
  }
  const rowTemplate = match[1]
  const effectiveRows = rows.length > 0 ? rows : emptyRow ? [emptyRow] : []
  const rendered = effectiveRows.map((row) => fillTemplate(rowTemplate, row)).join('\n')
  // OJO: usamos la forma de función `() => rendered`, NO `html.replace(re, rendered)`.
  // Si `rendered` contiene un valor en pesos como "$1500000" y se pasa como
  // string de reemplazo, JS interpreta "$1" como "insertar el grupo de
  // captura 1" (la plantilla cruda sin rellenar) en vez de tratarlo como
  // texto literal — esto duplicaba/corrompía las filas de tablas con montos.
  // El reemplazo por función nunca reinterpreta los "$" del valor devuelto.
  return html.replace(re, () => rendered)
}

/**
 * Verifica que no haya quedado ningún {{token}} sin reemplazar en el HTML
 * final. Es una red de seguridad para detectar campos que nos olvidamos de
 * mapear — un token visible en el PDF es mucho más fácil de diagnosticar
 * que un "Dato no provisto" ambiguo.
 */
export function findUnresolvedTokens(html: string): string[] {
  const matches = html.match(/\{\{\w+\}\}/g)
  return matches ? Array.from(new Set(matches)) : []
}
