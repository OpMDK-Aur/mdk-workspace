'use client'

import { EntriesList } from '@/components/time-entries/entries-list'

export default function EntriesPage() {
  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">All Time Entries</h1>
        <p className="text-muted-foreground mt-1">
          Browse and manage all your tracked time
        </p>
      </div>
      <EntriesList />
    </div>
  )
}
