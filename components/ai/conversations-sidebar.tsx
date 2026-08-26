'use client'

import useSWR from 'swr'
import { MessageSquare, MessagesSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

export interface ConversationSummary {
  id: string
  clientId: string
  clientName: string
  updatedAt: string
  lastMessagePreview: string | null
  lastMessageRole: 'user' | 'assistant' | null
}

const fetcher = (url: string) =>
  fetch(url).then((response) => {
    if (!response.ok) throw new Error('No se pudieron cargar las conversaciones.')
    return response.json() as Promise<{ conversations: ConversationSummary[] }>
  })

function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffMin = Math.round(diffMs / 60000)
  if (diffMin < 1) return 'ahora'
  if (diffMin < 60) return `hace ${diffMin} min`
  const diffHours = Math.round(diffMin / 60)
  if (diffHours < 24) return `hace ${diffHours} h`
  const diffDays = Math.round(diffHours / 24)
  return `hace ${diffDays} d`
}

export const CONVERSATIONS_SWR_KEY = '/api/ai/conversations'

interface ConversationsSidebarProps {
  /** Hay un único chat por cliente, así que resaltamos por clientId en vez de conversationId. */
  activeClientId: string | null
  onSelect: (conversation: ConversationSummary) => void
}

export function ConversationsSidebar({ activeClientId, onSelect }: ConversationsSidebarProps) {
  const { data, error, isLoading } = useSWR(CONVERSATIONS_SWR_KEY, fetcher, {
    refreshInterval: 30000,
  })
  const conversations = data?.conversations ?? []

  return (
    <aside className="flex w-full shrink-0 flex-col gap-3 border-b pb-6 lg:w-64 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <MessagesSquare className="size-4 text-primary" aria-hidden="true" />
        Chats activos
      </div>

      {isLoading && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}

      {!isLoading && error && (
        <p className="text-sm text-muted-foreground">No se pudieron cargar los chats activos.</p>
      )}

      {!isLoading && !error && conversations.length === 0 && (
        <p className="text-sm text-muted-foreground">Todavía no iniciaste ninguna conversación.</p>
      )}

      {!isLoading && conversations.length > 0 && (
        <nav aria-label="Chats activos" className="flex flex-col gap-1">
          {conversations.map((conversation) => {
            const isActive = conversation.clientId === activeClientId
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onSelect(conversation)}
                aria-current={isActive ? 'true' : undefined}
                className={cn(
                  'flex flex-col gap-1 rounded-md border px-3 py-2 text-left transition-colors',
                  isActive ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-accent',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{conversation.clientName}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(conversation.updatedAt)}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MessageSquare className="size-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    {conversation.lastMessagePreview
                      ? `${conversation.lastMessageRole === 'user' ? 'Vos: ' : ''}${conversation.lastMessagePreview}`
                      : 'Sin mensajes todavía'}
                  </span>
                </div>
              </button>
            )
          })}
        </nav>
      )}
    </aside>
  )
}
