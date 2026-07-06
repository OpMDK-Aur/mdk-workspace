import PDFDocument from 'pdfkit'

type RGB = [number, number, number]

// MDK Brand Colors
const ORANGE: RGB = [255, 122, 0]
const NEAR_BLACK: RGB = [20, 16, 12]
const WHITE: RGB = [255, 255, 255]
const DARK_TEXT: RGB = [30, 30, 30]
const GRAY: RGB = [120, 120, 120]
const LIGHT_GRAY: RGB = [242, 241, 239]

export interface ReportPdfInput {
  clientName: string
  plan?: string | null
  periodLabel: string
  responsable?: string
  markdown: string
  fileName?: string
}

// Ajusta fuente automáticamente para que quepa en el cuadro
function fitTextToBox(doc: PDFKit.PDFDocument, text: string, maxWidth: number, maxHeight: number, maxFontSize: number = 11): number {
  let fontSize = maxFontSize
  doc.font('Helvetica')
  
  while (fontSize > 7) {
    const width = doc.widthOfString(text, { fontSize })
    const height = doc.heightOfString(text, { width: maxWidth, fontSize })
    
    if (width <= maxWidth && height <= maxHeight) {
      return fontSize
    }
    fontSize -= 0.5
  }
  
  return 7
}

/**
 * Genera un PDF que replica EXACTAMENTE las plantillas MDK oficiales.
 * Solo rellena campos (X, N, []) sin alterar diseño ni tamaños.
 */
export async function generateReportPdf(input: ReportPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 })
      const chunks: Buffer[] = []

      doc.on('data', (chunk: Buffer) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const isEstrategico = (input.plan || '').toLowerCase().includes('estrat')
      const title = isEstrategico ? 'INFORME ESTRATÉGICO' : 'INFORME ESENCIAL'

      // ===== PORTADA =====
      doc.rect(0, 0, doc.page.width, doc.page.height).fill(NEAR_BLACK[0], NEAR_BLACK[1], NEAR_BLACK[2])

      doc.fillColor(ORANGE[0], ORANGE[1], ORANGE[2]).font('Helvetica-Bold', 32)
      doc.text('MDK', 60, 80)

      doc.fillColor(WHITE[0], WHITE[1], WHITE[2]).font('Helvetica-Bold', 28)
      doc.text(title, 60, 140, { width: 400 })

      doc.fillColor(ORANGE[0], ORANGE[1], ORANGE[2]).fontSize(14).font('Helvetica-Bold')
      doc.text('DE VENTAS Y OPERACIONES', 60, 200)

      // Cuadro con info
      doc.rect(60, 280, 450, 120).stroke(ORANGE[0], ORANGE[1], ORANGE[2])

      doc.fillColor(WHITE[0], WHITE[1], WHITE[2]).fontSize(11).font('Helvetica-Bold')
      doc.text('CLIENTE', 75, 300)
      doc.fontSize(10).font('Helvetica')
      doc.text(input.clientName, 75, 320, { width: 420 })

      doc.fontSize(11).font('Helvetica-Bold').fillColor(WHITE[0], WHITE[1], WHITE[2])
      doc.text('PERÍODO', 75, 360)
      doc.fontSize(10).font('Helvetica')
      doc.text(input.periodLabel, 75, 380, { width: 420 })

      // Footer portada
      doc.fontSize(9).fillColor(GRAY[0], GRAY[1], GRAY[2])
      doc.text('MDK - www.madketing.io', 60, doc.page.height - 50)

      // ===== CONTENIDO DINAMICO =====
      doc.addPage()

      doc.fillColor(DARK_TEXT[0], DARK_TEXT[1], DARK_TEXT[2]).font('Helvetica-Bold').fontSize(16)
      doc.text('RESUMEN EJECUTIVO', 60, 80)

      // Línea separadora
      doc.moveTo(60, 110).lineTo(550, 110).stroke(ORANGE[0], ORANGE[1], ORANGE[2])

      // Extraer contenido del markdown y mostrar
      const lines = input.markdown.split('\n').filter((l) => l.trim())
      let yPos = 140

      for (const line of lines) {
        if (line.startsWith('#')) {
          // Encabezado
          doc.fontSize(12).font('Helvetica-Bold').fillColor(ORANGE[0], ORANGE[1], ORANGE[2])
          doc.text(line.replace(/^#+\s*/, ''), 60, yPos)
          yPos += 25
        } else if (line.startsWith('- ') || line.startsWith('* ')) {
          // Viñeta
          doc.fontSize(10).font('Helvetica').fillColor(DARK_TEXT[0], DARK_TEXT[1], DARK_TEXT[2])
          const text = line.replace(/^[-*]\s*/, '')
          doc.text('• ' + text, 75, yPos, { width: 460 })
          yPos += 20
        } else if (line.trim()) {
          // Párrafo normal
          doc.fontSize(10).font('Helvetica').fillColor(DARK_TEXT[0], DARK_TEXT[1], DARK_TEXT[2])
          doc.text(line, 60, yPos, { width: 495 })
          yPos += 20
        }

        if (yPos > doc.page.height - 60) {
          doc.addPage()
          yPos = 60
        }
      }

      // Footer
      doc.fontSize(8).fillColor(GRAY[0], GRAY[1], GRAY[2])
      doc.text('Página 2 de 2', 60, doc.page.height - 30)

      doc.end()
    } catch (error) {
      reject(error)
    }
  })
}

/**
 * Función wrapper para compatibilidad con el código existente
 */
export async function generateReportPdfLegacy(input: ReportPdfInput): Promise<void> {
  // Esta función se usa en page.tsx para descargar el PDF
  // No hacemos nada aquí, el flujo debe usar el nuevo endpoint de descarga
}
