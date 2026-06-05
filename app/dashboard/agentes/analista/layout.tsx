export default function AnalistaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // This layout removes the default dashboard sidebar for a full-screen chat experience
  return (
    <div className="h-screen w-screen bg-background">
      {children}
    </div>
  )
}
