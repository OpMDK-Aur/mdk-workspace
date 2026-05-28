'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function V0SandboxDetector() {
  const router = useRouter()

  useEffect(() => {
    // Detect v0 sandbox environment
    const isV0Sandbox = typeof window !== 'undefined' && (
      window.location.hostname.includes('vusercontent.net') ||
      window.location.hostname.includes('v0.dev') ||
      window.location.hostname.includes('localhost') && new URL(window.location.href).searchParams.has('v0')
    )

    if (isV0Sandbox) {
      // Redirect to dashboard immediately, bypassing login
      if (window.location.pathname === '/' || window.location.pathname.startsWith('/auth/login')) {
        router.push('/dashboard')
        router.refresh()
      }
    }
  }, [router])

  return null
}
