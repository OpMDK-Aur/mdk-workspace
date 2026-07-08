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
  // @sparticuz/chromium trae binarios (no solo código JS) en su carpeta bin/.
  // Si Webpack intenta empaquetarlo como un módulo normal, mueve/rompe esos
  // binarios. serverExternalPackages le dice a Next.js que lo deje "tal cual"
  // en node_modules en vez de procesarlo con el bundler.
  serverExternalPackages: ['@sparticuz/chromium'],
}
module.exports = nextConfig