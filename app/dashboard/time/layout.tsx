import { TimerProvider } from '@/lib/time-tracking/timer-context'
import { ActiveTimerBar } from '@/components/timer/active-timer-bar'
import { TimeTrackingSidebar } from '@/components/timer/time-tracking-sidebar'

export default function TimeTrackingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <TimerProvider>
      <div className="flex flex-col h-full">
        <ActiveTimerBar />
        <div className="flex flex-1 overflow-hidden">
          <TimeTrackingSidebar />
          <main className="flex-1 overflow-auto p-6 bg-background">
            {children}
          </main>
        </div>
      </div>
    </TimerProvider>
  )
}
