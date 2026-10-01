'use client'

import { useRef } from 'react'
import { CopyButton } from './copy-button'

export function CodeBlock({ children }: { children?: React.ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null)

  return (
    <div className="group/code relative my-3 max-w-full">
      <CopyButton
        getText={() => preRef.current?.innerText ?? ''}
        label="Copiar prompt"
        className="absolute right-2 top-2 z-10 rounded-md border border-border bg-background/90 p-1.5 text-muted-foreground hover:text-foreground"
      />
      <pre
        ref={preRef}
        className="max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/40 p-3 pr-11 font-mono text-xs leading-5 [overflow-wrap:anywhere]"
      >
        {children}
      </pre>
    </div>
  )
}
