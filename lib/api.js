// Shared helpers for API route handlers: consistent errors, body/query validation, auth guards
import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/getAuthUser"

export class ApiError extends Error {
  constructor(status, message, { details, headers } = {}) {
    super(message)
    this.status = status
    this.details = details
    this.headers = headers
  }
}

// Pages read either `error` or `message`, so error responses carry both
export function errorResponse(status, message, { details, headers } = {}) {
  return NextResponse.json(
    { success: false, error: message, message, ...(details ? { details } : {}) },
    { status, headers }
  )
}

/** Wrap a route handler so thrown ApiErrors and bad input become proper 4xx responses. */
export function withApi(handler) {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx)
    } catch (err) {
      if (err instanceof ApiError) {
        return errorResponse(err.status, err.message, { details: err.details, headers: err.headers })
      }
      // Mongoose cast failures mean a malformed id or value slipped past validation
      if (err?.name === "CastError") {
        return errorResponse(400, "Invalid identifier")
      }
      if (err?.name === "ValidationError") {
        return errorResponse(400, "Invalid data")
      }
      console.error(`[api] ${req.method} ${new URL(req.url).pathname} failed:`, err)
      return errorResponse(500, "Something went wrong. Please try again.")
    }
  }
}

function formatIssues(issues) {
  return issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }))
}

function assertValid(result) {
  if (!result.success) {
    const details = formatIssues(result.error.issues)
    const first = details[0]
    const message = first.path ? `${first.path}: ${first.message}` : first.message
    throw new ApiError(400, message, { details })
  }
  return result.data
}

export async function parseBody(req, schema) {
  let body
  try {
    body = await req.json()
  } catch {
    throw new ApiError(400, "Request body must be valid JSON")
  }
  return assertValid(schema.safeParse(body))
}

export function parseQuery(req, schema) {
  const params = Object.fromEntries(new URL(req.url).searchParams)
  return assertValid(schema.safeParse(params))
}

/** Return the session user, or throw 401 (not logged in) / 403 (wrong role). */
export async function requireUser(roles) {
  const user = await getAuthUser()
  if (!user) throw new ApiError(401, "Unauthorized")
  if (roles && !roles.includes(user.userType)) throw new ApiError(403, "Forbidden")
  return user
}
