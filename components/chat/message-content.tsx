'use client'

import ReactMarkdown from 'react-markdown'
import { ChartBlock } from './chart-block'
import { FileBlock } from './file-block'
import { ImageBlock } from './image-block'
import { PdfBlock } from './pdf-block'

interface MessageContentProps {
  content: string
}

export function MessageContent({ content }: MessageContentProps) {
  // Parse content for special blocks (```chart, ```file and ```image)
  const parts: Array<{ type: 'text' | 'chart' | 'file' | 'image' | 'pdf'; content: string }> = []
  
  const regex = /```(chart|file|image|pdf)\n([\s\S]*?)```/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(content)) !== null) {
    // Add text before this match
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: content.slice(lastIndex, match.index) })
    }
    
    // Add the special block
    parts.push({ type: match[1] as 'chart' | 'file' | 'image' | 'pdf', content: match[2].trim() })
    lastIndex = regex.lastIndex
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push({ type: 'text', content: content.slice(lastIndex) })
  }

  // If no special blocks found, just render as markdown
  if (parts.length === 0) {
    return (
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    )
  }

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      {parts.map((part, index) => {
        if (part.type === 'text') {
          return <ReactMarkdown key={index}>{part.content}</ReactMarkdown>
        }
        
        if (part.type === 'chart') {
          try {
            const config = JSON.parse(part.content)
            return <ChartBlock key={index} config={config} />
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
            return <ImageBlock key={index} config={config} />
          } catch (e) {
            console.error('Failed to parse image config:', e)
            return <pre key={index} className="text-red-500">Error parsing image: {part.content}</pre>
          }
        }

        if (part.type === 'pdf') {
          try {
            const config = JSON.parse(part.content)
            return <PdfBlock key={index} config={config} messageContent={content} />
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
