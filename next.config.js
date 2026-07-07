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
  // Asegura que los PDFs de plantilla se empaqueten dentro de la función
  // serverless de download-pdf. Sin esto, fs.readFileSync() tira ENOENT
  // en producción porque /public no se incluye automáticamente en el
  // bundle de la función.
outputFileTracingIncludes: {
  'app/api/agentes/analista/download-pdf/route': ['./public/*.pdf'],
},
}
export default nextConfig