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
  webpack: (config) => {
    // Keep the Chromium binary external while retaining webpack compatibility
    // for deployments that explicitly use the webpack bundler.
    config.infrastructureLogging = {
      ...config.infrastructureLogging,
      level: 'error',
    }
    return config
  },
  // Next 16 uses Turbopack by default. Declaring the config explicitly keeps
  // dev and production builds from failing because this project also retains
  // a webpack hook for server-only Chromium assets.
  turbopack: {},
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
