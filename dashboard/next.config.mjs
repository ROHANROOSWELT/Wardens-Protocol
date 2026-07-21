/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://20.6.128.197/api/:path*',
      },
    ]
  },
}
export default nextConfig
