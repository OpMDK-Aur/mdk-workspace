MDK Sistema Operativo

Plataforma interna de operaciones para Madketing (MDK), agencia de marketing digital. Reemplaza herramientas externas como Notion y Clockify, centralizando gestión de clientes, tareas, time tracking, agentes de IA, performance publicitaria, CRM y operaciones de equipo en un único sistema.

🔗 Producción: app.madketing.io


Stack técnico

CapaTecnologíaFrameworkNext.js 15 (App Router) + React 19 + TypeScriptEstilosTailwind CSS v4 + shadcn/ui + Tabler IconsBase de datosSupabase (PostgreSQL + Auth + Storage)Hosting / CronVercel (vercel.json, @vercel/functions waitUntil)Generación de UIV0IAVercel AI SDK (ai, @ai-sdk/openai, @ai-sdk/react), modelos ClaudeEstado clienteZustand (persistencia en localStorage para el timer)OtrosSWR, Zod, react-hook-form, jsPDF, xlsx, googleapis


Estructura del proyecto

app/
  actions/          Server Actions (onboarding, perfil, hitos, config de plataformas)
  api/
    admin/          Gestión de usuarios y accesos
    agentes/        Endpoints de agentes IA (Analista, Redactor, RevOps, Controller config)
    ads/             Integraciones Meta Ads / Google Ads
    controller/      Motor de alertas del Agente Controller
    cron/            Jobs programados (close-month, expire-hito-tasks, nps-autofill, tester)
    tester/          Agente Tester (verificación de integraciones de clientes)
    crm/, ghl/        Integraciones CRM (GoHighLevel, Aurelia, etc.)
    google/, google-ads/, google-sheets/   OAuth y reportes de Google
    notifications/    Generación de notificaciones internas
  dashboard/         Rutas autenticadas (clientes, tareas, equipo, reportes, agentes, admin)
  analista/          Chat full-page del Agente Analista (fuera de /dashboard a propósito)
  auth/              Login, signup, callbacks OAuth

components/
  agentes/           UI de Controller, Tester, Redactor, RevOps
  cliente/           Vista y gestión de un cliente
  dashboard/         Layout, sidebar, paneles de overview, CRM, saldos
  tasks/             Kanban, calendario, detalle de tarea, modales
  time-tracking/, time-entries/, timer/   Registro de horas (ver nota de duplicación abajo)
  chat/              Bloques de mensajería para agentes (texto, imagen, PDF, charts)
  ui/                Componentes shadcn/ui

lib/
  supabase/          Clientes server / browser / admin / middleware
  google-ads/         Builder de queries, config
  analista/           Conversaciones y export a PDF
  tasks/, time-tracking/  Stores y tipos
  types.ts            Tipos centrales del dominio
  service-map.ts       Mapeo de categorías de servicios contratados
  permissions.ts        Lógica de roles (Master / Usuario / Lector)

scripts/             Migraciones SQL sueltas e imports de Clockify (no versionadas como migration tool)


Variables de entorno

bash# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # solo server-side, nunca exponer al cliente

# App
NEXT_PUBLIC_APP_URL=
VERCEL_URL=

# Cron
CRON_SECRET=                      # protege endpoints /api/cron/*

# Meta Ads
META_ADS_ACCESS_TOKEN=
META_API_VERSION=

# Google Ads
GOOGLE_ADS_DEVELOPER_TOKEN=
GOOGLE_ADS_LOGIN_CUSTOMER_ID=
GOOGLE_ADS_ACCESS_TOKEN=
GOOGLE_ADS_REFRESH_TOKEN=
GOOGLE_ADS_API_VERSION=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Google Calendar
GOOGLE_CALENDAR_ACCESS_TOKEN=
GOOGLE_CALENDAR_REFRESH_TOKEN=

# Discord
DISCORD_BOT_TOKEN=


Nota: este proyecto no trae .env.example. Se recomienda agregar uno (ver sección de recomendaciones).




Scripts

bashpnpm dev      # desarrollo local
pnpm build    # build de producción
pnpm start    # servidor de producción
pnpm lint     # eslint

⚠️ Actualmente next.config.mjs tiene typescript.ignoreBuildErrors: true y eslint.ignoreDuringBuilds: true, por lo que pnpm build no falla ante errores de tipos o lint. Ver recomendaciones.


Convenciones del proyecto


Idioma de dominio: nombres de tablas, columnas y muchas variables de negocio están en español (colaboradores, clientes, tareas, entradas_de_tiempo, etc.), mientras que el código (funciones, componentes) sigue convención en inglés. Mantener esta separación de forma consistente.
Roles: Master / Usuario / Lector, definidos en lib/permissions.ts.
Arrays nativos en Postgres: columnas como project_manager_ids, account_manager_ids, asignados_a son uuid[]. Usar = ANY() para filtrar y array_replace() para reemplazar valores.
Agentes IA: Controller (alertas Meta/Google Ads vía cron diario), Tester (verificación semanal de integraciones), Analista (chat con AI SDK, vive fuera de /dashboard para no heredar el DashboardShell), Redactor y RevOps (en components/agentes).
Cron jobs: se registran en vercel.json y se protegen comparando el header Authorization: Bearer <CRON_SECRET>.



Indicación para V0 (si vas a regenerar/ajustar UI)

Al pedirle a V0 que genere o edite componentes de este proyecto, conviene incluir este contexto en el prompt:

Este componente forma parte de "MDK Sistema Operativo", una app interna en Next.js 15 + React 19 + TypeScript.

Reglas:
- Es un componente de UI puro: recibe datos por props, sin imports de Supabase ni de server actions dentro del componente.
- Usar shadcn/ui (ya instalado, ver components.json) y Tabler Icons (@tabler/icons-react), no lucide salvo que ya esté en uso en el archivo.
- Tema oscuro: fondo #0f0f0f, color de acento #7F77DD.
- Tipá explícitamente todas las props con TypeScript (sin "any").
- Mantené el componente enfocado: si supera ~300 líneas, dividilo en subcomponentes dentro de la misma carpeta.
- Las acciones de datos (fetch/insert/update) van en server actions o en app/api, no inline en el componente.
- Usar Sonner para toasts y los estados de carga/error existentes en el proyecto (no inventar nuevos patrones).
- Nombres de campos de negocio en español (igual que las tablas de Supabase: clientes, tareas, colaboradores, etc.), nombres de funciones/variables de código en inglés.

Pegale esto como contexto fijo antes de cada prompt específico de componente.
