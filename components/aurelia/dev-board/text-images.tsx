'use client'

import { Fragment, useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { sanitizeFileName, uploadTaskFile } from '@/lib/tasks/upload-with-progress'
import { cn } from '@/lib/utils'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const IMAGE_MARKER = /!\[([^\]\n]*)\]\((https:\/\/[^\s)]+)\)/g
const ALLOWED_PREFIX = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/task-files/`

// Images live inside the text as `![nombre](url)`; only our own storage URLs render, so a pasted
// marker can't load arbitrary third-party images.
const isAllowedImageUrl = (url: string) => url.startsWith(ALLOWED_PREFIX)

type Segment = { type: 'text'; value: string } | { type: 'image'; alt: string; url: string; raw: string }

function splitText(text: string): Segment[] {
  const segments: Segment[] = []
  let last = 0
  for (const match of text.matchAll(IMAGE_MARKER)) {
    const [raw, alt, url] = match
    if (!isAllowedImageUrl(url)) continue
    if (match.index > last) segments.push({ type: 'text', value: text.slice(last, match.index) })
    segments.push({ type: 'image', alt: alt || 'Imagen adjunta', url, raw })
    last = match.index + raw.length
  }
  if (last < text.length) segments.push({ type: 'text', value: text.slice(last) })
  return segments
}

export function textImages(text: string) {
  return splitText(text).filter((segment): segment is Extract<Segment, { type: 'image' }> => segment.type === 'image')
}

function InlineImage({ url, alt, className }: { url: string; alt: string; className?: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={cn('block w-fit overflow-hidden rounded-md border bg-background', className)}>
      <img src={url} alt={alt} loading="lazy" className="max-h-72 max-w-full object-contain" />
    </a>
  )
}

/** Text with its attached images rendered in place. */
export function TextWithImages({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2 text-sm leading-relaxed', className)}>
      {splitText(text).map((segment, index) => (
        <Fragment key={index}>
          {segment.type === 'image' ? (
            <InlineImage url={segment.url} alt={segment.alt} />
          ) : segment.value.trim() ? (
            <p className="whitespace-pre-wrap break-words text-pretty">{segment.value.replace(/^\n+|\n+$/g, '')}</p>
          ) : null}
        </Fragment>
      ))}
    </div>
  )
}

/** Thumbnails of the images in a draft, each removable from the text. */
export function DraftImages({ text, onChange }: { text: string; onChange: (next: string) => void }) {
  const images = textImages(text)
  if (images.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Imágenes adjuntas">
      {images.map((image, index) => (
        <li key={`${image.url}-${index}`} className="relative">
          <InlineImage url={image.url} alt={image.alt} className="[&_img]:h-20 [&_img]:w-auto" />
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="absolute -right-2 -top-2 size-6 rounded-full border shadow-sm"
            onClick={() => onChange(text.replace(image.raw, '').replace(/\n{3,}/g, '\n\n').trim())}
            aria-label={`Quitar ${image.alt}`}
          >
            <X className="size-3" aria-hidden="true" />
          </Button>
        </li>
      ))}
    </ul>
  )
}

/**
 * Uploads pasted, dropped or picked images and inserts them as markers at the cursor of the textarea.
 * `getValue` reads the latest text so several uploads finishing out of order don't overwrite each other.
 */
export function useTextImages({ folder, getValue, onChange }: { folder: string; getValue: () => string; onChange: (next: string) => void }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [uploading, setUploading] = useState(0)

  const insertAtCursor = (snippet: string) => {
    const value = getValue()
    const element = textareaRef.current
    const start = element && document.activeElement === element ? element.selectionStart : value.length
    const end = element && document.activeElement === element ? element.selectionEnd : value.length
    const before = value.slice(0, start)
    const after = value.slice(end)
    const prefix = before && !before.endsWith('\n') ? '\n' : ''
    const suffix = after.startsWith('\n') ? '' : '\n'
    onChange(`${before}${prefix}${snippet}${suffix}${after}`)
    requestAnimationFrame(() => {
      if (!element) return
      const caret = before.length + prefix.length + snippet.length + suffix.length
      element.setSelectionRange(caret, caret)
    })
  }

  const upload = async (files: File[]) => {
    const images = files.filter((file) => file.type.startsWith('image/'))
    if (images.length === 0) return
    for (const file of images) {
      if (file.size > MAX_IMAGE_BYTES) {
        toast.error(`${file.name || 'La imagen'} pesa más de 10 MB.`)
        continue
      }
      setUploading((count) => count + 1)
      try {
        const extension = file.type.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'png'
        const name = sanitizeFileName(file.name || `captura.${extension}`) || `captura.${extension}`
        const url = await uploadTaskFile(file, `aurelia-dev/${folder}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${name}`, () => {})
        insertAtCursor(`![${name.replace(/[[\]]/g, '')}](${url})`)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo subir la imagen.')
      } finally {
        setUploading((count) => count - 1)
      }
    }
  }

  const imageFiles = (items: DataTransferItemList | null | undefined) =>
    [...(items ?? [])].filter((item) => item.kind === 'file' && item.type.startsWith('image/')).map((item) => item.getAsFile()).filter((file): file is File => file !== null)

  return {
    textareaRef,
    uploading: uploading > 0,
    upload,
    textareaProps: {
      ref: textareaRef,
      onPaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const files = imageFiles(event.clipboardData?.items)
        if (files.length === 0) return
        event.preventDefault()
        void upload(files)
      },
      onDragOver: (event: React.DragEvent<HTMLTextAreaElement>) => {
        if ([...event.dataTransfer.items].some((item) => item.kind === 'file')) event.preventDefault()
      },
      onDrop: (event: React.DragEvent<HTMLTextAreaElement>) => {
        const files = imageFiles(event.dataTransfer?.items)
        if (files.length === 0) return
        event.preventDefault()
        void upload(files)
      },
    },
  }
}

export function AttachImageButton({ onFiles, uploading, disabled, className }: { onFiles: (files: File[]) => void; uploading: boolean; disabled?: boolean; className?: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          onFiles([...(event.target.files ?? [])])
          event.target.value = ''
        }}
      />
      <Button type="button" variant="ghost" size="sm" className={cn('h-7 gap-1.5 text-xs', className)} onClick={() => inputRef.current?.click()} disabled={disabled || uploading}>
        {uploading ? <Spinner /> : <ImagePlus className="size-3.5" aria-hidden="true" />}
        {uploading ? 'Subiendo...' : 'Adjuntar imagen'}
      </Button>
    </>
  )
}
