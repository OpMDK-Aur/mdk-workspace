'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, AlertCircle, RefreshCw, Loader2, Calendar, Hash } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface TokenInfo {
  email_conectado: string | null
  token_expiry: string | null
  updated_at: string | null
}

interface DiscordInfo {
  discord_id: string | null
  discord_username: string | null
}

interface PlatformConnectionPanelProps {
  googleToken: TokenInfo | null
  googleCalendarToken: TokenInfo | null
  discordInfo: DiscordInfo | null
  appUrl: string
}

export function PlatformConnectionPanel({ googleToken, googleCalendarToken, discordInfo, appUrl }: PlatformConnectionPanelProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [loadingAds, setLoadingAds] = useState(false)
  const [loadingCalendar, setLoadingCalendar] = useState(false)
  const [loadingDiscord, setLoadingDiscord] = useState(false)

  // Handle URL params for success/error messages
  useEffect(() => {
    const connected = searchParams.get('connected')
    const discord = searchParams.get('discord')
    const error = searchParams.get('error')

    if (connected === 'google' || connected === 'google_ads') {
      setNotice({ type: 'success', message: 'Cuenta de Google Ads conectada correctamente.' })
      router.replace('/dashboard/apps')
      return
    }
    if (connected === 'google_calendar') {
      setNotice({ type: 'success', message: 'Cuenta de Google Calendar conectada correctamente.' })
      router.replace('/dashboard/apps')
      return
    }
    if (discord === 'connected') {
      setNotice({ type: 'success', message: 'Cuenta de Discord conectada correctamente.' })
      router.replace('/dashboard/apps')
      return
    }
    if (discord === 'error') {
      setNotice({ type: 'error', message: 'Error al conectar con Discord.' })
      router.replace('/dashboard/apps')
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
      router.replace('/dashboard/apps')
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

  const handleConnectDiscord = async () => {
    setLoadingDiscord(true)
    const supabase = createClient()
    
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard/platform`,
        scopes: 'identify email',
      },
    })
    
    if (error) {
      console.error('[v0] Discord OAuth error:', error)
      setNotice({ type: 'error', message: `Error al conectar con Discord: ${error.message}` })
      setLoadingDiscord(false)
    }
  }

  const isAdsConnected = Boolean(googleToken)
  const isCalendarConnected = Boolean(googleCalendarToken)
  const isDiscordConnected = Boolean(discordInfo?.discord_id)
  
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

      {/* Discord Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#5865F2] shrink-0">
                <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
              </div>
              <div>
                <CardTitle className="text-base">Discord</CardTitle>
                {discordInfo?.discord_username && (
                  <p className="text-xs text-muted-foreground mt-0.5">{discordInfo.discord_username}</p>
                )}
              </div>
              {isDiscordConnected ? (
                <Badge className="bg-[#5865F2]/15 text-[#5865F2] border-[#5865F2]/20 text-xs">
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
              <Button
                size="sm"
                variant={isDiscordConnected ? 'outline' : 'default'}
                className={`gap-2 h-8 ${!isDiscordConnected ? 'bg-[#5865F2] hover:bg-[#4752C4]' : ''}`}
                onClick={handleConnectDiscord}
                disabled={loadingDiscord}
              >
                {loadingDiscord ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : isDiscordConnected ? (
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

        {!isDiscordConnected && (
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Conecta tu cuenta de Discord para recibir notificaciones y comunicarte con el equipo directamente desde la plataforma.
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
