import * as XLSX from 'xlsx'

export interface ParsedAttachment {
  name: string
  type: string
  content: string
  format: 'csv' | 'excel' | 'text' | 'unknown'
}

/**
 * Download and parse file attachments (CSV, Excel, TXT)
 * Returns the file content as formatted text for inclusion in LLM context
 */
export async function parseAttachment(attachment: {
  url: string
  name?: string
  type?: string
}): Promise<ParsedAttachment | null> {
  try {
    const response = await fetch(attachment.url)
    if (!response.ok) {
      console.warn('[v0] Failed to fetch attachment:', attachment.url, response.status)
      return null
    }

    const contentType = attachment.type?.toLowerCase() || response.headers.get('content-type') || ''
    const fileName = attachment.name || 'documento'

    // Handle CSV
    if (contentType.includes('csv') || fileName.toLowerCase().endsWith('.csv')) {
      const text = await response.text()
      return {
        name: fileName,
        type: contentType,
        content: text,
        format: 'csv',
      }
    }

    // Handle Excel (XLSX, XLS)
    if (
      contentType.includes('spreadsheet') ||
      contentType.includes('excel') ||
      contentType.includes('sheet') ||
      fileName.toLowerCase().match(/\.(xlsx?|ods)$/)
    ) {
      const arrayBuffer = await response.arrayBuffer()
      const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' })

      // Convert all sheets to CSV format for easy reading
      let csvContent = ''
      workbook.SheetNames.forEach((sheetName, sheetIdx) => {
        if (sheetIdx > 0) csvContent += '\n\n---\n\n'
        csvContent += `HOJA: ${sheetName}\n\n`

        const worksheet = workbook.Sheets[sheetName]
        const csv = XLSX.utils.sheet_to_csv(worksheet, { blankrows: false })
        csvContent += csv
      })

      return {
        name: fileName,
        type: contentType,
        content: csvContent,
        format: 'excel',
      }
    }

    // Handle plain text files
    if (
      contentType.includes('text') ||
      contentType.includes('plain') ||
      fileName.toLowerCase().endsWith('.txt')
    ) {
      const text = await response.text()
      return {
        name: fileName,
        type: contentType,
        content: text,
        format: 'text',
      }
    }

    // Fallback: try to read as text
    const text = await response.text()
    if (text && text.length > 0) {
      return {
        name: fileName,
        type: contentType,
        content: text,
        format: 'unknown',
      }
    }

    return null
  } catch (error) {
    console.error('[v0] Error parsing attachment:', attachment.url, error)
    return null
  }
}

/**
 * Parse multiple attachments and format them into a context string
 */
export async function parseAttachments(
  attachments: Array<{ url: string; name?: string; type?: string }>,
): Promise<string> {
  if (!attachments || attachments.length === 0) return ''

  const parsed = await Promise.all(attachments.map(parseAttachment))
  const validParsed = parsed.filter((p): p is ParsedAttachment => p !== null)

  if (validParsed.length === 0) return ''

  let context = '\n\nARCHIVOS ADJUNTOS PARSEADOS:\n\n'
  validParsed.forEach((attachment) => {
    context += `---\nARCHIVO: ${attachment.name} (${attachment.format})\n---\n`
    // Limit content to first 10000 chars per file (enough for ~100+ rows of CSV data)
    const contentPreview = attachment.content.substring(0, 10000)
    const truncated = attachment.content.length > 10000 ? '\n... [Archivo muy grande, se muestran las primeras 10000 caracteres]' : ''
    context += contentPreview + truncated + '\n\n'
  })

  return context
}
