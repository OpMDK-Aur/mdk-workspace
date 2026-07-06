import { generateReportPdf } from '@/lib/analista/report-pdf'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { clientName, plan, periodLabel, responsable, markdown, fileName } = body

    if (!clientName || !markdown) {
      return NextResponse.json(
        { error: 'clientName y markdown son requeridos' },
        { status: 400 }
      )
    }

    // Generar PDF
    console.log('[v0] Generating PDF for:', clientName)
    const pdfBuffer = await generateReportPdf({
      clientName,
      plan,
      periodLabel,
      responsable,
      markdown,
      fileName,
    })

    console.log('[v0] PDF generated, size:', pdfBuffer?.length)

    if (!pdfBuffer || pdfBuffer.length === 0) {
      return NextResponse.json(
        { error: 'PDF generado pero vacío' },
        { status: 500 }
      )
    }

    // Retornar PDF con headers apropiados
    const name = fileName || `Informe_${clientName.replace(/\s+/g, '_')}_${periodLabel}.pdf`

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('[v0] PDF generation error:', error)
    return NextResponse.json(
      { error: 'Error al generar el PDF' },
      { status: 500 }
    )
  }
}
