// Server-side session helpers (Node runtime)
import jwt from "jsonwebtoken"
import { SESSION_COOKIE } from "@/lib/session"

const SESSION_DAYS = 7

export function signSessionToken(user) {
  return jwt.sign(
    { id: user._id.toString(), firstName: user.firstName, userType: user.userType },
    process.env.JWT_SECRET,
    { algorithm: "HS256", expiresIn: `${SESSION_DAYS}d` }
  )
}

export function setSessionCookie(response, token) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60, // seconds
  })
  return response
}

export function publicUser(user) {
  return {
    id: user._id.toString(),
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    userType: user.userType,
    verified: user.verified,
  }
}

// Emails are stored lowercase from now on; older accounts may have mixed case,
// so lookups compare case-insensitively.
export const EMAIL_COLLATION = { locale: "en", strength: 2 }
