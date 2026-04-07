'use client'

import { useState, useTransition, useEffect } from 'react'
import { useTheme } from 'next-themes'
import Image from 'next/image'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { updateProfile } from '@/app/actions/update-profile'
import { Check, Loader2, Sun, Moon, Monitor } from 'lucide-react'
import type { Profile } from '@/lib/types'
import type { User } from '@supabase/supabase-js'

const AVATARS = [
  { id: 'astronaut', src: '/avatars/astronaut.jpg', label: 'Astronauta' },
  { id: 'rocket', src: '/avatars/rocket.jpg', label: 'Cohete' },
  { id: 'planet', src: '/avatars/planet.jpg', label: 'Planeta' },
  { id: 'moon', src: '/avatars/moon.jpg', label: 'Luna' },
  { id: 'galaxy', src: '/avatars/galaxy.jpg', label: 'Galaxia' },
  { id: 'satellite', src: '/avatars/satellite.jpg', label: 'Satelite' },
]

const ACCENT_COLORS = [
  { hue: 55, label: 'Naranja', class: 'bg-orange-400' },
  { hue: 220, label: 'Azul', class: 'bg-blue-500' },
  { hue: 145, label: 'Verde', class: 'bg-emerald-500' },
  { hue: 280, label: 'Violeta', class: 'bg-violet-500' },
  { hue: 340, label: 'Rosa', class: 'bg-pink-500' },
  { hue: 25, label: 'Rojo', class: 'bg-red-500' },
  { hue: 190, label: 'Cyan', class: 'bg-cyan-500' },
  { hue: 60, label: 'Amarillo', class: 'bg-yellow-400' },
]

const THEMES = [
  { value: 'light' as const, label: 'Claro', icon: Sun },
  { value: 'dark' as const, label: 'Oscuro', icon: Moon },
  { value: 'system' as const, label: 'Sistema', icon: Monitor },
]

interface UserSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: User
  profile: Profile | null
}

export function UserSettingsDialog({ open, onOpenChange, user, profile }: UserSettingsDialogProps) {
  const { setTheme, theme } = useTheme()
  const [isPending, startTransition] = useTransition()

  const [fullName, setFullName] = useState(profile?.full_name || '')
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(profile?.avatar_url || null)
  const [selectedHue, setSelectedHue] = useState<number>(profile?.accent_hue ?? 55)
  const [selectedTheme, setSelectedTheme] = useState<'light' | 'dark' | 'system'>(
    (profile?.theme as 'light' | 'dark' | 'system') ?? 'system'
  )
  const [saved, setSaved] = useState(false)

  // Sync state when profile changes
  useEffect(() => {
    setFullName(profile?.full_name || '')
    setSelectedAvatar(profile?.avatar_url || null)
    setSelectedHue(profile?.accent_hue ?? 55)
    setSelectedTheme((profile?.theme as 'light' | 'dark' | 'system') ?? 'system')
  }, [profile])

  // Apply accent color live as user picks
  const applyAccentHue = (hue: number) => {
    setSelectedHue(hue)
    document.documentElement.style.setProperty(
      '--primary', `oklch(0.7 0.18 ${hue})`
    )
    document.documentElement.style.setProperty(
      '--accent', `oklch(0.7 0.18 ${hue})`
    )
    document.documentElement.style.setProperty(
      '--ring', `oklch(0.7 0.18 ${hue})`
    )
  }

  const handleThemeChange = (t: 'light' | 'dark' | 'system') => {
    setSelectedTheme(t)
    setTheme(t)
  }

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateProfile({
        full_name: fullName,
        avatar_url: selectedAvatar,
        theme: selectedTheme,
        accent_hue: selectedHue,
      })
      if (!result.error) {
        setSaved(true)
        setTimeout(() => {
          setSaved(false)
          onOpenChange(false)
        }, 1000)
      }
    })
  }

  const initials = fullName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || user.email?.[0].toUpperCase() || 'U'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configuracion de perfil</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">

          {/* Preview */}
          <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/50 border border-border">
            <div className="relative w-14 h-14 rounded-full overflow-hidden border-2 border-primary shrink-0">
              {selectedAvatar ? (
                <Image src={selectedAvatar} alt="Avatar" fill className="object-cover" />
              ) : (
                <div className="w-full h-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg">
                  {initials}
                </div>
              )}
            </div>
            <div>
              <p className="font-semibold text-sm">{fullName || user.email?.split('@')[0]}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>

          {/* Nombre */}
          <div className="space-y-2">
            <Label htmlFor="full_name">Nombre completo</Label>
            <Input
              id="full_name"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Tu nombre"
            />
          </div>

          {/* Avatares */}
          <div className="space-y-3">
            <Label>Avatar</Label>
            <div className="grid grid-cols-6 gap-2">
              {/* Sin avatar */}
              <button
                onClick={() => setSelectedAvatar(null)}
                className={cn(
                  'relative aspect-square rounded-full overflow-hidden border-2 transition-all',
                  selectedAvatar === null
                    ? 'border-primary ring-2 ring-primary/30 scale-105'
                    : 'border-border hover:border-muted-foreground'
                )}
              >
                <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground text-xs font-bold">
                  {initials}
                </div>
                {selectedAvatar === null && (
                  <div className="absolute inset-0 flex items-center justify-center bg-primary/20">
                    <Check className="h-4 w-4 text-primary" />
                  </div>
                )}
              </button>

              {AVATARS.map(avatar => (
                <button
                  key={avatar.id}
                  onClick={() => setSelectedAvatar(avatar.src)}
                  title={avatar.label}
                  className={cn(
                    'relative aspect-square rounded-full overflow-hidden border-2 transition-all',
                    selectedAvatar === avatar.src
                      ? 'border-primary ring-2 ring-primary/30 scale-105'
                      : 'border-border hover:border-muted-foreground'
                  )}
                >
                  <Image src={avatar.src} alt={avatar.label} fill className="object-cover" />
                  {selectedAvatar === avatar.src && (
                    <div className="absolute inset-0 flex items-center justify-center bg-primary/20">
                      <Check className="h-4 w-4 text-white drop-shadow" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Color de acento */}
          <div className="space-y-3">
            <Label>Color de acento</Label>
            <div className="flex flex-wrap gap-2">
              {ACCENT_COLORS.map(color => (
                <button
                  key={color.hue}
                  title={color.label}
                  onClick={() => applyAccentHue(color.hue)}
                  className={cn(
                    'w-8 h-8 rounded-full border-2 transition-all flex items-center justify-center',
                    color.class,
                    selectedHue === color.hue
                      ? 'border-foreground scale-110 shadow-md'
                      : 'border-transparent hover:scale-105'
                  )}
                >
                  {selectedHue === color.hue && (
                    <Check className="h-3.5 w-3.5 text-white drop-shadow" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Tema */}
          <div className="space-y-3">
            <Label>Tema</Label>
            <div className="grid grid-cols-3 gap-2">
              {THEMES.map(t => (
                <button
                  key={t.value}
                  onClick={() => handleThemeChange(t.value)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 text-sm font-medium transition-all',
                    selectedTheme === t.value
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border hover:border-muted-foreground text-muted-foreground'
                  )}
                >
                  <t.icon className="h-5 w-5" />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Guardar */}
          <Button
            className="w-full"
            onClick={handleSave}
            disabled={isPending || saved}
          >
            {isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...</>
            ) : saved ? (
              <><Check className="mr-2 h-4 w-4" /> Guardado</>
            ) : (
              'Guardar cambios'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
