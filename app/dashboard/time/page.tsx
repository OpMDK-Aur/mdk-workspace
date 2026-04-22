'use client'

import { EntriesList } from '@/components/time-entries/entries-list'

export default function TimePage() {
  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Time Entries</h1>
        <p className="text-muted-foreground mt-1">
          View and manage your tracked time
        </p>
      </div>
      <EntriesList />
    </div>
  )
}
