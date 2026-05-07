import { NextResponse } from 'next/server'

// Este endpoint se llama automaticamente los lunes y viernes via Vercel Cron
// Configurar en vercel.json con schedule para lunes y viernes a las 7am

export async function GET(request: Request) {
  try {
    // Verificar que es una llamada del cron de Vercel
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    // Llamar al endpoint principal de generacion de seguimientos
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'http://localhost:3000'
    
    const response = await fetch(`${baseUrl}/api/tasks/generate-seguimiento`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Pasar cookies de autenticacion si existen
        'Cookie': request.headers.get('cookie') || '',
      },
    })

    const result = await response.json()

    if (!response.ok) {
      console.error('[Cron] Error generating tasks:', result)
      return NextResponse.json({ error: result.error || 'Error generating tasks' }, { status: response.status })
    }

    console.log(`[Cron] Generated seguimiento tasks:`, result)

    return NextResponse.json({
      success: true,
      ...result,
    })

  } catch (error) {
    console.error('[Cron] Error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
