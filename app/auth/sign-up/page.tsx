'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Eye, EyeOff, Rocket, CheckCircle2 } from 'lucide-react'

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

export default function SignUpPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const ALLOWED_DOMAINS = ['madketing.io', 'soyaurelia.com']

  // Password requirements
  const hasMinLength = password.length >= 8
  const hasUppercase = /[A-Z]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Validate email domain
    const emailDomain = email.split('@')[1]?.toLowerCase()
    if (!emailDomain || !ALLOWED_DOMAINS.includes(emailDomain)) {
      setError('Solo pueden registrarse usuarios con correos @madketing.io o @soyaurelia.com')
      setLoading(false)
      return
    }

    // Validate password requirements
    if (!hasMinLength || !hasUppercase || !hasNumber) {
      setError('La contrasena debe tener al menos 8 caracteres, una mayuscula y un numero')
      setLoading(false)
      return
    }

    // Validate password match
    if (password !== confirmPassword) {
      setError('Las contrasenas no coinciden')
      setLoading(false)
      return
    }

    // Sign up with Supabase
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
    } else {
      setSuccess(true)
      setLoading(false)
    }
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a1a] relative overflow-hidden">
        <Stars />
        
        {/* Subtle glow effects */}
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="w-full max-w-md mx-4 relative z-10">
          <div className="bg-white/[0.03] backdrop-blur-sm border border-white/10 rounded-2xl p-8 shadow-2xl text-center">
            {/* Success Icon */}
            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-24 h-24 bg-primary/20 rounded-full blur-2xl animate-pulse" />
              </div>
              <div className="relative w-16 h-16 mx-auto bg-primary rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-white" />
              </div>
            </div>

            <h1 className="text-2xl font-bold text-white mb-2">
              Revisa tu correo
            </h1>
            <p className="text-white/50 text-sm mb-6 leading-relaxed">
              Te enviamos un link de confirmacion a <span className="text-white font-medium">{email}</span>. 
              Haz click en el link para activar tu cuenta y comenzar el onboarding.
            </p>

            <div className="p-4 rounded-xl bg-white/5 border border-white/10 mb-6">
              <p className="text-white/40 text-xs">
                No olvides revisar tu carpeta de spam si no lo encuentras.
              </p>
            </div>

            <Link href="/auth/login">
              <Button 
                variant="ghost" 
                className="w-full h-11 text-white/60 hover:text-white hover:bg-white/5 rounded-xl"
              >
                Volver al login
              </Button>
            </Link>
          </div>
        </div>
      </div>
    )
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
      
      {/* Subtle glow effects */}
      <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/4 w-64 h-64 bg-primary/3 rounded-full blur-3xl pointer-events-none" />
      
      {/* Sign Up Card */}
      <div className="w-full max-w-md mx-4 relative z-10">
        <div className="bg-white/[0.03] backdrop-blur-sm border border-white/10 rounded-2xl p-8 shadow-2xl">
          {/* Title */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Rocket className="w-6 h-6 text-primary" />
              <span className="text-primary text-sm font-semibold tracking-widest uppercase">Nueva cuenta</span>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">
              Unite al equipo
            </h1>
            <p className="text-white/50 text-sm">
              Crea tu cuenta para acceder al espacio de trabajo
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSignUp} className="space-y-4">
            {error && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-3">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse shrink-0" />
                {error}
              </div>
            )}
            
            {/* Full Name */}
            <div className="space-y-2">
              <Label htmlFor="fullName" className="text-white/70 text-sm font-medium">
                Nombre completo
              </Label>
              <Input
                id="fullName"
                type="text"
                placeholder="Tu nombre"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="h-11 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-primary focus:ring-primary/20 rounded-xl"
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white/70 text-sm font-medium">
                Email corporativo
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="tu@madketing.io"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-primary focus:ring-primary/20 rounded-xl"
              />
              <p className="text-white/30 text-xs">
                Solo dominios @madketing.io o @soyaurelia.com
              </p>
            </div>
            
            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-white/70 text-sm font-medium">
                Contrasena
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Minimo 8 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-primary focus:ring-primary/20 rounded-xl pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-7 h-7 text-white/40 hover:text-white/60 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              
              {/* Password requirements */}
              {password.length > 0 && (
                <div className="space-y-1 pt-1">
                  <div className={`flex items-center gap-2 text-xs ${hasMinLength ? 'text-green-400' : 'text-white/30'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${hasMinLength ? 'bg-green-400' : 'bg-white/30'}`} />
                    Minimo 8 caracteres
                  </div>
                  <div className={`flex items-center gap-2 text-xs ${hasUppercase ? 'text-green-400' : 'text-white/30'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${hasUppercase ? 'bg-green-400' : 'bg-white/30'}`} />
                    Una letra mayuscula
                  </div>
                  <div className={`flex items-center gap-2 text-xs ${hasNumber ? 'text-green-400' : 'text-white/30'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${hasNumber ? 'bg-green-400' : 'bg-white/30'}`} />
                    Un numero
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-white/70 text-sm font-medium">
                Confirmar contrasena
              </Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Repeti tu contrasena"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="h-11 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-primary focus:ring-primary/20 rounded-xl pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-7 h-7 text-white/40 hover:text-white/60 transition-colors"
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirmPassword.length > 0 && (
                <div className={`flex items-center gap-2 text-xs ${passwordsMatch ? 'text-green-400' : 'text-red-400'}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${passwordsMatch ? 'bg-green-400' : 'bg-red-400'}`} />
                  {passwordsMatch ? 'Las contrasenas coinciden' : 'Las contrasenas no coinciden'}
                </div>
              )}
            </div>
            
            <Button 
              type="submit" 
              className="w-full h-11 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-primary/25 mt-2"
              disabled={loading || !hasMinLength || !hasUppercase || !hasNumber || !passwordsMatch}
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creando cuenta...
                </div>
              ) : (
                'Crear cuenta'
              )}
            </Button>
          </form>

          {/* Login Link */}
          <div className="mt-6 text-center">
            <p className="text-white/50 text-sm">
              Ya tenes cuenta?{' '}
              <Link 
                href="/auth/login" 
                className="text-primary hover:text-primary/80 font-medium transition-colors"
              >
                Ingresar
              </Link>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-white/20 text-xs">
            Departamento de tecnologia | Powered by V0
          </p>
        </div>
      </div>
    </div>
  )
}
