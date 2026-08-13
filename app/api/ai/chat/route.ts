import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { chatRequestSchema } from '@/lib/ai/config/fallback'
import { streamSupervisorResponse } from '@/lib/ai/agents/supervisor'

export const maxDuration = 60

function getMessageText(message: unknown) {
  if (!message || typeof message !== 'object') return ''
  const parts = 'parts' in message && Array.isArray(message.parts) ? message.parts : []
  return parts
    .filter((part): part is { type: 'text'; text: string } =>
      Boolean(part && typeof part === 'object' && 'type' in part && part.type === 'text' && 'text' in part && typeof part.text === 'string'),
    )
    .map((part) => part.text)
    .join('')
    .trim()
}

export async function POST(request: Request) {
  console.log('[v0] AI request received')
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    console.log('[v0] AI request rejected: unauthenticated')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[v0] AI user authenticated:', user.id)

  try {
    const body = await request.json()
    const parsed = chatRequestSchema.safeParse(body)

    if (!parsed.success) {
      console.error('[v0] AI request validation failed:', parsed.error.flatten())
      return NextResponse.json(
        { error: 'La conversación no es válida.', issues: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const query = getMessageText(parsed.data.messages.at(-1))
    if (!query) {
      return NextResponse.json({ error: 'El último mensaje debe contener texto.' }, { status: 400 })
    }

    console.log('[v0] Supervisor starting:', { userId: user.id, messageCount: parsed.data.messages.length })
    const result = await streamSupervisorResponse(query, {
      userId: user.id,
      userEmail: user.email,
      ...parsed.data.context,
    })
    console.log('[v0] AI Gateway call initiated')

    const response = result.toTextStreamResponse()
    console.log('[v0] AI streaming started')
    return response
  } catch (error) {
    console.error('[v0] AI streaming failed:', error instanceof Error ? error.message : 'Unknown error')
    return NextResponse.json(
      { error: 'No se pudo procesar la conversación del Supervisor.' },
      { status: 500 },
    )
  }
}
