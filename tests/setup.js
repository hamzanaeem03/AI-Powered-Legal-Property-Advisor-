// Runs before every test file: test env vars, mocked request cookies, in-memory MongoDB.
import { afterAll, afterEach, beforeAll, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"
import { session } from "./helpers/session"

process.env.JWT_SECRET = "test-secret-0123456789abcdef0123456789abcdef"
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000"
delete process.env.UPSTASH_REDIS_REST_URL
delete process.env.KV_REST_API_URL
delete process.env.SMTP_HOST

// Route handlers read the session cookie through next/headers
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name) => (name === "token" && session.token ? { name, value: session.token } : undefined),
  }),
  headers: async () => new Headers(),
}))

let mongod

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  process.env.MONGODB_URI = mongod.getUri()
  global._mongoose = undefined
})

afterEach(async () => {
  session.token = null
  const { _resetMemoryStore } = await import("@/lib/rateLimit")
  _resetMemoryStore()
  if (mongoose.connection.readyState === 1) {
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})))
  }
})

afterAll(async () => {
  await mongoose.disconnect()
  global._mongoose = undefined
  await mongod?.stop()
})
