'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Eye, EyeOff } from 'lucide-react'

// Minimalist floating astronaut SVG
function FloatingAstronaut() {
  return (
    <div className="absolute pointer-events-none animate-float">
      <svg 
        width="60" 
        height="60" 
        viewBox="0 0 100 100" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        className="opacity-60"
      >
        {/* Helmet */}
        <circle cx="50" cy="35" r="20" fill="#ffffff" stroke="#f97316" strokeWidth="2"/>
        <circle cx="50" cy="35" r="14" fill="#0a0a1a" opacity="0.8"/>
        <ellipse cx="45" cy="32" rx="3" ry="4" fill="#f97316" opacity="0.6"/>
        
        {/* Body */}
        <rect x="35" y="52" width="30" height="28" rx="8" fill="#ffffff"/>
        <rect x="40" y="58" width="20" height="8" rx="2" fill="#f97316" opacity="0.3"/>
        
        {/* Arms */}
        <rect x="18" y="55" width="20" height="8" rx="4" fill="#ffffff" transform="rotate(-15 18 55)"/>
        <rect x="62" y="52" width="20" height="8" rx="4" fill="#ffffff" transform="rotate(15 62 52)"/>
        
        {/* Legs */}
        <rect x="38" y="78" width="8" height="16" rx="4" fill="#ffffff"/>
        <rect x="54" y="78" width="8" height="16" rx="4" fill="#ffffff"/>
        
        {/* Backpack */}
        <rect x="28" y="55" width="8" height="20" rx="3" fill="#e5e5e5"/>
      </svg>
    </div>
  )
}

// Animated stars component - client only to avoid hydration mismatch
function Stars() {
  const [stars, setStars] = useState<{ width: string; height: string; top: string; left: string; animationDelay: string; animationDuration: string; opacity: number }[]>([])

  useEffect(() => {
    setStars(
      Array.from({ length: 30 }, () => ({
        width: `${Math.random() * 2 + 1}px`,
        height: `${Math.random() * 2 + 1}px`,
        top: `${Math.random() * 100}%`,
        left: `${Math.random() * 100}%`,
        animationDelay: `${Math.random() * 3}s`,
        animationDuration: `${Math.random() * 2 + 2}s`,
        opacity: Math.random() * 0.5 + 0.2,
      }))
    )
  }, [])

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {stars.map((s, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-white animate-pulse"
          style={s}
        />
      ))}
    </div>
  )
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Detect v0 sandbox and redirect to dashboard immediately
  useEffect(() => {
    const isV0Sandbox = 
      typeof window !== 'undefined' && 
      (window.location.hostname.includes('vusercontent.net') ||
       window.location.hostname.includes('v0.dev') ||
       window.location.hostname.includes('localhost'))
    
    if (isV0Sandbox) {
      router.replace('/dashboard')
    }
  }, [router])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const ALLOWED_DOMAINS = ['madketing.io', 'soyaurelia.com']
    const emailDomain = email.split('@')[1]?.toLowerCase()
    if (!emailDomain || !ALLOWED_DOMAINS.includes(emailDomain)) {
      setError('Solo pueden acceder usuarios con correos @madketing.io o @soyaurelia.com')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a1a] relative overflow-hidden">
      <Stars />
      
      {/* Floating astronauts at different positions */}
      <div className="absolute top-[15%] left-[10%]" style={{ animationDelay: '0s' }}>
        <div className="animate-float-slow">
          <FloatingAstronaut />
        </div>
      </div>
      <div className="absolute top-[60%] right-[8%]" style={{ animationDelay: '2s' }}>
        <div className="animate-float-delayed scale-75">
          <FloatingAstronaut />
        </div>
      </div>
      <div className="absolute bottom-[20%] left-[15%]" style={{ animationDelay: '4s' }}>
        <div className="animate-float-reverse scale-50 opacity-40">
          <FloatingAstronaut />
        </div>
      </div>
      
      {/* Subtle glow effects */}
      <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/4 w-64 h-64 bg-primary/3 rounded-full blur-3xl pointer-events-none" />
      
      {/* Login Card */}
      <div className="w-full max-w-md mx-4 relative z-10">
        <div className="bg-white/[0.03] backdrop-blur-sm border border-white/10 rounded-2xl p-8 shadow-2xl">
          {/* Title */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-white mb-3">
              Hola!
            </h1>
            <p className="text-white/50 text-lg">
              Por favor, ingresá tu mail y contraseña
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            {error && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-3">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                {error}
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white/70 text-sm font-medium">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-12 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-primary focus:ring-primary/20 rounded-xl"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password" className="text-white/70 text-sm font-medium">
                Contraseña
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="��•••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-12 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-primary focus:ring-primary/20 rounded-xl pr-12 [&:-webkit-autofill]:![background-color:#1a1a2e] [&:-webkit-autofill]:[color:white]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-7 h-7 text-gray-500 hover:text-gray-800 transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
            
            <Button 
              type="submit" 
              className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-primary/25"
              disabled={loading}
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Ingresando...
                </div>
              ) : (
                'Ingresar'
              )}
            </Button>
          </form>

          {/* Create Account Link */}
          <div className="mt-6 text-center">
            <p className="text-white/50 text-sm">
              ¿No tenés cuenta?{' '}
              <Link 
                href="/auth/sign-up" 
                className="text-primary hover:text-primary/80 font-medium transition-colors"
              >
                Crear cuenta
              </Link>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-white/20 text-xs">
            Departamento de tecnología | Powered by V0
          </p>
        </div>
      </div>
    </div>
  )
}
