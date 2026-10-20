// Edge-safe session helpers (used by middleware, so no Node-only APIs here)
import { jwtVerify } from "jose"
import { ROLE_HOME } from "@/lib/routes"

export const SESSION_COOKIE = "token"

export async function verifySessionToken(token) {
  if (!token || !process.env.JWT_SECRET) return null
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET)
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] })
    if (!payload?.id || !ROLE_HOME[payload.userType]) return null
    return payload
  } catch {
    return null
  }
}
