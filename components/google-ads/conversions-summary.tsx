'use client'

import type { ConversionResult } from '@/app/api/google-ads/conversions/route'
import { Card, CardContent } from '@/components/ui/card'
import { TrendingUp } from 'lucide-react'

interface ConversionsSummaryProps {
  data: ConversionResult[]
  total: number
}

export function ConversionsSummary({ data, total }: ConversionsSummaryProps) {
  const uniqueActions = data.length
  const top = data[0]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {/* Total */}
      <Card className="border-border">
        <CardContent className="pt-5 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total conversiones</p>
              <p className="text-3xl font-bold text-foreground mt-1 tabular-nums">
                {total % 1 === 0 ? total.toLocaleString('es-AR') : total.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Ultimos 30 dias</p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Unique actions */}
      <Card className="border-border">
        <CardContent className="pt-5 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Acciones distintas</p>
              <p className="text-3xl font-bold text-foreground mt-1 tabular-nums">
                {uniqueActions}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Tipos de conversion</p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-chart-3/10 flex items-center justify-center shrink-0">
              <span className="text-lg font-bold" style={{ color: 'oklch(0.55 0.13 250)' }}>#</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top conversion */}
      <Card className="border-border">
        <CardContent className="pt-5 pb-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Principal conversion</p>
            {top ? (
              <>
                <p className="text-sm font-semibold text-foreground mt-1.5 leading-tight line-clamp-2">
                  {top.conversionName}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  <span className="font-semibold text-foreground tabular-nums">
                    {top.conversions % 1 === 0 ? top.conversions.toLocaleString('es-AR') : top.conversions.toFixed(2)}
                  </span>{' '}conversiones
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground mt-1.5">Sin datos</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
