// Fixed-window rate limiting.
//
// On Vercel every request can land on a different instance, so limits must live in a
// shared store: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (Vercel's Upstash
// integration also provides KV_REST_API_URL / KV_REST_API_TOKEN). Without them, an
// in-memory store is used, which is fine for local development only.
import { ApiError } from "@/lib/api"

const memoryStore = new Map()
let warnedAboutMemoryStore = false

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
  return url && token ? { url: url.replace(/\/$/, ""), token } : null
}

async function incrementRedis({ url, token }, key, windowMs) {
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([
      ["INCR", key],
      ["PEXPIRE", key, windowMs, "NX"],
      ["PTTL", key],
    ]),
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`Upstash responded ${res.status}`)
  const [incr, , pttl] = await res.json()
  if (incr.error) throw new Error(incr.error)
  return { count: incr.result, resetMs: pttl.result > 0 ? pttl.result : windowMs }
}

function incrementMemory(key, windowMs) {
  const now = Date.now()
  let entry = memoryStore.get(key)
  if (!entry || entry.expiresAt <= now) {
    entry = { count: 0, expiresAt: now + windowMs }
    memoryStore.set(key, entry)
  }
  entry.count += 1

  // Opportunistic cleanup so the map can't grow without bound
  if (memoryStore.size > 10_000) {
    for (const [k, v] of memoryStore) if (v.expiresAt <= now) memoryStore.delete(k)
  }
  return { count: entry.count, resetMs: entry.expiresAt - now }
}

/**
 * Count one hit against `key`.
 * @returns {Promise<{ success: boolean, remaining: number, retryAfterSeconds: number }>}
 */
export async function rateLimit(key, { limit, windowMs }) {
  const fullKey = `rl:${key}`
  const redis = redisConfig()
  let result

  if (redis) {
    try {
      result = await incrementRedis(redis, fullKey, windowMs)
    } catch (err) {
      // Fail open: a limiter outage must not take the whole site down
      console.error("[rateLimit] Redis unavailable, falling back to memory:", err.message)
      result = incrementMemory(fullKey, windowMs)
    }
  } else {
    if (process.env.NODE_ENV === "production" && !warnedAboutMemoryStore) {
      warnedAboutMemoryStore = true
      console.warn("[rateLimit] No Upstash Redis configured; limits are per-instance only.")
    }
    result = incrementMemory(fullKey, windowMs)
  }

  return {
    success: result.count <= limit,
    remaining: Math.max(0, limit - result.count),
    retryAfterSeconds: Math.ceil(result.resetMs / 1000),
  }
}

/** Throw a 429 ApiError when the limit is exceeded. */
export async function enforceRateLimit(key, options, message = "Too many requests. Please try again later.") {
  const result = await rateLimit(key, options)
  if (!result.success) {
    throw new ApiError(429, message, { headers: { "Retry-After": String(result.retryAfterSeconds) } })
  }
  return result
}

export function clientIp(req) {
  const forwarded = req.headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0].trim()
  return req.headers.get("x-real-ip") || "unknown"
}

/** Test helper */
export function _resetMemoryStore() {
  memoryStore.clear()
}

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

// Central place to tune limits
export const LIMITS = {
  loginPerIp: { limit: 30, windowMs: 15 * MINUTE },
  loginPerAccount: { limit: 10, windowMs: 15 * MINUTE },
  registerPerIp: { limit: 5, windowMs: HOUR },
  changePassword: { limit: 5, windowMs: 15 * MINUTE },
  aiChatPerMinute: { limit: 10, windowMs: MINUTE },
  aiChatPerDay: { limit: 200, windowMs: 24 * HOUR },
  sendMessage: { limit: 60, windowMs: MINUTE },
  createBooking: { limit: 10, windowMs: HOUR },
  createReview: { limit: 10, windowMs: HOUR },
  createCase: { limit: 20, windowMs: HOUR },
  uploadSign: { limit: 30, windowMs: HOUR },
}
