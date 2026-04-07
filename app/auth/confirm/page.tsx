'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Rocket, AlertCircle } from 'lucide-react'

function Stars() {
  const [stars, setStars] = useState<{
    width: string; height: string; top: string; left: string;
    animationDelay: string; animationDuration: string; opacity: number
  }[]>([])

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
        <div key={i} className="absolute rounded-full bg-white animate-pulse" style={s} />
      ))}
    </div>
  )
}

export default function ConfirmPage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const handleConfirm = async () => {
      // Supabase sends token_hash and type as query params in the confirmation link
      const params = new URLSearchParams(window.location.search)
      const tokenHash = params.get('token_hash')
      const type = params.get('type') as 'signup' | 'recovery' | null

      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
        if (error) {
          setStatus('error')
        } else {
          setStatus('success')
        }
      } else {
        // Fallback: check if already has a session (e.g. implicit flow)
        const { data } = await supabase.auth.getSession()
        if (data.session) {
          setStatus('success')
        } else {
          setStatus('error')
        }
      }
    }
    handleConfirm()
  }, [supabase])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a1a] p-4 relative overflow-hidden">
      <Stars />

      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/8 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm relative z-10">
        <div className="bg-white/[0.03] backdrop-blur-sm border border-white/10 rounded-2xl px-6 py-10 shadow-2xl text-center">

          {status === 'loading' && (
            <>
              <div className="w-16 h-16 mx-auto mb-6 relative">
                <div className="w-16 h-16 rounded-full border-2 border-white/10 border-t-primary animate-spin" />
              </div>
              <h1 className="text-xl font-bold text-white mb-2">Confirmando tu acceso...</h1>
              <p className="text-white/40 text-sm">Estamos verificando tu cuenta</p>
            </>
          )}

          {status === 'success' && (
            <>
              {/* Glow behind icon */}
              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-24 h-24 bg-primary/20 rounded-full blur-2xl animate-pulse" />
                </div>
                <div className="relative w-16 h-16 mx-auto bg-primary rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-white" />
                </div>
              </div>

              <h1 className="text-2xl font-bold text-white mb-2">
                Acceso confirmado
              </h1>
              <p className="text-white/50 text-sm mb-8 leading-relaxed">
                Tu cuenta fue verificada exitosamente. Ya podes ingresar a tu espacio de trabajo.
              </p>

              <Link href="/auth/login">
                <Button className="w-full h-11 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-primary/25 flex items-center justify-center gap-2 group">
                  <Rocket className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  Ingresar
                </Button>
              </Link>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-24 h-24 bg-red-500/10 rounded-full blur-2xl" />
                </div>
                <div className="relative w-16 h-16 mx-auto bg-red-500/20 border border-red-500/30 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-8 h-8 text-red-400" />
                </div>
              </div>

              <h1 className="text-2xl font-bold text-white mb-2">
                Link invalido
              </h1>
              <p className="text-white/50 text-sm mb-8 leading-relaxed">
                El link de confirmacion expiro o ya fue utilizado. Intenta registrarte nuevamente.
              </p>

              <Link href="/auth/sign-up">
                <Button className="w-full h-11 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl transition-all duration-300">
                  Volver al registro
                </Button>
              </Link>
            </>
          )}
        </div>

        <div className="mt-5 text-center">
          <p className="text-white/20 text-xs">
            Departamento de tecnologia | Powered by V0
          </p>
        </div>
      </div>
    </div>
  )
}
