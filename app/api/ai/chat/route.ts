import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { chatRequestSchema } from '@/lib/ai/config/fallback'
import { streamSupervisorResponse } from '@/lib/ai/agents/supervisor'

export const maxDuration = 60

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const parsed = chatRequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'La consulta no es válida.', issues: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const result = await streamSupervisorResponse(parsed.data.query, {
      userId: user.id,
      userEmail: user.email,
      ...parsed.data.context,
    })

    return result.toTextStreamResponse()
  } catch (error) {
    console.error('[v0] Supervisor request failed:', error)
    return NextResponse.json(
      { error: 'No se pudo procesar la consulta del Supervisor.' },
      { status: 500 },
    )
  }
}
