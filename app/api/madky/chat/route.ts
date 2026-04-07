import {
  consumeStream,
  convertToModelMessages,
  streamText,
  UIMessage,
} from 'ai'
import { MADKY_SYSTEM_PROMPT } from '@/lib/madky-prompt'

export const maxDuration = 60

export async function POST(req: Request) {
  const { messages, clientContext }: { 
    messages: UIMessage[]
    clientContext?: {
      clientName?: string
      clientId?: string
      metrics?: Record<string, unknown>
    }
  } = await req.json()

  // Build context message if client data is provided
  let contextMessage = ''
  if (clientContext?.clientName) {
    contextMessage = `\n\n## Contexto Actual\nEl usuario está analizando el cliente: **${clientContext.clientName}**`
    if (clientContext.metrics) {
      contextMessage += `\nMétricas disponibles: ${JSON.stringify(clientContext.metrics, null, 2)}`
    }
  }

  const result = streamText({
    model: 'anthropic/claude-opus-4',
    system: MADKY_SYSTEM_PROMPT + contextMessage,
    messages: await convertToModelMessages(messages),
    abortSignal: req.signal,
  })

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onFinish: async ({ isAborted }) => {
      if (isAborted) return
      // Could persist chat history here if needed
    },
    consumeSseStream: consumeStream,
  })
}
