'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useTheme } from 'next-themes'
import { updateProfile } from '@/app/actions/update-profile'
import { completeOnboarding } from '@/app/actions/complete-onboarding'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Check, ChevronRight, ChevronLeft, Sun, Moon, Monitor } from 'lucide-react'

// ─── AVATAR OPTIONS ────────────────────────────────────────────────────────────
const AVATARS = [
  {
    id: 'astronaut',
    label: 'Astronauta',
    description: 'Explorador del espacio digital',
    src: '/avatars/astronaut.jpg',
    hue: 220,
    palette: ['oklch(0.68 0.17 220)', 'oklch(0.55 0.14 220)', 'oklch(0.45 0.12 220)'],
    themeSuggestion: 'dark' as const,
  },
  {
    id: 'galaxy',
    label: 'Espacial',
    description: 'Navegante de galaxias remotas',
    src: '/avatars/galaxy.jpg',
    hue: 270,
    palette: ['oklch(0.65 0.20 270)', 'oklch(0.52 0.18 270)', 'oklch(0.42 0.15 270)'],
    themeSuggestion: 'dark' as const,
  },
  {
    id: 'planet',
    label: 'Planeta',
    description: 'Guardián de mundos verdes',
    src: '/avatars/planet.jpg',
    hue: 175,
    palette: ['oklch(0.62 0.16 175)', 'oklch(0.52 0.14 175)', 'oklch(0.44 0.12 175)'],
    themeSuggestion: 'system' as const,
  },
  {
    id: 'rocket',
    label: 'Cohete',
    description: 'Velocidad y ambición sin límites',
    src: '/avatars/rocket.jpg',
    hue: 48,
    palette: ['oklch(0.68 0.19 48)', 'oklch(0.58 0.17 48)', 'oklch(0.50 0.15 48)'],
    themeSuggestion: 'system' as const,
  },
  {
    id: 'moon',
    label: 'Luna',
    description: 'Tranquilo, preciso y luminoso',
    src: '/avatars/moon.jpg',
    hue: 65,
    palette: ['oklch(0.75 0.14 65)', 'oklch(0.62 0.12 65)', 'oklch(0.52 0.10 65)'],
    themeSuggestion: 'light' as const,
  },
  {
    id: 'satellite',
    label: 'Satélite',
    description: 'Conectado a todo, siempre',
    src: '/avatars/satellite.jpg',
    hue: 200,
    palette: ['oklch(0.60 0.15 200)', 'oklch(0.50 0.13 200)', 'oklch(0.42 0.11 200)'],
    themeSuggestion: 'dark' as const,
  },
]

// ─── ROLE OPTIONS ──────────────────────────────────────────────────────────────
const ROLES = [
  {
    value: 'project_manager',
    label: 'Project Manager',
    description: 'Lidera proyectos y coordina equipos',
    icon: '🎯',
  },
  {
    value: 'account_executive',
    label: 'Account Executive',
    description: 'Gestiona relaciones con clientes',
    icon: '🤝',
  },
  {
    value: 'editor',
    label: 'Editor',
    description: 'Crea y edita contenido multimedia',
    icon: '✂️',
  },
  {
    value: 'designer',
    label: 'Designer',
    description: 'Diseña experiencias visuales',
    icon: '🎨',
  },
  {
    value: 'analyst',
    label: 'Analyst',
    description: 'Analiza datos y genera insights',
    icon: '📊',
  },
] as const

type RoleValue = typeof ROLES[number]['value']

// ─── COLOR PALETTES ────────────────────────────────────────────────────────────
const COLOR_PALETTES = [
  { label: 'Naranja MDK', hue: 48,  swatch: 'oklch(0.68 0.19 48)' },
  { label: 'Azul cosmos', hue: 220, swatch: 'oklch(0.65 0.17 220)' },
  { label: 'Violeta',     hue: 270, swatch: 'oklch(0.62 0.20 270)' },
  { label: 'Verde luna',  hue: 175, swatch: 'oklch(0.58 0.16 175)' },
  { label: 'Dorado',      hue: 65,  swatch: 'oklch(0.72 0.14 65)' },
  { label: 'Coral',       hue: 24,  swatch: 'oklch(0.62 0.20 24)' },
  { label: 'Cian',        hue: 195, swatch: 'oklch(0.62 0.14 195)' },
  { label: 'Rosa',        hue: 340, swatch: 'oklch(0.64 0.18 340)' },
]

// ─── STARS ─────────────────────────────────────────────────────────────────────
function Stars() {
  const [stars, setStars] = useState<{ style: React.CSSProperties }[]>([])
  useEffect(() => {
    setStars(
      Array.from({ length: 50 }, () => ({
        style: {
          width: `${Math.random() * 2.5 + 0.5}px`,
          height: `${Math.random() * 2.5 + 0.5}px`,
          top: `${Math.random() * 100}%`,
          left: `${Math.random() * 100}%`,
          animationDelay: `${Math.random() * 4}s`,
          animationDuration: `${Math.random() * 3 + 2}s`,
          opacity: Math.random() * 0.6 + 0.1,
        },
      }))
    )
  }, [])
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {stars.map((s, i) => (
        <div key={i} className="absolute rounded-full bg-white animate-pulse" style={s.style} />
      ))}
    </div>
  )
}

// ─── STEP INDICATOR ────────────────────────────────────────────────────────────
function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={cn(
            'rounded-full transition-all duration-300',
            i < current
              ? 'w-6 h-2 bg-primary'
              : i === current
                ? 'w-8 h-2 bg-primary'
                : 'w-2 h-2 bg-white/20'
          )}
        />
      ))}
    </div>
  )
}

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────────
interface OnboardingFlowProps {
  userName: string
}

export function OnboardingFlow({ userName }: OnboardingFlowProps) {
  const router = useRouter()
  const { setTheme } = useTheme()

  const [step, setStep] = useState(0)
  const [name, setName] = useState(userName)
  const [selectedAvatar, setSelectedAvatar] = useState<typeof AVATARS[0] | null>(null)
  const [selectedRole, setSelectedRole] = useState<RoleValue | null>(null)
  const [selectedHue, setSelectedHue] = useState(48)
  const [selectedTheme, setSelectedTheme] = useState<'light' | 'dark' | 'system'>('system')
  const [saving, setSaving] = useState(false)

  const TOTAL_STEPS = 4

  // Preview color in real-time
  useEffect(() => {
    document.documentElement.style.setProperty('--primary', `oklch(0.68 0.19 ${selectedHue})`)
    document.documentElement.style.setProperty('--accent', `oklch(0.68 0.19 ${selectedHue})`)
    document.documentElement.style.setProperty('--ring', `oklch(0.68 0.19 ${selectedHue})`)
  }, [selectedHue])

  // When avatar selected, suggest theme + hue
  const handleAvatarSelect = (avatar: typeof AVATARS[0]) => {
    setSelectedAvatar(avatar)
    setSelectedHue(avatar.hue)
    setSelectedTheme(avatar.themeSuggestion)
    setTheme(avatar.themeSuggestion)
  }

  const handleThemeChange = (t: 'light' | 'dark' | 'system') => {
    setSelectedTheme(t)
    setTheme(t)
  }

  const handleFinish = async () => {
    setSaving(true)
    // completeOnboarding is a server action that sets onboarding_completed = true
    // and calls redirect('/dashboard') server-side, bypassing any RSC cache issues
    await completeOnboarding({
      full_name: name,
      avatar_url: selectedAvatar ? `/avatars/${selectedAvatar.id}.jpg` : null,
      role: selectedRole || 'editor',
      theme: selectedTheme,
      accent_hue: selectedHue,
    })
    // redirect() in the server action throws NEXT_REDIRECT — execution stops here
  }

  // ── STEP 0: Bienvenida ──────────────────────────────────────────────────────
  const StepWelcome = (
    <div className="animate-fade-up space-y-6">
      <div className="space-y-2">
        <p className="text-primary text-sm font-semibold tracking-widest uppercase">Bienvenido a MDK</p>
        <h1 className="text-4xl md:text-5xl font-bold text-white leading-tight text-balance">
          Hola, {name.split(' ')[0] || 'astronauta'}
        </h1>
        <p className="text-white/50 text-lg leading-relaxed">
          Antes de despegar, personaliza tu espacio de trabajo. Solo toma un minuto.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-white/60 text-sm font-medium">Como te llamamos?</label>
        <input
          className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-white placeholder:text-white/25 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
          placeholder="Tu nombre"
          value={name}
          onChange={e => setName(e.target.value)}
        />
      </div>

      <Button
        className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl gap-2 transition-all hover:shadow-lg hover:shadow-primary/25"
        onClick={() => setStep(1)}
        disabled={!name.trim()}
      >
        Empezar a personalizar
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )

  // ── STEP 1: Elegir avatar ───────────────────────────────────────────────────
  const StepAvatar = (
    <div className="animate-fade-up space-y-6">
      <div className="space-y-1">
        <p className="text-primary text-sm font-semibold tracking-widest uppercase">Paso 1 de 3</p>
        <h2 className="text-3xl font-bold text-white">Elige tu identidad</h2>
        <p className="text-white/50">Cada personaje trae su propia paleta y estilo visual.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {AVATARS.map(avatar => (
          <button
            key={avatar.id}
            onClick={() => handleAvatarSelect(avatar)}
            className={cn(
              'group relative rounded-2xl overflow-hidden border-2 transition-all duration-200',
              selectedAvatar?.id === avatar.id
                ? 'border-primary shadow-lg shadow-primary/30 scale-105'
                : 'border-white/10 hover:border-white/30 hover:scale-102'
            )}
          >
            <div className="aspect-square relative">
              <Image
                src={avatar.src}
                alt={avatar.label}
                fill
                className="object-cover"
              />
              {/* Overlay */}
              <div className={cn(
                'absolute inset-0 transition-opacity duration-200',
                selectedAvatar?.id === avatar.id
                  ? 'bg-primary/20'
                  : 'bg-black/20 group-hover:bg-black/10'
              )} />
              {/* Check mark */}
              {selectedAvatar?.id === avatar.id && (
                <div className="absolute top-2 right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center shadow-lg">
                  <Check className="h-3.5 w-3.5 text-white" />
                </div>
              )}
            </div>
            <div className="p-2 bg-black/40 backdrop-blur-sm">
              <p className="text-white text-xs font-semibold text-center">{avatar.label}</p>
            </div>
          </button>
        ))}
      </div>

      {selectedAvatar && (
        <div className="animate-fade-up p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-4">
          <div className="flex gap-1.5">
            {selectedAvatar.palette.map((color, i) => (
              <div key={i} className="w-5 h-5 rounded-full" style={{ background: color }} />
            ))}
          </div>
          <div>
            <p className="text-white text-sm font-medium">{selectedAvatar.label}</p>
            <p className="text-white/40 text-xs">{selectedAvatar.description}</p>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Button
          variant="ghost"
          className="flex-1 h-11 text-white/60 hover:text-white hover:bg-white/5 rounded-xl gap-2"
          onClick={() => setStep(0)}
        >
          <ChevronLeft className="h-4 w-4" />
          Volver
        </Button>
        <Button
          className="flex-1 h-11 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl gap-2 transition-all hover:shadow-lg hover:shadow-primary/25"
          onClick={() => setStep(2)}
          disabled={!selectedAvatar}
        >
          Continuar
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )

  // ── STEP 2: Elegir rol ──────────────────────────────────────────────────────
  const StepRole = (
    <div className="animate-fade-up space-y-6">
      <div className="space-y-1">
        <p className="text-primary text-sm font-semibold tracking-widest uppercase">Paso 2 de 3</p>
        <h2 className="text-3xl font-bold text-white">Cual es tu rol?</h2>
        <p className="text-white/50">Esto nos ayuda a personalizar tu experiencia.</p>
      </div>

      <div className="space-y-3">
        {ROLES.map(role => (
          <button
            key={role.value}
            onClick={() => setSelectedRole(role.value)}
            className={cn(
              'w-full p-4 rounded-2xl border-2 flex items-center gap-4 transition-all duration-200 text-left',
              selectedRole === role.value
                ? 'border-primary bg-primary/10 scale-[1.02]'
                : 'border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/8'
            )}
          >
            <div className="text-2xl">{role.icon}</div>
            <div className="flex-1">
              <p className={cn(
                'font-semibold',
                selectedRole === role.value ? 'text-white' : 'text-white/80'
              )}>
                {role.label}
              </p>
              <p className="text-white/40 text-sm">{role.description}</p>
            </div>
            {selectedRole === role.value && (
              <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                <Check className="h-3.5 w-3.5 text-white" />
              </div>
            )}
          </button>
        ))}
      </div>

      <div className="flex gap-3">
        <Button
          variant="ghost"
          className="flex-1 h-11 text-white/60 hover:text-white hover:bg-white/5 rounded-xl gap-2"
          onClick={() => setStep(1)}
        >
          <ChevronLeft className="h-4 w-4" />
          Volver
        </Button>
        <Button
          className="flex-1 h-11 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl gap-2 transition-all hover:shadow-lg hover:shadow-primary/25"
          onClick={() => setStep(3)}
          disabled={!selectedRole}
        >
          Continuar
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )

  // ── STEP 3: Color + Tema ────────────────────────────────────────────────────
  const StepColorTheme = (
    <div className="animate-fade-up space-y-6">
      <div className="space-y-1">
        <p className="text-primary text-sm font-semibold tracking-widest uppercase">Paso 3 de 3</p>
        <h2 className="text-3xl font-bold text-white">Tu paleta de colores</h2>
        <p className="text-white/50">Elige el color principal y el modo visual de tu plataforma.</p>
      </div>

      {/* Color picker */}
      <div className="space-y-3">
        <p className="text-white/60 text-sm font-medium">Color principal</p>
        <div className="grid grid-cols-4 gap-3">
          {COLOR_PALETTES.map(palette => (
            <button
              key={palette.hue}
              onClick={() => setSelectedHue(palette.hue)}
              className={cn(
                'group relative h-12 rounded-xl border-2 transition-all duration-200 flex flex-col items-center justify-center gap-1',
                selectedHue === palette.hue
                  ? 'border-white scale-105 shadow-lg'
                  : 'border-transparent hover:border-white/30 hover:scale-102'
              )}
              style={{ background: palette.swatch }}
              title={palette.label}
            >
              {selectedHue === palette.hue && (
                <Check className="h-4 w-4 text-white drop-shadow" />
              )}
            </button>
          ))}
        </div>
        <p className="text-white/40 text-xs">
          {COLOR_PALETTES.find(p => p.hue === selectedHue)?.label ?? 'Color personalizado'}
        </p>
      </div>

      {/* Theme selector */}
      <div className="space-y-3">
        <p className="text-white/60 text-sm font-medium">Modo visual</p>
        <div className="grid grid-cols-3 gap-3">
          {([
            { value: 'light', label: 'Claro', icon: Sun },
            { value: 'dark',  label: 'Oscuro', icon: Moon },
            { value: 'system', label: 'Sistema', icon: Monitor },
          ] as const).map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => handleThemeChange(value)}
              className={cn(
                'h-20 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all duration-200',
                selectedTheme === value
                  ? 'border-primary bg-primary/20 scale-105'
                  : 'border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/8'
              )}
            >
              <Icon className={cn('h-5 w-5', selectedTheme === value ? 'text-primary' : 'text-white/50')} />
              <span className={cn('text-xs font-medium', selectedTheme === value ? 'text-white' : 'text-white/50')}>
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Preview pill */}
      <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg shrink-0"
            style={{ background: `oklch(0.68 0.19 ${selectedHue})` }}
          />
          <div>
            <p className="text-white text-sm font-medium">Vista previa activa</p>
            <p className="text-white/40 text-xs">Los cambios ya se aplican en tiempo real</p>
          </div>
        </div>
        <div className="w-2 h-2 bg-status-verde rounded-full animate-pulse" />
      </div>

      <div className="flex gap-3">
        <Button
          variant="ghost"
          className="flex-1 h-11 text-white/60 hover:text-white hover:bg-white/5 rounded-xl gap-2"
          onClick={() => setStep(2)}
        >
          <ChevronLeft className="h-4 w-4" />
          Volver
        </Button>
        <Button
          className="flex-1 h-11 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl gap-2 transition-all hover:shadow-lg hover:shadow-primary/25"
          onClick={handleFinish}
          disabled={saving}
        >
          {saving ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Guardando...
            </div>
          ) : (
            <>
              Lanzar mi plataforma
              <ChevronRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  )

  const steps = [StepWelcome, StepAvatar, StepRole, StepColorTheme]

  return (
    <div className="min-h-screen bg-[oklch(0.10_0.012_245)] flex items-center justify-center relative overflow-hidden">
      <Stars />

      {/* Glow orbs */}
      <div
        className="absolute top-1/4 right-1/3 w-[500px] h-[500px] rounded-full blur-3xl pointer-events-none transition-all duration-1000"
        style={{ background: `oklch(0.55 0.18 ${selectedHue} / 0.08)` }}
      />
      <div
        className="absolute bottom-1/4 left-1/4 w-[300px] h-[300px] rounded-full blur-3xl pointer-events-none transition-all duration-1000"
        style={{ background: `oklch(0.45 0.14 ${selectedHue} / 0.06)` }}
      />

      {/* Floating avatar preview */}
      {selectedAvatar && (
        <div className="hidden lg:block absolute right-16 top-1/2 -translate-y-1/2 animate-float-slow pointer-events-none">
          <div className="relative w-48 h-48 rounded-3xl overflow-hidden border-2 border-white/10 shadow-2xl">
            <Image
              src={selectedAvatar.src}
              alt={selectedAvatar.label}
              fill
              className="object-cover"
            />
          </div>
        </div>
      )}

      {/* Card */}
      <div className="w-full max-w-md mx-4 relative z-10">
        <div className="glass rounded-3xl p-8 shadow-2xl">
          {/* Top bar: logo + step indicator */}
          <div className="flex items-center justify-between mb-8">
            <p className="text-white/30 text-sm font-semibold tracking-wider uppercase">MDK Workspace</p>
            <StepIndicator current={step} total={TOTAL_STEPS} />
          </div>

          {steps[step]}
        </div>
      </div>
    </div>
  )
}
