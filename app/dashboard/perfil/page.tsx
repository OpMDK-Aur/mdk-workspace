'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { 
  User, 
  Bell, 
  Calendar, 
  CheckSquare, 
  MessageSquare, 
  TrendingDown, 
  AlertTriangle,
  Mail,
  Save
} from 'lucide-react'

interface Colaborador {
  id: string
  nombre: string
  apellido: string | null
  email: string | null
  avatar_url: string | null
}

interface PreferenciasNotificaciones {
  id?: string
  colaborador_id: string
  reuniones_planificadas: boolean
  tareas_semana: boolean
  comentarios_cliente: boolean
  cpl_fuera_promedio: boolean
  cero_impresiones: boolean
  notificaciones_email: boolean
}

export default function PerfilPage() {
  const [colaborador, setColaborador] = useState<Colaborador | null>(null)
  const [preferencias, setPreferencias] = useState<PreferenciasNotificaciones | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const supabase = createClient()
    setLoading(true)

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    // Get colaborador
    const { data: colab } = await supabase
      .from('colaboradores')
      .select('id, nombre, apellido, email, avatar_url')
      .eq('id', user.id)
      .single()

    if (colab) {
      setColaborador(colab)

      // Get or create preferences
      const { data: prefs } = await supabase
        .from('preferencias_notificaciones')
        .select('*')
        .eq('colaborador_id', colab.id)
        .single()

      if (prefs) {
        setPreferencias(prefs)
      } else {
        // Create default preferences
        const defaultPrefs: PreferenciasNotificaciones = {
          colaborador_id: colab.id,
          reuniones_planificadas: true,
          tareas_semana: true,
          comentarios_cliente: true,
          cpl_fuera_promedio: true,
          cero_impresiones: true,
          notificaciones_email: false,
        }
        setPreferencias(defaultPrefs)
      }
    }

    setLoading(false)
  }

  async function savePreferences() {
    if (!preferencias || !colaborador) return
    
    const supabase = createClient()
    setSaving(true)

    const { error } = await supabase
      .from('preferencias_notificaciones')
      .upsert({
        ...preferencias,
        colaborador_id: colaborador.id,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'colaborador_id'
      })

    if (error) {
      toast.error('Error al guardar preferencias')
      console.error(error)
    } else {
      toast.success('Preferencias guardadas')
    }

    setSaving(false)
  }

  function updatePreference(key: keyof PreferenciasNotificaciones, value: boolean) {
    if (!preferencias) return
    setPreferencias({ ...preferencias, [key]: value })
  }

  const initials = colaborador
    ? `${colaborador.nombre?.[0] || ''}${colaborador.apellido?.[0] || ''}`.toUpperCase()
    : 'U'

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="container max-w-4xl py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Configuración</h1>
        <p className="text-muted-foreground">Administra tu cuenta y preferencias de notificaciones</p>
      </div>

      {/* Profile Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Cuenta
          </CardTitle>
          <CardDescription>Información de tu perfil</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={colaborador?.avatar_url || undefined} />
              <AvatarFallback className="text-xl">{initials}</AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-semibold text-lg">
                {colaborador?.nombre} {colaborador?.apellido}
              </h3>
              <p className="text-sm text-muted-foreground">{colaborador?.email}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notifications Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notificaciones
          </CardTitle>
          <CardDescription>Elige qué notificaciones deseas recibir</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* In-app notifications */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground">Notificaciones en la aplicación</h4>
            
            <div className="flex items-center justify-between py-3 border-b border-border">
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-blue-400 mt-0.5" />
                <div>
                  <Label htmlFor="reuniones" className="font-medium">Reuniones planificadas</Label>
                  <p className="text-sm text-muted-foreground">
                    Recibe recordatorios de reuniones próximas
                  </p>
                </div>
              </div>
              <Switch
                id="reuniones"
                checked={preferencias?.reuniones_planificadas ?? true}
                onCheckedChange={(v) => updatePreference('reuniones_planificadas', v)}
              />
            </div>

            <div className="flex items-center justify-between py-3 border-b border-border">
              <div className="flex items-start gap-3">
                <CheckSquare className="h-5 w-5 text-amber-400 mt-0.5" />
                <div>
                  <Label htmlFor="tareas" className="font-medium">Tareas de la semana</Label>
                  <p className="text-sm text-muted-foreground">
                    Notificaciones de tareas que vencen esta semana
                  </p>
                </div>
              </div>
              <Switch
                id="tareas"
                checked={preferencias?.tareas_semana ?? true}
                onCheckedChange={(v) => updatePreference('tareas_semana', v)}
              />
            </div>

            <div className="flex items-center justify-between py-3 border-b border-border">
              <div className="flex items-start gap-3">
                <MessageSquare className="h-5 w-5 text-green-400 mt-0.5" />
                <div>
                  <Label htmlFor="comentarios" className="font-medium">Comentarios en clientes asignados</Label>
                  <p className="text-sm text-muted-foreground">
                    Nuevos comentarios en clientes que tienes asignados
                  </p>
                </div>
              </div>
              <Switch
                id="comentarios"
                checked={preferencias?.comentarios_cliente ?? true}
                onCheckedChange={(v) => updatePreference('comentarios_cliente', v)}
              />
            </div>

            <div className="flex items-center justify-between py-3 border-b border-border">
              <div className="flex items-start gap-3">
                <TrendingDown className="h-5 w-5 text-red-400 mt-0.5" />
                <div>
                  <Label htmlFor="cpl" className="font-medium">CPL fuera del promedio</Label>
                  <p className="text-sm text-muted-foreground">
                    Alertas cuando el CPL está fuera del rango esperado
                  </p>
                </div>
              </div>
              <Switch
                id="cpl"
                checked={preferencias?.cpl_fuera_promedio ?? true}
                onCheckedChange={(v) => updatePreference('cpl_fuera_promedio', v)}
              />
            </div>

            <div className="flex items-center justify-between py-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-orange-400 mt-0.5" />
                <div>
                  <Label htmlFor="impresiones" className="font-medium">0 impresiones</Label>
                  <p className="text-sm text-muted-foreground">
                    Alertas cuando una campaña tiene 0 impresiones
                  </p>
                </div>
              </div>
              <Switch
                id="impresiones"
                checked={preferencias?.cero_impresiones ?? true}
                onCheckedChange={(v) => updatePreference('cero_impresiones', v)}
              />
            </div>
          </div>

          <Separator />

          {/* Email notifications */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground">Notificaciones por correo electrónico</h4>
            
            <div className="flex items-center justify-between py-3">
              <div className="flex items-start gap-3">
                <Mail className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <Label htmlFor="email-notif" className="font-medium">Enviar notificaciones por email</Label>
                  <p className="text-sm text-muted-foreground">
                    Recibe un resumen de las notificaciones importantes en tu correo
                  </p>
                </div>
              </div>
              <Switch
                id="email-notif"
                checked={preferencias?.notificaciones_email ?? false}
                onCheckedChange={(v) => updatePreference('notificaciones_email', v)}
              />
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={savePreferences} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Guardando...' : 'Guardar preferencias'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
