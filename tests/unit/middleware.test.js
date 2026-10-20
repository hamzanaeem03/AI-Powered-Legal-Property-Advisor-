import { describe, expect, it } from "vitest"
import jwt from "jsonwebtoken"
import { NextRequest } from "next/server"
import { middleware } from "@/middleware"
import { decidePageAccess, safeNextPath } from "@/lib/routes"
import { buildCsp } from "@/lib/csp"

const token = (userType, secret = process.env.JWT_SECRET) =>
  jwt.sign({ id: "64b000000000000000000001", userType }, secret)

const req = (path, { method = "GET", role, cookie, headers = {} } = {}) => {
  const h = new Headers({ host: "localhost", ...headers })
  const value = cookie ?? (role ? token(role) : null)
  if (value) h.set("cookie", `token=${value}`)
  return new NextRequest(`http://localhost${path}`, { method, headers: h })
}

describe("decidePageAccess", () => {
  it("sends logged-out users to login with a return path", () => {
    expect(decidePageAccess("/client/dashboard", null)).toEqual({
      action: "redirect",
      to: "/auth/login?next=%2Fclient%2Fdashboard",
    })
  })

  it("sends users with the wrong role to their own dashboard", () => {
    expect(decidePageAccess("/admin/dashboard", { userType: "client" })).toEqual({ action: "redirect", to: "/client/dashboard" })
    expect(decidePageAccess("/client/lawyers", { userType: "lawyer" })).toEqual({ action: "redirect", to: "/lawyer/dashboard" })
  })

  it("allows the right role and public pages", () => {
    expect(decidePageAccess("/admin/dashboard", { userType: "admin" })).toEqual({ action: "allow" })
    expect(decidePageAccess("/chat", { userType: "lawyer" })).toEqual({ action: "allow" })
    expect(decidePageAccess("/help", null)).toEqual({ action: "allow" })
    expect(decidePageAccess("/", null)).toEqual({ action: "allow" })
  })

  it("does not treat lookalike paths as protected prefixes", () => {
    expect(decidePageAccess("/clientele", null)).toEqual({ action: "allow" })
  })

  it("redirects logged-in users away from login and register", () => {
    expect(decidePageAccess("/auth/login", { userType: "lawyer" })).toEqual({ action: "redirect", to: "/lawyer/dashboard" })
  })
})

describe("safeNextPath", () => {
  it("accepts local paths only", () => {
    expect(safeNextPath("/client/ai-chat")).toBe("/client/ai-chat")
    expect(safeNextPath("https://evil.example")).toBeNull()
    expect(safeNextPath("//evil.example")).toBeNull()
    expect(safeNextPath("/\\evil.example")).toBeNull()
    expect(safeNextPath(null)).toBeNull()
  })
})

describe("middleware", () => {
  it("redirects anonymous visitors from protected pages", async () => {
    const res = await middleware(req("/admin/dashboard"))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("http://localhost/auth/login?next=%2Fadmin%2Fdashboard")
  })

  it("rejects tokens signed with another secret", async () => {
    const res = await middleware(req("/admin/dashboard", { cookie: token("admin", "attacker-secret") }))
    expect(res.headers.get("location")).toContain("/auth/login")
  })

  it("lets an admin through and sets a nonce CSP", async () => {
    const res = await middleware(req("/admin/dashboard", { role: "admin" }))
    expect(res.headers.get("location")).toBeNull()
    expect(res.headers.get("content-security-policy")).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/)
  })

  it("blocks admin APIs for other roles", async () => {
    const res = await middleware(req("/api/admin/stats", { role: "lawyer" }))
    expect(res.status).toBe(401)
  })

  it("blocks cross-site state-changing requests", async () => {
    const byOrigin = await middleware(req("/api/login", { method: "POST", headers: { origin: "https://evil.example" } }))
    expect(byOrigin.status).toBe(403)

    const byFetchMetadata = await middleware(req("/api/login", { method: "POST", headers: { "sec-fetch-site": "cross-site" } }))
    expect(byFetchMetadata.status).toBe(403)

    const logout = await middleware(req("/auth/logout", { method: "POST", headers: { origin: "https://evil.example" } }))
    expect(logout.status).toBe(403)
  })

  it("allows same-origin POSTs", async () => {
    const res = await middleware(req("/api/login", { method: "POST", headers: { origin: "http://localhost" } }))
    expect(res.status).toBe(200)
  })
})

describe("buildCsp", () => {
  it("omits unsafe-eval and websockets in production", () => {
    const csp = buildCsp("abc", { dev: false })
    expect(csp).not.toContain("unsafe-eval")
    expect(csp).not.toContain("ws:")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("upgrade-insecure-requests")
  })
})
