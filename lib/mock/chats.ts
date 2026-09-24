'use client'

// Store de chats de demo para la vista Chat / Análisis de Conexa. No llama a
// ninguna API: la lista vive en memoria y se persiste en localStorage.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getMockResponse, type AccountsContext } from './responses'

export type MockChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export type MockChat = {
  id: string
  title: string
  clientId: string
  clientName: string
  createdAt: string
  messages: MockChatMessage[]
}

const STORAGE_KEY = 'conexa-mock-chats'
const RESPONSE_DELAY_MS = 1200

function buildDefaultChats(): MockChat[] {
  const now = Date.now()
  return [
    {
      id: 'mock-caida-cpl',
      title: 'Caída CPL Meta',
      clientId: 'ics-salud',
      clientName: 'ICS Salud',
      createdAt: new Date(now).toISOString(),
      messages: [],
    },
    {
      id: 'mock-informe-semanal',
      title: 'Informe semanal',
      clientId: 'vn-global',
      clientName: 'VN Global',
      createdAt: new Date(now - 86_400_000).toISOString(),
      messages: [],
    },
  ]
}

function readStoredChats(): MockChat[] {
  if (typeof window === 'undefined') return buildDefaultChats()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return buildDefaultChats()
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as MockChat[]) : buildDefaultChats()
  } catch {
    return buildDefaultChats()
  }
}

function writeStoredChats(chats: MockChat[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(chats))
  } catch {
    // Modo privado o cuota llena: seguimos funcionando solo en memoria.
  }
}

export function dateGroupLabel(iso: string) {
  const date = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return 'Hoy'
  if (date.toDateString() === yesterday.toDateString()) return 'Ayer'
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })
}

export function useMockChats(clientId: string | null, clientName: string, accounts?: AccountsContext) {
  const [chats, setChats] = useState<MockChat[]>(() => readStoredChats())
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)

  useEffect(() => {
    writeStoredChats(chats)
  }, [chats])

  // Al cambiar de cliente, activa su chat existente o crea uno nuevo vacío.
  useEffect(() => {
    if (!clientId) {
      setActiveChatId(null)
      return
    }
    setChats((current) => {
      const existing = current.find((chat) => chat.clientId === clientId)
      if (existing) {
        setActiveChatId(existing.id)
        return current
      }
      const created: MockChat = {
        id: `mock-${Date.now()}`,
        title: 'Nuevo análisis',
        clientId,
        clientName,
        createdAt: new Date().toISOString(),
        messages: [],
      }
      setActiveChatId(created.id)
      return [created, ...current]
    })
  }, [clientId, clientName])

  const activeChat = useMemo(() => chats.find((chat) => chat.id === activeChatId) ?? null, [chats, activeChatId])

  const selectChat = useCallback((chatId: string) => setActiveChatId(chatId), [])

  const createChat = useCallback(() => {
    if (!clientId) return
    const created: MockChat = {
      id: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: 'Nuevo análisis',
      clientId,
      clientName,
      createdAt: new Date().toISOString(),
      messages: [],
    }
    // Se agrega al principio del grupo "Hoy" sin reemplazar los anteriores.
    setChats((current) => [created, ...current])
    setActiveChatId(created.id)
  }, [clientId, clientName])

  const resetActiveChat = useCallback(() => {
    if (!activeChatId) return
    setChats((current) => current.map((chat) => (chat.id === activeChatId ? { ...chat, messages: [] } : chat)))
  }, [activeChatId])

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!activeChatId || !trimmed) return
      const userMessage: MockChatMessage = { id: `msg-${Date.now()}`, role: 'user', content: trimmed, createdAt: new Date().toISOString() }
      setChats((current) =>
        current.map((chat) =>
          chat.id === activeChatId
            ? { ...chat, title: chat.messages.length === 0 ? trimmed.slice(0, 60) : chat.title, messages: [...chat.messages, userMessage] }
            : chat,
        ),
      )
      setIsSending(true)
      window.setTimeout(() => {
        try {
          const responseText = getMockResponse(trimmed, accounts)
          const assistantMessage: MockChatMessage = { id: `msg-${Date.now() + 1}`, role: 'assistant', content: responseText, createdAt: new Date().toISOString() }
          setChats((current) => current.map((chat) => (chat.id === activeChatId ? { ...chat, messages: [...chat.messages, assistantMessage] } : chat)))
        } finally {
          setIsSending(false)
        }
      }, RESPONSE_DELAY_MS)
    },
    [activeChatId, accounts],
  )

  return { chats, activeChat, isSending, selectChat, createChat, resetActiveChat, sendMessage }
}
