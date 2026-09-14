import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { GoogleTagManager } from '@next/third-parties/google'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import '../styles/globals.css'

export const metadata: Metadata = {
  title: 'MDK Workspace',
  description: 'Sistema de gestión de clientes y automatización con IA para agencias de marketing digital',
  generator: 'MDK',
}

export const viewport: Viewport = {
  themeColor: '#F97316',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" suppressHydrationWarning className="bg-background">
      <GoogleTagManager gtmId="GTM-W2LWLQ2P" />
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
