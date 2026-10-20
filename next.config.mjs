/** @type {import('next').NextConfig} */

// Content-Security-Policy is set per request (with a nonce) in middleware.js
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Camera and microphone stay available to this site for consultations
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
]

const nextConfig = {
  poweredByHeader: false,
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // API responses carry private data: never let browsers or proxies cache them
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
      // The service worker must always be revalidated so fixes roll out
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
    ]
  },
}

export default nextConfig
