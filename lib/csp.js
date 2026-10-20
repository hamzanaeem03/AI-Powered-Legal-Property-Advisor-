// Content-Security-Policy for page responses. Built per request with a fresh nonce;
// Next.js reads the nonce from the request's CSP header and applies it to its own scripts.
export function buildCsp(nonce, { dev = process.env.NODE_ENV !== "production" } = {}) {
  const directives = {
    "default-src": ["'self'"],
    // 'strict-dynamic' lets nonce-approved scripts load the chunks they need
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    // Inline styles come from next/font, framer-motion and Radix positioning
    "style-src": ["'self'", "'unsafe-inline'"],
    // Profile images may be any https URL; uploads come from Cloudinary
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    // Direct browser uploads go to Cloudinary; dev needs websockets for hot reload
    "connect-src": ["'self'", "https://api.cloudinary.com", ...(dev ? ["ws:", "wss:"] : [])],
    "media-src": ["'self'", "blob:"],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  }

  const policy = Object.entries(directives).map(([key, values]) => `${key} ${values.join(" ")}`)
  if (!dev) policy.push("upgrade-insecure-requests")
  return policy.join("; ")
}

export function generateNonce() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}
