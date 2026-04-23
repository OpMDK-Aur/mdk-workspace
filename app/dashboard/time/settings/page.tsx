'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Info } from 'lucide-react'

// localStorage keys
const IDLE_REMINDER_KEY = 'timer-idle-reminder-minutes'
const LONG_SESSION_KEY = 'timer-long-session-hours'

export default function TimeSettingsPage() {
  const [autoStopTimer, setAutoStopTimer] = useState(false)
  const [defaultBillable, setDefaultBillable] = useState(true)
  const [weekStart, setWeekStart] = useState('monday')
  const [timeFormat, setTimeFormat] = useState('24h')
  
  // Alert settings
  const [idleReminderMinutes, setIdleReminderMinutes] = useState('30')
  const [longSessionHours, setLongSessionHours] = useState('3')

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedIdleReminder = localStorage.getItem(IDLE_REMINDER_KEY)
    const savedLongSession = localStorage.getItem(LONG_SESSION_KEY)
    
    if (savedIdleReminder) setIdleReminderMinutes(savedIdleReminder)
    if (savedLongSession) setLongSessionHours(savedLongSession)
  }, [])

  const handleSettingChange = (setting: string) => {
    toast.success(`${setting} actualizado`)
  }

  const handleIdleReminderChange = (value: string) => {
    setIdleReminderMinutes(value)
    localStorage.setItem(IDLE_REMINDER_KEY, value)
    handleSettingChange('Recordatorio de inactividad')
  }

  const handleLongSessionChange = (value: string) => {
    setLongSessionHours(value)
    localStorage.setItem(LONG_SESSION_KEY, value)
    handleSettingChange('Alerta de sesión larga')
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configura tus preferencias de time tracking
        </p>
      </div>

      <div className="space-y-6">
        {/* Alert Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configuración de alertas de tiempo</CardTitle>
            <CardDescription>
              Recibe notificaciones para mantenerte productivo
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="idle-reminder" className="font-medium">
                  Alertar si no hay timer activo después de
                </Label>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Te recordaremos iniciar un timer si estás inactivo
                </p>
              </div>
              <Select
                value={idleReminderMinutes}
                onValueChange={handleIdleReminderChange}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 min</SelectItem>
                  <SelectItem value="30">30 min</SelectItem>
                  <SelectItem value="45">45 min</SelectItem>
                  <SelectItem value="60">1 hora</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="long-session" className="font-medium">
                  Avisar si llevo más de X horas en el mismo cliente
                </Label>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Alerta para sesiones de trabajo muy largas
                </p>
              </div>
              <Select
                value={longSessionHours}
                onValueChange={handleLongSessionChange}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 hora</SelectItem>
                  <SelectItem value="2">2 horas</SelectItem>
                  <SelectItem value="3">3 horas</SelectItem>
                  <SelectItem value="4">4 horas</SelectItem>
                  <SelectItem value="0">No avisar</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Auto-switch info card */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Al cambiar de cliente con un timer activo
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Se detiene el timer anterior automáticamente y se inicia uno nuevo para el cliente seleccionado.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Timer Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configuración del Timer</CardTitle>
            <CardDescription>
              Configura el comportamiento del timer
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="auto-stop" className="font-medium">
                  Detener timer a medianoche
                </Label>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Detiene automáticamente los timers activos a las 12:00 AM
                </p>
              </div>
              <Switch
                id="auto-stop"
                checked={autoStopTimer}
                onCheckedChange={(checked) => {
                  setAutoStopTimer(checked)
                  handleSettingChange('Detener a medianoche')
                }}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="default-billable" className="font-medium">
                  Facturable por defecto
                </Label>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Las nuevas entradas son facturables por defecto
                </p>
              </div>
              <Switch
                id="default-billable"
                checked={defaultBillable}
                onCheckedChange={(checked) => {
                  setDefaultBillable(checked)
                  handleSettingChange('Facturable por defecto')
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Display Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configuración de visualización</CardTitle>
            <CardDescription>
              Personaliza cómo se muestra el tiempo
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="week-start" className="font-medium">
                  La semana comienza el
                </Label>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Primer día de la semana en los reportes
                </p>
              </div>
              <Select
                value={weekStart}
                onValueChange={(val) => {
                  setWeekStart(val)
                  handleSettingChange('Inicio de semana')
                }}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monday">Lunes</SelectItem>
                  <SelectItem value="sunday">Domingo</SelectItem>
                  <SelectItem value="saturday">Sábado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="time-format" className="font-medium">
                  Formato de hora
                </Label>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Cómo se muestra la hora en la app
                </p>
              </div>
              <Select
                value={timeFormat}
                onValueChange={(val) => {
                  setTimeFormat(val)
                  handleSettingChange('Formato de hora')
                }}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">24 horas (14:30)</SelectItem>
                  <SelectItem value="12h">12 horas (2:30 PM)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
