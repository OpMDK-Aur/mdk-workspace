'use client'

import { useMemo } from 'react'
import Markdown from 'react-markdown'
import { ChartBlock } from './chart-block'
import { ImageBlock } from './image-block'
import { FileBlock } from './file-block'
import { PdfBlock } from './pdf-block'
import { FaltantesBlock } from './faltantes-block'

export type Artifact = {
  type: 'chart' | 'image' | 'file' | 'pdf' | 'faltantes'
  config: Record<string, unknown>
}

interface MessageContentProps {
  content: string
  onOpenArtifact?: (artifact: Artifact) => void
  onSubmitFaltantes?: (text: string, files?: File[]) => void
}

export function MessageContent({ content, onOpenArtifact, onSubmitFaltantes }: MessageContentProps) {
  const artifacts = useMemo(() => {
    const artifactRegex = /\[ARTIFACT:(\d+):(chart|image|file|pdf|faltantes):(.*?)\]/gs
    return Array.from(content.matchAll(artifactRegex)).map((match) => ({
      id: match[1],
      type: match[2] as Artifact['type'],
      config: JSON.parse(match[3]),
    }))
  }, [content])

  const contentWithoutArtifacts = content.replace(/\[ARTIFACT:\d+:(chart|image|file|pdf|faltantes):.*?\]/gs, '').trim()

  return (
    <div className="space-y-4">
      {contentWithoutArtifacts && (
        <Markdown
          className="prose prose-sm dark:prose-invert max-w-none"
          components={{
            p: ({ children }) => <p className="text-sm leading-relaxed">{children}</p>,
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                {children}
              </a>
            ),
            code: ({ inline, children }) =>
              inline ? (
                <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>
              ) : (
                <pre className="bg-muted p-3 rounded overflow-auto text-xs">
                  <code>{children}</code>
                </pre>
              ),
            table: ({ children }) => (
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-xs border-collapse">{children}</table>
              </div>
            ),
            ul: ({ children }) => <ul className="list-disc list-inside space-y-1">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal list-inside space-y-1">{children}</ol>,
            li: ({ children }) => <li className="text-sm">{children}</li>,
          }}
        >
          {contentWithoutArtifacts}
        </Markdown>
      )}

      {artifacts.map((artifact) => {
        switch (artifact.type) {
          case 'chart':
            return (
              <ChartBlock key={artifact.id} config={artifact.config} onClick={() => onOpenArtifact?.(artifact as Artifact)} />
            )
          case 'image':
            return (
              <ImageBlock key={artifact.id} config={artifact.config} onClick={() => onOpenArtifact?.(artifact as Artifact)} />
            )
          case 'file':
            return (
              <FileBlock key={artifact.id} config={artifact.config} onClick={() => onOpenArtifact?.(artifact as Artifact)} />
            )
          case 'pdf':
            return (
              <PdfBlock key={artifact.id} config={artifact.config} onClick={() => onOpenArtifact?.(artifact as Artifact)} />
            )
          case 'faltantes':
            return (
              <FaltantesBlock
                key={artifact.id}
                config={artifact.config}
                onSubmit={onSubmitFaltantes}
                onClick={() => onOpenArtifact?.(artifact as Artifact)}
              />
            )
          default:
            return null
        }
      })}
    </div>
  )
}
