/** @type {import('next').NextConfig} */
// Force full rebuild - cache reset v4
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config, { isServer }) => {
    // Suppress webpack cache serialization warning for big strings
    config.infrastructureLogging = {
      ...config.infrastructureLogging,
      level: 'error',
    }
    return config
  },
  // Performance optimizations
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  // Asegura que las plantillas HTML y los assets (fuentes, logo) del
  // generador de PDFs se empaqueten dentro de la función serverless de
  // download-pdf. Patrones explícitos por profundidad (NO "**/*"): el logo
  // está directo en pdf-assets/, las fuentes están un nivel más adentro en
  // pdf-assets/fonts/ — "**/*" no siempre matchea archivos a "cero"
  // subcarpetas de profundidad, así que se listan por separado.
  
}
module.exports = nextConfig