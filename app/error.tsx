'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[v0] App route error:', error)
  }, [error])

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <section className="flex max-w-md flex-col gap-4 text-center">
        <h1 className="text-xl font-semibold">Algo salió mal</h1>
        <p className="text-sm text-muted-foreground">No pudimos cargar esta sección. Intentá nuevamente.</p>
        <button
          type="button"
          onClick={() => reset()}
          className="mx-auto rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Reintentar
        </button>
      </section>
    </main>
  )
}
