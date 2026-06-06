'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Client } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { ThumbsUp, MessageSquare } from 'lucide-react'

interface NPSWidgetProps {
  client: Client
  onUpdate?: () => void
}

export function NPSWidget({ client, onUpdate }: NPSWidgetProps) {
  const supabase = createClient()
  const [score, setScore] = useState<number | null>(client.nps_score || null)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const handleScoreSelect = async (value: number) => {
    setScore(value)
    setIsSaving(true)

    try {
      const { error } = await supabase
        .from('clientes')
        .update({ nps_score: value })
        .eq('id', client.id)

      if (error) throw error
      setIsEditing(false)
      onUpdate?.()
    } catch (error) {
      console.error('[v0] Error saving NPS:', error)
      setScore(client.nps_score || null)
    } finally {
      setIsSaving(false)
    }
  }

  const getNPSColor = (value: number | null) => {
    if (value === null) return 'bg-muted'
    if (value >= 9) return 'bg-green-500/10 text-green-700 border-green-500/30'
    if (value >= 7) return 'bg-yellow-500/10 text-yellow-700 border-yellow-500/30'
    return 'bg-red-500/10 text-red-700 border-red-500/30'
  }

  const getNPSLabel = (value: number | null) => {
    if (value === null) return 'Sin NPS'
    if (value >= 9) return 'Promotor'
    if (value >= 7) return 'Pasivo'
    return 'Detractor'
  }

  return (
    <Card className="p-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ThumbsUp className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">NPS Score</h3>
          </div>
          <Badge 
            variant="outline"
            className={cn('border', getNPSColor(score))}
          >
            {score !== null ? score : '—'}
          </Badge>
        </div>

        {isEditing ? (
          <div className="grid grid-cols-5 gap-1">
            {Array.from({ length: 11 }, (_, i) => (
              <Button
                key={i}
                size="sm"
                variant={score === i ? 'default' : 'outline'}
                className="text-xs h-8"
                onClick={() => handleScoreSelect(i)}
                disabled={isSaving}
              >
                {i}
              </Button>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{getNPSLabel(score)}</p>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setIsEditing(true)}
            >
              Editar
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}
