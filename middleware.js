import { NextResponse } from "next/server"
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session"
import { decidePageAccess } from "@/lib/routes"
import { buildCsp, generateNonce } from "@/lib/csp"

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

// Reject state-changing requests that a browser sent from another site (CSRF).
// The session cookie is already sameSite=strict; this is defence in depth.
export function isCrossSiteRequest(req) {
  const origin = req.headers.get("origin")
  if (origin) {
    try {
      return new URL(origin).host !== req.headers.get("host")
    } catch {
      return true
    }
  }
  // No Origin header: fall back to Fetch Metadata where the browser sends it
  return req.headers.get("sec-fetch-site") === "cross-site"
}

export async function middleware(req) {
  const { pathname } = req.nextUrl
  const isApi = pathname.startsWith("/api/")

  if (UNSAFE_METHODS.has(req.method) && (isApi || pathname === "/auth/logout") && isCrossSiteRequest(req)) {
    return NextResponse.json({ error: "Cross-site request blocked", message: "Cross-site request blocked" }, { status: 403 })
  }

  const user = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)

  if (isApi) {
    // Admin APIs also check the role themselves; this blocks them before any DB work
    if (pathname.startsWith("/api/admin/") && user?.userType !== "admin") {
      return NextResponse.json({ error: "Unauthorized", message: "Unauthorized" }, { status: 401 })
    }
    return NextResponse.next()
  }

  const decision = decidePageAccess(pathname, user)
  if (decision.action === "redirect") {
    return NextResponse.redirect(new URL(decision.to, req.url))
  }

  // Per-request CSP nonce: Next.js picks it up from the request header
  const nonce = generateNonce()
  const csp = buildCsp(nonce)
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("Content-Security-Policy", csp)

  const res = NextResponse.next({ request: { headers: requestHeaders } })
  res.headers.set("Content-Security-Policy", csp)
  return res
}

export const config = {
  // Skip static assets and PWA files
  matcher: ["/((?!_next/static|_next/image|icons/|favicon.ico|sw.js|manifest.json|offline.html|robots.txt).*)"],
}
