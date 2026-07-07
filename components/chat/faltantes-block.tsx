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
  const [filesByItem, setFilesByItem] = useState<Record<number, File[]>>({})
  const [submitted, setSubmitted] = useState(false)
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({})

  if (!items || items.length === 0) return null

  const handleFileSelect = (index: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || [])
    if (selected.length === 0) return
    setFilesByItem((prev) => ({ ...prev, [index]: [...(prev[index] || []), ...selected] }))
    e.target.value = ''
  }

  const removeFile = (itemIndex: number, fileIndex: number) => {
    setFilesByItem((prev) => ({
      ...prev,
      [itemIndex]: (prev[itemIndex] || []).filter((_, i) => i !== fileIndex),
    }))
  }

  const handleSubmit = () => {
    const lines: string[] = ['Acá está la información que pediste:']
    const allFiles: File[] = []

    items.forEach((item, i) => {
      const text = values[i]?.trim()
      const files = filesByItem[i] || []
      if (files.length > 0) {
        allFiles.push(...files)
        const fileNote = `archivo${files.length > 1 ? 's' : ''} adjunto${files.length > 1 ? 's' : ''}: ${files.map((f) => f.name).join(', ')}`
        lines.push(`- ${item}: ${text ? `${text} (${fileNote})` : `ver ${fileNote}`}`)
      } else if (text) {
        lines.push(`- ${item}: ${text}`)
      }
    })

    if (lines.length === 1) return // nada respondido

    setSubmitted(true)
    onSubmit?.(lines.join('\n'), allFiles)
  }

  const hasAnyAnswer =
    Object.values(values).some((v) => v?.trim()) || Object.values(filesByItem).some((f) => f.length > 0)

  return (
    <div className="not-prose my-3 rounded-lg border border-border bg-muted/20 p-4 space-y-4">
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
          <div className="space-y-4">
            {items.map((item, i) => {
              const itemFiles = filesByItem[i] || []
              return (
                <div key={i} className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{item}</label>
                  <Textarea
                    value={values[i] || ''}
                    onChange={(e) => setValues((prev) => ({ ...prev, [i]: e.target.value }))}
                    placeholder="Escribí la respuesta, o adjuntá un archivo abajo (ej. un Excel con las ventas)"
                    className="min-h-[36px] text-sm resize-none"
                    rows={1}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={(el) => { fileInputRefs.current[i] = el }}
                      type="file"
                      accept={ACCEPT}
                      multiple
                      className="hidden"
                      onChange={handleFileSelect(i)}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRefs.current[i]?.click()}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Paperclip className="h-3 w-3" />
                      Adjuntar archivo para este dato
                    </button>
                    {itemFiles.map((f, fi) => (
                      <div key={fi} className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-0.5 text-xs">
                        <span className="max-w-[140px] truncate">{f.name}</span>
                        <button onClick={() => removeFile(i, fi)} aria-label="Quitar archivo">
                          <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex items-center justify-between gap-2 pt-1 border-t border-border">
            <p className="text-[11px] text-muted-foreground pt-3">
              Podés dejar en blanco lo que no tengas — respondemos después con lo que falte.
            </p>
            <Button
              type="button"
              size="sm"
              disabled={!hasAnyAnswer}
              onClick={handleSubmit}
              className="gap-1.5 bg-[#7F77DD] hover:bg-[#6B63C7] mt-3 shrink-0"
            >
              <Send className="h-3.5 w-3.5" />
              Enviar información
            </Button>
          </div>
        </>
      )}
    </div>
  )
}