'use client'

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="es">
      <body className="bg-background text-foreground">
        <main className="flex min-h-screen items-center justify-center px-6">
          <section className="flex max-w-md flex-col gap-4 text-center">
            <h1 className="text-xl font-semibold">Error inesperado</h1>
            <p className="text-sm text-muted-foreground">La aplicación necesita recargarse para continuar.</p>
            <button
              type="button"
              onClick={() => reset()}
              className="mx-auto rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Recargar
            </button>
          </section>
        </main>
      </body>
    </html>
  )
}
