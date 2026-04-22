import { TimeTrackingSidebar } from '@/components/timer/time-tracking-sidebar'

export default function TimeTrackingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-1 overflow-hidden">
      <TimeTrackingSidebar />
      <main className="flex-1 overflow-auto p-6 bg-background">
        {children}
      </main>
    </div>
  )
}
