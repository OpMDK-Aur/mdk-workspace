export default function TimeTrackingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <main className="flex-1 overflow-auto p-6 bg-background">
      {children}
    </main>
  )
}
