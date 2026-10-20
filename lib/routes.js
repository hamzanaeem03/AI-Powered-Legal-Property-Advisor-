// Page access rules shared by middleware and client pages (no secrets, no Node APIs)

export const ROLE_HOME = {
  client: "/client/dashboard",
  lawyer: "/lawyer/dashboard",
  admin: "/admin/dashboard",
}

// Pages that need a session, and which roles may open them.
// Order matters: the first matching prefix wins.
const PROTECTED_PAGES = [
  { prefix: "/admin", roles: ["admin"] },
  { prefix: "/lawyer", roles: ["lawyer"] },
  { prefix: "/client", roles: ["client"] },
  { prefix: "/chat", roles: ["client", "lawyer"] },
  { prefix: "/documents", roles: ["client", "lawyer", "admin"] },
  { prefix: "/profile", roles: ["client", "lawyer", "admin"] },
  { prefix: "/settings", roles: ["client", "lawyer", "admin"] },
]

const AUTH_PAGES = ["/auth/login", "/auth/register"]

const matchesPrefix = (pathname, prefix) => pathname === prefix || pathname.startsWith(prefix + "/")

/**
 * Decide what to do with a page request.
 * @returns {{ action: "allow" } | { action: "redirect", to: string }}
 */
export function decidePageAccess(pathname, user) {
  if (AUTH_PAGES.some((p) => matchesPrefix(pathname, p))) {
    return user ? { action: "redirect", to: ROLE_HOME[user.userType] } : { action: "allow" }
  }

  const rule = PROTECTED_PAGES.find((r) => matchesPrefix(pathname, r.prefix))
  if (!rule) return { action: "allow" }

  if (!user) {
    return { action: "redirect", to: `/auth/login?next=${encodeURIComponent(pathname)}` }
  }
  if (!rule.roles.includes(user.userType)) {
    return { action: "redirect", to: ROLE_HOME[user.userType] }
  }
  return { action: "allow" }
}

/** Only allow same-site relative paths as post-login destinations (no open redirects). */
export function safeNextPath(next) {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return null
  }
  return next
}
