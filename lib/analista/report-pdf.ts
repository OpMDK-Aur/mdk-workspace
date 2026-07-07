import { PDFDocument as PDFLibDocument, StandardFonts, rgb } from 'pdf-lib'
import fs from 'fs'
import path from 'path'

export interface ReportPdfInput {
  clientName: string
  plan?: string | null
  periodLabel: string
  responsable?: string
  markdown: string
  fileName?: string
}

/**
 * Carga la plantilla PDF correcta (Esencial o Estratégico) y agrega el contenido
 * del agente analista sin alterar el diseño base de la plantilla.
 */
export async function generateReportPdf(input: ReportPdfInput): Promise<Buffer> {
  try {
    const isEstrategico = (input.plan || '').toLowerCase().includes('estrat')
    const templateFileName = isEstrategico ? 'Informe_Estrategico_MDK.pdf' : 'Informe_Esencial_MDK.pdf'

    // Cargar plantilla PDF desde public/templates
    const templatePath = path.join(process.cwd(), 'public', templateFileName)
    console.log('[v0] Loading template from:', templatePath)

    const templateBytes = fs.readFileSync(templatePath)
    const pdfDoc = await PDFLibDocument.load(templateBytes)

    console.log('[v0] Template loaded successfully, pages:', pdfDoc.getPageCount())

    // Obtener la primera página para agregar texto
    const pages = pdfDoc.getPages()
    const firstPage = pages[0]
    const { width, height } = firstPage.getSize()

    console.log('[v0] Page dimensions:', width, 'x', height)

    // ---------------------------------------------------------------
    // FIX 1: pdf-lib requiere una fuente embebida explícita para poder
    // dibujar texto. Sin esto, drawText() tira "Cannot draw text without
    // a specified font".
    // ---------------------------------------------------------------
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

    // Agregar página nueva para el contenido del agente
    let currentPage = pdfDoc.addPage([width, height])

    // Extraer y formatear el contenido del markdown
    const lines = input.markdown.split('\n').filter((l) => l.trim())

    let yPosition = height - 50 // Comenzar desde arriba con margen
    const lineHeight = 15
    const marginX = 40
    const maxWidth = width - 80

    for (const line of lines) {
      // Si llegamos al final de la página, agregar nueva página
      if (yPosition < 50) {
        currentPage = pdfDoc.addPage([width, height])
        yPosition = height - 50
      }

      // Formatear líneas según su tipo (encabezados, viñetas, etc.)
      let displayText = line
      let fontSize = 11
      let useBold = false

      if (line.startsWith('# ')) {
        // Encabezado nivel 1
        displayText = line.replace(/^# /, '')
        fontSize = 16
        useBold = true
        yPosition -= 5 // Espacio extra antes de encabezado
      } else if (line.startsWith('## ')) {
        // Encabezado nivel 2
        displayText = line.replace(/^## /, '')
        fontSize = 14
        useBold = true
        yPosition -= 3
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        // Viñeta
        displayText = '• ' + line.replace(/^[-*]\s*/, '')
        fontSize = 11
      } else {
        fontSize = 11
      }

      // Agregar texto a la página
      currentPage.drawText(displayText, {
        x: marginX,
        y: yPosition,
        size: fontSize,
        maxWidth: maxWidth,
        lineHeight: lineHeight,
        font: useBold ? fontBold : font,
        color: rgb(0.12, 0.12, 0.12),
      })

      yPosition -= lineHeight + (fontSize === 11 ? 2 : 8)
    }

    // Guardar y retornar el PDF modificado
    const pdfBytes = await pdfDoc.save()
    console.log('[v0] PDF generated successfully, size:', pdfBytes.length)

    return Buffer.from(pdfBytes)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[v0] PDF generation error:', errorMessage)
    console.error('[v0] Error stack:', error instanceof Error ? error.stack : 'no stack')
    throw error
  }
}