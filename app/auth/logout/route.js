import { NextResponse } from "next/server"
import { SESSION_COOKIE } from "@/lib/session"

export async function POST(req) {
  // 303 so the browser follows the redirect with GET after the form POST
  const res = NextResponse.redirect(new URL("/auth/login", req.url), 303)
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  })
  // Wipe anything the browser or service worker cached for this user (shared devices)
  res.headers.set("Clear-Site-Data", '"cache", "storage"')
  return res
}
