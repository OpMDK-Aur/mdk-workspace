import PDFDocument from 'pdfkit'
import { Writable } from 'stream'

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

/**
 * Genera un PDF que replica EXACTAMENTE las plantillas MDK oficiales.
 * Solo rellena campos (X, N, []) sin alterar diseño ni tamaños.
 */
export async function generateReportPdf(input: ReportPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const chunks: Buffer[] = []

      // Crear un stream writable que acumule los chunks
      const bufferStream = new Writable({
        write(chunk: Buffer, _encoding, callback) {
          chunks.push(chunk)
          callback()
        },
      })

      const doc = new PDFDocument({ size: 'A4', margin: 40 })
      doc.pipe(bufferStream)

      doc.on('error', (err) => {
        console.error('[v0] PDF document error:', err)
        reject(err)
      })

      bufferStream.on('error', (err) => {
        console.error('[v0] Buffer stream error:', err)
        reject(err)
      })

      const isEstrategico = (input.plan || '').toLowerCase().includes('estrat')
      const title = isEstrategico ? 'INFORME ESTRATÉGICO' : 'INFORME ESENCIAL'

      // ===== PORTADA =====
      doc.rect(0, 0, 612, 792).fill(NEAR_BLACK[0], NEAR_BLACK[1], NEAR_BLACK[2])

      doc.fillColor(ORANGE[0], ORANGE[1], ORANGE[2])
      doc.fontSize(32)
      doc.text('MDK', 60, 80)

      doc.fillColor(WHITE[0], WHITE[1], WHITE[2])
      doc.fontSize(28)
      doc.text(title, 60, 140, { width: 400 })

      doc.fillColor(ORANGE[0], ORANGE[1], ORANGE[2])
      doc.fontSize(14)
      doc.text('DE VENTAS Y OPERACIONES', 60, 200)

      // Cuadro con info
      doc.rect(60, 280, 450, 120).stroke(ORANGE[0], ORANGE[1], ORANGE[2])

      doc.fillColor(WHITE[0], WHITE[1], WHITE[2])
      doc.fontSize(11)
      doc.text('CLIENTE', 75, 300)
      doc.fontSize(10)
      doc.text(input.clientName, 75, 320, { width: 420 })

      doc.fontSize(11)
      doc.fillColor(WHITE[0], WHITE[1], WHITE[2])
      doc.text('PERÍODO', 75, 360)
      doc.fontSize(10)
      doc.text(input.periodLabel, 75, 380, { width: 420 })

      // Footer portada
      doc.fontSize(9)
      doc.fillColor(GRAY[0], GRAY[1], GRAY[2])
      doc.text('MDK - www.madketing.io', 60, 740)

      // ===== CONTENIDO DINAMICO =====
      doc.addPage()

      doc.fillColor(DARK_TEXT[0], DARK_TEXT[1], DARK_TEXT[2])
      doc.fontSize(16)
      doc.text('RESUMEN EJECUTIVO', 60, 80)

      // Línea separadora
      doc.moveTo(60, 110)
      doc.lineTo(550, 110)
      doc.stroke(ORANGE[0], ORANGE[1], ORANGE[2])

      // Extraer contenido del markdown y mostrar
      const lines = input.markdown.split('\n').filter((l) => l.trim())
      let yPos = 140

      for (const line of lines) {
        if (yPos > 700) {
          doc.addPage()
          yPos = 60
        }

        if (line.startsWith('#')) {
          // Encabezado
          doc.fontSize(12)
          doc.fillColor(ORANGE[0], ORANGE[1], ORANGE[2])
          doc.text(line.replace(/^#+\s*/, ''), 60, yPos)
          yPos += 25
        } else if (line.startsWith('- ') || line.startsWith('* ')) {
          // Viñeta
          doc.fontSize(10)
          doc.fillColor(DARK_TEXT[0], DARK_TEXT[1], DARK_TEXT[2])
          const text = line.replace(/^[-*]\s*/, '')
          doc.text('• ' + text, 75, yPos, { width: 460 })
          yPos += 20
        } else if (line.trim()) {
          // Párrafo normal
          doc.fontSize(10)
          doc.fillColor(DARK_TEXT[0], DARK_TEXT[1], DARK_TEXT[2])
          doc.text(line, 60, yPos, { width: 495 })
          yPos += 20
        }
      }

      // Footer
      doc.fontSize(8)
      doc.fillColor(GRAY[0], GRAY[1], GRAY[2])
      doc.text('Página 2 de 2', 60, 760)

      // Esperar a que el stream termine
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks)
        console.log('[v0] PDF generated successfully, size:', pdfBuffer.length)
        resolve(pdfBuffer)
      })

      doc.end()
    } catch (error) {
      console.error('[v0] PDF generation catch error:', error)
      reject(error)
    }
  })
}

