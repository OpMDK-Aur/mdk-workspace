'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { AlertTriangle, ChevronDown, Download, RotateCw, Search } from 'lucide-react'
import type { ClientBudgetAlert } from '@/lib/types'

export default function PerformancePage() {
  const supabase = createClient()
  const [platform, setPlatform] = useState('all')
  const [client, setClient] = useState('all')
  const [account, setAccount] = useState('all')
  const [period, setPeriod] = useState('30')
  const [searchQuery, setSearchQuery] = useState('')
  const [alerts, setAlerts] = useState<ClientBudgetAlert[]>([])
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAlerts()
  }, [platform, client, account, period])

  const fetchAlerts = async () => {
    try {
      setLoading(true)
      const { data } = await supabase
        .from('cliente_alertas_budget')
        .select('*')
      
      if (data) {
        setAlerts(data as ClientBudgetAlert[])
      }
    } catch (error) {
      console.error('[v0] Error fetching alerts:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleRow = (clientId: string) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(clientId)) {
      newExpanded.delete(clientId)
    } else {
      newExpanded.add(clientId)
    }
    setExpandedRows(newExpanded)
  }

  const getCriticalCount = (alert: ClientBudgetAlert) => {
    let count = 0
    if (alert.google_ads?.campaigns) {
      count += alert.google_ads.campaigns.filter(c => c.status === 'critical').length
    }
    if (alert.meta_ads?.campaigns) {
      count += alert.meta_ads.campaigns.filter(c => c.status === 'critical').length
    }
    return count
  }

  const getAttentionCount = (alert: ClientBudgetAlert) => {
    let count = 0
    if (alert.google_ads?.campaigns) {
      count += alert.google_ads.campaigns.filter(c => c.status === 'attention').length
    }
    if (alert.meta_ads?.campaigns) {
      count += alert.meta_ads.campaigns.filter(c => c.status === 'attention').length
    }
    return count
  }

  const getTotalCount = (alert: ClientBudgetAlert) => {
    let count = 0
    if (alert.google_ads?.campaigns) {
      count += alert.google_ads.campaigns.length
    }
    if (alert.meta_ads?.campaigns) {
      count += alert.meta_ads.campaigns.length
    }
    return count
  }

  const totalCritical = alerts.reduce((sum, a) => sum + getCriticalCount(a), 0)
  const totalAttention = alerts.reduce((sum, a) => sum + getAttentionCount(a), 0)
  const totalCampaigns = alerts.reduce((sum, a) => sum + getTotalCount(a), 0)
  const totalClients = alerts.length

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'critical':
        return 'text-red-500'
      case 'attention':
        return 'text-yellow-500'
      default:
        return 'text-gray-500'
    }
  }

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'critical':
        return 'bg-red-500/10'
      case 'attention':
        return 'bg-yellow-500/10'
      default:
        return 'bg-gray-500/10'
    }
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Dashboard</h1>

        {/* Top Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={platform} onValueChange={setPlatform}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las plataformas</SelectItem>
              <SelectItem value="google">Google Ads</SelectItem>
              <SelectItem value="meta">Meta Ads</SelectItem>
            </SelectContent>
          </Select>

          <Select value={client} onValueChange={setClient}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los clientes</SelectItem>
              {alerts.map(a => (
                <SelectItem key={a.cliente_id} value={a.cliente_id}>
                  {a.cliente_nombre || a.cliente_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={account} onValueChange={setAccount}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las cuentas</SelectItem>
            </SelectContent>
          </Select>

          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 días</SelectItem>
              <SelectItem value="14">Últimos 14 días</SelectItem>
              <SelectItem value="30">Últimos 30 días</SelectItem>
              <SelectItem value="90">Últimos 90 días</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="ghost" size="sm" onClick={fetchAlerts}>
            <RotateCw className="h-4 w-4 mr-2" />
            Actualizar
          </Button>

          <Button className="ml-auto bg-green-600 hover:bg-green-700">
            <Download className="h-4 w-4 mr-2" />
            Generar reporte
          </Button>
        </div>
      </div>

      {/* Alerts Summary */}
      <Card className="bg-red-500/5 border-red-500/20 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold">Alertas de Campanas</h3>
            <p className="text-sm text-muted-foreground">
              {totalCritical} críticas, {totalAttention} atenciones, {totalCampaigns} total en {totalClients} clientes
            </p>
          </div>
        </div>
      </Card>

      {/* Filter Chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="default" className="bg-green-600">Últimos 14 días</Badge>
        <Badge variant="outline">Últimos 7 días</Badge>
        <Badge variant="outline">Ayer</Badge>
        <Badge variant="outline">Hoy</Badge>
        <Badge variant="outline">Personalizado</Badge>
        <Badge variant="outline">Todas las campanas</Badge>
        <Badge variant="default">Todas</Badge>
        <Badge variant="outline">Críticas</Badge>
        <Badge variant="outline">Atención</Badge>
        <Badge variant="outline">0 métricas</Badge>
        <Badge variant="outline">CPL</Badge>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar cliente o campaña"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Campaigns List */}
      <div className="space-y-2">
        {alerts.map((alert) => {
          const isExpanded = expandedRows.has(alert.cliente_id)
          const critical = getCriticalCount(alert)
          const attention = getAttentionCount(alert)
          const total = getTotalCount(alert)

          return (
            <div key={alert.cliente_id}>
              <button
                onClick={() => toggleRow(alert.cliente_id)}
                className={cn(
                  'w-full flex items-center justify-between p-4 rounded-lg border',
                  'bg-card hover:bg-accent/50 transition-colors'
                )}
              >
                <div className="flex items-center gap-3 flex-1">
                  <ChevronDown
                    className={cn(
                      'h-5 w-5 transition-transform',
                      isExpanded && 'rotate-180'
                    )}
                  />
                  <span className="font-medium">{alert.cliente_nombre || 'Cliente'}</span>
                </div>
                <div className="flex items-center gap-4">
                  {critical > 0 && (
                    <span className={cn('text-sm font-semibold', getStatusColor('critical'))}>
                      {critical} críticas
                    </span>
                  )}
                  {attention > 0 && (
                    <span className={cn('text-sm font-semibold', getStatusColor('attention'))}>
                      {attention} alertas
                    </span>
                  )}
                  <span className="text-sm font-semibold">{total} total</span>
                </div>
              </button>

              {isExpanded && (
                <div className="border border-t-0 rounded-b-lg bg-muted/30 p-4">
                  <div className="space-y-2">
                    {alert.google_ads?.campaigns && alert.google_ads.campaigns.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-sm mb-2">Google Ads</h4>
                        <div className="space-y-1">
                          {alert.google_ads.campaigns.map((camp, idx) => (
                            <div
                              key={idx}
                              className={cn(
                                'flex items-center justify-between p-2 rounded text-sm',
                                getStatusBg(camp.status)
                              )}
                            >
                              <span>{camp.campaign_name}</span>
                              <Badge variant="outline" className={getStatusColor(camp.status)}>
                                {camp.status}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {alert.meta_ads?.campaigns && alert.meta_ads.campaigns.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-sm mb-2">Meta Ads</h4>
                        <div className="space-y-1">
                          {alert.meta_ads.campaigns.map((camp, idx) => (
                            <div
                              key={idx}
                              className={cn(
                                'flex items-center justify-between p-2 rounded text-sm',
                                getStatusBg(camp.status)
                              )}
                            >
                              <span>{camp.campaign_name}</span>
                              <Badge variant="outline" className={getStatusColor(camp.status)}>
                                {camp.status}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* KPIs Section */}
      <div className="mt-12">
        <h2 className="text-lg font-semibold mb-4">KPIS DEL PERIODO</h2>
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="h-40 bg-card/50" />
          ))}
        </div>
      </div>
    </div>
  )
}
