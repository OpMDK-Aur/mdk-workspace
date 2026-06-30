'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Send, Trash2, MessageSquare, Sparkles, Search, Filter, X, Calendar, Hash, CheckSquare, AtSign, Pencil, Check, ImagePlus, Bold, Italic, List, ListOrdered, Paperclip, Download, FileText } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import Link from 'next/link'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { cn, linkifyText } from '@/lib/utils'

function getMessageText(parts: Array<{ type: string; text?: string }> | undefined): string {
  if (!parts || !Array.isArray(parts)) return ''
  return parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text)
    .join('')
}

interface ComentarioCliente {
  id: string
  cliente_id: string
  contenido: string
  autor: string
  imagenes?: string[] | null
  colaborador_id?: string | null
  colaborador?: {
    id: string
    nombre: string
    avatar_url?: string | null
  } | null
  editado_por?: string | null
  editor?: {
    id: string
    nombre: string
  } | null
  creado_en: string
  actualizado_en: string
}

interface TareaCliente {
  id: string
  titulo: string
  estado: string
  shortId: string // Generated from id
}

interface Colaborador {
  id: string
  nombre: string
  avatar_url?: string | null
}

interface CurrentUser {
  id: string
  nombre: string
  apellido?: string
  avatar_url?: string | null
}

interface ClientCommentsProps {
  clientId: string
  currentUser: CurrentUser | null
}

export function ClientComments({ clientId, currentUser }: ClientCommentsProps) {
  const [comments, setComments] = useState<ComentarioCliente[]>([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'comments' | 'ai'>('comments')
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [authorFilter, setAuthorFilter] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<string>('all')
  const [showFilters, setShowFilters] = useState(false)
  
  // Task mentions
  const [clientTasks, setClientTasks] = useState<TareaCliente[]>([])
  const [showTaskPopover, setShowTaskPopover] = useState(false)
  const [taskSearchQuery, setTaskSearchQuery] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  
  // Collaborator mentions
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [showColabPopover, setShowColabPopover] = useState(false)
  const [colabSearchQuery, setColabSearchQuery] = useState('')
  
  // Edit comment
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [editingImages, setEditingImages] = useState<string[]>([])
  const [showEditColabPopover, setShowEditColabPopover] = useState(false)
  const [editColabSearchQuery, setEditColabSearchQuery] = useState('')
  const [uploadingEditImage, setUploadingEditImage] = useState(false)
  const editTextareaRef = useRef<HTMLTextAreaElement>(null)
  const editImageInputRef = useRef<HTMLInputElement>(null)
  
  // Image upload
  const [pendingImages, setPendingImages] = useState<string[]>([])
  const [uploadingImage, setUploadingImage] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  
  // File attachments
  const [pendingFiles, setPendingFiles] = useState<{ name: string; url: string }[]>([])
  const [uploadingFile, setUploadingFile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const supabase = createClient()
  const chatContainerRef = useRef<HTMLDivElement>(null)

  // AI Chat
  const [aiInput, setAiInput] = useState('')
  const { messages, sendMessage, status, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/client-chat',
    }),
  })
  const aiLoading = status === 'streaming' || status === 'submitted'
  
  const handleAiSend = () => {
    if (!aiInput.trim() || aiLoading) return
    sendMessage({ text: aiInput }, { body: { clientId } })
    setAiInput('')
  }

  // Scroll to bottom when new AI messages arrive
  useEffect(() => {
    if (chatContainerRef.current && messages.length > 0) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [messages])

  // Fetch comments, tasks and collaborators
  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      setError(null)

      const [commentsRes, tasksRes, colabRes] = await Promise.all([
        supabase
          .from('comentarios_clientes')
          .select('*, colaborador:colaborador_id(id, nombre, avatar_url), editor:editado_por(id, nombre)')
          .eq('cliente_id', clientId)
          .order('creado_en', { ascending: false }),
        // Get tasks for this client
        supabase
          .from('tareas')
          .select('id, titulo, estado, cliente_id')
          .eq('cliente_id', clientId)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('colaboradores')
          .select('id, nombre, avatar_url')
          .order('nombre')
      ])

      if (commentsRes.error) {
        setError('Error al cargar comentarios')
        console.error('[v0] Error fetching comments:', commentsRes.error)
      } else {
        setComments(commentsRes.data || [])
      }
      
      // Map tasks with short IDs
      if (!tasksRes.error && tasksRes.data) {
        const tasksWithShortId = tasksRes.data.map(task => ({
          ...task,
          shortId: task.id.slice(0, 6).toUpperCase()
        }))
        setClientTasks(tasksWithShortId)
      }
      
      if (!colabRes.error && colabRes.data) {
        setColaboradores(colabRes.data)
      }

      setLoading(false)
    }

    fetchData()

    // Subscribe to changes in comentarios_clientes for this client
    const channel = supabase
      .channel(`comentarios_${clientId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'comentarios_clientes',
          filter: `cliente_id=eq.${clientId}`
        },
        (payload) => {
          // Refetch comments when a new one is inserted
          console.log('[v0] New comment detected, refetching...')
          fetchData()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [clientId, supabase])

  // Get unique authors for filter
  const uniqueAuthors = useMemo(() => {
    const authors = new Set(comments.map(c => c.autor))
    return Array.from(authors).sort()
  }, [comments])

  // Filtered comments
  const filteredComments = useMemo(() => {
    return comments.filter(comment => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesContent = comment.contenido.toLowerCase().includes(query)
        const matchesAuthor = comment.autor.toLowerCase().includes(query)
        if (!matchesContent && !matchesAuthor) return false
      }

      // Author filter
      if (authorFilter !== 'all' && comment.autor !== authorFilter) {
        return false
      }

      // Date filter
      if (dateFilter !== 'all') {
        const commentDate = new Date(comment.creado_en)
        const now = new Date()
        const diffDays = Math.floor((now.getTime() - commentDate.getTime()) / (1000 * 60 * 60 * 24))

        switch (dateFilter) {
          case 'today':
            if (diffDays > 0) return false
            break
          case 'week':
            if (diffDays > 7) return false
            break
          case 'month':
            if (diffDays > 30) return false
            break
        }
      }

      return true
    })
  }, [comments, searchQuery, authorFilter, dateFilter])

  // Extract mentioned collaborator IDs from comment
  const extractMentionedColaboradores = (content: string): string[] => {
    const mentionRegex = /@([\w\sáéíóúñÁÉÍÓÚÑ]+?)(?=\s|$|[.,;:!?])/g
    const mentionedIds: string[] = []
    let match
    
    while ((match = mentionRegex.exec(content)) !== null) {
      const mentionName = match[1].trim()
      const colab = colaboradores.find(c => c.nombre.toLowerCase() === mentionName.toLowerCase())
      if (colab && colab.id !== currentUser?.id) {
        mentionedIds.push(colab.id)
      }
    }
    
    return [...new Set(mentionedIds)] // Remove duplicates
  }

  // Upload image to Supabase Storage
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploadingImage(true)

    for (const file of Array.from(files)) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Solo se permiten archivos de imagen')
        continue
      }

      // Sanitize filename
      const sanitizedName = file.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_.-]/g, '')
      const fileName = `comentarios/${clientId}/${Date.now()}-${sanitizedName}`

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('cliente-adjuntos')
        .upload(fileName, file)

      if (uploadError) {
        console.error('[v0] Error uploading image:', uploadError)
        setError(`Error al subir imagen: ${uploadError.message}`)
        continue
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('cliente-adjuntos')
        .getPublicUrl(fileName)

      setPendingImages(prev => [...prev, publicUrl])
    }

    setUploadingImage(false)
    if (imageInputRef.current) {
      imageInputRef.current.value = ''
    }
  }

  // Remove pending image
  const removePendingImage = (url: string) => {
    setPendingImages(prev => prev.filter(img => img !== url))
  }

  // Upload file to Supabase Storage (any file type)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploadingFile(true)

    for (const file of Array.from(files)) {
      // Sanitize filename
      const sanitizedName = file.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '_')
      const fileName = `comentarios/${clientId}/${Date.now()}-${sanitizedName}`

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('cliente-adjuntos')
        .upload(fileName, file)

      if (uploadError) {
        console.error('[v0] Error uploading file:', uploadError)
        setError(`Error al subir archivo: ${uploadError.message}`)
        continue
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('cliente-adjuntos')
        .getPublicUrl(fileName)

      setPendingFiles(prev => [...prev, { name: file.name, url: publicUrl }])
    }

    setUploadingFile(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Remove pending file
  const removePendingFile = (url: string) => {
    setPendingFiles(prev => prev.filter(f => f.url !== url))
  }

  // Add comment
  const handleAddComment = async () => {
    if ((!newComment.trim() && pendingImages.length === 0 && pendingFiles.length === 0) || !currentUser || sending) return

    setSending(true)
    setError(null)

    const autorName = `${currentUser.nombre}${currentUser.apellido ? ` ${currentUser.apellido}` : ''}`
    const commentContent = newComment.trim()
    
    // Combine images and files
    const adjuntos = [
      ...pendingImages,
      ...pendingFiles.map(f => f.url)
    ]

    const { data, error: insertError } = await supabase
      .from('comentarios_clientes')
      .insert({
        cliente_id: clientId,
        contenido: commentContent,
        autor: autorName,
        colaborador_id: currentUser.id,
        imagenes: adjuntos.length > 0 ? adjuntos : null,
      })
      .select()
      .single()

    if (insertError) {
      setError('Error al agregar comentario')
      console.error('[v0] Error adding comment:', insertError)
    } else if (data) {
      setComments(prev => [data, ...prev])
      setNewComment('')
      setPendingImages([])
      setPendingFiles([])
      
      // Create notifications for mentioned collaborators
      const mentionedIds = extractMentionedColaboradores(commentContent)
      if (mentionedIds.length > 0) {
        const notifications = mentionedIds.map(colabId => ({
          usuario_id: colabId,
          tipo: 'mencion',
          titulo: `${autorName} te mencionó en un comentario`,
          contenido: commentContent.slice(0, 100) + (commentContent.length > 100 ? '...' : ''),
          leida: false,
          enlace: `/dashboard/clients/${clientId}`,
        }))
        
        const { error: notifError } = await supabase
          .from('notificaciones')
          .insert(notifications)
        
        if (notifError) {
          console.error('[v0] Error creating notifications:', notifError)
        }
      }
    }

    setSending(false)
  }

  // Delete comment
  const handleDeleteComment = async (commentId: string) => {
    const { error: deleteError } = await supabase
      .from('comentarios_clientes')
      .delete()
      .eq('id', commentId)

    if (deleteError) {
      setError('Error al eliminar comentario')
      console.error('[v0] Error deleting comment:', deleteError)
    } else {
      setComments(prev => prev.filter(c => c.id !== commentId))
    }
  }
  
  // Start editing comment
  const startEditComment = (comment: ComentarioCliente) => {
    setEditingCommentId(comment.id)
    setEditingContent(comment.contenido)
    setEditingImages(comment.imagenes || [])
  }
  
  // Cancel editing
  const cancelEditComment = () => {
    setEditingCommentId(null)
    setEditingContent('')
    setEditingImages([])
    setShowEditColabPopover(false)
    setEditColabSearchQuery('')
  }
  
  // Insert collaborator mention while editing
  const insertEditColabMention = (colab: Colaborador) => {
    setEditingContent(prev => `${prev}@${colab.nombre} `)
    setShowEditColabPopover(false)
    setEditColabSearchQuery('')
    editTextareaRef.current?.focus()
  }
  
  // Filtered collaborators for the edit popover
  const filteredEditColabs = useMemo(() => {
    if (!editColabSearchQuery) return colaboradores.slice(0, 10)
    const query = editColabSearchQuery.toLowerCase()
    return colaboradores
      .filter(c => c.nombre.toLowerCase().includes(query))
      .slice(0, 10)
  }, [colaboradores, editColabSearchQuery])
  
  // Upload image while editing
  const handleEditImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploadingEditImage(true)

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        setError('Solo se permiten archivos de imagen')
        continue
      }

      const sanitizedName = file.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_.-]/g, '')
      const fileName = `comentarios/${clientId}/${Date.now()}-${sanitizedName}`

      const { error: uploadError } = await supabase.storage
        .from('cliente-adjuntos')
        .upload(fileName, file)

      if (uploadError) {
        console.error('[v0] Error uploading image:', uploadError)
        setError(`Error al subir imagen: ${uploadError.message}`)
        continue
      }

      const { data: { publicUrl } } = supabase.storage
        .from('cliente-adjuntos')
        .getPublicUrl(fileName)

      setEditingImages(prev => [...prev, publicUrl])
    }

    setUploadingEditImage(false)
    if (editImageInputRef.current) {
      editImageInputRef.current.value = ''
    }
  }
  
  // Remove an image while editing
  const removeEditingImage = (url: string) => {
    setEditingImages(prev => prev.filter(img => img !== url))
  }
  
  // Save edited comment
  const handleSaveEdit = async () => {
    if (!editingCommentId || (!editingContent.trim() && editingImages.length === 0) || !currentUser) return
    
    const editorName = `${currentUser.nombre}${currentUser.apellido ? ` ${currentUser.apellido}` : ''}`
    const now = new Date().toISOString()
    const newContent = editingContent.trim()
    const newImages = editingImages.length > 0 ? editingImages : null
    
    const { error: updateError } = await supabase
      .from('comentarios_clientes')
      .update({ 
        contenido: newContent,
        imagenes: newImages,
        actualizado_en: now,
        editado_por: currentUser.id
      })
      .eq('id', editingCommentId)

    if (updateError) {
      setError('Error al actualizar comentario')
      console.error('[v0] Error updating comment:', updateError)
    } else {
      setComments(prev => prev.map(c => 
        c.id === editingCommentId 
          ? { 
              ...c, 
              contenido: newContent,
              imagenes: newImages,
              actualizado_en: now,
              editado_por: currentUser.id,
              editor: { id: currentUser.id, nombre: editorName }
            }
          : c
      ))
      
      // Notify newly mentioned collaborators
      const mentionedIds = extractMentionedColaboradores(newContent)
      if (mentionedIds.length > 0) {
        const notifications = mentionedIds.map(colabId => ({
          usuario_id: colabId,
          tipo: 'mencion',
          titulo: `${editorName} te mencionó en un comentario`,
          contenido: newContent.slice(0, 100) + (newContent.length > 100 ? '...' : ''),
          leida: false,
          enlace: `/dashboard/clients/${clientId}`,
        }))
        const { error: notifError } = await supabase
          .from('notificaciones')
          .insert(notifications)
        if (notifError) {
          console.error('[v0] Error creating notifications:', notifError)
        }
      }
      
      cancelEditComment()
    }
  }

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Ahora'
    if (diffMins < 60) return `Hace ${diffMins}m`
    if (diffHours < 24) return `Hace ${diffHours}h`
    if (diffDays < 7) return `Hace ${diffDays}d`
    return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
  }

  // Get initials from author name
  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
  }

  // Clear filters
  const clearFilters = () => {
    setSearchQuery('')
    setAuthorFilter('all')
    setDateFilter('all')
  }

  const hasActiveFilters = searchQuery || authorFilter !== 'all' || dateFilter !== 'all'
  
  // Apply markdown-style formatting to a textarea, operating on the current selection.
  // `setValue` updates the corresponding state; `ref` points to the textarea element.
  const applyFormat = (
    ref: React.RefObject<HTMLTextAreaElement | null>,
    value: string,
    setValue: (v: string) => void,
    type: 'bold' | 'italic' | 'ul' | 'ol'
  ) => {
    const el = ref.current
    const start = el ? el.selectionStart : value.length
    const end = el ? el.selectionEnd : value.length
    const selected = value.slice(start, end)

    let newValue = value
    let newCursor = end

    if (type === 'bold' || type === 'italic') {
      const marker = type === 'bold' ? '**' : '*'
      const text = selected || (type === 'bold' ? 'texto' : 'cursiva')
      const insert = `${marker}${text}${marker}`
      newValue = value.slice(0, start) + insert + value.slice(end)
      newCursor = start + insert.length
    } else {
      // List: prefix each selected line (or the current line) with a marker
      const lineStart = value.lastIndexOf('\n', start - 1) + 1
      const block = value.slice(lineStart, end) || ''
      const blockLines = (block || 'Elemento').split('\n')
      const formatted = blockLines
        .map((ln, i) => (type === 'ul' ? `- ${ln}` : `${i + 1}. ${ln}`))
        .join('\n')
      newValue = value.slice(0, lineStart) + formatted + value.slice(end)
      newCursor = lineStart + formatted.length
    }

    setValue(newValue)
    setTimeout(() => {
      if (el) {
        el.focus()
        el.setSelectionRange(newCursor, newCursor)
      }
    }, 0)
  }

  // Insert task mention
  const insertTaskMention = (task: TareaCliente) => {
    const mention = `#${task.shortId}`
    setNewComment(prev => prev + mention + ' ')
    setShowTaskPopover(false)
    setTaskSearchQuery('')
    textareaRef.current?.focus()
  }
  
  // Filter tasks for search
  const filteredTasks = useMemo(() => {
    if (!taskSearchQuery) return clientTasks.slice(0, 10)
    const query = taskSearchQuery.toLowerCase()
    return clientTasks
      .filter(t => 
        t.titulo.toLowerCase().includes(query) || 
        t.shortId.toLowerCase().includes(query)
      )
      .slice(0, 10)
  }, [clientTasks, taskSearchQuery])
  
  // Insert collaborator mention
  const insertColabMention = (colab: Colaborador) => {
    const mention = `@${colab.nombre}`
    setNewComment(prev => prev + mention + ' ')
    setShowColabPopover(false)
    setColabSearchQuery('')
    textareaRef.current?.focus()
  }
  
  // Filter collaborators for search
  const filteredColabs = useMemo(() => {
    if (!colabSearchQuery) return colaboradores.slice(0, 10)
    const query = colabSearchQuery.toLowerCase()
    return colaboradores
      .filter(c => c.nombre.toLowerCase().includes(query))
      .slice(0, 10)
  }, [colaboradores, colabSearchQuery])
  
  // Render comment content with formatting (bold/italic), lists, mentions and links
  const renderCommentContent = (content: string) => {
    // Renders a single line of text: handles **bold**, *italic*, #task, @mention, URLs
    const renderInline = (text: string, keyPrefix: string): React.ReactNode[] => {
      // First split out bold/italic segments, then process mentions/links within plain text
      const out: React.ReactNode[] = []
      // Match **bold** or *italic*
      const fmtRegex = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)/g
      let cursor = 0
      let fm: RegExpExecArray | null
      let segIdx = 0

      const pushPlain = (plain: string, kp: string) => {
        const mentionRegex = /(#([A-F0-9]{6}))|(@[\w\sáéíóúñÁÉÍÓÚÑ]+?)(?=\s|$|[.,;:!?])|((?:https?:\/\/|www\.)[^\s<>"{}|\\^`\[\]]*[^\s<>"{}|\\^`\[\].,;:!?()"'])/gi
        let lastIndex = 0
        let match: RegExpExecArray | null
        let mIdx = 0
        while ((match = mentionRegex.exec(plain)) !== null) {
          if (match.index > lastIndex) {
            out.push(plain.slice(lastIndex, match.index))
          }
          if (match[1]) {
            const shortId = match[2].toUpperCase()
            const linkedTask = clientTasks.find(t => t.shortId === shortId)
            out.push(
              <Link
                key={`${kp}-task-${mIdx}`}
                href={`/dashboard/tasks?task=${linkedTask?.id || ''}`}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors max-w-[250px]"
                onClick={(e) => e.stopPropagation()}
                title={linkedTask?.titulo}
              >
                <CheckSquare className="h-3 w-3 shrink-0" />
                <span className="truncate">{linkedTask?.titulo || `#${shortId}`}</span>
              </Link>
            )
          } else if (match[3]) {
            const mentionName = match[3].replace(/^@/, '').trim()
            const colab = currentUser?.nombre === mentionName ? currentUser : undefined
            out.push(
              <span
                key={`${kp}-mention-${mIdx}`}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-medium"
              >
                <AtSign className="h-3 w-3 shrink-0" />
                {colab?.nombre || mentionName}
              </span>
            )
          } else if (match[4]) {
            const url = match[4]
            const href = url.startsWith('www.') ? `https://${url}` : url
            out.push(
              <a
                key={`${kp}-url-${mIdx}`}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline text-primary underline hover:opacity-80 transition-opacity break-all"
                onClick={(e) => e.stopPropagation()}
              >
                {url}
              </a>
            )
          }
          lastIndex = match.index + match[0].length
          mIdx++
        }
        if (lastIndex < plain.length) {
          out.push(plain.slice(lastIndex))
        }
      }

      while ((fm = fmtRegex.exec(text)) !== null) {
        if (fm.index > cursor) {
          pushPlain(text.slice(cursor, fm.index), `${keyPrefix}-p${segIdx}`)
        }
        if (fm[1]) {
          out.push(<strong key={`${keyPrefix}-b${segIdx}`}>{fm[2]}</strong>)
        } else if (fm[3]) {
          out.push(<em key={`${keyPrefix}-i${segIdx}`}>{fm[4]}</em>)
        }
        cursor = fm.index + fm[0].length
        segIdx++
      }
      if (cursor < text.length) {
        pushPlain(text.slice(cursor), `${keyPrefix}-p${segIdx}`)
      }
      return out
    }

    // Group lines into paragraphs and ordered/unordered lists
    const lines = content.split('\n')
    const blocks: React.ReactNode[] = []
    let listBuffer: { ordered: boolean; items: string[] } | null = null
    let blockIdx = 0

    const flushList = () => {
      if (!listBuffer) return
      const { ordered, items } = listBuffer
      const ListTag = ordered ? 'ol' : 'ul'
      blocks.push(
        <ListTag
          key={`list-${blockIdx++}`}
          className={cn('my-1 pl-5 space-y-0.5', ordered ? 'list-decimal' : 'list-disc')}
        >
          {items.map((item, i) => (
            <li key={i}>{renderInline(item, `li-${blockIdx}-${i}`)}</li>
          ))}
        </ListTag>
      )
      listBuffer = null
    }

    lines.forEach((line, idx) => {
      const ulMatch = line.match(/^\s*[-*]\s+(.*)$/)
      const olMatch = line.match(/^\s*\d+\.\s+(.*)$/)
      if (ulMatch) {
        if (listBuffer && listBuffer.ordered) flushList()
        if (!listBuffer) listBuffer = { ordered: false, items: [] }
        listBuffer.items.push(ulMatch[1])
      } else if (olMatch) {
        if (listBuffer && !listBuffer.ordered) flushList()
        if (!listBuffer) listBuffer = { ordered: true, items: [] }
        listBuffer.items.push(olMatch[1])
      } else {
        flushList()
        if (line.trim() === '') {
          // preserve blank line spacing only between content
          return
        }
        blocks.push(
          <span key={`line-${blockIdx++}`} className="block">
            {renderInline(line, `line-${idx}`)}
          </span>
        )
      }
    })
    flushList()

    return blocks.length > 0 ? blocks : content
  }

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'comments' | 'ai')}>
        <div className="flex items-center justify-between gap-2">
          <TabsList className="h-9">
            <TabsTrigger value="comments" className="gap-1.5 text-xs">
              <MessageSquare className="h-3.5 w-3.5" />
              Comentarios
              {comments.length > 0 && (
                <span className="ml-1 text-[10px] bg-muted px-1.5 rounded-full">
                  {comments.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="ai" className="gap-1.5 text-xs">
              <Sparkles className="h-3.5 w-3.5" />
              Asistente IA
            </TabsTrigger>
          </TabsList>

          {activeTab === 'comments' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "h-8 gap-1.5 text-xs",
                hasActiveFilters && "text-primary"
              )}
            >
              <Filter className="h-3.5 w-3.5" />
              Filtros
              {hasActiveFilters && (
                <span className="ml-1 bg-primary text-primary-foreground text-[10px] px-1.5 rounded-full">
                  {[searchQuery, authorFilter !== 'all', dateFilter !== 'all'].filter(Boolean).length}
                </span>
              )}
            </Button>
          )}
        </div>

        <TabsContent value="comments" className="mt-4 space-y-4">
          {/* Filters */}
          {showFilters && (
            <div className="p-3 rounded-lg border bg-muted/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Filtrar comentarios</span>
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="h-6 text-xs gap-1">
                    <X className="h-3 w-3" />
                    Limpiar
                  </Button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 pl-8 text-xs"
                  />
                </div>
                <Select value={authorFilter} onValueChange={setAuthorFilter}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Autor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los autores</SelectItem>
                    {uniqueAuthors.map(author => (
                      <SelectItem key={author} value={author}>{author}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger className="h-8 text-xs">
                    <Calendar className="h-3.5 w-3.5 mr-1.5" />
                    <SelectValue placeholder="Fecha" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las fechas</SelectItem>
                    <SelectItem value="today">Hoy</SelectItem>
                    <SelectItem value="week">Ultima semana</SelectItem>
                    <SelectItem value="month">Ultimo mes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* New comment input */}
          {currentUser && (
            <div className="flex gap-3">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage src={currentUser.avatar_url || undefined} />
                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                  {currentUser.nombre[0]}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 space-y-2">
                {/* Formatting toolbar */}
                <div className="flex items-center gap-0.5 border-b pb-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => applyFormat(textareaRef, newComment, setNewComment, 'bold')}
                    title="Negrita"
                  >
                    <Bold className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => applyFormat(textareaRef, newComment, setNewComment, 'italic')}
                    title="Cursiva"
                  >
                    <Italic className="h-3.5 w-3.5" />
                  </Button>
                  <div className="w-px h-4 bg-border mx-1" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => applyFormat(textareaRef, newComment, setNewComment, 'ul')}
                    title="Lista con viñetas"
                  >
                    <List className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => applyFormat(textareaRef, newComment, setNewComment, 'ol')}
                    title="Lista numerada"
                  >
                    <ListOrdered className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Textarea
                  ref={textareaRef}
                  placeholder="Escribe un comentario..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  className="min-h-[80px] w-full resize-none text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.metaKey) {
                      handleAddComment()
                    }
                    // Open task popover on #
                    if (e.key === '#' || (e.key === '3' && e.shiftKey)) {
                      setTimeout(() => setShowTaskPopover(true), 50)
                    }
                    // Open collaborator popover on @
                    if (e.key === '@' || (e.key === '2' && e.shiftKey)) {
                      setTimeout(() => setShowColabPopover(true), 50)
                    }
                  }}
                />
                  {/* Pending images preview */}
                  {pendingImages.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {pendingImages.map((url, idx) => (
                        <div key={idx} className="relative group/img">
                          <img
                            src={url}
                            alt={`Imagen ${idx + 1}`}
                            className="h-16 w-16 object-cover rounded-md border"
                          />
                          <button
                            onClick={() => removePendingImage(url)}
                            className="absolute -top-1 -right-1 h-5 w-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Pending files preview */}
                  {pendingFiles.length > 0 && (
                    <div className="space-y-1.5">
                      {pendingFiles.map((file, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 rounded-md border bg-muted/50">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-xs truncate text-foreground">{file.name}</span>
                          </div>
                          <button
                            onClick={() => removePendingFile(file.url)}
                            className="ml-2 h-5 w-5 flex items-center justify-center rounded-full hover:bg-destructive hover:text-destructive-foreground transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                <div className="flex flex-wrap justify-between items-center gap-2">
                  <div className="flex items-center flex-wrap gap-1 min-w-0">
                    <Popover open={showTaskPopover} onOpenChange={setShowTaskPopover}>
                      <PopoverTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <Hash className="h-3 w-3" />
                          Mencionar tarea
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-72 p-0" align="start">
                        <Command>
                          <CommandInput 
                            placeholder="Buscar tarea..." 
                            value={taskSearchQuery}
                            onValueChange={setTaskSearchQuery}
                            className="h-9"
                          />
                          <CommandList>
                            <CommandEmpty>No se encontraron tareas</CommandEmpty>
                            <CommandGroup heading="Tareas del cliente">
                              {filteredTasks.map(task => (
                                <CommandItem
                                  key={task.id}
                                  value={`${task.shortId} ${task.titulo}`}
                                  onSelect={() => insertTaskMention(task)}
                                  className="gap-2"
                                >
                                  <CheckSquare className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="text-xs font-mono text-primary">
                                    #{task.shortId}
                                  </span>
                                  <span className="text-xs truncate flex-1">
                                    {task.titulo}
                                  </span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <Popover open={showColabPopover} onOpenChange={setShowColabPopover}>
                      <PopoverTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <AtSign className="h-3 w-3" />
                          <span className="hidden sm:inline">Mencionar</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-0" align="start">
                        <Command>
                          <CommandInput 
                            placeholder="Buscar colaborador..." 
                            value={colabSearchQuery}
                            onValueChange={setColabSearchQuery}
                            className="h-9"
                          />
                          <CommandList>
                            <CommandEmpty>No se encontraron colaboradores</CommandEmpty>
                            <CommandGroup heading="Colaboradores">
                              {filteredColabs.map(colab => (
                                <CommandItem
                                  key={colab.id}
                                  value={colab.nombre}
                                  onSelect={() => insertColabMention(colab)}
                                  className="gap-2"
                                >
                                  <Avatar className="h-5 w-5">
                                    <AvatarImage src={colab.avatar_url || undefined} />
                                    <AvatarFallback className="text-[10px]">
                                      {colab.nombre[0]}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="text-xs">
                                    {colab.nombre}
                                  </span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {/* Image upload button */}
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handleImageUpload}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => imageInputRef.current?.click()}
                      disabled={uploadingImage}
                    >
                      {uploadingImage ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <ImagePlus className="h-3 w-3" />
                      )}
                      <span className="hidden sm:inline">Imagen</span>
                    </Button>
                    {/* File upload button */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingFile}
                    >
                      {uploadingFile ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Paperclip className="h-3 w-3" />
                      )}
                      <span className="hidden sm:inline">Archivo</span>
                    </Button>
                    <span className="text-[10px] text-muted-foreground hidden xl:inline">
                      Cmd + Enter para enviar
                    </span>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleAddComment}
                    disabled={(!newComment.trim() && pendingImages.length === 0) || sending}
                    className="gap-1.5 shrink-0 ml-auto"
                  >
                    {sending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    Comentar
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* Loading state */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Filtered results info */}
          {!loading && hasActiveFilters && (
            <p className="text-xs text-muted-foreground">
              Mostrando {filteredComments.length} de {comments.length} comentarios
            </p>
          )}

          {/* Comments list */}
          {!loading && filteredComments.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              {hasActiveFilters 
                ? 'No hay comentarios que coincidan con los filtros.'
                : 'No hay comentarios aun. Se el primero en comentar.'
              }
            </p>
          )}

          {!loading && filteredComments.length > 0 && (
            <div className="space-y-3">
              {filteredComments.map((comment) => {
                // Use avatar from joined colaborador relation, fallback to search by name
                const avatarUrl = comment.colaborador?.avatar_url || 
                  colaboradores.find(c => comment.autor.toLowerCase().includes(c.nombre.toLowerCase()))?.avatar_url
                const wasEdited = comment.actualizado_en !== comment.creado_en && comment.editado_por
                return (
                <div
                  key={comment.id}
                  className="group rounded-lg border bg-muted/30 p-3"
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={avatarUrl || undefined} />
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {getInitials(comment.autor)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{comment.autor}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(comment.creado_en)}
                          </span>
                          {wasEdited && (
                            <span className="text-xs text-muted-foreground italic">
                              (editado {formatDate(comment.actualizado_en)}{comment.editor ? ` por ${comment.editor.nombre}` : ''})
                            </span>
                          )}
                        </div>
                        {currentUser && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-primary"
                              onClick={() => startEditComment(comment)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDeleteComment(comment.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                      {editingCommentId === comment.id ? (
                        <div className="mt-2 space-y-2">
                          {/* Formatting toolbar (edit) */}
                          <div className="flex items-center gap-0.5 border-b pb-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => applyFormat(editTextareaRef, editingContent, setEditingContent, 'bold')}
                              title="Negrita"
                            >
                              <Bold className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => applyFormat(editTextareaRef, editingContent, setEditingContent, 'italic')}
                              title="Cursiva"
                            >
                              <Italic className="h-3.5 w-3.5" />
                            </Button>
                            <div className="w-px h-4 bg-border mx-1" />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => applyFormat(editTextareaRef, editingContent, setEditingContent, 'ul')}
                              title="Lista con viñetas"
                            >
                              <List className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => applyFormat(editTextareaRef, editingContent, setEditingContent, 'ol')}
                              title="Lista numerada"
                            >
                              <ListOrdered className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          <Textarea
                            ref={editTextareaRef}
                            value={editingContent}
                            onChange={(e) => setEditingContent(e.target.value)}
                            className="min-h-[60px] text-sm"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === '@' || (e.key === '2' && e.shiftKey)) {
                                setTimeout(() => setShowEditColabPopover(true), 50)
                              }
                            }}
                          />
                          {/* Editing images preview */}
                          {editingImages.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {editingImages.map((url, idx) => (
                                <div key={idx} className="relative group/img">
                                  <img
                                    src={url}
                                    alt={`Imagen ${idx + 1}`}
                                    className="h-16 w-16 object-cover rounded-md border"
                                  />
                                  <button
                                    onClick={() => removeEditingImage(url)}
                                    className="absolute -top-1 -right-1 h-5 w-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1">
                              {/* Mention collaborator while editing */}
                              <Popover open={showEditColabPopover} onOpenChange={setShowEditColabPopover}>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
                                  >
                                    <AtSign className="h-3 w-3" />
                                    <span className="hidden sm:inline">Mencionar</span>
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-64 p-0" align="start">
                                  <Command>
                                    <CommandInput
                                      placeholder="Buscar colaborador..."
                                      value={editColabSearchQuery}
                                      onValueChange={setEditColabSearchQuery}
                                      className="h-9"
                                    />
                                    <CommandList>
                                      <CommandEmpty>No se encontraron colaboradores</CommandEmpty>
                                      <CommandGroup heading="Colaboradores">
                                        {filteredEditColabs.map(colab => (
                                          <CommandItem
                                            key={colab.id}
                                            value={colab.nombre}
                                            onSelect={() => insertEditColabMention(colab)}
                                            className="gap-2"
                                          >
                                            <Avatar className="h-5 w-5">
                                              <AvatarImage src={colab.avatar_url || undefined} />
                                              <AvatarFallback className="text-[10px]">
                                                {colab.nombre[0]}
                                              </AvatarFallback>
                                            </Avatar>
                                            <span className="text-xs">{colab.nombre}</span>
                                          </CommandItem>
                                        ))}
                                      </CommandGroup>
                                    </CommandList>
                                  </Command>
                                </PopoverContent>
                              </Popover>
                              {/* Attach image while editing */}
                              <input
                                ref={editImageInputRef}
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                onChange={handleEditImageUpload}
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => editImageInputRef.current?.click()}
                                disabled={uploadingEditImage}
                              >
                                {uploadingEditImage ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <ImagePlus className="h-3 w-3" />
                                )}
                                <span className="hidden sm:inline">Imagen</span>
                              </Button>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={cancelEditComment}
                                className="h-7 text-xs"
                              >
                                Cancelar
                              </Button>
                              <Button
                                size="sm"
                                onClick={handleSaveEdit}
                                className="h-7 text-xs gap-1"
                                disabled={!editingContent.trim() && editingImages.length === 0}
                              >
                                <Check className="h-3 w-3" />
                                Guardar
                              </Button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          {comment.contenido && (
                            <div className="text-sm mt-1 whitespace-pre-wrap">{renderCommentContent(comment.contenido)}</div>
                          )}
                          {/* Render images */}
                          {comment.imagenes && comment.imagenes.length > 0 && (
                            <div className="mt-2 space-y-2">
                              {/* Render images */}
                              {comment.imagenes.filter(url => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url)).length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                  {comment.imagenes
                                    .filter(url => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url))
                                    .map((imgUrl, idx) => (
                                      <a 
                                        key={idx} 
                                        href={imgUrl} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="block"
                                      >
                                        <img 
                                          src={imgUrl} 
                                          alt={`Imagen ${idx + 1}`}
                                          className="max-h-48 max-w-xs rounded-md border hover:opacity-90 transition-opacity cursor-pointer"
                                        />
                                      </a>
                                    ))}
                                </div>
                              )}
                              {/* Render file attachments */}
                              {comment.imagenes.filter(url => !/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url)).length > 0 && (
                                <div className="space-y-1.5">
                                  {comment.imagenes
                                    .filter(url => !/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url))
                                    .map((fileUrl, idx) => {
                                      const fileName = fileUrl.split('/').pop() || 'archivo'
                                      const fileNameWithoutId = fileName.replace(/^\d+-/, '')
                                      return (
                                        <a
                                          key={idx}
                                          href={fileUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex items-center gap-2 p-2 rounded-md border bg-muted/30 hover:bg-muted/50 transition-colors"
                                        >
                                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                                          <span className="text-xs truncate text-foreground underline flex-1">
                                            {fileNameWithoutId}
                                          </span>
                                          <Download className="h-3.5 w-3.5 text-muted-foreground" />
                                        </a>
                                      )
                                    })}
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )})}
            </div>
          )}
        </TabsContent>

        <TabsContent value="ai" className="mt-4 space-y-4">
          {/* AI Chat */}
          <div className="rounded-lg border bg-muted/20 overflow-hidden">
            {/* Chat messages */}
            <div 
              ref={chatContainerRef}
              className="h-[350px] overflow-y-auto p-4 space-y-4"
            >
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center px-4">
                  <Sparkles className="h-8 w-8 text-primary/50 mb-3" />
                  <h4 className="text-sm font-medium mb-1">Asistente IA del Cliente</h4>
                  <p className="text-xs text-muted-foreground max-w-[280px]">
                    Preguntame sobre tareas, comentarios, metricas de Google Ads/Meta, 
                    o cualquier informacion del cliente.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 justify-center">
                    {[
                      'Resume la situacion del cliente',
                      'Que tareas estan pendientes?',
                      'Como van las campanas de Google Ads?',
                      'Busca comentarios sobre presupuesto',
                    ].map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => {
                          setAiInput(suggestion)
                        }}
                        className="text-[11px] px-2.5 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex gap-3",
                    message.role === 'user' && "flex-row-reverse"
                  )}
                >
                  <Avatar className="h-7 w-7 shrink-0">
                    {message.role === 'assistant' ? (
                      <>
                        <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                          <Sparkles className="h-3.5 w-3.5" />
                        </AvatarFallback>
                      </>
                    ) : (
                      <>
                        <AvatarImage src={currentUser?.avatar_url || undefined} />
                        <AvatarFallback className="text-xs bg-muted">
                          {currentUser?.nombre?.[0] || 'U'}
                        </AvatarFallback>
                      </>
                    )}
                  </Avatar>
                  <div
                    className={cn(
                      "rounded-lg px-3 py-2 max-w-[85%] text-sm",
                      message.role === 'user'
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    )}
                  >
                    {message.role === 'assistant' ? (
                      <div 
                        className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                        dangerouslySetInnerHTML={{ __html: formatMarkdown(getMessageText(message.parts)) }}
                      />
                    ) : (
                      <p className="whitespace-pre-wrap">{getMessageText(message.parts)}</p>
                    )}
                  </div>
                </div>
              ))}

              {aiLoading && (
                <div className="flex gap-3">
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      <Sparkles className="h-3.5 w-3.5" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-muted rounded-lg px-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>

            {/* Chat input */}
            <div className="border-t p-3 flex gap-2">
              <Input
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleAiSend()
                  }
                }}
                placeholder="Pregunta algo sobre el cliente..."
                className="flex-1 h-9 text-sm"
                disabled={aiLoading}
              />
              <Button type="button" size="sm" onClick={handleAiSend} disabled={!aiInput?.trim() || aiLoading} className="h-9 px-3">
                {aiLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Clear chat button */}
          {messages.length > 0 && (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMessages([])}
                className="text-xs text-muted-foreground"
              >
                Limpiar conversacion
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

// Simple markdown formatter
function formatMarkdown(text: string): string {
  return text
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Code
    .replace(/`(.*?)`/g, '<code class="bg-muted px-1 rounded text-xs">$1</code>')
    // Line breaks
    .replace(/\n/g, '<br />')
    // Lists
    .replace(/^- (.*?)(<br \/>|$)/gm, '<li class="ml-4">$1</li>')
}
