'use client'

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MessageContent } from '@/components/chat/message-content'
import { dateGroupLabel, useMockChats, type MockChat, type MockChatMessage } from '@/lib/mock/chats'

interface ConexaMockChatProps {
  clientId: string | null
  clientName: string
  /** Se incrementa desde afuera para forzar el reset del chat activo. */
  resetSignal: number
  onCreateReport?: (content: string) => void
}

export function ConexaMockChat({ clientId, clientName, resetSignal, onCreateReport }: ConexaMockChatProps) {
  const { chats, activeChat, isSending, selectChat, createChat, resetActiveChat, sendMessage } = useMockChats(clientId, clientName)
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastResetSignal = useRef(resetSignal)

  useEffect(() => {
    if (resetSignal !== lastResetSignal.current) {
      lastResetSignal.current = resetSignal
      resetActiveChat()
    }
  }, [resetSignal, resetActiveChat])

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }, [activeChat?.messages.length, isSending])

  const visibleChats = chats.filter((chat) => chat.clientId === clientId)
  const groups = visibleChats.reduce<Record<string, MockChat[]>>((groupsAcc, chat) => {
    const label = dateGroupLabel(chat.createdAt)
    ;(groupsAcc[label] ??= []).push(chat)
    return groupsAcc
  }, {})

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envía; Shift+Enter agrega salto de línea. No enviamos mientras el
    // usuario compone texto con un IME ni en el evento final de Safari (229).
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = input.trim()
    if (!text || isSending || !clientId) return
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    sendMessage(text)
  }

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      <aside className="flex w-64 shrink-0 flex-col gap-3 border-r border-[#E6E6E1] bg-white p-3">
        <button
          type="button"
          onClick={createChat}
          disabled={!clientId}
          className="flex h-9 items-center justify-center gap-2 rounded-full border border-[#E6E6E1] bg-white text-sm font-medium text-[#141414] transition-colors hover:border-[#5B5FE8] hover:text-[#5B5FE8] disabled:cursor-not-allowed disabled:opacity-50"
        >
          + Nuevo análisis
        </button>
        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {Object.keys(groups).length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-[#9a9a9a]">Todavía no hay análisis</p>
          ) : (
            Object.entries(groups).map(([label, groupChats]) => (
              <section key={label} className="flex flex-col gap-0.5">
                <h3 className="px-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9a9a9a]">{label}</h3>
                {groupChats.map((chat) => (
                  <button
                    key={chat.id}
                    type="button"
                    onClick={() => selectChat(chat.id)}
                    className={cn(
                      'truncate rounded-md px-2 py-2 text-left text-sm',
                      activeChat?.id === chat.id ? 'bg-[#eeefff] text-[#5B5FE8]' : 'text-[#141414] hover:bg-[#f4f4f1]',
                    )}
                  >
                    {chat.title || 'Nueva conversación de análisis'}
                  </button>
                ))}
              </section>
            ))
          )}
        </div>
      </aside>

      <div className="flex min-h-0 flex-1 flex-col bg-white">
        <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-white p-4">
          {!activeChat || activeChat.messages.length === 0 ? (
            <div className="m-auto max-w-md text-center text-sm text-[#9a9a9a]">
              Preguntale a Conexa por leads, inversión, conversiones, campañas o ventas del cliente seleccionado.
            </div>
          ) : (
            activeChat.messages.map((message, index) => (
              <ChatBubble
                key={message.id}
                message={message}
                isLast={index === activeChat.messages.length - 1}
                onCreateReport={onCreateReport}
              />
            ))
          )}
          {isSending && (
            <div className="flex items-center gap-2 self-start rounded-lg border border-[#E6E6E1] bg-white px-3 py-2 text-sm text-[#9a9a9a]">
              <span className="flex gap-1" aria-hidden="true">
                <span className="size-1.5 animate-bounce rounded-full bg-[#5B5FE8] [animation-delay:-0.3s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-[#5B5FE8] [animation-delay:-0.15s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-[#5B5FE8]" />
              </span>
              Pensando…
            </div>
          )}
        </div>
        <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-[#E6E6E1] p-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => {
              setInput(event.target.value)
              const el = event.target
              el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 160)}px`
            }}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Preguntale algo a Conexa..."
            aria-label="Consulta para Conexa"
            disabled={!clientId || isSending}
            className="min-h-9 flex-1 resize-none rounded-lg border border-[#E6E6E1] bg-white px-3 py-2 text-sm leading-6 text-[#141414] outline-none focus-visible:border-[#5B5FE8]"
          />
          <button
            type="submit"
            disabled={!clientId || isSending || !input.trim()}
            aria-label="Enviar consulta"
            className="flex h-9 shrink-0 items-center gap-2 rounded-full bg-[#5B5FE8] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="size-4" aria-hidden="true" />
            Enviar
          </button>
        </form>
      </div>
    </div>
  )
}

function ChatBubble({
  message,
  isLast,
  onCreateReport,
}: {
  message: MockChatMessage
  isLast: boolean
  onCreateReport?: (content: string) => void
}) {
  const isUser = message.role === 'user'
  return (
    <div className={cn('flex flex-col gap-2', isUser ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-lg px-3 py-2 text-sm leading-6',
          isUser ? 'bg-[#5B5FE8] text-white' : 'w-full max-w-[95%] border border-[#E6E6E1] bg-white text-[#141414]',
        )}
      >
        {isUser ? <span className="whitespace-pre-wrap">{message.content}</span> : <MessageContent content={message.content} />}
      </div>
      {!isUser && isLast && onCreateReport && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onCreateReport(message.content)}
            className="rounded-full border border-[#E6E6E1] bg-white px-3 py-1.5 text-xs font-medium text-[#141414] hover:border-[#5B5FE8] hover:text-[#5B5FE8]"
          >
            Crear informe
          </button>
          <button
            type="button"
            onClick={() => onCreateReport(message.content)}
            className="rounded-full border border-[#E6E6E1] bg-white px-3 py-1.5 text-xs font-medium text-[#141414] hover:border-[#5B5FE8] hover:text-[#5B5FE8]"
          >
            Generar diagnóstico
          </button>
        </div>
      )}
    </div>
  )
}
