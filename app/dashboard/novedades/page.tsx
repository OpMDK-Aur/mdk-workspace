'use client'

import {
  SlidersHorizontal,
  LineChart,
  ClipboardCheck,
  PenLine,
  Gauge,
  Smile,
  ArrowUpRight,
  MapPin,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

type Agente = {
  nombre: string
  icono: React.ElementType
  descripcion: string
  ubicacion: string
  href?: string
}

const agentes: Agente[] = [
  {
    nombre: 'Controller',
    icono: SlidersHorizontal,
    descripcion:
      'Se configura una alerta por única vez y el sistema actualiza automáticamente el tablero de Performance con las alertas configuradas.',
    ubicacion: 'Panel de Performance y pestaña Agentes',
    href: '/dashboard/performance',
  },
  {
    nombre: 'Analista',
    icono: LineChart,
    descripcion: 'Genera informes de cierre de mes.',
    ubicacion: 'Tarea HITO de Informe Cierre de Mes o pestaña Agentes',
    href: '/dashboard/agentes',
  },
  {
    nombre: 'Tester',
    icono: ClipboardCheck,
    descripcion:
      'Testea integraciones de formularios de landing y de Meta. No sirve para testear IA ni chatbots.',
    ubicacion: 'Tarea HITO de Testing de Formulario o pestaña Agentes',
    href: '/dashboard/agentes',
  },
  {
    nombre: 'Redactor',
    icono: PenLine,
    descripcion:
      'Redacta el mensaje de inicio y cierre de semana con las métricas de los clientes.',
    ubicacion: 'Tarea HITO de Inicio y Cierre de Semana o pestaña Agentes',
    href: '/dashboard/agentes',
  },
  {
    nombre: 'RevOps',
    icono: Gauge,
    descripcion:
      'Analiza el uso del CRM (únicamente clientes con GoHighLevel) y devuelve un score definido por Consultoría.',
    ubicacion: 'Pestaña Agentes o tarjeta del cliente con ese CRM',
    href: '/dashboard/agentes',
  },
]

const pasos = [
  'Probar cada funcionalidad desde el lugar indicado en su tarjeta.',
  'Anotar cualquier error, comportamiento inesperado o sugerencia.',
  'Reportar los hallazgos al equipo de Operaciones antes del pase a producción.',
]

export default function NovedadesBeta() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-10 py-10 px-4">
      {/* Header */}
      <div className="space-y-3">
        <span className="text-xs font-medium uppercase tracking-wider text-[#7F77DD]">
          MDK Sistema Operativo
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">
            Novedades en beta
          </h1>
          <Badge className="border-[#7F77DD]/30 bg-[#7F77DD]/15 text-[#7F77DD] hover:bg-[#7F77DD]/15">
            Beta
          </Badge>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Nuevas funcionalidades para probar antes del pase a producción.
          Revisen cada sección, testeen desde el lugar indicado y reporten
          cualquier inconsistencia al equipo de Operaciones.
        </p>
      </div>

      <Separator />

      {/* Agentes IA */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">Agentes IA</h2>
          <p className="text-sm text-muted-foreground">
            Cinco agentes nuevos disponibles en el panel de Agentes.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {agentes.map((agente) => {
            const Icono = agente.icono
            return (
              <Card
                key={agente.nombre}
                className="border-border/60 bg-card/60 transition-colors hover:border-[#7F77DD]/40"
              >
                <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#7F77DD]/15 text-[#7F77DD]">
                      <Icono className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base font-medium">
                      {agente.nombre}
                    </CardTitle>
                  </div>
                  <Badge
                    variant="outline"
                    className="shrink-0 border-[#7F77DD]/30 text-[10px] text-[#7F77DD]"
                  >
                    Beta
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  <CardDescription className="text-sm leading-relaxed">
                    {agente.descripcion}
                  </CardDescription>
                  <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{agente.ubicacion}</span>
                  </div>
                  {agente.href && (
                    <a
                      href={agente.href}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#7F77DD] hover:underline pt-1"
                    >
                      Ir a {agente.nombre}
                      <ArrowUpRight className="h-3 w-3" />
                    </a>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      <Separator />

      {/* NPS */}
      <div className="space-y-4">
        <h2 className="text-lg font-medium">Envío de NPS</h2>
        <Card className="border-border/60 bg-card/60">
          <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#7F77DD]/15 text-[#7F77DD]">
                <Smile className="h-4 w-4" />
              </div>
              <CardTitle className="text-base font-medium">
                Clientes — vista de Lista
              </CardTitle>
            </div>
            <Badge
              variant="outline"
              className="shrink-0 border-[#7F77DD]/30 text-[10px] text-[#7F77DD]"
            >
              Beta
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <CardDescription className="text-sm leading-relaxed">
              Se sumó el envío de NPS desde la pestaña de Clientes, en la
              vista de Lista, junto con filtros para saber qué clientes
              respondieron la encuesta y cuáles no.
            </CardDescription>
            <a
              href="/dashboard/clients"
              className="inline-flex items-center gap-1 text-xs font-medium text-[#7F77DD] hover:underline"
            >
              Ir a Clientes
              <ArrowUpRight className="h-3 w-3" />
            </a>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Cómo testear */}
      <div className="space-y-4">
        <h2 className="text-lg font-medium">Cómo probar y reportar</h2>
        <ol className="space-y-3">
          {pasos.map((paso, i) => (
            <li key={i} className="flex items-start gap-3 text-sm">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#7F77DD]/15 text-[11px] font-medium text-[#7F77DD]">
                {i + 1}
              </span>
              <span className="text-muted-foreground">{paso}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
