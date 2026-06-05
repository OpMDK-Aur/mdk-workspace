'use client'

import ReactMarkdown from 'react-markdown'
import { ChartBlock } from './chart-block'
import { FileBlock } from './file-block'

interface MessageContentProps {
  content: string
}

export function MessageContent({ content }: MessageContentProps) {
  // Parse content for special blocks (```chart and ```file)
  const parts: Array<{ type: 'text' | 'chart' | 'file'; content: string }> = []
  
  const regex = /```(chart|file)\n([\s\S]*?)```/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(content)) !== null) {
    // Add text before this match
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: content.slice(lastIndex, match.index) })
    }
    
    // Add the special block
    parts.push({ type: match[1] as 'chart' | 'file', content: match[2].trim() })
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
        
        return null
      })}
    </div>
  )
}
