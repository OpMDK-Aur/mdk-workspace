'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, AlertCircle, RefreshCw, Loader2, Calendar } from 'lucide-react'

interface TokenInfo {
  email_conectado: string | null
  token_expiry: string | null
  updated_at: string | null
}

interface PlatformConnectionPanelProps {
  googleToken: TokenInfo | null
  googleCalendarToken: TokenInfo | null
  appUrl: string
}

export function PlatformConnectionPanel({ googleToken, googleCalendarToken, appUrl }: PlatformConnectionPanelProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [loadingAds, setLoadingAds] = useState(false)
  const [loadingCalendar, setLoadingCalendar] = useState(false)

  // Handle URL params for success/error messages
  useEffect(() => {
    const connected = searchParams.get('connected')
    const error = searchParams.get('error')

    if (connected === 'google' || connected === 'google_ads') {
      setNotice({ type: 'success', message: 'Cuenta de Google Ads conectada correctamente.' })
      router.replace('/dashboard/platform')
      return
    }
    if (connected === 'google_calendar') {
      setNotice({ type: 'success', message: 'Cuenta de Google Calendar conectada correctamente.' })
      router.replace('/dashboard/platform')
      return
    }
    if (error) {
      const messages: Record<string, string> = {
        no_token: 'No se obtuvo el token de acceso de Google.',
        no_provider_token: 'No se obtuvo el token de Google. Asegurate de tener Google configurado como proveedor en Supabase.',
        db_error: 'Error al guardar los tokens en la base de datos.',
        missing_scope: 'El token no tiene el scope necesario. Volve a autorizar.',
        no_refresh_token_revoke_required: 'No se obtuvo refresh token. Revoca el acceso en myaccount.google.com/permissions y volve a autorizar.',
      }
      setNotice({ type: 'error', message: messages[error] ?? `Error: ${error}` })
      router.replace('/dashboard/platform')
      return
    }
  }, [searchParams, router])

  const handleConnectAds = () => {
    setLoadingAds(true)
    window.location.href = '/api/auth/google-ads'
  }

  const handleConnectCalendar = () => {
    setLoadingCalendar(true)
    window.location.href = '/api/auth/google-calendar'
  }

  const isAdsConnected = Boolean(googleToken)
  const isCalendarConnected = Boolean(googleCalendarToken)
  
  const adsEmail = googleToken?.email_conectado
  const calendarEmail = googleCalendarToken?.email_conectado
  
  const adsUpdatedAt = googleToken?.updated_at
    ? new Date(googleToken.updated_at).toLocaleDateString('es-AR', {
        day: '2-digit', month: 'short', year: 'numeric',
      })
    : null
  const calendarUpdatedAt = googleCalendarToken?.updated_at
    ? new Date(googleCalendarToken.updated_at).toLocaleDateString('es-AR', {
        day: '2-digit', month: 'short', year: 'numeric',
      })
    : null

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Conexion de cuentas</h2>

      {notice && (
        <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
          notice.type === 'success'
            ? 'border-green-500/30 bg-green-500/5 text-green-700 dark:text-green-400'
            : 'border-destructive/30 bg-destructive/5 text-destructive'
        }`}>
          {notice.type === 'success'
            ? <CheckCircle2 className="h-4 w-4 shrink-0" />
            : <AlertCircle className="h-4 w-4 shrink-0" />
          }
          {notice.message}
        </div>
      )}

      {/* Google Ads Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg border bg-white shrink-0">
                <svg viewBox="0 0 24 24" className="w-5 h-5">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              </div>
              <div>
                <CardTitle className="text-base">Google Ads</CardTitle>
                {adsEmail && (
                  <p className="text-xs text-muted-foreground mt-0.5">{adsEmail}</p>
                )}
              </div>
              {isAdsConnected ? (
                <Badge className="bg-green-500/15 text-green-600 border-green-500/20 text-xs">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Conectado
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground text-xs">
                  Sin conectar
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {adsUpdatedAt && (
                <span className="text-xs text-muted-foreground hidden sm:block">
                  Actualizado {adsUpdatedAt}
                </span>
              )}
              <Button
                size="sm"
                variant={isAdsConnected ? 'outline' : 'default'}
                className="gap-2 h-8"
                onClick={handleConnectAds}
                disabled={loadingAds}
              >
                {loadingAds ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : isAdsConnected ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5" />
                    Reconectar
                  </>
                ) : (
                  'Conectar'
                )}
              </Button>
            </div>
          </div>
        </CardHeader>

        {!isAdsConnected && (
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Conecta tu cuenta de Google Ads para obtener metricas de campanas.
              Selecciona la cuenta que tiene acceso a las cuentas administradas (MCC).
            </p>
          </CardContent>
        )}
      </Card>

      {/* Google Calendar Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg border bg-white shrink-0">
                <Calendar className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-base">Google Calendar</CardTitle>
                {calendarEmail && (
                  <p className="text-xs text-muted-foreground mt-0.5">{calendarEmail}</p>
                )}
              </div>
              {isCalendarConnected ? (
                <Badge className="bg-green-500/15 text-green-600 border-green-500/20 text-xs">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Conectado
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground text-xs">
                  Sin conectar
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {calendarUpdatedAt && (
                <span className="text-xs text-muted-foreground hidden sm:block">
                  Actualizado {calendarUpdatedAt}
                </span>
              )}
              <Button
                size="sm"
                variant={isCalendarConnected ? 'outline' : 'default'}
                className="gap-2 h-8"
                onClick={handleConnectCalendar}
                disabled={loadingCalendar}
              >
                {loadingCalendar ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : isCalendarConnected ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5" />
                    Reconectar
                  </>
                ) : (
                  'Conectar'
                )}
              </Button>
            </div>
          </div>
        </CardHeader>

        {!isCalendarConnected && (
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Conecta tu cuenta de Google Calendar para crear reuniones automaticamente desde las tareas.
              Podes usar una cuenta diferente a la de Google Ads.
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
