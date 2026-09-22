import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <section className="flex max-w-md flex-col gap-4 text-center">
        <h1 className="text-xl font-semibold">Página no encontrada</h1>
        <p className="text-sm text-muted-foreground">La ruta que buscás no existe o ya no está disponible.</p>
        <Link href="/dashboard" className="mx-auto rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          Volver al inicio
        </Link>
      </section>
    </main>
  )
}
