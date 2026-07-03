'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Paperclip, X, Send, Check, ListChecks } from 'lucide-react'

interface FaltantesBlockProps {
  items: string[]
  onSubmit?: (text: string, files: File[]) => void
}

// Acepta los mismos tipos que el input de adjuntos principal del chat.
const ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt'

export function FaltantesBlock({ items, onSubmit }: FaltantesBlockProps) {
  const [values, setValues] = useState<Record<number, string>>({})
  const [files, setFiles] = useState<File[]>([])
  const [submitted, setSubmitted] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!items || items.length === 0) return null

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || [])
    if (selected.length === 0) return
    setFiles((prev) => [...prev, ...selected])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = () => {
    const answered = items
      .map((item, i) => ({ item, value: values[i]?.trim() }))
      .filter((a) => a.value)

    if (answered.length === 0 && files.length === 0) return

    const lines = [
      'Acá está la información que pediste:',
      ...answered.map((a) => `- ${a.item}: ${a.value}`),
    ]
    if (files.length > 0) {
      lines.push(`- Archivos adjuntos: ${files.map((f) => f.name).join(', ')}`)
    }

    setSubmitted(true)
    onSubmit?.(lines.join('\n'), files)
  }

  const hasAnyAnswer = Object.values(values).some((v) => v?.trim()) || files.length > 0

  return (
    <div className="not-prose my-3 rounded-lg border border-border bg-muted/20 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <ListChecks className="h-4 w-4 text-[#7F77DD]" />
        Completá la información faltante
      </div>

      {submitted ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Check className="h-4 w-4 text-emerald-500" />
          Enviado. El análisis va a actualizar el informe con esta información.
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {items.map((item, i) => (
              <div key={i} className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{item}</label>
                <Textarea
                  value={values[i] || ''}
                  onChange={(e) => setValues((prev) => ({ ...prev, [i]: e.target.value }))}
                  placeholder="Escribí la respuesta acá (opcional si vas a adjuntar un archivo)"
                  className="min-h-[36px] text-sm resize-none"
                  rows={1}
                />
              </div>
            ))}
          </div>

          {files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs">
                  <span className="max-w-[160px] truncate">{f.name}</span>
                  <button onClick={() => removeFile(i)} aria-label="Quitar archivo">
                    <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <input ref={fileInputRef} type="file" accept={ACCEPT} multiple className="hidden" onChange={handleFileSelect} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="gap-1.5"
            >
              <Paperclip className="h-3.5 w-3.5" />
              Adjuntar archivo
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!hasAnyAnswer}
              onClick={handleSubmit}
              className="gap-1.5 bg-[#7F77DD] hover:bg-[#6B63C7] ml-auto"
            >
              <Send className="h-3.5 w-3.5" />
              Enviar información
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Podés dejar en blanco lo que no tengas — respondemos después con lo que falte.
          </p>
        </>
      )}
    </div>
  )
}