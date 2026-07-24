/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://20.6.128.197:4000'}/api/:path*`,
      },
    ]
  },
}
export default nextConfig
