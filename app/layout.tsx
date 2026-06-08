import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { GoogleTagManager } from '@next/third-parties/google'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'
// Force full rebuild v5

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono' })

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
    <html lang="es" suppressHydrationWarning className={`${geist.variable} ${geistMono.variable} bg-background`}>
      <GoogleTagManager gtmId="GTM-W2LWLQ2P" />
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
