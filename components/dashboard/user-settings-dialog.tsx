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
import { Check, Loader2, Sun, Moon, Monitor, Camera, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'
import type { User } from '@supabase/supabase-js'

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
  const { setTheme } = useTheme()
  const [isPending, startTransition] = useTransition()
  const supabase = createClient()

  const [fullName, setFullName] = useState(profile?.full_name || '')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url || null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [selectedHue, setSelectedHue] = useState<number>(profile?.accent_hue ?? 55)
  const [selectedTheme, setSelectedTheme] = useState<'light' | 'dark' | 'system'>(
    (profile?.theme as 'light' | 'dark' | 'system') ?? 'system'
  )
  const [saved, setSaved] = useState(false)

  // Sync state when profile changes
  useEffect(() => {
    setFullName(profile?.full_name || '')
    setAvatarUrl(profile?.avatar_url || null)
    setSelectedHue(profile?.accent_hue ?? 55)
    setSelectedTheme((profile?.theme as 'light' | 'dark' | 'system') ?? 'system')
  }, [profile])

  // Handle avatar upload
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingAvatar(true)
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${user.id}-${Date.now()}.${fileExt}`
      const filePath = `avatars/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true })

      if (uploadError) {
        console.error('Error uploading avatar:', uploadError)
        return
      }

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      setAvatarUrl(publicUrl)
    } catch (err) {
      console.error('Error uploading avatar:', err)
    } finally {
      setUploadingAvatar(false)
    }
  }

  // Remove avatar
  const handleRemoveAvatar = () => {
    setAvatarUrl(null)
  }

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
        avatar_url: avatarUrl,
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

          {/* Preview with upload */}
          <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/50 border border-border">
            <div className="relative group">
              <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-primary shrink-0">
                {avatarUrl ? (
                  <Image src={avatarUrl} alt="Avatar" fill className="object-cover" />
                ) : (
                  <div className="w-full h-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl">
                    {initials}
                  </div>
                )}
              </div>
              {/* Upload overlay */}
              <label className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                {uploadingAvatar ? (
                  <Loader2 className="h-5 w-5 text-white animate-spin" />
                ) : (
                  <Camera className="h-5 w-5 text-white" />
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                  disabled={uploadingAvatar}
                />
              </label>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm">{fullName || user.email?.split('@')[0]}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Pasa el cursor sobre la foto para cambiarla</p>
            </div>
            {avatarUrl && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={handleRemoveAvatar}
                title="Quitar foto"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
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
