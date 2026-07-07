import { generateReportPdf } from '@/lib/analista/report-pdf'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 120

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
    const pdfBuffer = await generateReportPdf({
      clientName,
      plan,
      periodLabel,
      responsable,
      markdown,
      fileName,
    })

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
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[v0] PDF generation error:', errorMessage)
    console.error('[v0] Error stack:', error instanceof Error ? error.stack : 'no stack')
    return NextResponse.json(
      { error: 'Error al generar el PDF', details: errorMessage },
      { status: 500 }
    )
  }
}
