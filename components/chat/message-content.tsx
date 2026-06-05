'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Maximize2 } from 'lucide-react'
import { ChartBlock } from './chart-block'
import { FileBlock } from './file-block'
import { ImageBlock } from './image-block'
import { PdfBlock } from './pdf-block'

export type Artifact = {
  type: 'chart' | 'pdf' | 'image'
  config: unknown
  messageContent: string
}

interface MessageContentProps {
  content: string
  onOpenArtifact?: (artifact: Artifact) => void
}

// Shared markdown components: styled tables, lists, code, etc.
const markdownComponents = {
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="my-3 w-full overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="bg-muted/60">{children}</thead>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="border-b border-border px-3 py-2 text-left font-semibold text-foreground">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="border-b border-border/50 px-3 py-2 text-foreground/90">{children}</td>
  ),
  tr: ({ children }: { children?: React.ReactNode }) => (
    <tr className="even:bg-muted/20">{children}</tr>
  ),
}

function ArtifactCard({
  label,
  onOpen,
  children,
}: {
  label: string
  onOpen?: () => void
  children: React.ReactNode
}) {
  return (
    <div className="group relative my-2">
      {onOpen && (
        <button
          onClick={onOpen}
          className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-md border border-border bg-background/90 px-2 py-1 text-xs font-medium text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground group-hover:opacity-100"
          aria-label={`Abrir ${label} en panel`}
        >
          <Maximize2 className="h-3 w-3" />
          Ampliar
        </button>
      )}
      {children}
    </div>
  )
}

export function MessageContent({ content, onOpenArtifact }: MessageContentProps) {
  // Parse content for special blocks (```chart, ```file, ```image, ```pdf)
  const parts: Array<{ type: 'text' | 'chart' | 'file' | 'image' | 'pdf'; content: string }> = []

  const regex = /```(chart|file|image|pdf)\n([\s\S]*?)```/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: content.slice(lastIndex, match.index) })
    }
    parts.push({ type: match[1] as 'chart' | 'file' | 'image' | 'pdf', content: match[2].trim() })
    lastIndex = regex.lastIndex
  }

  if (lastIndex < content.length) {
    parts.push({ type: 'text', content: content.slice(lastIndex) })
  }

  if (parts.length === 0) {
    return (
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {content}
        </ReactMarkdown>
      </div>
    )
  }

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      {parts.map((part, index) => {
        if (part.type === 'text') {
          if (!part.content.trim()) return null
          return (
            <ReactMarkdown key={index} remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {part.content}
            </ReactMarkdown>
          )
        }

        if (part.type === 'chart') {
          try {
            const config = JSON.parse(part.content)
            return (
              <ArtifactCard
                key={index}
                label="gráfico"
                onOpen={onOpenArtifact ? () => onOpenArtifact({ type: 'chart', config, messageContent: content }) : undefined}
              >
                <ChartBlock config={config} />
              </ArtifactCard>
            )
          } catch (e) {
            console.error('Failed to parse chart config:', e)
            return <pre key={index} className="text-red-500">Error parsing chart: {part.content}</pre>
          }
        }

        if (part.type === 'file') {
          try {
            const config = JSON.parse(part.content)
            return <FileBlock key={index} config={config} />
          } catch (e) {
            console.error('Failed to parse file config:', e)
            return <pre key={index} className="text-red-500">Error parsing file: {part.content}</pre>
          }
        }

        if (part.type === 'image') {
          try {
            const config = JSON.parse(part.content)
            return (
              <ArtifactCard
                key={index}
                label="imagen"
                onOpen={onOpenArtifact ? () => onOpenArtifact({ type: 'image', config, messageContent: content }) : undefined}
              >
                <ImageBlock config={config} />
              </ArtifactCard>
            )
          } catch (e) {
            console.error('Failed to parse image config:', e)
            return <pre key={index} className="text-red-500">Error parsing image: {part.content}</pre>
          }
        }

        if (part.type === 'pdf') {
          try {
            const config = JSON.parse(part.content)
            return (
              <ArtifactCard
                key={index}
                label="PDF"
                onOpen={onOpenArtifact ? () => onOpenArtifact({ type: 'pdf', config, messageContent: content }) : undefined}
              >
                <PdfBlock config={config} messageContent={content} />
              </ArtifactCard>
            )
          } catch (e) {
            console.error('Failed to parse pdf config:', e)
            return <pre key={index} className="text-red-500">Error parsing pdf: {part.content}</pre>
          }
        }

        return null
      })}
    </div>
  )
}
