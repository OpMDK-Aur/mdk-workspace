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
  // download-pdf. Sin esto, fs.readFileSync() tira ENOENT en producción
  // porque esas carpetas no se incluyen automáticamente en el bundle.
  outputFileTracingIncludes: {
    'app/api/agentes/analista/download-pdf/route': [
      './lib/analista/pdf-templates/**/*.html',
      './lib/analista/pdf-assets/**/*',
    ],
  },
}
module.exports = nextConfig